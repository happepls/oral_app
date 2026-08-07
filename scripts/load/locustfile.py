"""Five-minute, read-only production-safe HTTP profile."""

import math
import os
import time
from collections import deque

import gevent
from locust import HttpUser, LoadTestShape, between, events, task

_WINDOW_SECONDS = 30
_recent = deque()
_bad_windows = 0
_unexpected_429 = 0


class ReadOnlyUser(HttpUser):
    wait_time = between(0.5, 1.5)

    def on_start(self):
        # Locust disables requests' environment proxy discovery by default.
        # Keep direct connections as the default, but allow an operator whose
        # network requires an approved proxy to opt in without exposing its URL.
        self.client.trust_env = os.getenv("LOAD_TEST_TRUST_ENV_PROXY") == "1"

    @task(4)
    def gateway_health(self):
        self.client.get("/health", name="GET /health")

    @task(3)
    def user_health(self):
        self.client.get("/api/users/health", name="GET /api/users/health")

    @task(2)
    def public_prices(self):
        self.client.get("/api/stripe/products-with-prices", name="GET /api/stripe/products-with-prices")


class ProductionReadOnlyShape(LoadTestShape):
    stages = (
        {"duration": 60, "users": 5, "spawn_rate": 1},
        {"duration": 180, "users": 10, "spawn_rate": 1},
        {"duration": 300, "users": 20, "spawn_rate": 2},
    )

    def tick(self):
        elapsed = self.get_run_time()
        for stage in self.stages:
            if elapsed < stage["duration"]:
                return stage["users"], stage["spawn_rate"]
        return None


@events.request.add_listener
def record_request(*, response_time, response=None, exception=None, **_kwargs):
    global _unexpected_429
    status = getattr(response, "status_code", None)
    failed = exception is not None or (status is not None and status >= 500)
    if status == 429:
        _unexpected_429 += 1
        failed = True
    _recent.append((time.monotonic(), float(response_time), failed))


def _percentile(values, percentile):
    if not values:
        return 0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(percentile * len(ordered)) - 1))
    return ordered[index]


def _window_guard(environment):
    global _bad_windows
    while environment.runner and environment.runner.state not in {"stopped", "stopping", "cleanup"}:
        gevent.sleep(_WINDOW_SECONDS)
        cutoff = time.monotonic() - _WINDOW_SECONDS
        while _recent and _recent[0][0] < cutoff:
            _recent.popleft()
        samples = list(_recent)
        if not samples:
            continue
        failures = sum(1 for _, _, failed in samples if failed)
        latencies = [latency for _, latency, _ in samples]
        breached = (
            failures / len(samples) >= 0.01
            or _percentile(latencies, 0.95) >= 1000
            or _percentile(latencies, 0.99) >= 2000
            or _unexpected_429 > 0
        )
        _bad_windows = _bad_windows + 1 if breached else 0
        if _bad_windows >= 2:
            environment.process_exit_code = 1
            environment.runner.quit()
            return


@events.test_start.add_listener
def start_guard(environment, **_kwargs):
    gevent.spawn(_window_guard, environment)


@events.quitting.add_listener
def enforce_final_thresholds(environment, **_kwargs):
    stats = environment.stats.total
    if stats.num_requests == 0:
        environment.process_exit_code = 1
        return
    failure_rate = stats.num_failures / stats.num_requests
    if (
        failure_rate >= 0.01
        or stats.get_response_time_percentile(0.95) >= 1000
        or stats.get_response_time_percentile(0.99) >= 2000
        or _unexpected_429 > 0
    ):
        environment.process_exit_code = 1
