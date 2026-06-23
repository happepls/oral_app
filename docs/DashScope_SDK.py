
from openai import OpenAI
import os
from http import HTTPStatus
from urllib.parse import urlparse, unquote
from pathlib import PurePosixPath
import requests
from dashscope import ImageSynthesis
import dashscope


# qwen-flash 替换 原qwen-turbo
# Initialize OpenAI client
client = OpenAI(
    # If environment variables are not configured, replace with the Model Studio API Key: api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
)

messages = [
    {"role":"user","content":"hi"}
]

completion = client.chat.completions.create(
    model="qwen-flash",
    messages=messages,
    stream=True,
    top_p=0.8,
    temperature=0.7,
    result_format="message",
    extra_body={
        "thinking_budget": 4000
    }
)

reasoning_content = ""  # Complete reasoning process
answer_content = ""  # Complete response
is_answering = False  # Whether entering the response phase
print("=" * 20 + "Thinking Process" + "=" * 20 )

for chunk in completion:
    if not chunk.choices:
        print("Usage:")
        print(chunk.usage)
        continue

    delta = chunk.choices[0].delta

    # Only collect reasoning content
    if hasattr(delta, "reasoning_content") and delta.reasoning_content is not None:
        if not is_answering:
            print(delta.reasoning_content, end="", flush=True)
        reasoning_content += delta.reasoning_content

    # Received content, starting to respond
    if hasattr(delta, "content") and delta.content:
        if not is_answering:
            print("=" * 20 + "Complete Response" + "=" * 20)
            is_answering = True
        print(delta.content, end="", flush=True)
        answer_content += delta.content


# wan2.2-t2i-flash 替换 原 wanx2.1-t2i-turbo
dashscope.base_http_api_url = 'https://ws-apadg96g31j9nnwh.ap-southeast-1.maas.aliyuncs.com/api/v1'
prompt = "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵"

print('----sync call, please wait a moment----')
rsp = ImageSynthesis.call(api_key=os.getenv("DASHSCOPE_API_KEY"),
                          model="wan2.2-t2i-flash",
                          prompt=prompt,
                          n=1,
                          size='1280*1280')
print('response: %s' % rsp)
if rsp.status_code == HTTPStatus.OK:
    # 在当前目录下保存图片
    for result in rsp.output.results:
        file_name = PurePosixPath(unquote(urlparse(result.url).path)).parts[-1]
        with open('./%s' % file_name, 'wb+') as f:
            f.write(requests.get(result.url).content)
else:
    print('sync_call Failed, status_code: %s, code: %s, message: %s' %
          (rsp.status_code, rsp.code, rsp.message))

# 新加坡专属工作区qwen3-asr-flash-realtime 替换 原 qwen3-asr-flash-realtime
import os
import time
import json
import threading
import base64
import websocket
import logging
import logging.handlers
from datetime import datetime

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# 若没有配置环境变量，请用百炼API Key将下行替换为：API_KEY="sk-xxx"
API_KEY = os.environ.get("DASHSCOPE_API_KEY")
QWEN_MODEL = "qwen3-asr-flash-realtime"

baseUrl = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
url = f"{baseUrl}?model={QWEN_MODEL}"
print(f"Connecting to server: {url}")

# 注意： 如果是非vad模式，建议持续发送的音频时长累加不超过60s
enableServerVad = True

headers = [
    "Authorization: Bearer " + API_KEY,
    "OpenAI-Beta: realtime=v1"
]

def send_event(ws, event):
    logger.info(f" Send event: {event['event_id']}, type={event['type']}")
    ws.send(json.dumps(event))

def init_logger():
    formatter = logging.Formatter('%(asctime)s|%(levelname)s|%(message)s')

    filter = logging.handlers.RotatingFileHandler("omni_tester.log", maxBytes = 100 * 1024 *1024, backupCount = 3)
    filter.setLevel(logging.DEBUG)
    filter.setFormatter(formatter)

    console = logging.StreamHandler()
    console.setLevel(logging.DEBUG)
    console.setFormatter(formatter)

    logger.addHandler(filter)
    logger.addHandler(console)

