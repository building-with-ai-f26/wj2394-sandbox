import json
import unittest
from unittest.mock import patch

from venue_research import VenueResearch, sourced_venue
from planner import PlanError
from test_server import Response


ADDRESS = "192 Grand Street, New York, NY 10013"
OFFICIAL = "https://tominonyc.com/about"
REDDIT = "https://www.reddit.com/r/FoodNYC/comments/example/"

def venue_response():
    return {
        "content": json.dumps({
            "identity": {"address": ADDRESS, "url": OFFICIAL},
            "category": {"url": OFFICIAL, "value": "restaurant", "excerpt": "our Galician restaurant"},
            "neighborhood": {"url": OFFICIAL, "value": "Nolita", "excerpt": "in the Nolita neighborhood"},
            "tags": [
                {"url": REDDIT, "value": "conversation", "excerpt": "not quiet enough to talk"},
                {"url": REDDIT, "value": "date", "excerpt": "a good date night spot"},
                {"url": "https://unverified.example/", "value": "group", "excerpt": "ideal for groups"},
            ],
            "cuisines": [
                {"url": OFFICIAL, "value": "Spanish", "excerpt": "our Galician restaurant"},
                {"url": OFFICIAL, "value": "japanese", "excerpt": "our Galician restaurant"},
            ],
            "keywords": [{"url": OFFICIAL, "value": "tapas", "excerpt": "our tapas menu"}],
        }),
        "annotations": [
            {"type": "url_citation", "url_citation": {"url": OFFICIAL, "content": f"Tomiño Taberna Gallega, our Galician restaurant, is in the Nolita neighborhood. See our tapas menu. {ADDRESS}"}},
            {"type": "url_citation", "url_citation": {"url": REDDIT, "content": f"At Tomiño Taberna Gallega {ADDRESS}, it is a good date night spot but not quiet enough to talk."}},
        ],
    }


class ResearchTests(unittest.TestCase):
    def test_sourced_result_retains_links_and_drops_unverified_or_negated_hints(self):
        result = sourced_venue(venue_response(), "Tomiño Taberna Gallega")
        self.assertEqual(result["category"], {"value": "restaurant", "url": OFFICIAL})
        self.assertEqual(result["neighborhood"]["value"], "Nolita")
        self.assertEqual(result["tags"], [{"value": "date", "url": REDDIT}])
        self.assertEqual(result["cuisines"], [{"value": "spanish", "url": OFFICIAL}])
        self.assertEqual(result["keywords"], [{"value": "tapas", "url": OFFICIAL}])
        self.assertNotIn("excerpt", json.dumps(result))

    def test_requires_explicit_identity_in_citations(self):
        message = venue_response()
        message["annotations"] = []
        self.assertEqual(sourced_venue(message, "Tomiño Taberna Gallega"), {})
        self.assertEqual(sourced_venue(venue_response(), "Wrong Venue"), {})

    def test_rejects_branch_mismatches_negated_evidence_and_restricted_sources(self):
        wrong_branch = "https://www.example.com/wrong-branch"
        yelp = "https://www.yelp.com/biz/fixture"
        google = "https://maps.google.com/?cid=123"
        message = venue_response()
        result = json.loads(message["content"])
        result["cuisines"] = [{"url": wrong_branch, "value": "japanese", "excerpt": "Japanese cuisine"}]
        result["keywords"] = [
            {"url": yelp, "value": "outdoor seating", "excerpt": "outdoor seating on the patio"},
            {"url": google, "value": "live music", "excerpt": "live music tonight"},
            {"url": OFFICIAL, "value": "sushi", "excerpt": "there is no sushi menu"},
        ]
        message["content"] = json.dumps(result)
        message["annotations"][0]["url_citation"]["content"] += " Also, there is no sushi menu."
        for url, excerpt, address in (
            (wrong_branch, "Japanese cuisine", "1" + ADDRESS),
            (yelp, "outdoor seating on the patio", ADDRESS),
            (google, "live music tonight", ADDRESS),
        ):
            message["annotations"].append({"type": "url_citation", "url_citation": {
                "url": url, "content": f"Tomiño Taberna Gallega. {address}. {excerpt}."
            }})
        verified = sourced_venue(message, "Tomiño Taberna Gallega")
        self.assertNotIn("cuisines", verified)
        self.assertNotIn("keywords", verified)

    def test_research_request_only_sends_public_identity_and_is_bounded(self):
        service = VenueResearch("fixture-key", "fixture-model", limit=1)
        with patch("venue_research.urlopen", return_value=Response({"choices": [{"message": venue_response()}]})) as upstream:
            service.check({"name": "Tomiño Taberna Gallega", "area": "Nolita", "note": "private", "status": "been there"})
            payload = json.loads(upstream.call_args.args[0].data)
            self.assertEqual(json.loads(payload["messages"][1]["content"]), {"name":"Tomiño Taberna Gallega","area":"Nolita","city":"New York City"})
            self.assertEqual(payload["tools"][0]["parameters"]["max_uses"], 2)
            with self.assertRaises(PlanError) as limit:
                service.check({"name": "Tomiño Taberna Gallega"})
            self.assertEqual(limit.exception.status, 429)
            upstream.assert_called_once()
