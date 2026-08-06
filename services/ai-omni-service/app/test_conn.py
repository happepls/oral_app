import os
import dashscope
from dashscope.audio.qwen_omni import OmniRealtimeConversation
from dashscope.audio.qwen_omni import OmniRealtimeCallback
import asyncio
from dotenv import load_dotenv
try:
    from .dashscope_config import classify_connection_error, resolve_dashscope_config
except ImportError:
    from dashscope_config import classify_connection_error, resolve_dashscope_config

# 加载 .env 文件
# 尝试加载 services/ai-omni-service/.env 如果存在，否则加载当前目录 .env
env_path = 'services/ai-omni-service/.env'
if not os.path.exists(env_path):
    env_path = '.env'
    
print(f"Loading env from: {env_path}")
load_dotenv(env_path)

config = resolve_dashscope_config(os.environ)
print(f"Credential source: {config.ws_credential_source}")
dashscope.api_key = config.http_api_key

class TestCallback(OmniRealtimeCallback):
    def on_open(self):
        print("✅ Connection Successfully Opened!")
        
    def on_close(self, *args):
        print(f"❌ Connection Closed: {args}")

    def on_event(self, response):
        print(f"Received Event: {response.get('type')}")

    def on_error(self, error):
        print(f"❌ Error: {classify_connection_error(error)['code']}")

def test_connection():
    print("Attempting to connect to DashScope Qwen-Omni...")
    conversation = OmniRealtimeConversation(
        model=os.getenv("QWEN3_OMNI_MODEL", "qwen3.5-omni-plus-realtime"),
        callback=TestCallback(),
        url=config.ws_url,
        api_key=config.ws_api_key,
    )
    
    try:
        conversation.connect()
        print("Connect method called. Waiting a bit...")
        # SDK 的 connect 可能是异步也可能是同步发起连接，但通常需要一些时间建立 WebSocket
        # 由于这是简单的脚本，我们模拟一些等待，或者保持主线程运行
        import time
        time.sleep(5)
        conversation.close()
        print("Test finished.")
    except Exception as e:
        print(f"❌ Exception during connection: {classify_connection_error(e)['code']}")

if __name__ == "__main__":
    test_connection()
