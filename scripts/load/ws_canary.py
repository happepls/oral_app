#!/usr/bin/env python3
"""Open at most two authenticated realtime connections without exposing secrets."""

import argparse
import asyncio
import os
import ssl
import uuid
from urllib.parse import urlencode, urlparse

import httpx
import websockets


def _accounts():
    result = []
    for index in (1, 2):
        email = os.getenv(f"WS_CANARY_ACCOUNT_{index}_EMAIL")
        password = os.getenv(f"WS_CANARY_ACCOUNT_{index}_PASSWORD")
        if bool(email) != bool(password):
            raise RuntimeError(f"Canary account {index} requires both email and password variables")
        if email:
            result.append((email, password))
    if not result:
        raise RuntimeError("At least one synthetic canary account is required")
    return result


async def _canary(base_url, account, index):
    async with httpx.AsyncClient(base_url=base_url, timeout=10, follow_redirects=False) as client:
        login = await client.post("/api/users/login", json={"email": account[0], "password": account[1]})
        login.raise_for_status()
        ticket_response = await client.post(
            "/api/v1/realtime/tickets",
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        ticket_response.raise_for_status()
        payload = ticket_response.json().get("data", ticket_response.json())
        ticket = payload.get("ticket")
        if not ticket:
            raise RuntimeError("Realtime ticket response was incomplete")

    parsed = urlparse(base_url)
    ws_scheme = "wss" if parsed.scheme == "https" else "ws"
    query = urlencode({
        "ticket": ticket,
        "sessionId": f"production-canary-{index}-{uuid.uuid4().hex[:8]}",
        "voice": "Tina",
    })
    ws_url = f"{ws_scheme}://{parsed.netloc}/api/v1/realtime?{query}"
    ssl_context = ssl.create_default_context() if ws_scheme == "wss" else None
    async with asyncio.timeout(10):
        async with websockets.connect(ws_url, ssl=ssl_context, open_timeout=10) as websocket:
            await websocket.recv()
    print(f"Canary {index}: realtime handshake succeeded")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--production", action="store_true")
    parser.add_argument("--confirm-production-canary", action="store_true")
    args = parser.parse_args()
    parsed = urlparse(args.target)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"}:
        raise SystemExit("--target must contain only scheme and host")
    if parsed.hostname in {"guajiguaji.top", "www.guajiguaji.top"} and not (
        args.production and args.confirm_production_canary
    ):
        raise SystemExit("Production canary requires both production confirmation flags")
    await asyncio.gather(*(_canary(args.target.rstrip("/"), account, i) for i, account in enumerate(_accounts(), 1)))


if __name__ == "__main__":
    asyncio.run(main())
