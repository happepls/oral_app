import unittest
from unittest.mock import AsyncMock, Mock, patch

from ._omni_stubs import load_main

omni = load_main()


class QuickProfileContextTests(unittest.IsolatedAsyncioTestCase):
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
