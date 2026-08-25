from ._omni_stubs import load_main


omni = load_main()


def test_restores_only_current_task_and_keeps_legacy_messages():
    history = [
        {"id": "legacy", "role": "user", "content": "legacy message"},
        {"id": "other", "role": "assistant", "content": "wrong task", "task_id": "8"},
        {"id": "current", "role": "user", "content": "current task", "task_id": "7", "turn_id": "turn-7"},
        {"id": "other-scene", "role": "assistant", "content": "other scene", "scenario": "Airport"},
    ]

    restored = omni._current_task_history(history, 7, "Coffee Shop")

    assert [message["id"] for message in restored] == ["legacy", "current"]
    assert restored[-1]["turn_id"] == "turn-7"


def test_restoration_is_limited_to_latest_ten_messages():
    history = [
        {"id": str(index), "role": "user", "content": str(index), "task_id": "7"}
        for index in range(15)
    ]

    restored = omni._current_task_history(history, "7", "Coffee Shop")

    assert [message["id"] for message in restored] == [str(index) for index in range(5, 15)]
