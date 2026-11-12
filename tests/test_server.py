import io
import json
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server import GooglePlaces, Handler, PlacesError, ThreadingHTTPServer
from accounts import Accounts


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

    def test_search_uses_narrow_fields_and_never_sends_personal_notes(self):
        with patch('server.urlopen', return_value=Response({'places': []})) as upstream:
            GooglePlaces('fixture-not-a-real-key').search('Test', 'Chelsea')
            request = upstream.call_args.args[0]
            self.assertEqual(json.loads(request.data)['textQuery'], 'Test Chelsea')
            self.assertNotIn('reviews', request.get_header('X-goog-fieldmask'))
            self.assertNotIn('key=', request.full_url)

    def test_review_opt_in_changes_fields_and_limits_samples(self):
        client = GooglePlaces('fixture-not-a-real-key')
        with self.assertRaises(PlacesError):
            client.details('ChIJfixture', True)
        with patch('server.urlopen', return_value=Response({'reviews': [{}] * 8, 'photos': [{}] * 8})) as upstream:
            data = GooglePlaces('fixture-not-a-real-key', reviews=True).details('ChIJfixture', True)
            self.assertEqual(len(data['reviews']), 5)
            self.assertEqual(len(data['photos']), 1)
            self.assertIn('reviews', upstream.call_args.args[0].get_header('X-goog-fieldmask'))

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
