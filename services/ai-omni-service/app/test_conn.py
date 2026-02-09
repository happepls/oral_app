import os
import dashscope
from dashscope.audio.qwen_omni import OmniRealtimeConversation
from dashscope.audio.qwen_omni import OmniRealtimeCallback
import asyncio
from dotenv import load_dotenv

# 加载 .env 文件
# 尝试加载 services/ai-omni-service/.env 如果存在，否则加载当前目录 .env
env_path = 'services/ai-omni-service/.env'
if not os.path.exists(env_path):
    env_path = '.env'
    
print(f"Loading env from: {env_path}")
load_dotenv(env_path)

api_key = os.getenv("QWEN3_OMNI_API_KEY")
if not api_key:
    # 尝试从 DASHSCOPE_API_KEY 读取
    api_key = os.getenv("DASHSCOPE_API_KEY")

print(f"API Key found: {'Yes' if api_key else 'No'}")
if api_key:
    print(f"API Key prefix: {api_key[:6]}...")
else:
    print("Error: No API Key found in env variables!")
    exit(1)

dashscope.api_key = api_key

class TestCallback(OmniRealtimeCallback):
    def on_open(self):
        print("✅ Connection Successfully Opened!")
        
    def on_close(self, *args):
        print(f"❌ Connection Closed: {args}")

    def on_event(self, response):
        print(f"Received Event: {response.get('type')}")

    def on_error(self, error):
        print(f"❌ Error: {error}")

def test_connection():
    print("Attempting to connect to DashScope Qwen-Omni...")
    conversation = OmniRealtimeConversation(
        model=os.getenv("QWEN3_OMNI_MODEL", "qwen3-omni-flash-realtime-2025-12-01"),
        callback=TestCallback(),
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
        print(f"❌ Exception during connection: {e}")

if __name__ == "__main__":
    test_connection()
