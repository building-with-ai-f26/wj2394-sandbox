import json
import os
import threading
import unittest
from http.client import HTTPConnection
from unittest.mock import patch

from accounts import Accounts, AccountError
from server import GooglePlaces, Handler, RequestLimiter, ThreadingHTTPServer, public_app_origin


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

    def test_rate_limit_is_atomic_and_recovers_after_window(self):
        limiter = RequestLimiter(total=3, per_visitor=2, window=10)
        with patch('server.time.monotonic', return_value=100):
            self.assertTrue(limiter.allow('first'))
            self.assertTrue(limiter.allow('first'))
            self.assertFalse(limiter.allow('first'))
            outcomes = []
            threads = [threading.Thread(target=lambda: outcomes.append(limiter.allow('second'))) for _ in range(8)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            self.assertEqual(sum(outcomes), 1)
        with patch('server.time.monotonic', return_value=111):
            self.assertTrue(limiter.allow('first'))

    def test_public_api_rejects_other_hosts_and_origins_before_provider_calls(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        server.public_origin = 'https://demo.example'
        server.api_limiter = RequestLimiter(total=2)
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
            for expected in (200, 200, 429):
                connection.request('GET', '/api/status', headers={'Host':'demo.example'})
                response = connection.getresponse()
                self.assertEqual(response.status, expected)
                self.assertIn('max-age', response.getheader('Strict-Transport-Security'))
                response.read()
            connection.request('GET', '/healthz')
            response = connection.getresponse()
            self.assertEqual(json.loads(response.read()), {'ok':True})
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join()
