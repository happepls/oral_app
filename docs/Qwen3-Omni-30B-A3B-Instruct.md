关于如何在 ModelScope (阿里云百炼/DashScope) 上使用 Qwen3-Omni (或 Qwen2.5-Omni) 的 API，以下是基于现有文档和最佳实践的详细指南。

**核心提示**：

* **模型名称**：目前公开文档主要集中在 `qwen2.5-omni` 和 `qwen-audio` 系列。虽然您提到 `Qwen3-Omni`，但在调用 API 时，请务必先确认 DashScope 控制台中确切的 `model` 参数值（通常类似于 `qwen-omni-turbo` 或具体版本号）。
* **流式强制**：Omni 类全模态模型通常**仅支持流式调用 (`stream=True`)**，因为它们需要同时实时输出音频和文本。
* **接口选择**：必须使用 `MultiModalConversation` 接口，而非普通的文本生成接口。

-----

### 1\. 环境准备

首先安装 DashScope 的 Python SDK：

```bash
pip install dashscope --upgrade
```

确保已获取 API Key 并配置环境变量：

```bash
export DASHSCOPE_API_KEY="sk-your-api-key"
```

### 2\. 核心 API 调用示例 (Python)

Qwen-Omni 的核心能力是**端到端语音对话**（语音输入 -\> 语音+文本输出）。以下是一个标准的流式调用示例代码：

```python
from http import HTTPStatus
import dashscope
from dashscope import MultiModalConversation

def call_qwen_omni_stream():
    # 构造用户输入：包含文本指令和音频文件
    messages = [
        {
            "role": "user",
            "content": [
                {"text": "请听这段音频，并用英语回复我。"}, # 可选的文本指令
                {"audio": "https://your-oss-bucket.com/test_audio.mp3"} # 支持本地路径或URL
            ]
        }
    ]

    # 发起流式调用
    responses = MultiModalConversation.call(
        # 请在阿里云百炼控制台确认最新的模型代码，如 qwen2.5-omni-instruct 或 qwen-audio-turbo
        model='qwen2.5-omni', 
        messages=messages,
        stream=True,  # Omni模型必须开启流式
        result_format='message',
        # 可选参数：指定输出语音的音色 (如 Cherry, Serena, Ethan, Chelsie)
        # 注意：部分Omni模型可能自动克隆或使用特定参数控制
        # parameters={'voice': 'Cherry'} 
    )

    print("--- 正在接收流式响应 ---")
    for response in responses:
        if response.status_code == HTTPStatus.OK:
            output = response.output
            # 实时打印增量文本
            if output.choices and output.choices[0].message.content:
                # 注意：实际SDK返回结构可能包含 delta 字段，需根据实际调试调整
                content_list = output.choices[0].message.content
                for item in content_list:
                    if 'text' in item:
                        print(f"[Text]: {item['text']}", end="", flush=True)
                    if 'audio' in item:
                        # 音频通常以二进制流或临时URL形式返回
                        # 实时场景下通常需要将此数据流送入播放器
                        print(f"\n[Audio Chunk Received]") 
        else:
            print(f"请求失败: {response.code} - {response.message}")

if __name__ == '__main__':
    call_qwen_omni_stream()
```

### 3\. 关键参数说明

* **`model`**: 目前 DashScope 上 Omni 类的模型 ID 可能会更新。如果 `qwen3-omni` 尚未完全全量开放，请尝试使用 `qwen2.5-omni` 或 `qwen-audio-turbo` 作为替代。
* **`stream=True`**: 这是必须的。Omni 模型通过“Thinking-Talking”架构工作，文本和音频是几乎同时生成的。非流式调用会导致极大的延迟或直接报错。
* **`voice` 参数**: 如果模型支持 TTS 输出，可以通过 `parameters` 字典指定音色。常见的预设音色包括 `Cherry`, `Serena`, `Ethan`, `Chelsie`。

### 4\. 实时性优化建议 (针对 SROP 架构)

您的项目 (SROP) 强调 **2s 以内的延迟**。标准的 HTTP 流式 API 可能在网络握手上存在开销。对于极致的实时体验（如类似 GPT-4o 的实时语音模式），建议关注阿里云百炼是否开放了 **WebSocket API** 或 **Real-time API**。

* **WebSocket 方式**：通常用于双工通信（边说边听）。如果 SDK 的 HTTP 流式无法满足 2s 延迟，请查阅文档中关于 `WebSocket` 协议的接入部分（通常在 `api/ws/` 路径下）。
* **音频处理**：在客户端使用 `AudioWorklet` 采集 PCM 数据后，建议先转码为 OPUS 或使用 SDK 支持的流式上传接口，以减少传输带宽。

### 5\. 更多资源

* **官方文档**: 访问 [阿里云百炼文档中心](https://help.aliyun.com/zh/model-studio/) 搜索 "Qwen-Omni" 或 "多模态对话"。
* **模型卡片**: 在 ModelScope 网站上搜索 `Qwen3-Omni-30B-A3B-Instruct` 查看具体的 API 调用参数限制。

