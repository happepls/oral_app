import asyncio
import unittest
from unittest.mock import AsyncMock, Mock, patch

from ._omni_stubs import load_main

omni = load_main()


class AnalyticsHookTests(unittest.IsolatedAsyncioTestCase):
    def callback(self, mode=None):
        callback = omni.WebSocketCallback(Mock(), asyncio.get_running_loop(),
                                         {'target_language': 'English'}, 'test-token',
                                         'test-user', 'test-session', [], 'Interview', mode)
        callback.is_connected = True
        callback.websocket.send_json = AsyncMock()
        callback._safe_send = AsyncMock()
        callback._flush_audio_gate = AsyncMock()
        callback._schedule_real_turn_count = Mock()
        omni.session_phases[callback.phase_key] = {'phase': 'scene_theater'}
        return callback

    async def test_real_upstream_events_pair_and_issue_proof_but_welcome_does_not(self):
        with patch.dict(omni.os.environ, {'PRODUCT_ANALYTICS_ENABLED': 'true', 'ANALYTICS_WRITE_TOKEN': 'test-only-secret-with-at-least-32-characters'}), \
             patch.object(omni.product_analytics, 'enqueue', AsyncMock(return_value=True)) as emit, \
             patch.object(omni, 'save_single_message', AsyncMock()), \
             patch.object(omni, '_evaluate_scene_turn_progress', AsyncMock()), \
             patch.object(omni, '_maybe_finalize_daily_qa_answer', AsyncMock()):
            callback = self.callback()
            async def event(data):
                callback.on_event(data)
                await asyncio.sleep(0.02)
            await event({'type': 'response.created', 'response': {'id': 'welcome'}})
            await event({'type': 'response.text.done', 'response_id': 'welcome', 'text': 'Welcome.'})
            emit.assert_not_awaited()
            await event({'type': 'input_audio_buffer.committed', 'item_id': 'input-1'})
            await event({'type': 'response.created', 'response': {'id': 'reply-1'}})
            await event({'type': 'conversation.item.input_audio_transcription.completed', 'item_id': 'input-1', 'transcript': 'I would like to practice.'})
            await event({'type': 'response.text.done', 'response_id': 'reply-1', 'text': 'Let us practice together.'})
            self.assertEqual([call.args[-1] for call in emit.await_args_list], ['started', 'paired'])
            proofs = [call.args[0] for call in callback._safe_send.await_args_list if call.args[0].get('type') == 'analytics_end_proof']
            self.assertEqual(len(proofs), 1)

    async def test_reconnect_restores_proof_only_for_server_real_mode(self):
        with patch.dict(omni.os.environ, {'PRODUCT_ANALYTICS_ENABLED': 'true', 'ANALYTICS_WRITE_TOKEN': 'test-only-secret-with-at-least-32-characters'}), \
             patch.object(omni.httpx, 'AsyncClient') as factory:
            client = AsyncMock()
            response = Mock(status_code=200)
            response.json.return_value = {'paired': True}
            client.post.return_value = response
            factory.return_value.__aenter__.return_value = client
            callback = self.callback()
            await callback.restore_analytics_proof()
            callback.websocket.send_json.assert_awaited_once()
            self.assertEqual(callback.websocket.send_json.await_args.args[0]['type'], 'analytics_end_proof')
            client.post.reset_mock()
            recall = self.callback('recall')
            await recall.restore_analytics_proof()
            client.post.assert_not_awaited()
            recall._safe_send.assert_not_awaited()

    async def test_reconnect_waits_for_pending_redis_delivery(self):
        with patch.dict(omni.os.environ, {'PRODUCT_ANALYTICS_ENABLED': 'true', 'ANALYTICS_WRITE_TOKEN': 'test-only-secret-with-at-least-32-characters'}), \
             patch.object(omni.httpx, 'AsyncClient') as factory, \
             patch.object(omni.asyncio, 'sleep', AsyncMock()):
            client = AsyncMock()
            pending, persisted = Mock(status_code=200), Mock(status_code=200)
            pending.json.return_value = {'paired': False}
            persisted.json.return_value = {'paired': True}
            client.post.side_effect = [pending, persisted]
            factory.return_value.__aenter__.return_value = client
            callback = self.callback()
            callback.is_connected = False  # upstream AI connection isn't needed for analytics proof
            await callback.restore_analytics_proof()
            self.assertEqual(client.post.await_count, 2)
            callback.websocket.send_json.assert_awaited_once()
