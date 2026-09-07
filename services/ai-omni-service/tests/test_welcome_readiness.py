import asyncio
import unittest
from unittest.mock import Mock

from ._omni_stubs import load_main

omni = load_main()


class WelcomeReadinessTests(unittest.IsolatedAsyncioTestCase):
    def callback(self, history=None):
        callback = omni.WebSocketCallback(Mock(), asyncio.get_running_loop(),
                                         {"target_language": "English"}, "test-token", "test-user", "test-session",
                                         history or [], "English interview")
        callback.conversation = Mock()
        callback.is_connected = True
        return callback

    async def test_created_is_not_ready_until_config_and_client_handshake(self):
        callback = self.callback()
        callback.on_event({"type": "session.created"})
        callback.conversation.create_response.assert_not_called()
        callback.on_event({"type": "session.updated"})
        callback.conversation.create_response.assert_not_called()
        callback.start_client_session({"type": "session_start", "welcomeMuted": False})
        callback.conversation.create_response.assert_called_once()
        callback.conversation.send_raw.assert_not_called()  # no forged learner turn
        callback.on_event({"type": "session.updated"})
        callback.start_client_session({"type": "session_start"})
        callback.conversation.create_response.assert_called_once()
        await asyncio.sleep(0)

    async def test_handshake_before_configuration_still_starts_once(self):
        callback = self.callback()
        callback.start_client_session({"type": "session_start", "payload": {"welcomeMuted": False}})
        callback.on_event({"type": "session.created"})
        callback.conversation.create_response.assert_not_called()
        callback.on_event({"type": "session.updated"})
        callback.conversation.create_response.assert_called_once()
        await asyncio.sleep(0)

    async def test_muted_and_restored_sessions_never_request_welcome(self):
        for handshake in ({"welcomeMuted": True}, {"payload": {"welcomeMuted": True}}):
            callback = self.callback()
            callback.session_ready = callback.session_configured = True
            callback.start_client_session(handshake)
            self.assertTrue(callback.welcome_muted)
            callback.conversation.create_response.assert_not_called()
        callback = self.callback([{"role": "assistant", "content": "Previous reply"}])
        callback.session_ready = callback.session_configured = True
        callback.start_client_session({})
        callback.conversation.create_response.assert_not_called()

    async def test_failed_send_does_not_claim_welcome_was_sent(self):
        callback = self.callback()
        callback.session_ready = callback.session_configured = True
        callback.conversation.create_response.side_effect = RuntimeError('offline')
        callback.start_client_session({})
        self.assertFalse(callback.welcome_sent)
        self.assertNotIn('welcome_requested', callback._latency_stages)
