import io
import json
import unittest
from unittest.mock import patch, Mock
from urllib.error import HTTPError

from planner import Planner, PlanError


class PlannerTests(unittest.TestCase):
    def data(self):
        return {"messages": [{"role": "user", "content": "A quiet catch-up"}],
                "places": [{"id": "fictional-1", "name": "Fictional cafe", "tags": ["conversation"]}]}

    def test_missing_key_and_invalid_history_make_no_calls(self):
        with patch('planner.urlopen') as upstream:
            with self.assertRaises(PlanError):
                Planner('replace-with-key').recommend(self.data())
            data = self.data()
            data['messages'][0]['role'] = 'system'
            with self.assertRaises(PlanError):
                Planner('fixture').recommend(data)
            upstream.assert_not_called()

    def test_followup_ids_deduplication_and_private_usage(self):
        data = self.data()
        data['messages'] += [{'role': 'assistant', 'content': 'Which area?'}, {'role': 'user', 'content': 'Downtown'}]
        result = {'reply': 'Here is a possibility.', 'matches': [
            {'id': 'invented', 'reason': 'Wrong'}, {'id': 'fictional-1', 'reason': 'Recorded conversation tag'},
            {'id': 'fictional-1', 'reason': 'Duplicate'}]}
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'choices': [{'message': {'content': json.dumps(result)}}],
                                               'usage': {'total_tokens': 42, 'cost': 0.001}}).encode()
        usage = Mock()
        with patch('planner.urlopen', return_value=response) as upstream:
            answer = Planner('fixture', usage=usage).recommend(data)
        self.assertEqual([match['id'] for match in answer['matches']], ['fictional-1'])
        payload = json.loads(upstream.call_args.args[0].data)
        self.assertEqual(payload['messages'][-1]['content'], 'Downtown')
        self.assertEqual(usage.record_ai.call_args.args[3]['total_tokens'], 42)
        self.assertNotIn('Downtown', str(usage.record_ai.call_args))

    def test_upstream_rejection_logs_only_status_and_fixed_category(self):
        for status, category in [(401, "authentication"), (402, "payment_required"),
                                 (429, "rate_limited"), (503, "provider_unavailable"),
                                 (502, "upstream_error")]:
            with self.subTest(status=status):
                body = io.BytesIO(b'{"message":"fixture private response"}')
                rejection = HTTPError("https://openrouter.ai/?token=fixture-url", status,
                                      "fixture upstream message", {}, body)
                usage = Mock()
                with patch("planner.urlopen", side_effect=rejection), self.assertLogs("planner", level="WARNING") as logs:
                    with self.assertRaises(PlanError) as caught:
                        Planner("fixture-key", usage=usage).recommend(self.data(), shortlist=True)
                self.assertEqual(logs.output, [f"WARNING:planner:OpenRouter search failed status={status} category={category}"])
                self.assertEqual(caught.exception.status, 502)
                self.assertEqual(usage.record_ai.call_args.args[0], status)
                self.assertTrue(body.closed)

    def test_match_reason_is_direct_and_keeps_source_links(self):
        data = self.data()
        data["places"][0]["googleEvidenceURL"] = "https://www.google.com/maps/place/Fixture"
        result = {
            "reply": "This could work for your catch-up.",
            "matches": [{
                "id": "fictional-1",
                "reason": "According to Google Maps, the back room could suit your catch-up. "
                          "For lunch, Google Maps says it has a separate bar. "
                          "The tables are indoors, according to Google Maps.",
                "sourceIds": ["1"]
            }],
        }
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({"choices": [{"message": {"content": json.dumps(result)}}]}).encode()
        with patch("planner.urlopen", return_value=response) as upstream:
            answer = Planner("fixture").recommend(data)
        prompt = json.loads(upstream.call_args.args[0].data)["messages"][0]["content"]
        self.assertIn("addressed to the person making the plan", prompt)
        self.assertEqual(answer["matches"][0]["reason"],
                         "The back room could suit your catch-up. For lunch, it has a separate bar. The tables are indoors.")
        self.assertEqual(answer["matches"][0]["sources"],
                         [{"label": "Google Maps", "url": data["places"][0]["googleEvidenceURL"]}])

    def test_malformed_model_reply_has_safe_error(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{}'
        with patch('planner.urlopen', return_value=response):
            with self.assertRaises(PlanError) as caught:
                Planner('fixture-secret').recommend(self.data())
        self.assertNotIn('fixture-secret', str(caught.exception))

    def test_occasion_only_plan_does_not_require_a_cuisine(self):
        data = self.data()
        data['places'][0]['name'] = 'Sample · 茶'
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        result = {'reply':'A fictional catch-up option.', 'matches':[{'id':'fictional-1','reason':'Recorded conversation tag'}]}
        response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
        with patch('planner.urlopen',return_value=response) as upstream:
            answer = Planner('fixture').recommend(data)
        system = json.loads(upstream.call_args.args[0].data)['messages'][0]['content']
        self.assertNotIn('Explicit cuisine is required', system)
        self.assertIn('An occasion-only request can match supplied occasion evidence', system)
        self.assertIn('Sample · 茶', system)
        self.assertEqual(answer['matches'][0]['id'], 'fictional-1')

    def test_google_evidence_reaches_final_ranking_and_shortlist_allows_missing_data(self):
        data = self.data()
        data['places'][0].update({'googleDescription': 'A cafe with a garden.',
                                 'googlePriceRange': {'endPrice': {'units': '25', 'currencyCode': 'USD'}},
                                 'googleReviewTags': ['conversation'],
                                 'googleReviews': ['Quiet enough for conversation.']})
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'choices': [{'message': {'content': json.dumps({'reply': 'Consider this.', 'matches': []})}}]}).encode()
        with patch('planner.urlopen', return_value=response) as upstream:
            client = Planner('fixture')
            client.recommend(data, shortlist=True)
            retrieval = json.loads(upstream.call_args.args[0].data)['messages'][0]['content']
            self.assertIn('consider promising venues with blank notes', retrieval)
            client.recommend(data)
            ranking = json.loads(upstream.call_args.args[0].data)['messages'][0]['content']
            self.assertIn('A cafe with a garden.', ranking)
            self.assertIn('"reviewHints": ["conversation"]', ranking)
            self.assertNotIn('Quiet enough for conversation.', ranking)
            self.assertIn('googlePriceRange', ranking)

    def test_japanese_tag_keeps_uncategorized_saved_place_in_final_results(self):
        data = self.data()
        data['messages'] = [{'role':'user','content':'Japanese spots?'}]
        data['places'] = [
            {'id':'saved','name':'Fixture Dining Room','category':'unknown','tags':['Japanese']},
            {'id':'types','name':'Fixture Counter','category':'unknown','googleCuisineTags':['japanese']},
            {'id':'web','name':'Fixture Kitchen','category':'unknown','webCuisines':['japanese']},
            {'id':'keywords','name':'Fixture Bar','category':'unknown','webVenueKeywords':['yakitori']},
            {'id':'reviews','name':'Fixture Cafe','category':'unknown','googleReviews':['I had sushi elsewhere.']},
            {'id':'conflict','name':'Fixture House','tags':['sushi'],'googleCategory':'Korean Restaurant'},
        ]
        result = {'reply':'Here are some places.', 'matches':[
            {'id':place['id'],'reason':'A possible fit.'} for place in data['places']
        ]}
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
        with patch('planner.urlopen', return_value=response) as upstream:
            answer = Planner('fixture').recommend(data)
        self.assertEqual([match['id'] for match in answer['matches']], ['saved', 'types', 'web', 'keywords'])
        prompt = json.loads(upstream.call_args.args[0].data)['messages'][0]['content']
        self.assertNotIn('I had sushi elsewhere.', prompt)

    def test_broad_japanese_retrieval_can_recover_a_sourced_candidate(self):
        data = self.data()
        data['messages'] = [{'role':'user','content':'Japanese spots?'}]
        data['places'] = [
            {'id':'unknown','name':'Fixture Cafe','category':'unknown'},
            {'id':'sourced','name':'Fixture Kitchen','category':'unknown','webCuisines':['japanese']},
        ]
        result = {'reply':'No candidates.', 'matches':[]}
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
        with patch('planner.urlopen', return_value=response) as upstream:
            planner = Planner('fixture')
            self.assertEqual([match['id'] for match in planner.recommend(data, shortlist=True)['matches']], ['sourced'])
            payload = json.loads(upstream.call_args.args[0].data)
            prompt = payload['messages'][0]['content']
            self.assertLess(prompt.index('"id": "sourced"'), prompt.index('"id": "unknown"'))
            self.assertEqual(payload['model'], 'openai/gpt-6.2-sol')
            self.assertEqual(payload['reasoning']['effort'], 'low')
            self.assertEqual(payload['response_format']['type'], 'json_schema')
            self.assertNotIn('temperature', payload)
            data['messages'][0]['content'] = 'A casual Japanese lunch spot under $15 in Soho?'
            self.assertEqual([match['id'] for match in planner.recommend(data, shortlist=True)['matches']], ['sourced'])
            self.assertEqual(planner.recommend(data)['matches'], [])
            data['messages'][0]['content'] = 'Japanese spots?'
            result['matches'] = [{'id':'unknown','reason':'Details to check.'}]
            response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
            self.assertEqual([match['id'] for match in planner.recommend(data, shortlist=True)['matches']], ['sourced', 'unknown'])

    def test_casual_japanese_lunch_recovers_a_sourced_venue_beyond_six_omitted_notes(self):
        data = self.data()
        data['messages'] = [{'role':'user','content':'Do I have a casual Japanese lunch spot in this guide?'}]
        others = [{'id':f'other-{index}','name':f'Fixture {index}','category':'unknown'} for index in range(6)]
        data['places'] = [*others, {'id':'lunch','name':'Fixture Lunch Counter','webCuisines':['japanese'],
                                   'webVenueKeywords':['lunch'],'category':'unknown','note':''}]
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        result = {'reply':'Possible saved places.', 'matches':[{'id':place['id'],'reason':'Check it.'} for place in others]}
        response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
        with patch('planner.urlopen',return_value=response):
            matches = Planner('fixture').recommend(data, shortlist=True)['matches']
        self.assertEqual(matches[0]['id'], 'lunch')
        self.assertEqual(len(matches),6)

    def test_sparse_saved_hints_can_prompt_lookup_without_proving_cuisine(self):
        data = self.data()
        data['messages'] = [{'role':'user','content':'Casual Japanese lunch'}]
        data['places'] = [{'id':'sparse','name':'Fixture Counter','category':'restaurant','savedCuisineHints':['japanese']},
                          {'id':'other','name':'Fixture Park','category':'other'}]
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        result = {'reply':'No obvious candidates.', 'matches':[]}
        with patch('planner.urlopen',return_value=response):
            planner = Planner('fixture')
            response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
            self.assertEqual([match['id'] for match in planner.recommend(data, shortlist=True)['matches']], ['sparse'])
            result['matches'] = [{'id':'sparse','reason':'Only a tentative cue.'}]
            response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
            self.assertEqual(planner.recommend(data)['matches'], [])

    def test_group_dinner_cites_supplied_sources_and_rejects_unsaved_venues(self):
        data = self.data()
        data['messages'] = [{'role':'user','content':'A fun festive group dinner spot'}]
        place = data['places'][0]
        place.update({'note':'', 'webVenueKeywords':['group dining','small plates'],
                      'webEvidence':[{'label':'Group dining','url':'https://example.com/groups'},
                                     {'label':'Menu','url':'javascript:alert(1)'}],
                      'googleService':{'goodForGroups':True,'servesLunch':False,'servesDinner':'yes'}})
        result = {'reply':'Try this saved restaurant.', 'matches':[
            {'id':'outside','reason':'An unsaved place.','sourceIds':['1']},
            {'id':place['id'],'reason':'The group menu and small plates suit a celebration.',
             'sourceIds':['2', '1', '1', None]}]}
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
        with patch('planner.urlopen',return_value=response) as upstream:
            matches = Planner('fixture').recommend(data)['matches']
        self.assertEqual([match['id'] for match in matches], [place['id']])
        self.assertEqual(matches[0]['sources'], [{'label':'Group dining','url':'https://example.com/groups'}])
        prompt = json.loads(upstream.call_args.args[0].data)['messages'][0]['content']
        self.assertIn('"googleService": {"servesLunch": false, "goodForGroups": true}', prompt)
        self.assertNotIn('javascript:alert', prompt)

    def test_japanese_followup_excludes_korean_substitution(self):
        data = self.data()
        data['messages'] = [{'role':'user','content':'Spanish food in NYC'},
                            {'role':'assistant','content':'Here are possibilities.'},
                            {'role':'user','content':'What about Japanese, nothing fancy'}]
        data['places'] = [{'id':'japanese','name':'Fictional Ramen','tags':[], 'googleCategory':'Ramen Restaurant'},
                          {'id':'korean','name':'Fictional Tofu','tags':[], 'googleCategory':'Korean Restaurant'}]
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        result = {'reply':'Consider these places.', 'matches':[{'id':'japanese','reason':'Ramen'}, {'id':'korean','reason':'Might appeal to Japanese food fans'}]}
        response.read.return_value = json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
        with patch('planner.urlopen',return_value=response):
            answer = Planner('fixture').recommend(data)
        self.assertEqual([match['id'] for match in answer['matches']],['japanese'])
