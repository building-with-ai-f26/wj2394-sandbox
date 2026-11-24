"""Inner Table. app with explicit local and HTTPS-proxied public modes."""
import argparse
from collections import deque
import ipaddress
import json
import os
from pathlib import Path
import re
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlsplit
from urllib.request import Request, urlopen
from usage import UsageLog
from planner import DEFAULT_SEARCH_MODEL, Planner, PlanError
from venue_research import VenueResearch
from accounts import Accounts, AccountError
from shared_lists import fetch_shared_list, SharedListError

ROOT = Path(__file__).resolve().parent
PLACE_ID = re.compile(r"[A-Za-z0-9_-]{5,255}\Z")
PHOTO_NAME = re.compile(r"places/[A-Za-z0-9_-]{5,255}/photos/[A-Za-z0-9_-]{1,2000}\Z")


def public_app_origin():
    mode = os.getenv('APP_MODE', 'local')
    if mode not in ('local', 'public'):
        raise ValueError('APP_MODE must be local or public.')
    if mode == 'local':
        return ''
    value = os.getenv('APP_PUBLIC_ORIGIN') or os.getenv('RENDER_EXTERNAL_URL', '')
    parsed = urlsplit(value)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.port or parsed.path not in ('', '/') or parsed.query or parsed.fragment
            or parsed.hostname in ('localhost', '127.0.0.1', '::1')):
        raise ValueError('Public mode requires the app HTTPS origin in APP_PUBLIC_ORIGIN or RENDER_EXTERNAL_URL.')
    return value.rstrip('/')


class RequestLimiter:
    """Bound total and per-visitor API traffic for one running demo instance."""
    def __init__(self, total=300, per_visitor=60, window=3600):
        self.total = total
        self.per_visitor = per_visitor
        self.window = window
        self.requests = deque()
        self.visitors = {}
        self.lock = threading.Lock()

    def allow(self, visitor):
        now = time.monotonic()
        cutoff = now - self.window
        with self.lock:
            while self.requests and self.requests[0] <= cutoff:
                self.requests.popleft()
            self.visitors = {key:times for key,times in self.visitors.items() if times[-1] > cutoff}
            times = self.visitors.get(visitor, deque())
            while times and times[0] <= cutoff:
                times.popleft()
            if (len(self.requests) >= self.total or len(times) >= self.per_visitor
                    or (visitor not in self.visitors and len(self.visitors) >= 2000)):
                return False
            self.requests.append(now)
            times.append(now)
            self.visitors[visitor] = times
            return True


def load_env(path=ROOT / ".env"):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            key = key.strip()
            if re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
                os.environ.setdefault(key, value.strip().strip("\"'"))


class PlacesError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


PLACE_PHOTO_FIELDS = "id,photos"
PLACE_ENRICHMENT_FIELDS = (
    "id,displayName,formattedAddress,addressComponents,primaryType,primaryTypeDisplayName,"
    "types,photos,googleMapsUri,attributions"
)


