import copy
import threading
import unittest
from unittest.mock import patch

from accounts import Accounts, AccountError, clean_places

OWNER = '1442ca54-196b-4d68-a6b9-91230125f4ba'


def place(name='Fictional cafe', url='https://maps.google.com/?cid=123'):
    return {'id':'fixture', 'name':name, 'url':url, 'category':'unknown', 'status':'not specified',
            'recommended':False, 'inGuide':True, 'price':None, 'note':'Personal fixture note',
            'neighborhood':'', 'tags':[], 'inferredTags':[]}


class AccountTests(unittest.TestCase):
    def test_google_pkce_is_bound_to_browser_and_consumed_once(self):
        from urllib.parse import parse_qs, urlsplit
        client = Accounts('https://fixture.supabase.co', 'sb_publishable_fixture')
        start, cookie = client.start_google('http://127.0.0.1:8001')
        query = parse_qs(urlsplit(start['url']).query)
        self.assertEqual(query['provider'], ['google'])
        self.assertEqual(query['code_challenge_method'], ['s256'])
        self.assertEqual(query['redirect_to'], ['http://127.0.0.1:8001/api/account/google/callback'])
        self.assertIn('SameSite=Lax', cookie)
        with patch.object(client, 'request') as upstream:
            with self.assertRaises(AccountError):
                client.finish_google('fixture-code', None)
            upstream.assert_not_called()
        response = {'user':{'id':OWNER}, 'access_token':'private-access', 'refresh_token':'private-refresh', 'expires_in':3600}
        with patch.object(client, 'request', return_value=response) as upstream:
            result, session_cookie = client.finish_google('fixture-code', cookie)
        self.assertTrue(result['signedIn'])
        self.assertNotIn('private-access', session_cookie)
        self.assertEqual(upstream.call_args.args[0], '/auth/v1/token?grant_type=pkce')
        self.assertIn('code_verifier', upstream.call_args.args[1])
        with self.assertRaises(AccountError):
            client.finish_google('fixture-code', cookie)

    def test_google_rejects_expired_attempts_and_external_redirects(self):
        client = Accounts('https://fixture.supabase.co', 'sb_publishable_fixture')
        with self.assertRaises(AccountError):
            client.start_google('https://unexpected.example')
        _, cookie = client.start_google('http://127.0.0.1:8001')
        next(iter(client.google_attempts.values()))['until'] = 0
        with patch.object(client, 'request') as upstream:
            with self.assertRaises(AccountError):
                client.finish_google('fixture-code', cookie)
            upstream.assert_not_called()

    def client(self):
        client = Accounts('https://fixture.supabase.co', 'sb_publishable_fixture')
        response = {'user':{'id':OWNER}, 'access_token':'private-access', 'refresh_token':'private-refresh', 'expires_in':3600}
        with patch.object(client, 'request', return_value=response):
            result, cookie = client.handle('POST','/api/account/sign-in',{'email':'fixture@example.com','password':'fixture-password'},None)
        return client, cookie

    def test_unconfigured_and_anonymous_sessions_do_not_leak_keys(self):
        client = Accounts()
        result, cookie = client.handle('GET','/api/account/session',{},None)
        self.assertEqual(result, {'configured':False,'signedIn':False})
        with self.assertRaises(AccountError):
            client.handle('GET','/api/account/guide',{},None)
        self.assertFalse(Accounts('https://fixture.supabase.co','sb_secret_private').configured)
        self.assertFalse(Accounts('http://127.0.0.1','fixture').configured)

    def test_signin_cookie_hides_tokens_and_signout_invalidates_it(self):
        client, cookie = self.client()
        self.assertIn('HttpOnly',cookie)
        self.assertIn('SameSite=Strict',cookie)
        self.assertNotIn('private-access',cookie)
        client.handle('POST','/api/account/sign-out',{},cookie)
        with self.assertRaises(AccountError) as caught:
            client.handle('GET','/api/account/guide',{},cookie)
        self.assertEqual(caught.exception.status,401)

    def test_profile_ownership_comes_from_session_not_request(self):
        client, cookie = self.client()
        with patch.object(client, 'request', side_effect=[None,[]]) as request:
            client.handle('POST','/api/account/profile',{'id':'another-owner','display_name':'Fixture','username':'fixture_name'},cookie)
        self.assertEqual(request.call_args_list[0].args[1]['id'],OWNER)
        self.assertEqual(request.call_args_list[0].kwargs['token'],'private-access')

    def test_migration_preserves_existing_edits_and_is_repeatable(self):
        client, cookie = self.client()
        existing = clean_places([place()])[0]
        existing['note'] = 'Account edit wins'
        existing['inGuide'] = False
        incoming = [place(), place('Another fictional cafe','https://maps.google.com/?cid=456')]
        with patch.object(client,'guide',return_value={'places':[existing],'revision':3}), patch.object(client,'save',return_value={'revision':4}) as save:
            result, _ = client.handle('POST','/api/account/migrate',{'places':incoming},cookie)
        self.assertEqual(result['added'],1)
        self.assertEqual(result['places'][0]['note'],'Account edit wins')
        self.assertFalse(result['places'][0]['inGuide'])
        with patch.object(client,'guide',return_value=result), patch.object(client,'save',return_value={'revision':5}):
            repeated, _ = client.handle('POST','/api/account/migrate',{'places':incoming},cookie)
        self.assertEqual(repeated['added'],0)
        self.assertEqual(len(repeated['places']),2)

    def test_google_content_is_stripped_and_invalid_snapshot_is_rejected(self):
        incoming = place()
        incoming.update(_google={'reviews':['Do not persist']},googleReviews=['Do not persist'],googlePlaceId='ChIJfixture')
        cleaned = clean_places([incoming])[0]
        self.assertNotIn('_google',cleaned)
        self.assertNotIn('googleReviews',cleaned)
        self.assertEqual(cleaned['googlePlaceId'],'ChIJfixture')
        client, cookie = self.client()
        with patch.object(client,'request') as request:
            with self.assertRaises(AccountError):
                client.handle('POST','/api/account/guide',{'places':[place(),{**place(),'price':float('nan')}],'revision':1},cookie)
            request.assert_not_called()

    def test_stale_revision_and_lost_response_retry(self):
        client, cookie = self.client()
        _, session = client.get_session(cookie)
        snapshot = clean_places([place()])
        with patch.object(client,'request',side_effect=AccountError('conflict',409)), patch.object(client,'guide',return_value={'places':snapshot,'revision':2}):
            self.assertEqual(client.save(session,snapshot,1),{'revision':2})
        other = copy.deepcopy(snapshot)
        other[0]['note'] = 'Changed elsewhere'
        with patch.object(client,'request',side_effect=AccountError('conflict',409)), patch.object(client,'guide',return_value={'places':other,'revision':2}):
            with self.assertRaises(AccountError):
                client.save(session,snapshot,1)

    def test_concurrent_requests_refresh_rotating_token_once(self):
        client, cookie = self.client()
        _, session = client.get_session(cookie)
        session['expires'] = 0
        def upstream(path, *args, **kwargs):
            if 'refresh_token' in path:
                return {'access_token':'new-access','refresh_token':'new-refresh','expires_in':3600}
            return []
        with patch.object(client,'request',side_effect=upstream) as request:
            threads = [threading.Thread(target=client.handle,args=('GET','/api/account/guide',{},cookie)) for _ in range(2)]
            for thread in threads:thread.start()
            for thread in threads:thread.join()
        refreshes = [call for call in request.call_args_list if 'refresh_token' in call.args[0]]
        self.assertEqual(len(refreshes),1)
