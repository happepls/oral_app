#!/usr/bin/env python3
"""Read only a bounded numeric response; never persist failed response bodies."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

spec = importlib.util.spec_from_file_location("sdlc_monitor", Path(__file__).with_name("sdlc-monitor.py"))
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def collect(url, token, opener=None):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("HTTPS aggregate URL required")
    if len(token) < 32:
        raise ValueError("dedicated read token required")
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}", "Accept": "application/json",
        # Production ingress rejects Python's generic default User-Agent.
        "User-Agent": "oral-app-daily-monitor/1.0",
    })
    opener = opener or urllib.request.build_opener(NoRedirect())
    with opener.open(request, timeout=15) as response:
        if response.status != 200 or response.headers.get_content_type() != "application/json":
            raise ValueError("invalid aggregate response")
        raw = response.read(16385)
        if len(raw) > 16384:
            raise ValueError("aggregate response too large")
    return monitor.validate_aggregate(json.loads(raw))


def main():
    destination = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp")
    metrics_path = destination / "daily-metrics.json"
    evaluation_path = destination / "zeabur-aggregate-evaluation.json"
    metrics_path.unlink(missing_ok=True)
    try:
        metrics = collect(os.environ.get("ZEABUR_AGGREGATES_URL", ""), os.environ.get("ZEABUR_TOKEN", ""))
        evaluation = monitor.evaluate(metrics, monitor.parse_bands(monitor.ROOT / "bands.yaml"))
        metrics_path.write_text(json.dumps(metrics, sort_keys=True) + "\n")
    except Exception:
        # Do not print exception text, URLs, authorization or upstream bodies.
        evaluation = {"severity": "diagnose", "reasons": ["daily_aggregate_unavailable"], "redacted_summary": ""}
        evaluation_path.write_text(json.dumps(evaluation) + "\n")
        print("Daily aggregate unavailable: check configuration, coverage and source health.")
        return 1
    evaluation_path.write_text(json.dumps(evaluation, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
