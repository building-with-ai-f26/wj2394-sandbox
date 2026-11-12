"""Supabase accounts through the local server. Tokens stay in server memory."""
from collections import deque
import base64
import hashlib
from http.cookies import SimpleCookie, CookieError
import json
import math
import re
import secrets
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, quote, urlencode
from urllib.request import Request, urlopen
from uuid import UUID

COOKIE = 'inner_table_session'
OAUTH_COOKIE = 'inner_table_google'
TAGS = {'conversation', 'fun', 'special', 'date', 'group'}


class AccountError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def clean_places(places):
    if not isinstance(places, list) or len(places) > 2000:
        raise AccountError('Choose a guide with up to 2,000 places.')
    cleaned, urls = [], set()
    for place in places:
        if not isinstance(place, dict):
            raise AccountError('Invalid place in the guide.')
        result = {}
        for field, maximum in [('id', 100), ('name', 200), ('url', 2000), ('note', 3000), ('neighborhood', 100), ('listName', 200), ('source', 100)]:
            value = place.get(field, '')
            if not isinstance(value, str) or len(value) > maximum:
                raise AccountError('A place contains invalid details.')
            result[field] = value
        if not result['id'] or not result['name'].strip():
            raise AccountError('Each place needs a name and identifier.')
        try:
            url = urlsplit(result['url'])
            host = url.hostname
            allowed = ((host in ('google.com', 'www.google.com') and re.match(r'^/maps(?:/|$)', url.path)) or
                       host == 'maps.google.com' or (host == 'maps.app.goo.gl' and len(url.path) > 1) or
                       (host == 'goo.gl' and url.path.startswith('/maps/')))
            if url.scheme != 'https' or url.username or url.password or url.port or not allowed:
                raise ValueError()
        except ValueError:
            raise AccountError('Use a valid Google Maps place link.') from None
        if result['url'] in urls:
            raise AccountError('The guide contains duplicate Maps links.')
        urls.add(result['url'])
        if place.get('category') not in ('unknown', 'restaurant', 'cafe', 'bar', 'shop', 'nightclub', 'other') or place.get('status') not in ('been there', 'want to try', 'not specified'):
            raise AccountError('Invalid category or visit status.')
        result.update(category=place['category'], status=place['status'])
        for field in ('recommended', 'inGuide'):
            value = place.get(field, place.get('recommended', False))
            if not isinstance(value, bool):
                raise AccountError('Invalid guide status.')
            result[field] = value
        price = place.get('price')
        if price is not None and (type(price) not in (int, float) or not math.isfinite(price) or not 0 < price <= 10000):
            raise AccountError('Invalid budget estimate.')
        result['price'] = price
        for field in ('tags', 'inferredTags'):
            values = place.get(field, [])
            if not isinstance(values, list) or any(not isinstance(tag, str) or tag not in TAGS for tag in values):
                raise AccountError('Invalid occasion tags.')
            result[field] = list(dict.fromkeys(values))
        result['inferredTags'] = [tag for tag in result['inferredTags'] if tag in result['tags']]
        place_id = place.get('googlePlaceId')
        if place_id is not None:
            if not isinstance(place_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{5,255}', place_id):
                raise AccountError('Invalid Google place identifier.')
            result['googlePlaceId'] = place_id
        cleaned.append(result)
    return cleaned


class Accounts:
    def __init__(self, url='', key=''):
        self.url = url.rstrip('/')
        self.key = key
        self.configured = bool(re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', self.url) and key)
        if key.startswith('sb_secret_'):
            self.configured = False
        # Reject legacy service-role JWT keys as well. Only user tokens authorize data access.
        if key.startswith('eyJ'):
            import base64
            try:
                role = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '===')).get('role')
                self.configured = self.configured and role == 'anon'
            except (ValueError, IndexError):
                self.configured = False
        self.sessions = {}
        self.lock = threading.Lock()
        self.attempts = deque()
        self.google_attempts = {}

    def create_session(self, result, previous_cookie):
        try:
            user_id = str(UUID(result['user']['id']))
            access, refresh, expiry = result['access_token'], result['refresh_token'], result['expires_in']
            if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh or type(expiry) not in (int, float) or not 0 < expiry <= 86400:
                raise ValueError()
        except (KeyError, ValueError, TypeError):
            raise AccountError('Sign-in returned an incomplete session. Please try again.', 502) from None
        previous_id, _ = self.get_session(previous_cookie)
        new_id = secrets.token_urlsafe(32)
        with self.lock:
            self.sessions = {key:value for key, value in self.sessions.items() if value['until'] > time.time()}
            if len(self.sessions) >= 1000:
                raise AccountError('Too many active sessions. Please try later.', 503)
            self.sessions.pop(previous_id, None)
            self.sessions[new_id] = {'user':{'id':user_id}, 'access':access, 'refresh':refresh,
                                     'expires':time.time() + expiry, 'until':time.time() + 28800, 'lock':threading.Lock()}
        return {'signedIn':True}, self.cookie(new_id)

    def start_google(self, origin):
        if not self.configured:
            raise AccountError('Account sign-in is being prepared.', 503)
        if not re.fullmatch(r'http://(?:127\.0\.0\.1|localhost):[0-9]{1,5}', origin):
            raise AccountError('Invalid sign-in address.')
        verifier = secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        attempt_id = secrets.token_urlsafe(32)
        with self.lock:
            self.google_attempts = {key:value for key, value in self.google_attempts.items() if value['until'] > time.time()}
            if len(self.google_attempts) >= 1000:
                raise AccountError('Please try signing in later.', 429)
            self.google_attempts[attempt_id] = {'verifier':verifier, 'until':time.time() + 600}
        query = urlencode({'provider':'google', 'redirect_to':origin + '/api/account/google/callback',
                           'code_challenge':challenge, 'code_challenge_method':'s256', 'scopes':'openid email profile'})
        cookie = f'{OAUTH_COOKIE}={attempt_id}; HttpOnly; SameSite=Lax; Path=/api/account/google; Max-Age=600'
        return {'url':self.url + '/auth/v1/authorize?' + query}, cookie

    def finish_google(self, code, cookie):
        parsed = SimpleCookie()
        try:
            parsed.load(cookie or '')
            attempt_id = parsed[OAUTH_COOKIE].value if OAUTH_COOKIE in parsed else ''
        except CookieError:
            attempt_id = ''
        with self.lock:
            attempt = self.google_attempts.pop(attempt_id, None)
        if not attempt or attempt['until'] <= time.time() or not isinstance(code, str) or not 1 <= len(code) <= 2048:
            raise AccountError('This sign-in expired. Start Google sign-in again.', 401)
        result = self.request('/auth/v1/token?grant_type=pkce', {'auth_code':code, 'code_verifier':attempt['verifier']})
        return self.create_session(result, cookie)

    def request(self, path, data=None, token=None, method=None, prefer=None):
        headers = {'apikey': self.key, 'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if prefer:
            headers['Prefer'] = prefer
        request = Request(self.url + path, data=json.dumps(data).encode() if data is not None else None,
                          headers=headers, method=method)
        try:
            with urlopen(request, timeout=20) as response:
                raw = response.read(20_000_001)
                if len(raw) > 20_000_000:
                    raise AccountError('This account guide is too large to load.', 502)
                return json.loads(raw) if raw else None
        except HTTPError as error:
            status = error.code
            try:
                detail = json.loads(error.read(100_000))
            except (ValueError, OSError):
                detail = {}
            finally:
                error.close()
            if detail.get('message') == 'guide_conflict':
                raise AccountError('Your account guide changed elsewhere. Export your pending changes before reloading it.', 409) from None
            messages = {'guide_access_denied': ('This guide needs the owner’s approval, or access has been removed.', 403),
                        'friend_not_found': ('No profile found with that username.', 404),
                        'cannot_follow_self': ('That is your own profile.', 400),
                        'profile_required': ('Save your display name and username before requesting access.', 400)}
            if detail.get('message') in messages:
                message, status = messages[detail['message']]
                raise AccountError(message, status) from None
            if detail.get('code') == '23505':
                raise AccountError('That username is already taken.') from None
            if status == 429:
                raise AccountError('Please wait before trying again.', 429) from None
            if path.startswith('/auth/'):
                raise AccountError('Sign-in could not finish. Check your email, password and email confirmation.', 401) from None
            if status in (401, 403):
                raise AccountError('Your session needs a fresh sign-in.', 401) from None
            raise AccountError('Your account could not be updated. Please try again.', 502) from None
        except (URLError, TimeoutError, ValueError):
            raise AccountError('The account service could not be reached. Your pending changes are still on this page.', 502) from None

    def cookie(self, session_id='', age=28800):
        return f'{COOKIE}={session_id}; HttpOnly; SameSite=Strict; Path=/api/account; Max-Age={age}'

    def get_session(self, cookie):
        parsed = SimpleCookie()
        try:
            parsed.load(cookie or '')
            session_id = parsed[COOKIE].value if COOKIE in parsed else ''
        except CookieError:
            session_id = ''
        with self.lock:
            session = self.sessions.get(session_id)
            if session and session['until'] <= time.time():
                self.sessions.pop(session_id, None)
                session = None
        return session_id, session

    def token(self, session):
        if session['expires'] <= time.time() + 30:
            result = self.request('/auth/v1/token?grant_type=refresh_token', {'refresh_token': session['refresh']})
            session.update(access=result['access_token'], refresh=result['refresh_token'], expires=time.time() + result['expires_in'])
        return session['access']

    def guide(self, session):
        rows = self.request('/rest/v1/private_guides?select=places,revision&owner_id=eq.' + session['user']['id'], token=self.token(session))
        return rows[0] if rows else {'places': [], 'revision': 0}

    def save(self, session, places, revision):
        if type(revision) is not int or revision < 0:
            raise AccountError('Invalid guide revision.')
        try:
            return self.request('/rest/v1/rpc/save_my_guide', {'p_places': places, 'p_expected_revision': revision}, token=self.token(session))
        except AccountError as error:
            if error.status == 409:
                current = self.guide(session)
                # A retry after a lost response is safe when the exact snapshot was saved.
                if current['places'] == places:
                    return {'revision': current['revision']}
            raise

    def profile(self, session):
        rows = self.request('/rest/v1/profiles?select=id,display_name,username&id=eq.' + session['user']['id'], token=self.token(session))
        return rows[0] if rows else {'id': session['user']['id'], 'display_name': '', 'username': ''}

    def followed_guide(self, owner_id, cookie):
        _, session = self.get_session(cookie)
        if not session:
            raise AccountError('Sign in to read a friend’s guide.', 401)
        try:
            owner_id = str(UUID(owner_id))
        except (ValueError, TypeError, AttributeError):
            raise AccountError('Invalid guide owner.') from None
        with session['lock']:
            return self.request('/rest/v1/rpc/get_followed_guide', {'p_owner':owner_id}, token=self.token(session))

    def prepare_friend_plan(self, body, cookie):
        # Recheck approval on every AI request. Client-submitted personal fields are not authoritative.
        guide = self.followed_guide(body.get('ownerId'), cookie)
        supplied = body.get('places')
        if not isinstance(supplied, list):
            raise AccountError('Invalid guide summary.')
        available = {place['url']:place for place in guide['places']}
        places = []
        google_fields = ('googleAddress', 'googleCategory', 'googleDescription', 'googlePriceRange', 'googleReviews', 'googleReviewTags')
        for candidate in supplied:
            if not isinstance(candidate, dict) or not isinstance(candidate.get('id'), str) or not isinstance(candidate.get('url'), str):
                raise AccountError('Invalid guide summary.')
            recorded = available.get(candidate.get('url'))
            if recorded:
                place = {**recorded, 'id':candidate['id']}
                place.update({field:candidate[field] for field in google_fields if field in candidate})
                places.append(place)
        return {**body, 'places':places}

    def handle(self, method, path, body, cookie):
        session_id, session = self.get_session(cookie)
        if method == 'GET' and path == '/api/account/session':
            if not self.configured or not session:
                return {'configured': self.configured, 'signedIn': False}, None
            with session['lock']:
                return {'configured': True, 'signedIn': True, 'profile': self.profile(session)}, None
        if not self.configured:
            raise AccountError('Account sign-in is being prepared. Your device guide is ready to use.', 503)
        if method == 'POST' and path in ('/api/account/sign-in', '/api/account/sign-up'):
            email, password = body.get('email'), body.get('password')
            if not isinstance(email, str) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254 or not isinstance(password, str) or not 8 <= len(password) <= 256:
                raise AccountError('Enter your email and a password of at least eight characters.')
            with self.lock:
                now = time.time()
                while self.attempts and self.attempts[0] < now - 600:
                    self.attempts.popleft()
                if len(self.attempts) >= 10:
                    raise AccountError('Please wait a few minutes before trying again.', 429)
                self.attempts.append(now)
            if path.endswith('/sign-up'):
                self.request('/auth/v1/signup', {'email': email, 'password': password})
                return {'message': 'Confirm your email if prompted, then sign in here.'}, None
            result = self.request('/auth/v1/token?grant_type=password', {'email': email, 'password': password})
            return self.create_session(result, cookie)
        if method == 'POST' and path == '/api/account/sign-out':
            with self.lock:
                self.sessions.pop(session_id, None)
            return {'signedIn': False}, self.cookie(age=0)
        if not session:
            raise AccountError('Please sign in to use your account guide.', 401)
        with session['lock']:
            if method == 'POST' and path == '/api/account/connections':
                return self.request('/rest/v1/rpc/guide_connections', {}, token=self.token(session)), None
            if method == 'POST' and path == '/api/account/follow':
                username = body.get('username')
                if not isinstance(username, str) or not re.fullmatch(r'[a-z0-9_]{3,30}', username):
                    raise AccountError('Enter your friend’s exact username.')
                return self.request('/rest/v1/rpc/request_guide_follow', {'p_username':username}, token=self.token(session)), None
            if method == 'POST' and path in ('/api/account/approve', '/api/account/revoke', '/api/account/unfollow'):
                try:
                    other_id = str(UUID(body.get('id')))
                except (ValueError, TypeError, AttributeError):
                    raise AccountError('Invalid connection.') from None
                owner_id = other_id if path.endswith('/unfollow') else session['user']['id']
                follower_id = session['user']['id'] if path.endswith('/unfollow') else other_id
                route = '/rest/v1/guide_follows?owner_id=eq.' + owner_id + '&follower_id=eq.' + follower_id
                approved = path.endswith('/approve')
                self.request(route, {'approved':True} if approved else None, token=self.token(session), method='PATCH' if approved else 'DELETE')
                return {'ok':True}, None
            if method == 'GET' and path == '/api/account/guide':
                return self.guide(session), None
            if method == 'POST' and path == '/api/account/profile':
                name, username = body.get('display_name'), body.get('username')
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80 or not isinstance(username, str) or not re.fullmatch(r'[a-z0-9_]{3,30}', username):
                    raise AccountError('Use a display name and a username of 3–30 lowercase letters, numbers or underscores.')
                self.request('/rest/v1/profiles?on_conflict=id', {'id': session['user']['id'], 'display_name': name.strip(), 'username': username},
                             token=self.token(session), prefer='resolution=merge-duplicates,return=minimal')
                return {'profile': self.profile(session)}, None
            if method == 'POST' and path == '/api/account/guide':
                places = clean_places(body.get('places'))
                return self.save(session, places, body.get('revision')), None
            if method == 'POST' and path == '/api/account/migrate':
                incoming = clean_places(body.get('places'))
                current = self.guide(session)
                seen = {place['url'] for place in current['places']}
                additions = [place for place in incoming if place['url'] not in seen]
                merged = clean_places(current['places'] + additions)
                saved = self.save(session, merged, current['revision'])
                return {'places': merged, 'revision': saved['revision'], 'added': len(additions)}, None
        raise AccountError('Not found.', 404)
