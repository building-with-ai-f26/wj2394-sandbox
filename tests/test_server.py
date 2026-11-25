import io
from contextlib import redirect_stderr
import json
import threading
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server import GooglePlaces, Handler, PlacesError, ThreadingHTTPServer, main
from accounts import Accounts
from planner import PlanError


class Response:
    def __init__(self, data):
        self.data = json.dumps(data).encode()
        self.status = 200
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def read(self, limit):
        return self.data[:limit]


class GoogleClientTests(unittest.TestCase):
    def test_missing_key_and_session_cap_prevent_calls(self):
        with patch('server.urlopen') as upstream:
            with self.assertRaises(PlacesError):
                GooglePlaces().search('Test')
            upstream.assert_not_called()
        client = GooglePlaces('fixture-not-a-real-key', limit=1)
        with patch('server.urlopen', return_value=Response({'places': []})) as upstream:
            client.search('Test')
            with self.assertRaises(PlacesError):
                client.search('Again')
            self.assertEqual(upstream.call_count, 1)

    def test_uncapped_local_client_keeps_usage_count(self):
        client = GooglePlaces('fixture-not-a-real-key', limit=None)
        client.used = 20
        with patch('server.urlopen', return_value=Response({'places': []})) as upstream:
            client.search('Mercado Little Spain')
            upstream.assert_called_once()
        self.assertIsNone(client.status()['requestLimit'])
        self.assertEqual(client.status()['requestsUsed'], 21)

    def test_uncapped_flag_is_refused_in_hosted_mode(self):
        with patch('sys.argv', ['server.py', '--no-places-limit']), \
             patch('server.public_app_origin', return_value='https://example.com'), \
             patch('server.ThreadingHTTPServer') as listener, redirect_stderr(io.StringIO()) as errors:
            with self.assertRaises(SystemExit) as aborted:
                main()
        self.assertEqual(aborted.exception.code, 2)
        self.assertIn('only in the local preview', errors.getvalue())
        listener.assert_not_called()

    def test_search_uses_narrow_fields_and_never_sends_personal_notes(self):
        with patch('server.urlopen', return_value=Response({'places': []})) as upstream:
            GooglePlaces('fixture-not-a-real-key').search('Test', 'Chelsea')
            request = upstream.call_args.args[0]
            self.assertEqual(json.loads(request.data)['textQuery'], 'Test Chelsea')
            self.assertNotIn('reviews', request.get_header('X-goog-fieldmask'))
            self.assertNotIn('key=', request.full_url)

    def test_photo_search_returns_one_reference_per_candidate_without_review_fields(self):
        candidate = {'id': 'ChIJMercado', 'photos': [{'name': 'ref-one'}, {'name': 'ref-two'}]}
        with patch('server.urlopen', return_value=Response({'places': [candidate]})) as upstream:
            data = GooglePlaces('fixture-not-a-real-key').search('Mercado Little Spain', include_photos=True)
            fields = upstream.call_args.args[0].get_header('X-goog-fieldmask').split(',')
        self.assertIn('places.photos', fields)
        self.assertNotIn('places.reviews', fields)
        self.assertEqual(data['places'][0]['photos'], [{'name': 'ref-one'}])

    def test_known_id_photo_details_request_only_id_and_photos(self):
        client = GooglePlaces('fixture-not-a-real-key', reviews=True)
        with patch('server.urlopen', return_value=Response({'id': 'ChIJTomino', 'photos': []})) as upstream:
            data = client.details('ChIJTomino', photos_only=True)
            request = upstream.call_args.args[0]
        self.assertEqual(request.get_header('X-goog-fieldmask'), 'id,photos')
        self.assertEqual(data, {'id': 'ChIJTomino', 'photos': []})
        with self.assertRaises(PlacesError):
            client.details('ChIJTomino', True, photos_only=True)
        with self.assertRaises(PlacesError):
            client.search('Tomiño Taberna Gallega', include_photos='yes')

    def test_import_enrichment_uses_neighborhood_components_without_price_or_reviews(self):
        client = GooglePlaces('fixture-not-a-real-key', reviews=True)
        address = [{'types': ['neighborhood'], 'longText': 'Williamsburg'}]
        with patch('server.urlopen', return_value=Response({'id': 'ChIJDevocion', 'addressComponents': address})) as upstream:
            data = client.details('ChIJDevocion', enrichment_only=True)
            fields = upstream.call_args.args[0].get_header('X-goog-fieldmask').split(',')
        self.assertIn('addressComponents', fields)
        self.assertIn('primaryType', fields)
        self.assertNotIn('websiteUri', fields)
        self.assertNotIn('priceRange', fields)
        self.assertNotIn('reviews', fields)
        self.assertEqual(data['addressComponents'], address)
        with self.assertRaises(PlacesError):
            client.details('ChIJDevocion', True, enrichment_only=True)

    def test_review_opt_in_changes_fields_and_limits_samples(self):
        client = GooglePlaces('fixture-not-a-real-key')
        with self.assertRaises(PlacesError):
            client.details('ChIJfixture', True)
        reviewed = GooglePlaces('fixture-not-a-real-key', reviews=True)
        service = {'servesLunch': True, 'servesDinner': True, 'goodForGroups': False, 'liveMusic': False}
        with patch('server.urlopen', side_effect=[Response({'id':'ChIJfixture'}),
                                                   Response({'reviews': [{}] * 8, 'photos': [{}] * 8, **service})]) as upstream:
            reviewed.details('ChIJfixture')
            regular_fields = upstream.call_args.args[0].get_header('X-goog-fieldmask').split(',')
            self.assertTrue(set(service).isdisjoint(regular_fields))
            data = reviewed.details('ChIJfixture', True)
            self.assertEqual(len(data['reviews']), 5)
            self.assertEqual(len(data['photos']), 1)
            fields = upstream.call_args.args[0].get_header('X-goog-fieldmask').split(',')
            self.assertIn('reviews', fields)
            self.assertIn('addressComponents', fields)
            self.assertIn('websiteUri', fields)
            self.assertTrue(set(service).issubset(fields))
            self.assertEqual({field:data[field] for field in service}, service)

    def test_invalid_ids_and_photo_urls_are_rejected(self):
        client = GooglePlaces('fixture-not-a-real-key')
        with self.assertRaises(PlacesError):
            client.details('../secrets')
        with self.assertRaises(PlacesError):
            client.photo('https://example.com/photo')
        with patch.object(client, 'request', return_value={'photoUri': 'http://127.0.0.1/private'}):
            with self.assertRaises(PlacesError):
                client.photo('places/ChIJfixture/photos/abc')

    def test_errors_do_not_disclose_upstream_credentials(self):
        error = HTTPError('https://upstream/?key=fixture-secret', 403, 'fixture-secret', {}, io.BytesIO())
        with patch('server.urlopen', side_effect=error):
            with self.assertRaises(PlacesError) as caught:
                GooglePlaces('fixture-secret').search('Test')
            self.assertNotIn('fixture-secret', str(caught.exception))


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        cls.server.places = GooglePlaces()
        cls.server.accounts = Accounts('https://fixture.supabase.co', 'sb_publishable_fixture')
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_status_no_store_and_no_secret(self):
        with urlopen(self.base + '/api/status') as response:
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            data = json.load(response)
            self.assertFalse(data['configured'])
            self.assertNotIn('key', data)

    def test_optional_venue_research_status_and_error_use_existing_handler(self):
        service = Mock(key='fixture-not-a-real-key')
        service.check.side_effect = PlanError('Research is temporarily unavailable.', 503)
        data = {'name': 'Mercado Little Spain'}
        request = Request(self.base + '/api/places/research', data=json.dumps(data).encode(),
                          headers={'Content-Type': 'application/json'})
        with patch.object(self.server, 'venue_research', service, create=True):
            with urlopen(self.base + '/api/status') as response:
                self.assertTrue(json.load(response)['venueResearchConfigured'])
            with self.assertRaises(HTTPError) as caught:
                urlopen(request)
            with caught.exception as response:
                self.assertEqual(response.code, 503)
                self.assertEqual(json.load(response)['error'], 'Research is temporarily unavailable.')
        service.check.assert_called_once_with(data, unlimited=False)

    def test_profile_photos_are_same_origin_uncached_images(self):
        with patch.object(self.server.accounts,'profile_photo',return_value=b'jpeg fixture') as photo:
            with urlopen(self.base + '/api/account/avatar?owner=fixture-owner') as response:
                self.assertEqual(response.headers['Content-Type'],'image/jpeg')
                self.assertEqual(response.headers['Cache-Control'],'no-store')
                self.assertEqual(response.headers['Cross-Origin-Resource-Policy'],'same-origin')
                self.assertEqual(response.read(),b'jpeg fixture')
            photo.assert_called_once_with('fixture-owner',None)
            request = Request(self.base + '/api/account/avatar?owner=fixture-owner',headers={'Sec-Fetch-Site':'cross-site'})
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code,403)
            error.exception.close()
            self.assertEqual(photo.call_count,1)

    def test_google_callback_accepts_provider_navigation_and_hides_tokens(self):
        from http.client import HTTPConnection
        connection = HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request('POST', '/api/account/google/start', body='{}', headers={'Content-Type':'application/json'})
        response = connection.getresponse()
        self.assertEqual(response.status, 200)
        pending_cookie = response.getheader('Set-Cookie')
        self.assertIn('provider=google', json.loads(response.read())['url'])
        result = {'user':{'id':'1442ca54-196b-4d68-a6b9-91230125f4ba'},
                  'access_token':'private-access', 'refresh_token':'private-refresh', 'expires_in':3600}
        with patch.object(self.server.accounts, 'request', return_value=result):
            connection.request('GET', '/api/account/google/callback?code=fixture-code',
                               headers={'Cookie':pending_cookie, 'Sec-Fetch-Site':'cross-site'})
            response = connection.getresponse()
            self.assertEqual(response.status, 303)
            self.assertEqual(response.getheader('Location'), '/prototype/?signin=google')
            self.assertEqual(response.getheader('Referrer-Policy'), 'no-referrer')
            self.assertNotIn('private-access', str(response.getheaders()))
            response.read()
        connection.request('GET', '/api/account/google/callback?code=fixture-code',
                           headers={'Cookie':pending_cookie, 'Sec-Fetch-Site':'cross-site'})
        response = connection.getresponse()
        self.assertEqual(response.getheader('Location'), '/prototype/?signin=failed')
        response.read()
        connection.close()

    def test_static_site_works_but_repo_secrets_are_not_served(self):
        with urlopen(self.base + '/prototype/') as response:
            self.assertIn(b'Inner Table', response.read())
        for path in ['/.env', '/server.py', '/AGENTS.md', '/%2e%2e/.env']:
            with self.assertRaises(HTTPError) as error:
                urlopen(self.base + path)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()

    def test_cross_origin_post_cannot_spend_api_calls(self):
        request = Request(self.base + '/api/places/search', data=b'{"name":"Test"}',
                          headers={'Content-Type': 'application/json', 'Origin': 'https://example.com'})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 403)
        error.exception.close()
        self.assertEqual(self.server.places.used, 0)

    def test_missing_key_returns_actionable_error(self):
        request = Request(self.base + '/api/places/search', data=b'{"name":"Test"}',
                          headers={'Content-Type': 'application/json'})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 503)
        self.assertIn('GOOGLE_MAPS_API_KEY', json.load(error.exception)['error'])
        error.exception.close()


if __name__ == '__main__':
    unittest.main()