class GooglePlaces:
    def __init__(self, key="", limit=40, reviews=False, usage=None):
        self.key = key
        self.limit = None if limit is None else max(1, min(int(limit), 1000))
        self.reviews = reviews
        self.used = 0
        self.lock = threading.Lock()
        self.usage = usage

    def status(self):
        return {"configured": bool(self.key), "reviewsEnabled": self.reviews,
                "requestsUsed": self.used, "requestLimit": self.limit}

    def request(self, resource, payload=None, fields=None, query=None):
        if not self.key:
            raise PlacesError("Add GOOGLE_MAPS_API_KEY to your local .env and restart the server.", 503)
        with self.lock:
            if self.limit is not None and self.used >= self.limit:
                raise PlacesError("Local session request limit reached. Review Google Cloud usage before restarting.", 429)
            self.used += 1
        headers = {"X-Goog-Api-Key": self.key, "Content-Type": "application/json"}
        if fields:
            headers["X-Goog-FieldMask"] = fields
        url = "https://places.googleapis.com/v1/" + resource
        if query:
            url += "?" + urlencode(query)
        request = Request(url, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
        started = time.monotonic()
        http_status = 502
        try:
            with urlopen(request, timeout=15) as response:
                http_status = response.status
                return json.loads(response.read(2_000_000))
        except HTTPError as error:
            # Never forward upstream URLs, headers, or errors that could contain credentials.
            code = error.code
            http_status = code
            error.close()
            raise PlacesError({400: "Google rejected the request. Check that Places API (New) is enabled.",
                               403: "Google denied access. Check API restrictions, billing, and Places API (New).",
                               404: "This Google place or photo could not be found. Try matching again.",
                               429: "Google's quota was reached. Check your Cloud quota and billing."}.get(code, "Google Places is temporarily unavailable."),
                              code if code in [400, 403, 404, 429] else 502) from None
        except (URLError, TimeoutError, ValueError):
            raise PlacesError("Could not reach Google Places. Try again later.", 502) from None
        finally:
            if self.usage:
                operation = "search" if resource == "places:searchText" else "photo" if resource.endswith("/media") else "details"
                if operation == "search":
                    sku = "Text Search Pro"
                elif operation == "photo":
                    sku = "Place Photos"
                elif fields == PLACE_PHOTO_FIELDS:
                    sku = "Place Details Essentials IDs Only"
                elif fields == PLACE_ENRICHMENT_FIELDS:
                    sku = "Place Details Pro"
                else:
                    sku = "Place Details Enterprise + Atmosphere" if fields and "reviews" in fields else "Place Details Enterprise"
                self.usage.record(operation, http_status, round((time.monotonic() - started) * 1000), sku)

    def search(self, name, neighborhood="", include_photos=False):
        if not isinstance(name, str) or not name.strip() or len(name) > 200:
            raise PlacesError("Provide a place name up to 200 characters.")
        if not isinstance(neighborhood, str) or len(neighborhood) > 100:
            raise PlacesError("Invalid neighborhood.")
        if not isinstance(include_photos, bool):
            raise PlacesError("Invalid photo option.")
        fields = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.attributions"
        if include_photos:
            fields += ",places.photos"
        data = self.request("places:searchText", {
            "textQuery": " ".join(part for part in [name.strip(), neighborhood.strip()] if part),
            "pageSize": 3, "languageCode": "en", "regionCode": "US",
            "locationBias": {"circle": {"center": {"latitude": 40.7306, "longitude": -73.9866}, "radius": 30000}}
        }, fields)
        places = data.get("places", [])[:3]
        if include_photos:
            for place in places:
                place["photos"] = (place.get("photos") or [])[:1]
        return {"places": places}

    def details(self, place_id, include_reviews=False, photos_only=False, enrichment_only=False):
        if not isinstance(place_id, str) or not PLACE_ID.fullmatch(place_id):
            raise PlacesError("Invalid Google place ID.")
        if not isinstance(include_reviews, bool):
            raise PlacesError("Invalid review option.")
        if not isinstance(photos_only, bool) or not isinstance(enrichment_only, bool):
            raise PlacesError("Invalid place details option.")
        if sum((include_reviews, photos_only, enrichment_only)) > 1:
            raise PlacesError("Choose one place details option.")
        if include_reviews and not self.reviews:
            raise PlacesError("Reviews are disabled locally. Set GOOGLE_PLACES_REVIEWS_ENABLED=true to enable the higher-priced review tier.")
        fields = PLACE_PHOTO_FIELDS if photos_only else PLACE_ENRICHMENT_FIELDS
        if not photos_only and not enrichment_only:
            fields += ",priceRange,websiteUri"
        if include_reviews:
            fields += ",reviews,editorialSummary"
        data = self.request("places/" + quote(place_id, safe=""), fields=fields)
        # Only one photo is needed per card. Review order remains Google's relevance order.
        data["photos"] = data.get("photos", [])[:1]
        if not photos_only:
            data["reviews"] = data.get("reviews", [])[:5] if include_reviews else []
        return data

    def photo(self, name):
        if not isinstance(name, str) or not PHOTO_NAME.fullmatch(name):
            raise PlacesError("Invalid photo resource.")
        data = self.request(name + "/media", query={"maxWidthPx": 800, "skipHttpRedirect": "true"})
        uri = data.get("photoUri", "")
        parsed = urlsplit(uri)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port or not (
                (parsed.hostname or "").endswith(".googleusercontent.com") or
                (parsed.hostname or "").endswith(".ggpht.com")):
            raise PlacesError("Google returned an unsupported photo URL.", 502)
        try:
            # Do not send the API credential to the photo host. Redirects are not followed.
            from urllib.request import HTTPRedirectHandler, build_opener
            class NoRedirect(HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs):
                    return None
            with build_opener(NoRedirect()).open(Request(uri), timeout=15) as response:
                mime = response.headers.get_content_type()
                content = response.read(8_000_001)
                if mime not in ["image/jpeg", "image/png", "image/webp"] or len(content) > 8_000_000:
                    raise PlacesError("Unsupported photo response.", 502)
                return content, mime
        except (HTTPError, URLError, TimeoutError):
            raise PlacesError("Photo unavailable. Match again to get a fresh reference.", 502) from None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "docs"), **kwargs)

    def setup(self):
        super().setup()
        if getattr(self.server, 'public_origin', ''):
            self.connection.settimeout(30)

    def log_message(self, format, *args):
        if getattr(self.server, 'public_origin', ''):
            print(format % args, flush=True)
        else:
            super().log_message(format, *args)

    def log_request(self, code="-", size="-"):
        # Request counters belong in the private ledger, with photo references omitted.
        self.log_message("%s %s %s", self.command, urlsplit(self.path).path, code)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer" if urlsplit(self.path).path == '/api/account/google/callback' else "strict-origin-when-cross-origin")
        if getattr(self.server, 'public_origin', ''):
            self.send_header('Strict-Transport-Security', 'max-age=31536000')
        super().end_headers()

    def check_request(self, oauth_callback=False):
        host = self.headers.get("Host", "")
        public_origin = getattr(self.server, 'public_origin', '')
        expected_origin = public_origin or 'http://' + host
        allowed = [urlsplit(public_origin).netloc] if public_origin else [f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"]
        origin = self.headers.get("Origin")
        if host not in allowed or (origin and origin != expected_origin) or (not oauth_callback and self.headers.get("Sec-Fetch-Site") == "cross-site"):
            raise PlacesError("Open Inner Table. at its app address to make this request.", 403)
        if public_origin and self.command == 'POST' and origin != public_origin:
            raise PlacesError('This request needs to come from the app.', 403)
        if public_origin and not oauth_callback:
            # Render supplies the visitor address as the first forwarded entry.
            forwarded = self.headers.get('X-Forwarded-For', '').split(',')[0].strip()
            try:
                visitor = str(ipaddress.ip_address(forwarded or self.client_address[0]))
            except ValueError:
                visitor = self.client_address[0]
            if not self.server.api_limiter.allow(visitor):
                raise PlacesError('The demo request limit was reached. Please try again later.', 429)

    def json_response(self, data, status=200, cookie=None):
        content = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        route = urlsplit(self.path)
        if route.path == '/healthz':
            self.json_response({'ok': True})
            return
        if not route.path.startswith("/api/"):
            # Static files come exclusively from docs, never the repo root or .env.
            if any(part.startswith(".") for part in route.path.split("/") if part):
                self.send_error(404)
                return
            return super().do_GET()
        try:
            self.check_request(oauth_callback=route.path == '/api/account/google/callback')
            if route.path == '/api/account/google/callback':
                try:
                    _, cookie = self.server.accounts.finish_google(parse_qs(route.query).get('code', [''])[0], self.headers.get('Cookie'))
                    destination = '/prototype/?signin=google'
                except AccountError:
                    cookie = None
                    destination = '/prototype/?signin=failed'
                self.send_response(303)
                self.send_header('Location', destination)
                if cookie:
                    self.send_header('Set-Cookie', cookie)
                secure = '; Secure' if getattr(self.server, 'public_origin', '') else ''
                self.send_header('Set-Cookie', 'inner_table_google=; HttpOnly; SameSite=Lax; Path=/api/account/google; Max-Age=0' + secure)
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            if route.path == '/api/account/avatar':
                owner = parse_qs(route.query).get('owner', [''])[0]
                content = self.server.accounts.profile_photo(owner, self.headers.get('Cookie'))
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
                self.end_headers()
                self.wfile.write(content)
            elif route.path.startswith('/api/account/'):
                result, cookie = self.server.accounts.handle('GET', route.path, {}, self.headers.get('Cookie'))
                self.json_response(result, cookie=cookie)
            elif route.path == "/api/status":
                self.json_response({
                    **self.server.places.status(),
                    "aiConfigured": bool(getattr(getattr(self.server, "planner", None), "key", "")),
                    "venueResearchConfigured": bool(getattr(getattr(self.server, "venue_research", None), "key", "")),
                })
            elif route.path == "/api/places/photo":
                content, mime = self.server.places.photo(parse_qs(route.query).get("name", [""])[0])
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                raise PlacesError("Not found.", 404)
        except (PlacesError, AccountError) as error:
            self.json_response({"error": str(error)}, error.status)

    def do_POST(self):
        try:
            self.check_request()
            if self.headers.get_content_type() != "application/json":
                raise PlacesError("Send JSON.", 415)
            length = int(self.headers.get("Content-Length", "0"))
            maximum = 20_000_000 if self.path in ('/api/account/guide', '/api/account/migrate') else 1_000_000 if self.path in ('/api/plan', '/api/plan/shortlist', '/api/account/plan', '/api/account/plan/shortlist') else 124_000 if self.path == '/api/account/profile' else 8192
            if not 0 < length <= maximum:
                raise PlacesError("Request too large or empty.", 413)
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise PlacesError("Send a JSON object.")
            if self.path == '/api/account/google/start':
                origin = getattr(self.server, 'public_origin', '') or 'http://' + self.headers['Host']
                result, cookie = self.server.accounts.start_google(origin)
                self.json_response(result, cookie=cookie)
                return
            if self.path == '/api/import/maps-list':
                try:
                    self.json_response(fetch_shared_list(data.get('url')))
                except SharedListError as error:
                    self.json_response({'error': str(error)}, 400)
                return
            if self.path in ('/api/account/plan', '/api/account/plan/shortlist'):
                verified = self.server.accounts.prepare_friend_plan(data, self.headers.get('Cookie'))
                self.json_response(self.server.planner.recommend(verified, shortlist=self.path.endswith('/shortlist')))
                return
            elif self.path == '/api/account/friend-guide':
                self.json_response(self.server.accounts.followed_guide(data.get('ownerId'), self.headers.get('Cookie')))
                return
            elif self.path.startswith('/api/account/'):
                result, cookie = self.server.accounts.handle('POST', self.path, data, self.headers.get('Cookie'))
                self.json_response(result, cookie=cookie)
                return
            elif self.path in ("/api/plan", "/api/plan/shortlist"):
                self.json_response(self.server.planner.recommend(data, shortlist=self.path.endswith("/shortlist")))
                return
            elif self.path == "/api/places/research":
                self.json_response(self.server.venue_research.check(data))
                return
            elif self.path == "/api/places/search":
                result = self.server.places.search(data.get("name"), data.get("neighborhood", ""),
                                                   include_photos=data.get("includePhotos", False))
            elif self.path == "/api/places/details":
                result = self.server.places.details(data.get("placeId"), data.get("includeReviews", False),
                                                    photos_only=data.get("photosOnly", False),
                                                    enrichment_only=data.get("enrichmentOnly", False))
            else:
                raise PlacesError("Not found.", 404)
            self.json_response({"result": result, "usage": self.server.places.status()})
        except (ValueError, json.JSONDecodeError):
            self.json_response({"error": "Invalid JSON or request length."}, 400)
        except (PlacesError, PlanError, AccountError) as error:
            self.json_response({"error": str(error)}, error.status)


def main():
    load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.getenv('PORT', '8001')))
    parser.add_argument("--no-places-limit", action="store_true",
                        help="Remove the app's Google Places request cap in loopback mode.")
    args = parser.parse_args()
    try:
        origin = public_app_origin()
    except ValueError as error:
        parser.error(str(error))
    if origin and args.no_places_limit:
        parser.error("--no-places-limit is available only in the local preview.")
    places_limit = None if args.no_places_limit else os.getenv("GOOGLE_PLACES_MAX_REQUESTS_PER_SESSION", "40")
    server = ThreadingHTTPServer(('0.0.0.0' if origin else '127.0.0.1', args.port), Handler)
    server.public_origin = origin
    server.api_limiter = RequestLimiter()
    server.accounts = Accounts(os.getenv('SUPABASE_URL', ''), os.getenv('SUPABASE_PUBLISHABLE_KEY', ''), origin)
    server.planner = Planner(os.getenv("OPENROUTER_API_KEY", ""), os.getenv("OPENROUTER_MODEL", DEFAULT_SEARCH_MODEL),
                             UsageLog(ROOT / ".local" / "usage.jsonl"))
    research_key = server.planner.key if os.getenv("VENUE_RESEARCH_ENABLED", "false").lower() == "true" else ""
    server.venue_research = VenueResearch(research_key, "openai/gpt-4o-mini", server.planner.usage)
    server.places = GooglePlaces(os.getenv("GOOGLE_MAPS_API_KEY", ""),
                                 places_limit,
                                 os.getenv("GOOGLE_PLACES_REVIEWS_ENABLED", "false").lower() == "true",
                                 UsageLog(ROOT / ".local" / "usage.jsonl"))
    print('Inner Table. app: ' + (origin or f'http://127.0.0.1:{args.port}') + '/prototype/', flush=True)
    print("Google key configured: " + ("yes" if server.places.key else "no") + "; key values are never printed.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