def on_open(ws):
    logger.info("Connected to server.")

    # 会话更新事件
    event0 = {
        "event_id": "event_123",
        "type": "session.update",
        "session": {
            "modalities": ["text"],
            "input_audio_format": "pcm",
            "sample_rate": 16000,
            "input_audio_transcription": {
                # 语种标识，可选，如果有明确的语种信息，建议设置
                "language": "zh",
                # 语料，可选，如果有语料，建议设置以增强识别效果
                # "corpus": {
                #     "text": ""
                # }
            },
            "turn_detection": None
        }
    }
    event1 = {
        "event_id": "event_123",
        "type": "session.update",
        "session": {
            "modalities": ["text"],
            "input_audio_format": "pcm",
            "sample_rate": 16000,
            "input_audio_transcription": {
                # 语种标识，可选，如果有明确的语种信息，建议设置
                "language": "zh",
                # 语料，可选，如果有语料，建议设置以增强识别效果
                # "corpus": {
                #     "text": ""
                # }
            },
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.2,
                "silence_duration_ms": 800
            }
        }
    }

    global enableServerVad
    if enableServerVad:
        logger.info(f"Sending event: {json.dumps(event1, indent=2)}")
        ws.send(json.dumps(event1))
    else:
        logger.info(f"Sending event: {json.dumps(event0, indent=2)}")
        ws.send(json.dumps(event0))

def on_message(ws, message):
    try:
        data = json.loads(message)
        logger.info(f"Received event: {json.dumps(data, ensure_ascii=False, indent=2)}")
    except json.JSONDecodeError:
        logger.error(f"Failed to parse message: {message}")

def on_error(ws, error):
    logger.error(f"Error: {error}")

def on_close(ws, close_status_code, close_msg):
    logger.info(f"Connection closed: {close_status_code} - {close_msg}")

def send_audio(ws, local_audio_path):
    time.sleep(5)

    with open(local_audio_path, 'rb') as audio_file:
        logger.info(f"文件读取开始: {datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
        while True:
            # 读取指定大小的二进制数据
            audio_data = audio_file.read(3200)
            if not audio_data:
                logger.info(f"文件读取完毕: {datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
                global enableServerVad
                if enableServerVad is False:
                    event = {
                        "event_id": "event_789",
                        "type": "input_audio_buffer.commit"
                    }
                    ws.send(json.dumps(event))
                break  # 如果已达到文件结尾，则退出循环

            # 对读取的二进制数据进行 Base64 编码
            encoded_data = base64.b64encode(audio_data).decode('utf-8')
            #print(f"读取数据：{len(audio_data)} 字节, 编码后: {len(encoded_data)} 字节")

            eventd = {
                "event_id": "event_" + str(int(time.time() * 1000)),
                "type": "input_audio_buffer.append",
                "audio": encoded_data
            }
            ws.send(json.dumps(eventd))
            logger.info(f"Sending audio event: {eventd['event_id']}")

            # 模拟实时音频采集
            time.sleep(0.1)

# 添加连接关闭处理函数
ws = websocket.WebSocketApp(
    url,
    header=headers,
    on_open=on_open,
    on_message=on_message,
    on_error=on_error,
    on_close=on_close
)

init_logger()
logger.info(f"Connecting to local WebSocket server at {url}...")

# 替换为待识别的音频文件路径
local_audio_path = "your_audio_file"
thread = threading.Thread(target=send_audio, args=(ws, local_audio_path))
thread.start()

ws.run_forever()


# 新加坡专属工作区qwen3-tts-flash 替换 原 qwen3-tts-flash
text = "这段话复述一下。"
response = dashscope.audio.qwen_tts.SpeechSynthesizer.call(
    # 仅支持qwen-tts系列模型，请勿使用除此之外的其他模型
    model="qwen3-tts-flash",
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    text=text,
    voice="Cherry",
)
print(response)
