import asyncio
import numpy as np
import sounddevice as sd
from queue import Queue
import threading
import time
from dataclasses import dataclass
from typing import Optional, AsyncGenerator
import io
import wave
import tempfile
import os
import re

 """在M2 Mac mini（16G统一内存）上组合式流水线（本地 ASR + 本地小/中型 LLM‐MLX + 本地 TTS），实现 “我说 → ASR → LLM 思考 → TTS 说回”的本地对话"""


# MLX imports
import mlx.core as mx
from mlx_lm import load, generate

# 使用标准whisper
try:
    import whisper

    WHISPER_AVAILABLE = True
    print("✅ OpenAI Whisper available")
except ImportError:
    WHISPER_AVAILABLE = False
    print("⚠️ OpenAI Whisper not available")

# 禁用VAD，使用简单能量检测
VAD_AVAILABLE = False
print("🔧 使用简单能量检测代替WebRTC VAD")

# TTS imports
try:
    import pyttsx3

    SYSTEM_TTS_AVAILABLE = True
    print("✅ System TTS available")
except ImportError:
    SYSTEM_TTS_AVAILABLE = False
    print("⚠️ No TTS available")


@dataclass
class AudioConfig:
    sample_rate: int = 16000
    chunk_size: int = 1024
    channels: int = 1
    silence_timeout: float = 2.5
    min_audio_length: float = 1.0
    max_buffer_seconds: float = 8.0
    energy_threshold: float = 0.005
    silence_threshold: float = 0.001


