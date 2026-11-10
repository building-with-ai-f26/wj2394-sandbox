import json
from pathlib import Path
import tempfile
import unittest

from usage import UsageLog


class UsageTests(unittest.TestCase):
    def test_records_counts_and_keeps_cost_pending(self):
        with tempfile.TemporaryDirectory() as directory:
            log = UsageLog(Path(directory) / "usage.jsonl")
            log.record("search", 200, 120, "Text Search Pro")
            log.record("details", 403, 80, "Place Details Enterprise + Atmosphere")
            report = log.summary()
            self.assertEqual(report["google_requests"], 2)
            self.assertEqual(report["failed_requests"], 1)
            self.assertEqual(report["operations"], {"search": 1, "details": 1})
            self.assertIsNone(report["google_cost_usd"])
            self.assertIsNone(report["codex_tokens"])
            record = json.loads(log.path.read_text().splitlines()[0])
            self.assertEqual(set(record), {"timestamp", "provider", "operation", "http_status", "duration_ms", "billing_category", "cost_usd", "cost_status"})

    def test_report_handles_empty_log_and_an_interrupted_line(self):
        with tempfile.TemporaryDirectory() as directory:
            log = UsageLog(Path(directory) / "usage.jsonl")
            self.assertEqual(log.summary()["google_requests"], 0)
            log.record("photo", 200, 50, "Place Photos")
            with log.path.open("a") as output:
                output.write('{"incomplete":')
            self.assertEqual(log.summary()["google_requests"], 1)


if __name__ == "__main__":
    unittest.main()
