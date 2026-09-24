import unittest
from unittest.mock import AsyncMock, Mock, patch
import copy
import asyncio

from ._omni_stubs import load_main

omni = load_main()


class QuickProfileContextTests(unittest.IsolatedAsyncioTestCase):
    async def test_prompt_refresh_preserves_reset_generation_through_real_scoring_entrypoint(self):
        from .test_scoring_windows import FakeRedis

        task = {'id': 9, 'text': 'Order coffee', 'status': 'pending',
                'score': 0, 'interaction_count': 0, 'scoring_generation': 2}
        current = {**task, 'task_description': task['text'], 'scenario_title': 'Cafe'}
        goal = {'id': 4, 'target_language': 'English', 'current_task': current,
                'scenarios': [{'title': 'Cafe', 'tasks': [task]}]}
        callback = omni.WebSocketCallback(
            AsyncMock(), asyncio.get_running_loop(), {'active_goal': goal},
            'test-token', 'u1', 'session', history_messages=[], scenario='Cafe',
        )
        callback.conversation = Mock()
        callback._safe_send = AsyncMock()
        redis = FakeRedis()
        post = AsyncMock(return_value={
            'evaluation_status': 'completed', 'evidence_sufficient': True,
            'quality': 'satisfactory', 'delta': 2, 'score': 2,
            'interaction_count': 3, 'scoring_generation': 2,
            'completed_window_count': 1,
        })
        with patch.object(omni, 'session_phases', {callback.phase_key: {'phase': 'scene_theater'}}), \
                patch.object(omni.prompt_manager, 'generate_scene_theater_prompt', return_value='Practice'), \
                patch.object(omni, 'MultiModality', Mock(TEXT='text', AUDIO='audio')), \
                patch.object(omni, '_get_redis_client', return_value=redis), \
                patch.object(omni, '_post_scoring_window', post):
            for number in range(3):
                # Connection setup and later prompt refreshes both use this path.
                callback._update_session_prompt()
                turn_id = f'new-{number}'
                callback.current_turn_id = turn_id
                callback.messages.append({'role': 'user', 'turn_id': turn_id, 'content': 'Coffee please'})
                await omni._evaluate_scene_turn_progress(callback, 4, 9, 'Which size?')

        self.assertEqual(callback.conversation.update_session.call_count, 3)
        self.assertEqual(post.await_count, 1)
        payload = post.await_args.args[0]
        self.assertEqual(payload['scoring_generation'], 2)
        self.assertEqual(payload['current_task']['scoring_generation'], 2)
        self.assertIs(goal['current_task'], current)
        self.assertEqual(goal['current_task']['scoring_generation'], 2)
        message = callback._safe_send.await_args.args[0]
        self.assertEqual(message['type'], 'proficiency_update')
        self.assertEqual(message['payload']['scoring_generation'], 2)
        self.assertEqual(message['payload']['task_score'], 2)

    async def test_reset_generation_survives_both_context_paths_and_next_scoring_window(self):
        from .test_scoring_windows import FakeRedis, add_turn, callback_for

        for scenario in ('Cafe', None):
            with self.subTest(scenario=scenario):
                task = {'id': 9, 'text': 'Order coffee', 'status': 'pending',
                        'score': 0, 'interaction_count': 0, 'scoring_generation': 3}
                goal = {'id': 4, 'scenarios': [{'title': 'Cafe', 'tasks': [task]}]}
                payloads = [{'data': {'user': {'id': 'u1'}}}, {'data': {'goal': goal}}]
                if scenario is None:
                    payloads.append({'data': {'task': task, 'scenario': {'title': 'Cafe'}}})
                responses = []
                for payload in payloads:
                    response = Mock(status_code=200)
                    response.json.return_value = copy.deepcopy(payload)
                    responses.append(response)
                client = AsyncMock()
                client.get.side_effect = responses
                context = AsyncMock()
                context.__aenter__.return_value = client
                with patch.object(omni.httpx, 'AsyncClient', return_value=context):
                    result = await omni.get_user_context('test-token', scenario=scenario)
                current = result['active_goal']['current_task']
                self.assertEqual(current['scoring_generation'], 3)

                callback, redis = callback_for(), FakeRedis()
                callback.user_context = result
                post = AsyncMock(return_value={
                    'evaluation_status': 'completed', 'evidence_sufficient': True,
                    'quality': 'satisfactory', 'delta': 2, 'score': 2,
                    'interaction_count': 3, 'scoring_generation': 3,
                    'completed_window_count': 1,
                })
                with patch.object(omni, '_get_redis_client', return_value=redis), patch.object(
                    omni, '_post_scoring_window', post
                ):
                    for turn_id in ('new-1', 'new-2', 'new-3'):
                        await add_turn(callback, turn_id, current)
                self.assertEqual(post.await_count, 1)
                self.assertEqual(post.await_args.args[0]['scoring_generation'], 3)
                message = callback._safe_send.await_args.args[0]
                self.assertEqual(message['type'], 'proficiency_update')
                self.assertEqual(message['payload']['scoring_generation'], 3)
                self.assertEqual(message['payload']['task_score'], 2)

    async def test_new_account_context_never_fetches_goals(self):
        profile = {"id": "new-account", "native_language": None, "subscription_status": "free"}
        response = Mock(status_code=200)
        response.json.return_value = {"data": {"user": profile}}
        client = AsyncMock()
        client.get.return_value = response
        context = AsyncMock()
        context.__aenter__.return_value = client
        with patch.object(omni.httpx, "AsyncClient", return_value=context):
            result = await omni.get_user_context("test-token", profile_only=True)
        self.assertEqual(result, profile)
        client.get.assert_awaited_once()
        self.assertTrue(client.get.call_args.args[0].endswith('/api/users/profile'))

    async def test_invalid_profile_token_is_not_accepted(self):
        client = AsyncMock()
        client.get.return_value = Mock(status_code=401, text="Unauthorized")
        context = AsyncMock()
        context.__aenter__.return_value = client
        with patch.object(omni.httpx, "AsyncClient", return_value=context):
            self.assertIsNone(await omni.get_user_context("expired-token", profile_only=True))
