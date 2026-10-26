"""Explicit recording transfer state; silence never commits an input."""
import hashlib
import json
import re
import time


class AudioInput:
    def __init__(self):
        self.input_id = None
        self.next_sequence = 0
        self.recording = False
        self.suppress = False
        self.started_at = None
        self.upload_started_at = None
        self.scope = None

    def start(self, input_id, scope=None):
        if not isinstance(input_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", input_id):
            raise ValueError("invalid_input_id")
        self.input_id = input_id
        self.scope = scope
        self.next_sequence = 0
        self.recording = True
        self.suppress = False
        self.started_at = time.monotonic()
        self.upload_started_at = None

    def chunk(self, payload):
        if self.suppress:
            return False
        if self.input_id is None:  # Legacy clients have no explicit start event.
            return True
        if not self.recording or payload.get("input_id") != self.input_id:
            raise ValueError("input_mismatch")
        sequence = payload.get("sequence")
        if type(sequence) is not int or sequence != self.next_sequence:
            raise ValueError("input_sequence_mismatch")
        self.next_sequence += 1
        return True

    def end(self, payload):
        if self.suppress:
            return False
        if self.input_id is not None:
            if (payload.get("input_id") != self.input_id
                    or type(payload.get("chunks")) is not int
                    or payload["chunks"] != self.next_sequence):
                raise ValueError("input_incomplete")
        self.recording = False
        return True

    def key(self, callback):
        goal = callback.user_context.get("active_goal") or {}
        task = goal.get("current_task") or {}
        identity = [callback.user_id, callback.scenario, goal.get("id"), task.get("id"),
                    task.get("scoring_generation"), self.input_id]
        return "audio-submission:" + hashlib.sha256(json.dumps(identity).encode()).hexdigest()

    def current_scope(self, callback):
        if self.scope is None:  # Rolling compatibility with older clients.
            return True
        goal = callback.user_context.get('active_goal') or {}
        task = goal.get('current_task') or {}
        expected = dict(goal_id=goal.get('id'), task_id=task.get('id'), scoring_generation=task.get('scoring_generation'))
        return (isinstance(self.scope, dict)
                and type(self.scope.get('scoring_generation')) is int
                and self.scope == expected)


def needs_access_check(kind, transfer, has_audio=False):
    if kind in {"ping", "interrupt", "user_audio_cancelled"}:
        return False
    # Authorization belongs to the recording start and commit boundaries,
    # never to each PCM fragment. Legacy input checks its first fragment.
    return kind != "audio_stream" or (not transfer.recording and not has_audio)
