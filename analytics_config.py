"""Generate browser analytics configuration from the environment for static hosting."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from server import load_env


def build_config():
    token = os.environ.get("POSTHOG_PROJECT_TOKEN", "").strip()
    host = os.environ.get("POSTHOG_HOST", "").strip()
    parsed = urlsplit(host)
    if not token or not host:
        raise ValueError("Set POSTHOG_PROJECT_TOKEN and POSTHOG_HOST before building analytics.")
    if parsed.scheme != "https" or parsed.hostname not in ("us.i.posthog.com", "eu.i.posthog.com") or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.username or parsed.port:
        raise ValueError("Use your project's official PostHog ingestion host.")
    return {"token": token, "host": host.rstrip("/")}


if __name__ == "__main__":
    load_env()
    target = Path(__file__).resolve().parent / "docs" / "analytics-config.json"
    target.write_text(json.dumps(build_config()) + "\n", encoding="utf-8")
    print("Generated browser analytics configuration.")
