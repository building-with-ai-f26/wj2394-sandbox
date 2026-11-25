import hmac
import json
import os
import threading
import unittest
from http.client import HTTPConnection
from unittest.mock import Mock, patch

from accounts import Accounts, AccountError
from daily_limits import DailyRequestQuota, QuotaUnavailable
from server import GooglePlaces, Handler, ThreadingHTTPServer, public_app_origin


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


class PublicModeTests(unittest.TestCase):
    def test_public_mode_requires_an_explicit_https_origin(self):
        with patch.dict(os.environ, {'APP_MODE':'public', 'APP_PUBLIC_ORIGIN':'', 'RENDER_EXTERNAL_URL':''}):
            with self.assertRaises(ValueError):
                public_app_origin()
            for value in ('http://demo.example', 'https://demo.example/path', 'https://user@demo.example', 'https://localhost'):
                os.environ['APP_PUBLIC_ORIGIN'] = value
                with self.assertRaises(ValueError):
                    public_app_origin()
            os.environ['APP_PUBLIC_ORIGIN'] = 'https://demo.example/'
            self.assertEqual(public_app_origin(), 'https://demo.example')
            os.environ['APP_MODE'] = 'local'
            self.assertEqual(public_app_origin(), '')

    def test_public_auth_cookies_and_oauth_redirect_are_bound_to_app(self):
        accounts = Accounts('https://fixture.supabase.co', 'sb_publishable_fixture', 'https://demo.example')
        result, cookie = accounts.start_google('https://demo.example')
        self.assertIn('Secure', cookie)
        self.assertIn('https%3A%2F%2Fdemo.example%2Fapi%2Faccount%2Fgoogle%2Fcallback', result['url'])
        self.assertIn('Secure', accounts.cookie())
        self.assertIn('Secure', accounts.cookie(age=0))
        with self.assertRaises(AccountError):
            accounts.start_google('https://other.example')

    def test_quota_requests_sign_the_scope_without_transmitting_the_ip(self):
        secret = 'ab' * 32
        visitor = '192.0.2.20'
        request = Mock(return_value=30)
        quota = DailyRequestQuota(request, secret)
        with patch('daily_limits.time.time', return_value=123456):
            self.assertEqual(quota.consume(visitor, priority=True, owner=False), 30)
        path, args = request.call_args.args
        self.assertEqual(path, '/rest/v1/rpc/consume_demo_request')
        self.assertEqual(args['p_kind'], 'priority')
        self.assertEqual(args['p_visitor'], hmac.digest(secret.encode(), b'visitor:192.0.2.20', 'sha256').hex())
        message = f"count:123456:{args['p_visitor']}:priority".encode()
        self.assertEqual(args['p_signature'], hmac.digest(secret.encode(), message, 'sha256').hex())
        self.assertNotIn(visitor, str(args))
        self.assertNotIn(secret, str(args))
        request.side_effect = AccountError('internal error', 502)
        with self.assertRaises(QuotaUnavailable):
            quota.consume(visitor, priority=False, owner=False)

    def test_public_api_rejects_other_hosts_and_origins_before_provider_calls(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        server.public_origin = 'https://demo.example'
        server.api_limiter = Mock()
        server.api_limiter.consume.side_effect = [0, 0, 42]
        server.places = GooglePlaces()
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = HTTPConnection('127.0.0.1', server.server_port)
        try:
            for headers in ({'Host':'other.example', 'Origin':'https://demo.example'},
                            {'Host':'demo.example', 'Origin':'https://other.example'},
                            {'Host':'demo.example'}):
                connection.request('POST', '/api/places/search', '{}', {**headers, 'Content-Type':'application/json'})
                response = connection.getresponse()
                self.assertEqual(response.status, 403)
                response.read()
            self.assertEqual(server.places.used, 0)
            server.api_limiter.consume.assert_not_called()
            for expected in (200, 200, 429):
                connection.request('GET', '/api/status', headers={'Host':'demo.example'})
                response = connection.getresponse()
                self.assertEqual(response.status, expected)
                self.assertIn('max-age', response.getheader('Strict-Transport-Security'))
                if expected == 429:
                    self.assertEqual(response.getheader('Retry-After'), '42')
                    self.assertIn('midnight New York time', json.loads(response.read())['error'])
                response.read()
            connection.request('GET', '/healthz')
            response = connection.getresponse()
            self.assertEqual(json.loads(response.read()), {'ok':True})
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_only_verified_owner_bypasses_caps_and_sign_in_stays_reachable(self):
        origin = 'https://demo.example'
        owner_id = '1442ca54-196b-4d68-a6b9-91230125f4ba'
        visitor_id = '2442ca54-196b-4d68-a6b9-91230125f4ba'
        accounts = Accounts('https://fixture.supabase.co', 'sb_publishable_fixture', origin)
        def session_cookie(account_id):
            _, cookie = accounts.create_session({
                'user':{'id':account_id}, 'access_token':'fixture-token', 'refresh_token':'fixture-refresh',
                'expires_in':3600,
            }, None)
            self.assertIn('Path=/api;', cookie)
            return cookie.split(';')[0]
        owner_cookie, visitor_cookie = session_cookie(owner_id), session_cookie(visitor_id)
        server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        server.public_origin = origin
        server.accounts = accounts
        server.demo_owner_id = owner_id
        server.api_limiter = Mock()
        server.api_limiter.consume.side_effect = lambda visitor, *, priority, owner: 0 if owner else 30
        server.places = GooglePlaces('fixture-marked-key', limit=1)
        server.places.used = 1
        server.planner = Mock(key='fixture-marked-key')
        server.planner.recommend.return_value = {'reply':'Fixture result','matches':[]}
        server.venue_research = Mock(key='fixture-marked-key')
        server.venue_research.check.return_value = {}
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = HTTPConnection('127.0.0.1', server.server_port)
        def post(path, cookie=None, body=None):
            headers = {'Host':'demo.example','Origin':origin,'Content-Type':'application/json'}
            if cookie:
                headers['Cookie'] = cookie
            connection.request('POST', path, json.dumps(body or {}), headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        try:
            self.assertEqual(post('/api/plan',visitor_cookie,{'ownerId':owner_id,'unlimited':True})[0],429)
            self.assertEqual(post('/api/plan',f'inner_table_session_v2={owner_id}')[0],429)
            server.planner.recommend.assert_not_called()
            self.assertEqual(post('/api/plan',owner_cookie)[0],200)
            server.planner.recommend.assert_called_once_with({},shortlist=False,unlimited=True)
            self.assertEqual(post('/api/places/research',owner_cookie,{'name':'Public fixture'})[0],200)
            server.venue_research.check.assert_called_once_with({'name':'Public fixture'},unlimited=True)
            upstream = Mock(status=200)
            upstream.read.return_value = b'{"places":[]}'
            with patch('server.urlopen') as provider:
                provider.return_value.__enter__.return_value = upstream
                status, result = post('/api/places/search',owner_cookie,{'name':'Public fixture'})
            self.assertEqual(status,200)
            self.assertIsNone(result['usage']['requestLimit'])
            self.assertEqual(server.places.used,1)
            calls = server.api_limiter.consume.call_count
            self.assertEqual(post('/api/account/sign-out',visitor_cookie)[0],200)
            self.assertIsNone(accounts.get_session(visitor_cookie)[1])
            with patch.object(accounts,'handle',return_value=({'signedIn':True},owner_cookie)):
                self.assertEqual(post('/api/account/sign-in')[0],200)
            self.assertEqual(server.api_limiter.consume.call_count,calls)
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join()
