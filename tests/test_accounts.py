import base64
import copy
import threading
import unittest
from unittest.mock import patch

from accounts import Accounts, AccountError, clean_places

OWNER = '1442ca54-196b-4d68-a6b9-91230125f4ba'
FRIEND = '7e01ff2f-b906-46f4-8d52-2b5017195502'


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

    def test_friend_preview_is_read_only_and_follow_is_bound_to_previewed_id(self):
        client, cookie = self.client()
        with patch.object(client,'request',return_value={'id':FRIEND}) as request:
            client.handle('POST','/api/account/find-friend',{'username':'sample_friend'},cookie)
            self.assertEqual(request.call_args.args,('/rest/v1/rpc/lookup_guide_profile',{'p_username':'sample_friend'}))
            client.handle('POST','/api/account/follow',{'username':'sample_friend','expected_id':FRIEND},cookie)
            self.assertEqual(request.call_args.args,('/rest/v1/rpc/request_guide_follow',{'p_username':'sample_friend','p_expected_id':FRIEND}))

    def test_profile_edits_validate_photo_and_keep_media_out_of_session_json(self):
        client, cookie = self.client()
        jpeg = b'\xff\xd8\xff' + bytes(20) + b'\xff\xd9'
        photo = 'data:image/jpeg;base64,' + base64.b64encode(jpeg).decode()
        profile = {'id':OWNER,'display_name':'Example','username':'sample_viewer','bio':'Neighborhood walks','photo_data':photo}
        body = {key:value for key,value in profile.items() if key!='id'}
        with patch.object(client,'request',side_effect=[None,[profile]]) as upstream:
            result, _ = client.handle('POST','/api/account/profile',body,cookie)
            self.assertEqual(upstream.call_args_list[0].args[1],profile)
            self.assertEqual(result['profile']['bio'],'Neighborhood walks')
            self.assertTrue(result['profile']['has_photo'])
            self.assertNotIn('photo_data',result['profile'])
        with patch.object(client,'request') as upstream:
            with self.assertRaises(AccountError):
                client.handle('POST','/api/account/profile',{**body,'photo_data':'data:image/svg+xml;base64,PHN2Zy8+'},cookie)
            with self.assertRaises(AccountError):
                client.handle('POST','/api/account/profile',{**body,'bio':'x'*161},cookie)
            upstream.assert_not_called()
        with patch.object(client,'request',return_value={'photo_data':photo}) as upstream:
            self.assertEqual(client.profile_photo(FRIEND,cookie),jpeg)
            self.assertEqual(upstream.call_args.args,('/rest/v1/rpc/get_guide_profile_photo',{'p_owner':FRIEND}))
            self.assertEqual(upstream.call_args.kwargs['token'],'private-access')
        with self.assertRaises(AccountError) as failure:
            client.profile_photo(FRIEND,None)
        self.assertEqual(failure.exception.status,401)

    def test_session_remains_available_before_profile_migration(self):
        client, cookie = self.client()
        legacy = {'id':OWNER,'display_name':'Example','username':'sample_viewer'}
        with patch.object(client,'request',side_effect=[AccountError('Missing profile columns',501),[legacy]]):
            result, _ = client.handle('GET','/api/account/session',{},cookie)
        self.assertTrue(result['signedIn'])
        self.assertFalse(result['profile']['profile_fields'])

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

    def test_only_sourced_public_cuisines_and_keywords_are_saved(self):
        source = 'https://www.example.org/menu'
        cuisine = {'value':'japanese', 'url':source}
        keyword = {'value':'ramen', 'url':source}
        incoming = {**place(), 'publicDetails': {
            'cuisines':[cuisine, cuisine, {'value':'unknown', 'url':source}],
            'keywords':[keyword, {'value':'brunch', 'url':'https://www.yelp.com/biz/example'}],
            'neighborhood':{'value':'Brooklyn','url':source},
        }, 'googleCuisineTags':['japanese'], 'googleAddress':'Transient fixture'}
        cleaned = clean_places([incoming])[0]
        self.assertEqual(cleaned['publicDetails'], {'cuisines':[cuisine], 'keywords':[keyword]})
        self.assertNotIn('googleCuisineTags', cleaned)
        self.assertNotIn('googleAddress', cleaned)

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

    def test_only_the_session_owner_is_used_when_approving_a_follower(self):
        client, cookie = self.client()
        follower = '7e01ff2f-b906-46f4-8d52-2b5017195502'
        with patch.object(client,'request',return_value=None) as request:
            client.handle('POST','/api/account/approve',{'id':follower,'owner_id':follower},cookie)
        self.assertIn('owner_id=eq.' + OWNER,request.call_args.args[0])
        self.assertIn('follower_id=eq.' + follower,request.call_args.args[0])
        self.assertEqual(request.call_args.args[1],{'approved':True})

    def test_friend_plans_recheck_access_and_ignore_forged_personal_fields(self):
        client, cookie = self.client()
        visible = place()
        body = {'ownerId':OWNER,'places':[{**visible,'note':'Forged endorsement','recommended':True,'googleCategory':'Cafe'},
                                        place('Hidden place','https://maps.google.com/?cid=999')]}
        with patch.object(client,'followed_guide',return_value={'places':[visible]}) as access:
            verified = client.prepare_friend_plan(body,cookie)
        self.assertEqual(len(verified['places']),1)
        self.assertEqual(verified['places'][0]['note'],'Personal fixture note')
        self.assertFalse(verified['places'][0]['recommended'])
        self.assertEqual(verified['places'][0]['googleCategory'],'Cafe')
        access.assert_called_once_with(OWNER,cookie)
        with patch.object(client,'followed_guide',side_effect=AccountError('revoked',403)):
            with self.assertRaises(AccountError):
                client.prepare_friend_plan(body,cookie)

    def test_friend_plan_preserves_manual_choices_and_uses_sourced_cuisine(self):
        client, cookie = self.client()
        source = 'https://www.example.org/menu'
        visible = {**place(), 'category':'cafe', 'tags':['conversation'], 'detailOverrides':['tags'],
                   'publicDetails':{'cuisines':[{'value':'japanese', 'url':source}],
                                    'keywords':[{'value':'coffee', 'url':source}]}}
        candidate = {**visible, 'category':'bar', 'neighborhood':'Forged', 'googleNeighborhood':'East Village',
                     'googleCuisineTags':['japanese'], 'googleReviews':['Raw review'], 'googleReviewTags':['fun'],
                     'publicDetails':{'cuisines':[{'value':'korean', 'url':source}],
                                      'keywords':[{'value':'ramen', 'url':source}]}}
        body = {'ownerId':OWNER, 'places':[candidate]}
        with patch.object(client,'followed_guide',return_value={'places':[visible]}):
            result = client.prepare_friend_plan(body,cookie)['places'][0]
        with patch.object(client,'followed_guide',return_value={'places':[{**visible, 'detailOverrides':[]}]}):
            supplemented = client.prepare_friend_plan(body,cookie)['places'][0]
        self.assertEqual(result['category'], 'cafe')
        self.assertEqual(result['neighborhood'], 'East Village')
        self.assertEqual(result['tags'], ['conversation'])
        self.assertEqual(result['webCuisines'], ['japanese', 'korean'])
        self.assertNotIn('webVenueKeywords', result)
        self.assertEqual(supplemented['webVenueKeywords'], ['coffee', 'ramen'])
        self.assertEqual(result['googleCuisineTags'], ['japanese'])
        self.assertNotIn('googleReviews', result)
        self.assertNotIn('googleReviewTags', result)
