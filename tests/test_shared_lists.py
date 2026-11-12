import json
import unittest
from shared_lists import allowed_url, parse_list, SharedListError


class SharedListTests(unittest.TestCase):
    def fixture(self):
        location = [None] * 8
        location[6] = ['123', '456']
        entry = [None, location, 'Fictional cafe', 'A fictional saved note']
        data = [None] * 13
        data[4], data[8], data[12] = 'Fictional list', [entry], 1
        return data

    def test_import_preserves_title_note_and_maps_identity(self):
        result = parse_list(")]}'\n" + json.dumps([self.fixture()]))
        self.assertEqual(result['places'], [{'name': 'Fictional cafe', 'note': 'A fictional saved note', 'url': 'https://www.google.com/maps?cid=456'}])

    def test_incomplete_lists_fail_without_partial_import(self):
        data = self.fixture()
        data[12] = 2
        with self.assertRaises(SharedListError):
            parse_list(json.dumps([data]))

    def test_only_google_maps_https_targets_are_permitted(self):
        self.assertTrue(allowed_url('https://maps.app.goo.gl/fictional'))
        for url in ['http://www.google.com/maps', 'https://127.0.0.1/maps', 'https://www.google.com.evil.test/maps', 'https://user@www.google.com/maps', 'https://www.google.com:443/maps', 'https://www.google.com/search']:
            self.assertFalse(allowed_url(url))
