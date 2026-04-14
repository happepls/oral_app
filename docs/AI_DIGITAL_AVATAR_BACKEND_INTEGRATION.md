# AI 数字人对话系统 - 完整后端集成文档

## 概览

本文档详细说明如何在现有 Oral AI 后端（SROP 架构）基础上集成 AI 数字人对话功能，包括 Keevx 数字人生成、Qwen3.5-Omni-Plus-Realtime 多模态交互、预设音色系统和母语辅助功能。

---

## 目录

1. [技术架构](#1-技术架构)
2. [预设音色与数字人匹配系统](#2-预设音色与数字人匹配系统)
3. [Keevx 数字人集成](#3-keevx-数字人集成)
4. [Qwen3.5-Omni 多模态对话集成](#4-qwen35-omni-多模态对话集成)
5. [完整对话流程实现](#5-完整对话流程实现)
6. [母语辅助功能](#6-母语辅助功能)
7. [腾讯云 COS 媒体存储](#7-腾讯云-cos-媒体存储)
8. [数据库模型](#8-数据库模型)
9. [环境变量配置](#9-环境变量配置)
10. [部署清单](#10-部署清单)
11. [成本估算](#11-成本估算)
12. [前端调用示例](#12-前端调用示例)

---

## 1. 技术架构

### 1.1 现有架构（SROP - Scalable Real-time Oral Practice）

```
┌─────────────────────────────────────────────────────────────┐
│                      前端应用                                │
│  React 19 + Tailwind CSS + Material Symbols                │
│  /ai-conversation (AiConversationPage)                      │
│    ├─ AiAvatar 组件（数字人显示）                            │
│    ├─ VoiceSelector 组件（音色选择：4个预设）               │
│    ├─ NativeLanguageToggle 组件（母语辅助开关）             │
│    └─ MessageBubble（双语对照消息显示）                      │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────┐
│               API Gateway (Nginx/Express, Port 8080)         │
│  路由层：请求分发、负载均衡、限流                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────┬──────────────────┬──────────────────────┐
│ user-service     │ conversation-    │ ai-omni-service      │
│ (Node.js)        │ service          │ (Python FastAPI)     │
│ Port 3002        │ (Node.js)        │ Port 8082            │
│ - 用户认证        │ Port 8083        │ - Qwen3.5-Omni      │
│ - 订阅管理        │ - 对话管理        │ - 实时语音对话       │
│ - 数字人绑定      │ - 会话状态        │ - 语音识别（内置）    │
│ PostgreSQL       │ Redis/Postgres   │ - 语音合成（TTS）    │
└──────────────────┴──────────────────┴──────────────────────┘
         │                    │                    │
         ├────────────────────┼────────────────────┤
         ↓                    ↓                    ↓
┌──────────────────┬──────────────────┬──────────────────────┐
│ media-processing │ comms-service    │ history-analytics    │
│ -service         │ (Node.js)        │ -service             │
│ (Node.js)        │ Port 3001        │ (Node.js)            │
│ Port 8002        │ - WebSocket      │ Port 8001            │
│ - 音频转码        │ - 实时通信        │ - 聊天历史存储        │
│ - 腾讯云 COS      │                  │ MongoDB              │
└──────────────────┴──────────────────┴──────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   外部服务集成                               │
│  Keevx API              - 数字人形象生成                     │
│  Qwen3.5-Omni API       - 多模态对话（语音+文本）            │
│  Qwen TTS               - 语音合成（4个预设音色）             │
│  Azure Translator       - 翻译服务（母语辅助）               │
│  腾讯云 COS             - 音频文件存储                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 新增集成点

| 服务 | 集成内容 | 说明 |
|------|---------|------|
| **user-service** | 添加数字人绑定、音色偏好存储 | 用户选择音色后，系统自动分配对应数字人 |
| **conversation-service** | 添加数字人会话管理、音色参数传递 | 管理对话中的数字人和音色配置 |
| **ai-omni-service** | 集成 Keevx 数字人生成、Qwen 音色合成 | Python 服务处理多模态交互 |
| **media-processing-service** | 添加腾讯云 COS 上传逻辑 | 存储数字人视频和语音文件 |
| **api-gateway** | 添加数字人相关路由 | `/api/avatar/*` 路由 |

---

## 2. 预设音色与数字人匹配系统

### 2.1 预设音色配置

系统预设 4 个音色选项，用户选择音色后，系统自动匹配对应的数字人形象：

```javascript
// services/ai-omni-service/app/voice_config.py
VOICE_OPTIONS = [
    {
        "id": "Serena",
        "name": "Serena",
        "desc": "温柔女声",
        "gender": "female",
        "style": "gentle",
        "qwen_voice_id": "longxiaochun",  # 通义千问音色 ID
        "avatar_style": "elegant_business"
    },
    {
        "id": "Momo",
        "name": "Momo", 
        "desc": "活泼女声",
        "gender": "female",
        "style": "cheerful",
        "qwen_voice_id": "longyue",
        "avatar_style": "casual_friendly"
    },
    {
        "id": "Ryan",
        "name": "Ryan",
        "desc": "活力男声",
        "gender": "male",
        "style": "energetic",
        "qwen_voice_id": "longzhe",
        "avatar_style": "casual_sporty"
    },
    {
        "id": "Nofish",
        "name": "Nofish",
        "desc": "稳重男声",
        "gender": "male",
        "style": "professional",
        "qwen_voice_id": "longfeng",
        "avatar_style": "professional_business"
    }
]
```

### 2.2 音色与数字人自动匹配逻辑

```python
# services/ai-omni-service/app/avatar_matcher.py
import os
import logging
from typing import Dict, Optional
from .voice_config import VOICE_OPTIONS

logger = logging.getLogger(__name__)

class AvatarMatcher:
    """音色与数字人自动匹配器"""
    
    def __init__(self):
        self.voice_config_map = {v['id']: v for v in VOICE_OPTIONS}
    
    def get_voice_config(self, voice_id: str) -> Optional[Dict]:
        """获取音色配置"""
        return self.voice_config_map.get(voice_id)
    
    def match_avatar_to_voice(self, voice_id: str) -> Dict:
        """
        根据用户选择的音色，自动匹配对应的数字人形象
        
        Args:
            voice_id: 音色 ID (Serena/Momo/Ryan/Nofish)
            
        Returns:
            数字人配置字典
        """
        voice_config = self.get_voice_config(voice_id)
        
        if not voice_config:
            logger.warning(f"Unknown voice_id: {voice_id}, fallback to Serena")
            voice_config = self.voice_config_map['Serena']
        
        # 返回匹配的数字人配置
        return {
            "voice_id": voice_config['id'],
            "voice_name": voice_config['name'],
            "voice_desc": voice_config['desc'],
            "qwen_voice_id": voice_config['qwen_voice_id'],
            "avatar_style": voice_config['avatar_style'],
            "gender": voice_config['gender'],
            "tts_params": {
                "voice": voice_config['qwen_voice_id'],
                "speed": 1.0,
                "volume": 50
            }
        }
    
    def get_all_voices(self) -> list:
        """获取所有可用音色列表"""
        return [
            {
                "id": v['id'],
                "name": v['name'],
                "desc": v['desc'],
                "gender": v['gender']
            }
            for v in VOICE_OPTIONS
        ]

# 单例实例
avatar_matcher = AvatarMatcher()
```

### 2.3 用户音色选择流程

```
1. 用户进入 AI 对话页面
   ↓
2. 选择音色（Serena/Momo/Ryan/Nofish）
   ↓
3. 前端调用 POST /api/avatar/select-voice
   ↓
4. ai-omni-service 根据音色匹配数字人
   ↓
5. 调用 Keevx API 生成对应风格的数字人形象
   ↓
6. 返回数字人信息 + 音色配置给前端
   ↓
7. 开始对话（使用匹配的数字人和音色）
```

---

## 3. Keevx 数字人集成

### 3.1 Keevx API 配置

在 `services/ai-omni-service/.env` 中添加：

```bash
# Keevx 数字人配置
KEEVX_API_KEY=your_keevx_api_key
KEEVX_API_URL=https://api.keevx.com/v1
KEEVX_PROJECT_ID=your_project_id
```

### 3.2 Keevx Service 实现

```python
# services/ai-omni-service/app/keevx_service.py
import os
import aiohttp
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class KeevxService:
    """Keevx 数字人生成服务"""
    
    def __init__(self):
        self.api_key = os.getenv('KEEVX_API_KEY')
        self.api_url = os.getenv('KEEVX_API_URL', 'https://api.keevx.com/v1')
        self.project_id = os.getenv('KEEVX_PROJECT_ID')
        
        if not all([self.api_key, self.project_id]):
            logger.warning("Keevx credentials not configured")
    
    async def generate_avatar(self, avatar_style: str, voice_config: Dict) -> Dict:
        """
        生成数字人形象
        
        Args:
            avatar_style: 数字人风格 (elegant_business, casual_friendly, etc.)
            voice_config: 音色配置
            
        Returns:
            数字人信息（包含图片URL、视频URL等）
        """
        # 根据 avatar_style 映射 Keevx 配置
        style_mapping = {
            "elegant_business": {
                "gender": "female",
                "style": "professional",
                "clothing": "business_suit"
            },
            "casual_friendly": {
                "gender": "female",
                "style": "casual",
                "clothing": "casual_wear"
            },
            "casual_sporty": {
                "gender": "male",
                "style": "casual",
                "clothing": "sportswear"
            },
            "professional_business": {
                "gender": "male",
                "style": "professional",
                "clothing": "business_suit"
            }
        }
        
        keevx_config = style_mapping.get(avatar_style, style_mapping['elegant_business'])
        
        async with aiohttp.ClientSession() as session:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                "projectId": self.project_id,
                "name": voice_config.get('voice_name', 'Avatar'),
                "gender": keevx_config['gender'],
                "style": keevx_config['style'],
                "customizations": {
                    "clothing": keevx_config['clothing']
                }
            }
            
            try:
                async with session.post(
                    f"{self.api_url}/avatars/generate",
                    headers=headers,
                    json=payload
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            "avatar_id": data.get('id'),
                            "image_url": data.get('thumbnail_url'),
                            "video_url": data.get('video_url'),
                            "gender": keevx_config['gender'],
                            "style": keevx_config['style']
                        }
                    else:
                        error = await response.text()
                        logger.error(f"Keevx API error: {error}")
                        return self._get_fallback_avatar(keevx_config['gender'])
            
            except Exception as e:
                logger.error(f"Failed to generate avatar: {e}")
                return self._get_fallback_avatar(keevx_config['gender'])
    
    def _get_fallback_avatar(self, gender: str) -> Dict:
        """降级：返回默认数字人"""
        return {
            "avatar_id": f"default_{gender}",
            "image_url": f"https://cdn.oralai.com/avatars/default_{gender}.png",
            "video_url": f"https://cdn.oralai.com/avatars/default_{gender}.mp4",
            "gender": gender,
            "style": "default"
        }
    
    async def get_avatars_list(self) -> list:
        """获取已生成的数字人列表"""
        async with aiohttp.ClientSession() as session:
            headers = {
                'Authorization': f'Bearer {self.api_key}'
            }
            
            try:
                async with session.get(
                    f"{self.api_url}/avatars",
                    headers=headers,
                    params={"projectId": self.project_id}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('avatars', [])
                    else:
                        return []
            except Exception as e:
                logger.error(f"Failed to fetch avatars: {e}")
                return []

# 单例实例
keevx_service = KeevxService()
```

---

## 4. Qwen3.5-Omni 多模态对话集成

### 4.1 Qwen Omni 配置

在 `services/ai-omni-service/.env` 中添加：

```bash
# Qwen 配置
DASHSCOPE_API_KEY=your_dashscope_api_key
QWEN_MODEL=qwen3.5-omni-plus-realtime
QWEN_TTS_MODEL=cosyvoice-v1
```

### 4.2 Qwen Omni Service（实时语音对话）

```python
# services/ai-omni-service/app/qwen_omni_service.py
import os
import asyncio
import logging
from dashscope.audio.asr import Recognition
from dashscope.audio.tts import SpeechSynthesizer
from http import HTTPStatus

logger = logging.getLogger(__name__)

class QwenOmniService:
    """Qwen3.5-Omni 多模态对话服务"""
    
    def __init__(self):
        self.api_key = os.getenv('DASHSCOPE_API_KEY')
        self.model = os.getenv('QWEN_MODEL', 'qwen3.5-omni-plus-realtime')
        self.tts_model = os.getenv('QWEN_TTS_MODEL', 'cosyvoice-v1')
    
    async def transcribe_audio(self, audio_data: bytes) -> str:
        """
        语音转文字（使用 Qwen 内置 ASR）
        
        Args:
            audio_data: 音频数据
            
        Returns:
            转录文本
        """
        try:
            recognition = Recognition(
                model='paraformer-realtime-v2',
                format='pcm',
                sample_rate=16000,
                callback=None
            )
            
            result = recognition.call(audio_data)
            
            if result.status_code == HTTPStatus.OK:
                transcript = result.output.get('sentence', {}).get('text', '')
                return transcript
            else:
                logger.error(f"ASR failed: {result.message}")
                return ""
        
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return ""
    
    async def generate_response(
        self,
        user_message: str,
        conversation_history: list,
        scenario_context: dict,
        native_language: str = None
    ) -> str:
        """
        生成 AI 回复（文本）
        
        Args:
            user_message: 用户消息
            conversation_history: 对话历史
            scenario_context: 场景上下文
            native_language: 用户母语（用于母语辅助）
            
        Returns:
            AI 回复文本
        """
        # 构建 prompt
        system_prompt = f"""You are an English conversation tutor helping a student practice speaking.
Current scenario: {scenario_context.get('title', 'Daily Conversation')}
Context: {scenario_context.get('description', 'Practice daily English')}

Guidelines:
- Keep responses conversational and natural
- Encourage the student to speak more
- Ask follow-up questions
- Correct errors gently when appropriate
- Match the scenario context"""

        if native_language:
            system_prompt += f"\n- User's native language is {native_language}"
        
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # 添加历史消息
        for msg in conversation_history[-10:]:  # 只保留最近 10 轮
            messages.append({
                "role": msg.get('role', 'user'),
                "content": msg.get('text', '')
            })
        
        # 添加当前用户消息
        messages.append({
            "role": "user",
            "content": user_message
        })
        
        # 调用 Qwen API（使用现有的 DashScope SDK）
        try:
            from dashscope import Generation
            
            response = Generation.call(
                model='qwen-plus',
                messages=messages,
                result_format='message',
                stream=False,
                api_key=self.api_key
            )
            
            if response.status_code == HTTPStatus.OK:
                return response.output.choices[0].message.content
            else:
                logger.error(f"Qwen API error: {response.message}")
                return "I apologize, but I'm having trouble responding right now. Could you please try again?"
        
        except Exception as e:
            logger.error(f"Response generation error: {e}")
            return "Sorry, I encountered an error. Please try again."
    
    async def synthesize_speech(
        self,
        text: str,
        voice_id: str,
        output_format: str = 'mp3'
    ) -> bytes:
        """
        文字转语音（使用 Qwen TTS + 预设音色）
        
        Args:
            text: 要合成的文本
            voice_id: 音色 ID（对应 VOICE_OPTIONS 中的 qwen_voice_id）
            output_format: 输出格式
            
        Returns:
            音频数据（bytes）
        """
        try:
            synthesizer = SpeechSynthesizer(
                model=self.tts_model,
                voice=voice_id,
                format=output_format,
                api_key=self.api_key
            )
            
            audio_data = synthesizer.call(text)
            
            if audio_data:
                return audio_data
            else:
                logger.error("TTS returned empty audio")
                return b''
        
        except Exception as e:
            logger.error(f"Speech synthesis error: {e}")
            return b''
    
    async def analyze_pronunciation(
        self,
        user_transcript: str,
        reference_text: str = None
    ) -> dict:
        """
        语音评分分析
        
        Args:
            user_transcript: 用户语音转文字结果
            reference_text: 参考文本（可选）
            
        Returns:
            评分结果
        """
        # 使用 Qwen 分析发音质量
        analysis_prompt = f"""Analyze the pronunciation quality and provide scores (0-100):
User said: "{user_transcript}"
Reference: "{reference_text or 'N/A'}"

Provide JSON response with:
- pronunciation: accuracy score (0-100)
- fluency: smoothness score (0-100)
- grammar: grammatical correctness (0-100)
- suggestions: array of improvement suggestions"""
        
        try:
            from dashscope import Generation
            
            response = Generation.call(
                model='qwen-plus',
                messages=[
                    {"role": "system", "content": "You are a pronunciation analysis expert."},
                    {"role": "user", "content": analysis_prompt}
                ],
                result_format='message',
                api_key=self.api_key
            )
            
            if response.status_code == HTTPStatus.OK:
                import json
                result = json.loads(response.output.choices[0].message.content)
                return result
            else:
                return self._default_analysis()
        
        except Exception as e:
            logger.error(f"Pronunciation analysis error: {e}")
            return self._default_analysis()
    
    def _default_analysis(self) -> dict:
        """默认评分"""
        return {
            "pronunciation": 75,
            "fluency": 70,
            "grammar": 80,
            "suggestions": []
        }

# 单例实例
qwen_omni_service = QwenOmniService()
```

---

## 5. 完整对话流程实现

### 5.1 AI Omni Service API 路由

在 `services/ai-omni-service/app/main.py` 中添加端点：

```python
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from .avatar_matcher import avatar_matcher
from .keevx_service import keevx_service
from .qwen_omni_service import qwen_omni_service
from .cos_service import cos_service  # 腾讯云 COS 上传

app = FastAPI()

@app.post("/api/avatar/select-voice")
async def select_voice(voice_id: str = Form(...)):
    """
    用户选择音色，系统自动匹配数字人
    
    Args:
        voice_id: 音色 ID (Serena/Momo/Ryan/Nofish)
        
    Returns:
        数字人信息 + 音色配置
    """
    try:
        # 1. 匹配音色配置
        voice_config = avatar_matcher.match_avatar_to_voice(voice_id)
        
        # 2. 生成对应的数字人
        avatar_info = await keevx_service.generate_avatar(
            avatar_style=voice_config['avatar_style'],
            voice_config=voice_config
        )
        
        return JSONResponse({
            "success": True,
            "data": {
                "voice": {
                    "id": voice_config['voice_id'],
                    "name": voice_config['voice_name'],
                    "desc": voice_config['voice_desc']
                },
                "avatar": {
                    "id": avatar_info['avatar_id'],
                    "image_url": avatar_info['image_url'],
                    "video_url": avatar_info['video_url'],
                    "gender": avatar_info['gender']
                },
                "tts_params": voice_config['tts_params']
            }
        })
    
    except Exception as e:
        logger.error(f"Voice selection error: {e}")
        raise HTTPException(status_code=500, detail="Failed to select voice")


@app.get("/api/avatar/voices")
async def get_available_voices():
    """获取所有可用音色"""
    voices = avatar_matcher.get_all_voices()
    return JSONResponse({
        "success": True,
        "data": voices
    })


@app.post("/api/conversation/message")
async def send_message(
    conversation_id: str = Form(...),
    audio_file: UploadFile = File(...),
    voice_id: str = Form(...),
    native_language_enabled: bool = Form(False),
    user_native_language: str = Form('zh-Hans')
):
    """
    发送语音消息并获取 AI 回复
    
    流程：
    1. 语音转文字（Qwen ASR）
    2. 生成 AI 回复文本（Qwen）
    3. 文字转语音（Qwen TTS + 预设音色）
    4. 上传音频到腾讯云 COS
    5. 返回完整对话数据
    """
    try:
        # 1. 读取音频数据
        audio_data = await audio_file.read()
        
        # 2. 语音转文字（Qwen 内置 ASR）
        user_transcript = await qwen_omni_service.transcribe_audio(audio_data)
        
        if not user_transcript:
            raise HTTPException(status_code=400, detail="Failed to transcribe audio")
        
        # 3. 获取对话历史（从 conversation-service）
        # TODO: 调用 conversation-service API 获取历史
        conversation_history = []
        scenario_context = {
            "title": "Daily Conversation",
            "description": "Practice daily English"
        }
        
        # 4. 生成 AI 回复
        ai_response_text = await qwen_omni_service.generate_response(
            user_message=user_transcript,
            conversation_history=conversation_history,
            scenario_context=scenario_context,
            native_language=user_native_language if native_language_enabled else None
        )
        
        # 5. 获取音色配置
        voice_config = avatar_matcher.get_voice_config(voice_id)
        qwen_voice_id = voice_config['qwen_voice_id']
        
        # 6. 合成 AI 语音
        ai_audio_data = await qwen_omni_service.synthesize_speech(
            text=ai_response_text,
            voice_id=qwen_voice_id
        )
        
        # 7. 上传音频到腾讯云 COS
        user_audio_url = await cos_service.upload_audio(
            audio_data=audio_data,
            filename=f"user_{conversation_id}_{int(time.time())}.webm"
        )
        
        ai_audio_url = await cos_service.upload_audio(
            audio_data=ai_audio_data,
            filename=f"ai_{conversation_id}_{int(time.time())}.mp3"
        )
        
        # 8. 语音评分
        analysis = await qwen_omni_service.analyze_pronunciation(
            user_transcript=user_transcript
        )
        
        # 9. 母语翻译（如果开启）
        user_translation = None
        ai_translation = None
        
        if native_language_enabled:
            # TODO: 调用 Azure Translator API
            pass
        
        return JSONResponse({
            "success": True,
            "data": {
                "userMessage": {
                    "text": user_transcript,
                    "translation": user_translation,
                    "audioUrl": user_audio_url,
                    "timestamp": datetime.now().isoformat()
                },
                "aiResponse": {
                    "text": ai_response_text,
                    "translation": ai_translation,
                    "audioUrl": ai_audio_url,
                    "timestamp": datetime.now().isoformat()
                },
                "analysis": analysis
            }
        })
    
    except Exception as e:
        logger.error(f"Message processing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process message")
```

---

## 6. 母语辅助功能

### 6.1 Azure Translator 集成

在 `services/ai-omni-service/.env` 中添加：

```bash
# Azure Translator 配置
AZURE_TRANSLATOR_KEY=your_azure_translator_key
AZURE_TRANSLATOR_REGION=eastus
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
```

### 6.2 Translation Service 实现

```python
# services/ai-omni-service/app/translation_service.py
import os
import aiohttp
import logging

logger = logging.getLogger(__name__)

class TranslationService:
    """Azure Translator 翻译服务"""
    
    def __init__(self):
        self.api_key = os.getenv('AZURE_TRANSLATOR_KEY')
        self.region = os.getenv('AZURE_TRANSLATOR_REGION', 'eastus')
        self.endpoint = os.getenv(
            'AZURE_TRANSLATOR_ENDPOINT',
            'https://api.cognitive.microsofttranslator.com'
        )
    
    async def translate_text(
        self,
        text: str,
        target_language: str = 'zh-Hans',
        source_language: str = 'en'
    ) -> str:
        """
        翻译文本
        
        Args:
            text: 待翻译文本
            target_language: 目标语言
            source_language: 源语言
            
        Returns:
            翻译结果
        """
        if not self.api_key:
            logger.warning("Azure Translator not configured, skipping translation")
            return ""
        
        url = f"{self.endpoint}/translate"
        params = {
            'api-version': '3.0',
            'from': source_language,
            'to': target_language
        }
        headers = {
            'Ocp-Apim-Subscription-Key': self.api_key,
            'Ocp-Apim-Subscription-Region': self.region,
            'Content-Type': 'application/json'
        }
        body = [{'text': text}]
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, params=params, headers=headers, json=body) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data[0]['translations'][0]['text']
                    else:
                        error = await response.text()
                        logger.error(f"Translation API error: {error}")
                        return ""
        
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return ""

# 单例实例
translation_service = TranslationService()
```

---

## 7. 腾讯云 COS 媒体存储

### 7.1 COS 配置

在 `services/media-processing-service/.env` 中添加：

```bash
# 腾讯云 COS 配置
TENCENT_COS_SECRET_ID=your_secret_id
TENCENT_COS_SECRET_KEY=your_secret_key
TENCENT_COS_BUCKET=oral-ai-media-1234567890
TENCENT_COS_REGION=ap-guangzhou
TENCENT_COS_CDN_DOMAIN=https://cdn.oralai.com
```

### 7.2 COS Service 实现

```python
# services/ai-omni-service/app/cos_service.py
import os
import logging
from qcloud_cos import CosConfig, CosS3Client
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)

class COSService:
    """腾讯云 COS 存储服务"""
    
    def __init__(self):
        secret_id = os.getenv('TENCENT_COS_SECRET_ID')
        secret_key = os.getenv('TENCENT_COS_SECRET_KEY')
        region = os.getenv('TENCENT_COS_REGION', 'ap-guangzhou')
        
        self.bucket = os.getenv('TENCENT_COS_BUCKET')
        self.cdn_domain = os.getenv('TENCENT_COS_CDN_DOMAIN', '')
        
        if not all([secret_id, secret_key, self.bucket]):
            logger.warning("Tencent COS not configured")
            self.client = None
            return
        
        config = CosConfig(
            Region=region,
            SecretId=secret_id,
            SecretKey=secret_key
        )
        self.client = CosS3Client(config)
    
    async def upload_audio(self, audio_data: bytes, filename: str) -> str:
        """
        上传音频文件到 COS
        
        Args:
            audio_data: 音频数据
            filename: 文件名
            
        Returns:
            文件 CDN URL
        """
        if not self.client:
            logger.warning("COS client not initialized, using fallback URL")
            return f"https://cdn.oralai.com/fallback/{filename}"
        
        try:
            # 生成对象键（路径）
            date_prefix = datetime.now().strftime('%Y/%m/%d')
            object_key = f"audio/{date_prefix}/{filename}"
            
            # 上传文件
            response = self.client.put_object(
                Bucket=self.bucket,
                Body=audio_data,
                Key=object_key,
                ContentType=self._get_content_type(filename)
            )
            
            # 返回 CDN URL
            if self.cdn_domain:
                return f"{self.cdn_domain}/{object_key}"
            else:
                # 使用 COS 直接链接
                return f"https://{self.bucket}.cos.{self.client._conf._region}.myqcloud.com/{object_key}"
        
        except Exception as e:
            logger.error(f"COS upload error: {e}")
            return f"https://cdn.oralai.com/error/{filename}"
    
    def _get_content_type(self, filename: str) -> str:
        """根据文件扩展名获取 Content-Type"""
        ext = filename.split('.')[-1].lower()
        content_types = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'webm': 'audio/webm',
            'ogg': 'audio/ogg',
            'mp4': 'video/mp4'
        }
        return content_types.get(ext, 'application/octet-stream')

# 单例实例
cos_service = COSService()
```

---

## 8. 数据库模型

### 8.1 User Model（PostgreSQL - user-service）

```sql
-- services/user-service/migrations/add_avatar_voice.sql

-- 添加数字人和音色字段到 users 表
ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_voice_id VARCHAR(50) DEFAULT 'Serena';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_image_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS native_language VARCHAR(10) DEFAULT 'zh-Hans';
ALTER TABLE users ADD COLUMN IF NOT EXISTS native_language_enabled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_voice_id ON users(selected_voice_id);
```

### 8.2 Conversation Model（MongoDB - history-analytics-service）

```javascript
// services/history-analytics-service/models/conversation.model.js

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, required: true },
  translation: { type: String }, // 母语翻译
  audioUrl: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const conversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  scenarioId: { type: String, required: true },
  voiceId: { type: String, required: true }, // 用户选择的音色
  avatarId: { type: String }, // 数字人 ID
  avatarImageUrl: { type: String },
  messages: [messageSchema],
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  stats: {
    totalMessages: Number,
    duration: Number, // 秒
    avgPronunciationScore: Number,
    avgFluencyScore: Number
  },
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
});

module.exports = mongoose.model('Conversation', conversationSchema);
```

---

## 9. 环境变量配置

### 9.1 根目录 `.env` 更新

```bash
# 现有配置...

# Keevx 数字人（新增）
KEEVX_API_KEY=your_keevx_api_key
KEEVX_API_URL=https://api.keevx.com/v1
KEEVX_PROJECT_ID=your_project_id

# Azure Translator（母语辅助）
AZURE_TRANSLATOR_KEY=your_azure_translator_key
AZURE_TRANSLATOR_REGION=eastus
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com

# 腾讯云 COS
TENCENT_COS_SECRET_ID=your_secret_id
TENCENT_COS_SECRET_KEY=your_secret_key
TENCENT_COS_BUCKET=oral-ai-media-1234567890
TENCENT_COS_REGION=ap-guangzhou
TENCENT_COS_CDN_DOMAIN=https://cdn.oralai.com
```

### 9.2 ai-omni-service `.env`

```bash
# services/ai-omni-service/.env

# DashScope（Qwen）
DASHSCOPE_API_KEY=your_dashscope_api_key
QWEN_MODEL=qwen3.5-omni-plus-realtime
QWEN_TTS_MODEL=cosyvoice-v1

# Keevx
KEEVX_API_KEY=your_keevx_api_key
KEEVX_API_URL=https://api.keevx.com/v1
KEEVX_PROJECT_ID=your_project_id

# Azure Translator
AZURE_TRANSLATOR_KEY=your_azure_translator_key
AZURE_TRANSLATOR_REGION=eastus
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com

# 腾讯云 COS
TENCENT_COS_SECRET_ID=your_secret_id
TENCENT_COS_SECRET_KEY=your_secret_key
TENCENT_COS_BUCKET=oral-ai-media-1234567890
TENCENT_COS_REGION=ap-guangzhou
TENCENT_COS_CDN_DOMAIN=https://cdn.oralai.com
```

---

## 10. 部署清单

### Phase 1: 基础配置（1周）
- [ ] 更新所有服务的环境变量配置
- [ ] 配置腾讯云 COS 存储桶
- [ ] 配置 Keevx API 账户
- [ ] 配置 Azure Translator API

### Phase 2: 服务集成开发（2周）
- [ ] ai-omni-service: 添加音色匹配逻辑
- [ ] ai-omni-service: 集成 Keevx 数字人生成
- [ ] ai-omni-service: 集成 Qwen TTS（4个预设音色）
- [ ] ai-omni-service: 集成 Azure Translator
- [ ] ai-omni-service: 集成腾讯云 COS 上传
- [ ] user-service: 数据库迁移（添加音色和数字人字段）
- [ ] conversation-service: 更新会话管理逻辑
- [ ] api-gateway: 添加数字人相关路由

### Phase 3: 测试与优化（1周）
- [ ] 单元测试：音色匹配逻辑
- [ ] 集成测试：完整对话流程
- [ ] 性能测试：响应时间 < 2秒
- [ ] 音色质量测试：4个预设音色
- [ ] 数字人加载优化
- [ ] COS 上传速度优化

### Phase 4: 部署上线（3天）
- [ ] 部署到 staging 环境
- [ ] 完整功能测试
- [ ] 灰度发布到生产环境
- [ ] 监控和日志配置

---

## 11. 成本估算

### 外部服务月度成本（1000 DAU）

| 服务 | 用量 | 单价 | 月成本 |
|------|------|------|--------|
| Keevx 数字人 | 4 个预设形象 | $50/形象 | $200 |
| Qwen3.5-Omni API | 100万 tokens | $0.002/1K | $200 |
| Qwen TTS (CosyVoice) | 50万字符 | ¥0.08/千字符 | ¥40 (~$6) |
| Qwen ASR | 1000小时 | ¥0.01/分钟 | ¥600 (~$84) |
| Azure Translator | 540万字符 * | $10/1M | $54 |
| 腾讯云 COS | 500GB存储 + 1TB流量 | ¥0.118/GB + ¥0.50/GB | ¥559 (~$78) |
| **总计** | | | **$622/月** |

\* 假设 60% 用户开启母语辅助，每用户每天 10 轮对话

### 优化后成本

通过以下优化可降低成本：
- **翻译缓存（Redis）**: 降低 30% 翻译成本 → $54 → $38
- **COS 预加载优化**: 降低 20% 流量成本 → $78 → $62
- **优化后总计**: **$582/月**

---

## 12. 前端调用示例

### 12.1 选择音色并匹配数字人

```typescript
// 前端调用示例
class AvatarService {
  async selectVoice(voiceId: 'Serena' | 'Momo' | 'Ryan' | 'Nofish') {
    const formData = new FormData();
    formData.append('voice_id', voiceId);
    
    const response = await fetch(`${AI_SERVICE_URL}/api/avatar/select-voice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const result = await response.json();
    
    return {
      voice: result.data.voice,      // { id, name, desc }
      avatar: result.data.avatar,    // { id, image_url, video_url }
      ttsParams: result.data.tts_params
    };
  }
  
  async getAvailableVoices() {
    const response = await fetch(`${AI_SERVICE_URL}/api/avatar/voices`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    return result.data; // 返回 4 个预设音色
  }
}
```

### 12.2 发送语音消息

```typescript
class ConversationService {
  async sendVoiceMessage(
    conversationId: string,
    audioBlob: Blob,
    voiceId: string,
    nativeLanguageEnabled: boolean = false
  ) {
    const formData = new FormData();
    formData.append('conversation_id', conversationId);
    formData.append('audio_file', audioBlob, 'recording.webm');
    formData.append('voice_id', voiceId);
    formData.append('native_language_enabled', nativeLanguageEnabled.toString());
    formData.append('user_native_language', 'zh-Hans');
    
    const response = await fetch(`${AI_SERVICE_URL}/api/conversation/message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const result = await response.json();
    
    return {
      userMessage: result.data.userMessage,    // { text, translation, audioUrl }
      aiResponse: result.data.aiResponse,      // { text, translation, audioUrl }
      analysis: result.data.analysis           // 语音评分
    };
  }
}
```

---

## 附录：API 端点总览

### 数字人与音色管理
- `POST /api/avatar/select-voice` - 选择音色并匹配数字人
- `GET /api/avatar/voices` - 获取所有可用音色（4个预设）
- `GET /api/avatar/list` - 获取用户的数字人列表

### 对话管理
- `POST /api/conversation/start` - 开始对话
- `POST /api/conversation/message` - 发送语音消息（完整流程）
- `GET /api/conversation/:id` - 获取对话历史
- `POST /api/conversation/:id/end` - 结束对话

### 母语辅助
- `POST /api/translation/translate` - 翻译单条消息
- `POST /api/translation/batch` - 批量翻译

---

## 联系支持

- 技术问题：tech@oralai.com
- Keevx 文档：https://docs.keevx.com
- 通义千问文档：https://help.aliyun.com/zh/dashscope
- 腾讯云 COS：https://cloud.tencent.com/document/product/436

---

**文档版本**: v2.0  
**最后更新**: 2026-04-09  
**维护者**: Oral AI 技术团队
