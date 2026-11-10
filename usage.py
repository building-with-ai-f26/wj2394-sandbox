"""Private request ledger for project reporting. Never records place names or secrets."""
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import threading


class UsageLog:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.Lock()

    def record(self, operation, http_status, duration_ms, sku):
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "provider": "google_maps",
            "operation": operation,
            "http_status": http_status,
            "duration_ms": duration_ms,
            "billing_category": sku,
            "cost_usd": None,
            "cost_status": "pending_provider_billing",
        }
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as output:
                output.write(json.dumps(event) + "\n")

    def summary(self):
        events = []
        if self.path.exists():
            for line in self.path.read_text(encoding="utf-8").splitlines():
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        google = [event for event in events if event.get("provider") == "google_maps"]
        ai = [event for event in events if event.get("provider") == "openrouter"]
        return {
            "scope": "Instrumented local prototype requests only",
            "google_requests": len(google),
            "operations": dict(Counter(event["operation"] for event in google)),
            "failed_requests": sum(event["http_status"] != 200 for event in events),
            "google_cost_usd": None if events else 0,
            "google_cost_status": "Pending Google Cloud billing" if events else "No instrumented requests recorded",
            "app_ai_requests": len(ai),
            "app_ai_recorded_tokens": sum(event["total_tokens"] for event in ai if type(event.get("total_tokens")) is int),
            "app_ai_recorded_cost_usd": sum(event["cost_usd"] for event in ai if type(event.get("cost_usd")) in (int, float)),
            "app_ai_requests_missing_usage": sum(type(event.get("total_tokens")) is not int or type(event.get("cost_usd")) not in (int, float) for event in ai),
            "app_ai_tokens": sum(event["total_tokens"] for event in ai) if ai and all(type(event.get("total_tokens")) is int for event in ai) else None,
            "app_ai_cost_usd": sum(event["cost_usd"] for event in ai) if ai and all(type(event.get("cost_usd")) in (int, float) for event in ai) else None,
            "app_ai_token_status": "Provider-reported usage; missing values remain pending" if ai else "No instrumented AI requests recorded",
            "codex_tokens": None,
            "codex_token_status": "Exact per-project tokens unavailable from account usage limits",
        }

    def record_ai(self, http_status, duration_ms, model, usage):
        event = {"timestamp": datetime.now(timezone.utc).isoformat(), "provider": "openrouter",
                 "operation": "plan", "http_status": http_status, "duration_ms": duration_ms,
                 "model": model, "total_tokens": usage.get("total_tokens"),
                 "prompt_tokens": usage.get("prompt_tokens"), "completion_tokens": usage.get("completion_tokens"),
                 "cost_usd": usage.get("cost"), "cost_status": "provider_reported" if usage.get("cost") is not None else "pending_provider_billing"}
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as output:
                output.write(json.dumps(event) + "\n")


if __name__ == "__main__":
    print(json.dumps(UsageLog(Path(__file__).parent / ".local" / "usage.jsonl").summary(), indent=2))
