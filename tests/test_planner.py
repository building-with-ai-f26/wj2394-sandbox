import json
import unittest
from unittest.mock import patch, Mock

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

    def test_malformed_model_reply_has_safe_error(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{}'
        with patch('planner.urlopen', return_value=response):
            with self.assertRaises(PlanError) as caught:
                Planner('fixture-secret').recommend(self.data())
        self.assertNotIn('fixture-secret', str(caught.exception))

    def test_google_evidence_reaches_final_ranking_and_shortlist_allows_missing_data(self):
        data = self.data()
        data['places'][0].update({'googleDescription': 'A cafe with a garden.',
                                 'googlePriceRange': {'endPrice': {'units': '25', 'currencyCode': 'USD'}},
                                 'googleReviews': ['Quiet enough for conversation.']})
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'choices': [{'message': {'content': json.dumps({'reply': 'Consider this.', 'matches': []})}}]}).encode()
        with patch('planner.urlopen', return_value=response) as upstream:
            client = Planner('fixture')
            client.recommend(data, shortlist=True)
            retrieval = json.loads(upstream.call_args.args[0].data)['messages'][0]['content']
            self.assertIn('Missing category, price, address or tags must not exclude', retrieval)
            client.recommend(data)
            ranking = json.loads(upstream.call_args.args[0].data)['messages'][0]['content']
            self.assertIn('A cafe with a garden.', ranking)
            self.assertIn('Quiet enough for conversation.', ranking)
            self.assertIn('googlePriceRange', ranking)

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
