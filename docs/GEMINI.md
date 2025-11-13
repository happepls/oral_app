# Oral App 项目要点记录

## 项目概述
本项目是一个基于SROP（Scalable Real-time Oral Practice）微服务架构的实时英语口语练习应用。应用使用WebRTC/QUIC协议实现低延迟音频流传输，并集成ASR、LLM和TTS服务提供完整的口语练习体验。

## 技术架构
- 前端：React应用
- 后端：Node.js微服务
- 核心服务：
  - omni-service：集成Qwen3-Omni模型的AI服务
  - 其他微服务待完善

## 已完成功能
1. omni-service服务基础框架搭建
2. 模拟模式实现，用于开发调试
3. 文本处理API（/api/process/text）
4. 音频处理API（/api/process/audio）
5. 上下文管理API（/api/context）
6. 健康检查端点（/health）

## 开发要点
1. 强制启用模拟模式解决了模型下载网络问题
2. 实现了完整的API响应格式（code, message, data）
3. 所有接口均已通过测试验证

## 待办事项
1. 集成真实的Qwen3-Omni模型服务
2. 完善其他微服务组件
3. 实现完整的WebRTC音频流处理
4. 添加用户认证和会话管理

## 环境变量配置
- USE_MOCK_LLM：控制是否使用模拟LLM服务
- MODEL_CACHE_DIR：模型缓存目录
- PORT：服务监听端口

## API端点
- POST /api/process/text：文本处理
- POST /api/process/audio：音频处理
- POST /api/context：设置用户上下文
- GET /health：健康检查