class StreamingVoiceAgent:
    def __init__(self):
        self.config = AudioConfig()
        self.audio_queue = Queue()
        self.is_listening = False
        self.is_speaking = False

        # Initialize components
        self._init_asr()
        self._init_llm()
        self._init_tts()

    def _init_asr(self):
        """初始化ASR"""
        print("🎤 Loading ASR model...")
        if WHISPER_AVAILABLE:
            try:
                self.asr_model = whisper.load_model("base")
                self.asr_type = "whisper"
                print("✅ Whisper model loaded (offline)")
            except Exception as e:
                print(f"❌ Failed to load Whisper: {e}")
                self.asr_model = None
                self.asr_type = "none"
        else:
            self.asr_model = None
            self.asr_type = "none"
            print("❌ No ASR available")

    def _init_llm(self):
        """初始化LLM"""
        print("🧠 Loading LLM model...")
        try:
            self.llm_model, self.tokenizer = load(
                "mlx-community/Qwen2.5-7B-Instruct-4bit",
                tokenizer_config={"trust_remote_code": True}
            )
            print("✅ LLM model loaded")
        except Exception as e:
            print(f"❌ Failed to load LLM: {e}")
            raise

    def _init_tts(self):
        """初始化TTS - 修复多次调用问题"""
        print("🔊 Loading TTS model...")

        self.tts = None
        self.tts_type = "none"
        self.tts_lock = asyncio.Lock()  # 添加锁防止并发问题

        if SYSTEM_TTS_AVAILABLE:
            try:
                self.tts = pyttsx3.init()

                # 获取所有可用语音
                voices = self.tts.getProperty('voices')
                self.available_voices = {}

                if voices:
                    print("🎵 可用语音:")
                    for i, voice in enumerate(voices):
                        voice_id = voice.id
                        voice_name = voice.name
                        lang_code = getattr(voice, 'languages', ['unknown'])[0] if hasattr(voice,
                                                                                           'languages') and voice.languages else 'unknown'

                        print(f"   [{i}] {voice_name} ({lang_code}) - {voice_id}")

                        # 建立语言映射
                        if any(x in voice_name.lower() or x in voice_id.lower() for x in
                               ['chinese', 'zh', 'mandarin', '中文']):
                            self.available_voices['zh'] = voice_id
                        elif any(x in voice_name.lower() or x in voice_id.lower() for x in
                                 ['english', 'en', 'us', 'uk']):
                            self.available_voices['en'] = voice_id
                        elif any(x in voice_name.lower() or x in voice_id.lower() for x in ['japanese', 'ja', '日本']):
                            self.available_voices['ja'] = voice_id
                        elif any(x in voice_name.lower() or x in voice_id.lower() for x in ['korean', 'ko', '한국']):
                            self.available_voices['ko'] = voice_id
                        elif any(
                                x in voice_name.lower() or x in voice_id.lower() for x in ['french', 'fr', 'français']):
                            self.available_voices['fr'] = voice_id
                        elif any(x in voice_name.lower() or x in voice_id.lower() for x in ['german', 'de', 'deutsch']):
                            self.available_voices['de'] = voice_id
                        elif any(
                                x in voice_name.lower() or x in voice_id.lower() for x in ['spanish', 'es', 'español']):
                            self.available_voices['es'] = voice_id

                    print(f"🌍 语言映射: {self.available_voices}")

                    # 设置默认语音（优先中文）
                    if 'zh' in self.available_voices:
                        self.tts.setProperty('voice', self.available_voices['zh'])
                        self.current_voice = 'zh'
                        print(f"✅ 默认语音设为中文")
                    elif 'en' in self.available_voices:
                        self.tts.setProperty('voice', self.available_voices['en'])
                        self.current_voice = 'en'
                        print(f"✅ 默认语音设为英文")
                    else:
                        self.current_voice = 'default'
                        print("✅ 使用系统默认语音")
                else:
                    self.current_voice = 'default'
                    self.available_voices = {}

                # 设置TTS参数
                self.tts.setProperty('rate', 180)
                self.tts.setProperty('volume', 0.9)
                self.tts_type = "system"
                print("✅ System TTS loaded with multi-language support")
                return

            except Exception as e:
                print(f"⚠️ System TTS failed: {e}")

        print("⚠️ No TTS available - text-only mode")

    def _detect_language(self, text: str) -> str:
        """检测文本语言"""
        try:
            # 简单的语言检测
            chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
            japanese_chars = len(re.findall(r'[\u3040-\u309f\u30a0-\u30ff]', text))
            korean_chars = len(re.findall(r'[\uac00-\ud7af]', text))
            total_chars = len(text)

            if total_chars == 0:
                return 'en'

            # 计算各语言字符占比
            chinese_ratio = chinese_chars / total_chars
            japanese_ratio = japanese_chars / total_chars
            korean_ratio = korean_chars / total_chars

            if chinese_ratio > 0.3:
                return 'zh'
            elif japanese_ratio > 0.3:
                return 'ja'
            elif korean_ratio > 0.3:
                return 'ko'
            else:
                # 检测其他欧洲语言的特征词
                text_lower = text.lower()
                if any(word in text_lower for word in
                       ['le', 'la', 'les', 'de', 'du', 'des', 'je', 'tu', 'nous', 'vous']):
                    return 'fr'
                elif any(
                        word in text_lower for word in ['der', 'die', 'das', 'ich', 'du', 'wir', 'ihr', 'und', 'oder']):
                    return 'de'
                elif any(word in text_lower for word in ['el', 'la', 'los', 'las', 'yo', 'tu', 'nosotros', 'vosotros']):
                    return 'es'
                else:
                    return 'en'

        except Exception as e:
            print(f"Language detection error: {e}")
            return 'en'

    def _set_voice_for_language(self, language: str):
        """根据语言设置合适的语音"""
        if not self.tts or not self.available_voices:
            return

        try:
            target_voice = None

            # 直接匹配
            if language in self.available_voices:
                target_voice = self.available_voices[language]
            # 回退策略
            elif language in ['zh-cn', 'zh-tw'] and 'zh' in self.available_voices:
                target_voice = self.available_voices['zh']
            elif language in ['en-us', 'en-gb'] and 'en' in self.available_voices:
                target_voice = self.available_voices['en']
            # 默认回退到英文或中文
            elif 'zh' in self.available_voices:
                target_voice = self.available_voices['zh']
            elif 'en' in self.available_voices:
                target_voice = self.available_voices['en']

            if target_voice and target_voice != getattr(self, 'current_voice_id', None):
                self.tts.setProperty('voice', target_voice)
                self.current_voice_id = target_voice
                print(f"🎵 切换语音: {language} -> {target_voice}")

        except Exception as e:
            print(f"Voice switching error: {e}")

    def _energy_vad(self, audio_data: np.ndarray) -> bool:
        """基于能量的语音活动检测"""
        rms = np.sqrt(np.mean(audio_data ** 2))
        return rms > self.config.energy_threshold

    def _is_silence(self, audio_data: np.ndarray) -> bool:
        """检测是否为静音"""
        rms = np.sqrt(np.mean(audio_data ** 2))
        return rms < self.config.silence_threshold

    def _audio_callback(self, indata, frames, time, status):
        """音频回调"""
        if status:
            print(f"Audio input error: {status}")

        if not self.is_speaking:
            audio_data = indata[:, 0].copy()
            audio_data = np.clip(audio_data, -1.0, 1.0)
            self.audio_queue.put(audio_data)

    def _transcribe_audio_whisper(self, audio_data: np.ndarray) -> str:
        """使用离线Whisper转录"""
        try:
            if self.asr_model is None:
                return ""

            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)

            audio_data = np.clip(audio_data, -1.0, 1.0)

            result = self.asr_model.transcribe(
                audio_data,
                language=None,
                task="transcribe",
                verbose=False
            )

            return result.get("text", "").strip()

        except Exception as e:
            print(f"Whisper transcription error: {e}")
            return ""

    async def _stream_asr(self) -> AsyncGenerator[str, None]:
        """流式ASR处理"""
        buffer = []
        silence_start = None
        last_speech_time = time.time()
        speech_detected = False

        print("🎤 开始监听音频... (使用能量检测)")

        while self.is_listening:
            try:
                current_time = time.time()

                chunks_this_cycle = 0
                while not self.audio_queue.empty() and chunks_this_cycle < 10:
                    try:
                        chunk = self.audio_queue.get_nowait()
                        buffer.append(chunk)
                        chunks_this_cycle += 1
                    except:
                        break

                if len(buffer) > 0:
                    recent_chunks = buffer[-5:]
                    if recent_chunks:
                        recent_audio = np.concatenate(recent_chunks)

                        has_speech = self._energy_vad(recent_audio)
                        is_silence = self._is_silence(recent_audio)

                        if has_speech:
                            if not speech_detected:
                                print("🔊 检测到语音...")
                                speech_detected = True
                            silence_start = None
                            last_speech_time = current_time
                        elif speech_detected and is_silence:
                            if silence_start is None:
                                silence_start = current_time
                                print("🔇 检测到静音...")

                buffer_duration = len(buffer) * self.config.chunk_size / self.config.sample_rate

                should_process = False
                if (speech_detected and silence_start and
                        current_time - silence_start > self.config.silence_timeout):
                    should_process = True
                elif buffer_duration > self.config.max_buffer_seconds:
                    should_process = True
                    print("⚠️ Buffer满，强制处理")

                if should_process and buffer_duration > self.config.min_audio_length:
                    print(f"🔄 处理音频: {buffer_duration:.1f}s")

                    try:
                        audio_data = np.concatenate(buffer)
                        rms = np.sqrt(np.mean(audio_data ** 2))
                        print(f"📊 音频RMS: {rms:.4f}")

                        if rms > self.config.silence_threshold:
                            if self.asr_type == "whisper":
                                text = self._transcribe_audio_whisper(audio_data)
                            else:
                                text = ""

                            if text and len(text.strip()) > 2:
                                print(f"🎤 转录: {text}")
                                yield text
                            else:
                                print("🔇 无有效语音内容")
                        else:
                            print("🔇 音频能量过低，跳过")

                    except Exception as e:
                        print(f"Audio processing error: {e}")

                    buffer = []
                    silence_start = None
                    speech_detected = False

                if current_time - last_speech_time > 15:
                    if buffer:
                        print("🧹 清理超时buffer")
                        buffer = []
                    silence_start = None
                    speech_detected = False

                await asyncio.sleep(0.05)

            except Exception as e:
                print(f"Stream ASR error: {e}")
                await asyncio.sleep(0.1)

    async def _generate_response(self, text: str) -> AsyncGenerator[str, None]:
        """生成LLM响应"""
        messages = [
            {"role": "system", "content": "你是一个友善的AI助手。请用简洁自然的语言回答用户问题，回复控制在50字以内。"},
            {"role": "user", "content": text}
        ]

        prompt = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )

        try:
            print("🧠 生成回复...")

            response = generate(
                model=self.llm_model,
                tokenizer=self.tokenizer,
                prompt=prompt,
                max_tokens=128,
            )

            response = response.strip()

            if prompt in response:
                response = response.replace(prompt, "").strip()

            response = response.replace("assistant\n", "").replace("Assistant:", "").replace("AI:", "").strip()

            lines = [line.strip() for line in response.split('\n') if line.strip()]
            if lines:
                response = lines[0]

            if response and len(response) > 3:
                yield response
            else:
                yield "我明白了，还有什么可以帮助你的吗？"

        except Exception as e:
            print(f"LLM generation error: {e}")
            yield "我理解了你的问题，让我换个方式回答你。"

    async def _stream_tts(self, text: str):
        """TTS合成与播放 - 修复多语言支持和重复播放问题"""
        if not self.tts:
            print(f"💬 AI回复: {text}")
            return

        # 使用异步锁防止并发TTS调用
        async with self.tts_lock:
            try:
                print(f"🔊 语音播放: {text}")

                # 检测语言并切换语音
                detected_lang = self._detect_language(text)
                print(f"🌍 检测语言: {detected_lang}")
                self._set_voice_for_language(detected_lang)

                self.is_speaking = True

                # 分句播放，改进分句逻辑
                sentences = self._split_sentences(text)
                print(f"📝 分句结果: {sentences}")

                for i, sentence in enumerate(sentences):
                    if sentence.strip():
                        print(f"🎵 播放第{i + 1}句: {sentence}")

                        # 在新线程中执行TTS避免阻塞
                        def speak_sentence():
                            try:
                                # 重新初始化TTS引擎以避免状态问题
                                temp_tts = pyttsx3.init()

                                # 重新设置语音
                                if hasattr(self, 'current_voice_id'):
                                    temp_tts.setProperty('voice', self.current_voice_id)
                                temp_tts.setProperty('rate', 180)
                                temp_tts.setProperty('volume', 0.9)

                                temp_tts.say(sentence)
                                temp_tts.runAndWait()
                                temp_tts.stop()

                            except Exception as e:
                                print(f"TTS sentence error: {e}")

                        # 在线程池中执行
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, speak_sentence)

                        # 句子间短暂停顿
                        if i < len(sentences) - 1:
                            await asyncio.sleep(0.3)

                print("✅ TTS播放完成")
                self.is_speaking = False

            except Exception as e:
                print(f"TTS error: {e}")
                self.is_speaking = False

    def _split_sentences(self, text: str) -> list:
        """改进的分句方法"""
        if not text.strip():
            return []

        # 使用正则表达式分句，支持中英文标点
        import re

        # 分句标点符号
        sentence_endings = r'[。！？.!?]+\s*'
        sentences = re.split(sentence_endings, text)

        # 过滤空句子并保留标点
        result = []
        parts = re.findall(r'[^。！？.!?]*[。！？.!?]+|[^。！？.!?]+$', text)

        for part in parts:
            part = part.strip()
            if part:
                result.append(part)

        # 如果没有找到分句，返回整个文本
        if not result:
            result = [text.strip()]

        return result

    async def _conversation_loop(self):
        """主对话循环"""
        print("\n🎯 语音对话已启动!")
        print("💡 使用说明:")
        print("   - 正常说话，系统会自动检测语音开始和结束")
        print("   - 说完话后等待2.5秒，AI会自动处理")
        print("   - 支持中英文及多语言混合识别和播报")
        print("   - 按 Ctrl+C 退出")
        print("=" * 50)

        async for user_text in self._stream_asr():
            if not user_text.strip():
                continue

            print(f"\n👤 用户: {user_text}")

            # 暂停录音
            self.is_listening = False
            print("⏸️ 暂停录音，AI思考中...")

            # 生成并播放回复
            async for response in self._generate_response(user_text):
                print(f"🤖 AI: {response}")
                await self._stream_tts(response)

            print("=" * 50)

            # 恢复录音
            await asyncio.sleep(1.5)
            self.is_listening = True
            print("🎤 继续监听...")

    def start_conversation(self):
        """启动语音对话"""
        print("🚀 启动语音Agent...")
        print(f"🔧 系统配置:")
        print(f"   - ASR: {self.asr_type}")
        print(f"   - LLM: Qwen2.5-7B-Instruct (4bit)")
        print(f"   - TTS: {self.tts_type}")
        print(f"   - VAD: 能量检测 (阈值: {self.config.energy_threshold})")
        print(f"   - 静音超时: {self.config.silence_timeout}s")

        if self.asr_model is None:
            print("❌ ASR不可用，无法启动")
            return

        # 测试LLM
        print("🔧 测试LLM生成功能...")
        try:
            test_prompt = self.tokenizer.apply_chat_template(
                [{"role": "user", "content": "你好"}],
                tokenize=False,
                add_generation_prompt=True
            )
            test_response = generate(
                model=self.llm_model,
                tokenizer=self.tokenizer,
                prompt=test_prompt,
                max_tokens=50
            )
            print("✅ LLM测试成功")
        except Exception as e:
            print(f"❌ LLM测试失败: {e}")
            return

        self.is_listening = True

        try:
            with sd.InputStream(
                    channels=self.config.channels,
                    samplerate=self.config.sample_rate,
                    blocksize=self.config.chunk_size,
                    callback=self._audio_callback,
                    dtype=np.float32
            ):
                asyncio.run(self._conversation_loop())
        except KeyboardInterrupt:
            print("\n👋 对话结束")
            self.is_listening = False
        except Exception as e:
            print(f"❌ 启动失败: {e}")


# 使用示例
if __name__ == "__main__":
    print("🔍 环境检查:")
    print(f"   - MLX设备: {mx.default_device()}")
    print(f"   - Whisper可用: {WHISPER_AVAILABLE}")
    print(f"   - TTS可用: {SYSTEM_TTS_AVAILABLE}")

    if not WHISPER_AVAILABLE:
        print("\n🚨 需要安装Whisper:")
        print("pip install openai-whisper")
        exit(1)

    agent = StreamingVoiceAgent()
    agent.start_conversation()
