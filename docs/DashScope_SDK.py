# Qwen-Omni-Realtime 模型可通过 WebSocket 协议接入，也可通过以下 Python 示例代码建立连接。也可通过DashScope SDK 建立连接。
# SDK 版本不低于1.23.9
import os
import json
from dashscope.audio.qwen_omni import OmniRealtimeConversation,OmniRealtimeCallback
import dashscope
# 若没有配置 API Key，请将下行改为 dashscope.api_key = "sk-xxx"
dashscope.api_key = os.getenv("DASHSCOPE_API_KEY")

class PrintCallback(OmniRealtimeCallback):
    def on_open(self) -> None:
        print("Connected Successfully")
    def on_event(self, response: dict) -> None:
        print("Received event:")
        print(json.dumps(response, indent=2, ensure_ascii=False))
    def on_close(self, close_status_code: int, close_msg: str) -> None:
        print(f"Connection closed (code={close_status_code}, msg={close_msg}).")

callback = PrintCallback()
conversation = OmniRealtimeConversation(
    model="qwen3-omni-flash-realtime",
    callback=callback,
    # 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime
    url="wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
)
try:
    conversation.connect()
    print("Conversation started. Press Ctrl+C to exit.")
    conversation.thread.join()
except KeyboardInterrupt:
    conversation.close()