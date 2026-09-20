"""Content-free, authenticated conversation evidence and durable delivery.

Browser supplied counts/mode/identity never enter this module. Only accepted
input and completed upstream responses are paired; reconnect uses SQL evidence.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)
QUEUE = 'product_analytics:pending'
PAYLOADS = 'product_analytics:payloads'
_local_pending = {}
ENQUEUE = """
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 1 then
  redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
end
return 1
"""
ACK = """
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
"""


def enabled():
    return os.getenv('PRODUCT_ANALYTICS_ENABLED') == 'true'


def end_proof(user_id, session_id):
    secret = os.getenv('ANALYTICS_WRITE_TOKEN', '')
    if len(secret) < 32:
        return None
    issued = str(int(time.time()))
    signature = hmac.new(secret.encode(), f'{user_id}:{session_id}:{issued}'.encode(), hashlib.sha256).hexdigest()
    return f'{issued}.{signature}'


def eligible(mode, phase, daily=False):
    if daily or mode in ('tour', 'recall', 'daily_qa', 'quick_experience'):
        return False
    return phase == 'scene_theater'


async def enqueue(redis, user_id, session_id, event):
    if not enabled():
        return False
    payload = {'userId': str(user_id), 'sessionId': session_id, 'event': event,
               'occurredAt': datetime.now(timezone.utc).isoformat()}
    key = hashlib.sha256(f'{user_id}:{session_id}:{event}'.encode()).hexdigest()
    # Retain the original timestamp through transient Redis outages. The worker
    # retries independently of whether the websocket is still connected.
    _local_pending.setdefault(key, payload)
    return await persist_pending(redis, key)


async def persist_pending(redis, key):
    try:
        if redis is None:
            return False
        await asyncio.wait_for(redis.eval(ENQUEUE, 2, PAYLOADS, QUEUE, key,
                                         json.dumps(_local_pending[key]), time.time()), timeout=0.5)
        _local_pending.pop(key, None)
        return True
    except Exception:
        logger.warning('[product-analytics] evidence queue unavailable')
        return False


async def deliver_once(redis, client):
    if not enabled() or redis is None:
        return
    for key in list(_local_pending)[:20]:
        await persist_pending(redis, key)
    token = os.getenv('ANALYTICS_WRITE_TOKEN', '')
    if len(token) < 32:
        return
    base = os.getenv('USER_SERVICE_URL', 'http://user-service:3000').rstrip('/')
    keys = await redis.zrangebyscore(QUEUE, '-inf', time.time(), start=0, num=20)
    for key in keys:
        raw = await redis.hget(PAYLOADS, key)
        if not raw:
            await redis.zrem(QUEUE, key)
            continue
        try:
            response = await client.post(f'{base}/api/users/analytics/internal/milestone',
                                         headers={'Authorization': f'Bearer {token}'},
                                         json=json.loads(raw), timeout=3)
            if response.status_code == 204:
                await redis.eval(ACK, 2, PAYLOADS, QUEUE, key)
            else:
                await redis.zadd(QUEUE, {key: time.time() + 30})
                logger.warning('[product-analytics] evidence delivery deferred')
        except Exception:
            await redis.zadd(QUEUE, {key: time.time() + 30})
            logger.warning('[product-analytics] evidence delivery unavailable')


async def delivery_worker(get_redis):
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await asyncio.wait_for(deliver_once(get_redis(), client), timeout=65)
            except Exception:
                logger.warning('[product-analytics] delivery cycle unavailable')
            await asyncio.sleep(5)


class ConversationEvidence:
    def __init__(self, emit):
        self.emit = emit
        self.pending = None
        self.accepted = set()
        self.responses = {}
        self.completed = set()
        self.paired = False
        self.started = False

    def prepare(self, turn_id, real):
        # Called at authoritative audio commit, or immediately before text response.
        self.pending = str(turn_id) if turn_id and real else None

    def response_started(self, response_id):
        if response_id:
            self.responses[str(response_id)] = self.pending
            # A spontaneous/welcome response cannot borrow the preceding input.
            self.pending = None
            while len(self.responses) > 128:
                self.responses.pop(next(iter(self.responses)))

    async def accept(self, turn_id, real):
        if not turn_id or not real:
            return
        self.accepted.add(str(turn_id))
        if not self.started:
            self.started = bool(await self.emit('started'))
        await self._pair()

    async def finish(self, response_id):
        if response_id:
            self.completed.add(str(response_id))
            await self._pair()

    async def _pair(self):
        if not self.paired and any(self.responses.get(rid) in self.accepted for rid in self.completed):
            await self.emit('paired')
            self.paired = True
        # Once paired, one pair is sufficient; no conversation contents are kept.
        if self.paired:
            self.accepted.clear()
            self.completed.clear()

    async def end(self):
        # A reconnect may have no in-memory pair; the SQL ledger retains it.
        # End evidence alone never constitutes completion.
        await self.emit('ended')
