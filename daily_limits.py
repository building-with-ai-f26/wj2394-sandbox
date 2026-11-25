"""Signed access to the demo's durable request counters."""
import hmac
import re
import time

from accounts import AccountError


class QuotaUnavailable(Exception):
    pass


class DailyRequestQuota:
    def __init__(self, request, secret):
        if not re.fullmatch(r"[0-9a-f]{64}", secret):
            raise ValueError("Public mode requires a 64-character lowercase hex DEMO_QUOTA_SECRET.")
        self.request = request
        self.secret = secret.encode()

    def consume(self, visitor, *, priority, owner):
        kind = "owner" if owner else "priority" if priority else "general"
        fingerprint = hmac.digest(self.secret, f"visitor:{visitor}".encode(), "sha256").hex()
        timestamp = int(time.time())
        message = f"count:{timestamp}:{fingerprint}:{kind}".encode()
        signature = hmac.digest(self.secret, message, "sha256").hex()
        try:
            seconds = self.request("/rest/v1/rpc/consume_demo_request", {
                "p_timestamp": timestamp, "p_visitor": fingerprint,
                "p_kind": kind, "p_signature": signature,
            })
        except AccountError:
            raise QuotaUnavailable from None
        if type(seconds) is not int or not 0 <= seconds <= 90_000 or (owner and seconds):
            raise QuotaUnavailable
        return seconds
