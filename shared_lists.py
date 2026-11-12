"""Read viewable Google Maps lists without account credentials."""
import html
import json
import re
from urllib.parse import urlsplit, urljoin
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError


class SharedListError(Exception):
    pass


def allowed_url(url):
    try:
        parsed = urlsplit(url)
        return (parsed.scheme == 'https' and not parsed.username and not parsed.password
                and parsed.port is None and parsed.hostname in ('maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com')
                and (parsed.hostname == 'maps.app.goo.gl' or parsed.path.startswith('/maps')))
    except ValueError:
        return False


class GoogleRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        if not allowed_url(newurl):
            raise SharedListError('This link redirects outside Google Maps. Copy the list’s viewing link again.')
        return super().redirect_request(request, response, code, message, headers, newurl)


def read_google(url):
    if not allowed_url(url):
        raise SharedListError('Paste an HTTPS Google Maps list link.')
    try:
        with build_opener(GoogleRedirects()).open(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=25) as response:
            raw = response.read(8_000_001)
            if len(raw) > 8_000_000:
                raise SharedListError('This list is too large to read. Try a smaller list.')
            return raw.decode('utf-8'), response.url
    except (HTTPError, URLError, TimeoutError, UnicodeError):
        raise SharedListError('Google could not load this list. Check that its viewing link works while signed out.') from None


def parse_list(raw):
    try:
        payload = json.loads(raw.split('\n', 1)[1] if raw.startswith(")]}'") else raw)
        data = payload[0]
        entries = data[8] or []
        name = data[4]
        total = data[12]
        if not isinstance(entries, list) or not isinstance(name, str) or type(total) is not int:
            raise ValueError()
        if len(entries) != total or total > 2000:
            raise SharedListError('Google returned an incomplete or oversized list. Use a smaller list or Takeout CSV.')
        places = []
        for entry in entries:
            title, note, location = entry[2], entry[3] or '', entry[1]
            if not isinstance(title, str) or not title.strip() or not isinstance(note, str):
                raise ValueError()
            # Google represents the Maps feature ID as two decimal strings.
            cid = int(location[6][1])
            if cid < 0:
                cid += 2 ** 64
            if not 0 < cid < 2 ** 64 or len(title) > 200 or len(note) > 3000:
                raise ValueError()
            places.append({'name': title, 'note': note, 'url': 'https://www.google.com/maps?cid=' + str(cid)})
        return {'listName': name[:200], 'places': places}
    except (ValueError, TypeError, IndexError, KeyError):
        raise SharedListError('Google’s list format could not be read. No places were imported. Try a Takeout CSV.') from None


def fetch_shared_list(url):
    if not isinstance(url, str) or len(url) > 4000:
        raise SharedListError('Paste a Google Maps list link.')
    page, final_url = read_google(url.strip())
    match = re.search(r'href="([^\"]*/maps/preview/entitylist/getlist\?[^\"]*)"', page)
    if not match:
        raise SharedListError('This link does not expose a readable shared list. Share the list using a viewing link, then try again.')
    endpoint = urljoin(final_url, html.unescape(match[1]))
    raw, _ = read_google(endpoint)
    return parse_list(raw)
