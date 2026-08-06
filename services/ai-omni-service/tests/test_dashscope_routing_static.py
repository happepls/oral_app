import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_ai_omni_call_sites_use_resolved_endpoint_credentials():
    source = (ROOT / "services/ai-omni-service/app/main.py").read_text()
    assert not re.search(
        r'os\.(?:getenv|environ\.get)\(["\'](?:QWEN3_OMNI_API_KEY|DASHSCOPE_API_KEY)["\']',
        source,
    )
    for credential in ("ws_api_key", "http_api_key", "chat_api_key", "image_api_key"):
        assert f"DASHSCOPE_CONFIG.{credential}" in source


def test_workflow_public_calls_never_fall_back_to_maas_key():
    workflows = ROOT / "services/workflow-service/src/workflows"
    files = ("batch_evaluation.py", "scenario_review.py", "proficiency_scoring.py")
    for filename in files:
        source = (workflows / filename).read_text()
        assert 'os.getenv("DASHSCOPE_API_KEY")' not in source
        assert 'os.getenv("QWEN3_OMNI_API_KEY")' in source
