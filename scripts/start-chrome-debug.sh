#!/bin/bash
# 启动一个带远程调试的 Chrome 实例供 Playwright MCP attach
# Claude Code 通过 CDP (http://localhost:9222) 连接到这个浏览器实例，
# 能够直接读取你的 console、network、登录态。
#
# 用法：./scripts/start-chrome-debug.sh
# 然后正常使用浏览器登录、操作 oral_app，Claude Code 即可读取一切。

PORT=9222
PROFILE_DIR="$HOME/.chrome-debug-profile"

# 关掉已有的占用 9222 的 Chrome（避免端口冲突）
if lsof -ti :$PORT >/dev/null 2>&1; then
  echo "Port $PORT already in use. Existing instance will be reused."
  echo "If you want a fresh start, kill it first: lsof -ti :$PORT | xargs kill"
  exit 0
fi

mkdir -p "$PROFILE_DIR"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at $CHROME"
  exit 1
fi

echo "Starting Chrome with --remote-debugging-port=$PORT"
echo "Profile: $PROFILE_DIR"
echo "CDP endpoint: http://localhost:$PORT"
echo ""
echo "After Chrome opens, log into oral_app once; the session persists."
echo "Claude Code will attach to this browser via Playwright MCP."

"$CHROME" \
  --remote-debugging-port=$PORT \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "http://localhost:3000" &

disown
