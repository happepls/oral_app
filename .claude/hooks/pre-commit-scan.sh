#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if ! echo "$CMD" | grep -qE 'git commit'; then
  exit 0
fi

if ! command -v gitleaks &>/dev/null; then
  echo '{"systemMessage":"WARNING: gitleaks 未安装，跳过密钥扫描。安装: brew install gitleaks"}'
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
cd "$REPO_ROOT"

SCAN_EXIT=0
SCAN_OUTPUT=$(gitleaks git --pre-commit --staged --verbose --config .gitleaks.toml 2>&1) || SCAN_EXIT=$?

if [ "$SCAN_EXIT" -eq 1 ]; then
  ESCAPED_OUTPUT=$(echo "$SCAN_OUTPUT" | jq -Rs .)
  echo "{\"hookSpecificOutput\":{\"permissionDecision\":\"deny\"},\"systemMessage\":\"COMMIT BLOCKED: gitleaks 检测到密钥泄露:\\n${ESCAPED_OUTPUT}\\n\\n请移除敏感信息后再提交。\"}" >&2
  exit 2
fi

echo '{"systemMessage":"gitleaks: 未检测到密钥泄露。"}'
exit 0
