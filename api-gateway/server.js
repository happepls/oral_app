const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8082';
const COMMS_SERVICE_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3003';
const CONVERSATION_SERVICE_URL = process.env.CONVERSATION_SERVICE_URL || 'http://localhost:8000';

const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
});

app.use('/api/ai/generate-scenarios', express.json(), async (req, res) => {
  try {
    const { type, target_language, target_level, interests, description, native_language } = req.body;
    
    // Determine output language based on native_language
    const outputLang = native_language || 'Chinese';
    const outputLangInstruction = outputLang === 'Chinese' ? '用中文输出所有场景标题和任务描述' : 
                                   outputLang === 'Japanese' ? '日本語で全てのシナリオタイトルとタスクを出力してください' :
                                   outputLang === 'French' ? 'Générez tous les titres et tâches en français' :
                                   'Output all scenario titles and tasks in English';
    
    const prompt = `You are an expert language learning curriculum designer. Generate exactly 10 practice scenarios for a ${target_language} learner.

IMPORTANT: ${outputLangInstruction}

User Profile:
- Goal Type: ${type || 'daily_conversation'}
- Target Level: ${target_level || 'Intermediate'}
- Interests: ${interests || 'general topics'}
- Additional Notes: ${description || 'none'}
- Native Language: ${outputLang}

Requirements:
1. Create 10 unique, practical scenarios relevant to the goal type
2. Each scenario must have a clear title and exactly 3 specific practice tasks
3. Tasks should be conversational goals the learner can practice in ${target_language}
4. Include 1 scenario about cultural small talk in ${target_language}-speaking regions
5. Order scenarios from easier to more challenging
6. IMPORTANT: Write scenario titles and task descriptions in ${outputLang} so the learner can understand them easily

Respond ONLY with valid JSON in this exact format:
{
  "scenarios": [
    {
      "title": "场景标题(用${outputLang})",
      "tasks": ["任务1(用${outputLang})", "任务2(用${outputLang})", "任务3(用${outputLang})"]
    }
  ]
}`;

    const response = await openrouter.chat.completions.create({
      model: 'meta-llama/llama-3.3-70b-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    
    res.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('AI Scenario Generation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate scenarios',
      error: error.message
    });
  }
});

app.use('/api/users', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/users': '' },
  logLevel: 'debug'
}));

app.use('/api/ai', createProxyMiddleware({
  target: AI_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/ai': '' },
  logLevel: 'debug'
}));

app.use('/api/conversation', createProxyMiddleware({
  target: CONVERSATION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/conversation': '' },
  logLevel: 'debug'
}));

app.use('/api/history/user', createProxyMiddleware({
  target: CONVERSATION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/history/user': '/history/user' },
  logLevel: 'debug'
}));

app.use('/api/history/stats', createProxyMiddleware({
  target: CONVERSATION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/history/stats': '/history/stats' },
  logLevel: 'debug'
}));

app.use('/api/history/session', createProxyMiddleware({
  target: CONVERSATION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/history/session': '/history' },
  logLevel: 'debug'
}));

app.use('/api/ws', createProxyMiddleware({
  target: COMMS_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  logLevel: 'debug'
}));

app.use('/api/stripe/webhook', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use('/api/stripe', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'api-gateway',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'API endpoint not found' 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Proxying to:`);
  console.log(`  - User Service: ${USER_SERVICE_URL}`);
  console.log(`  - AI Service: ${AI_SERVICE_URL}`);
  console.log(`  - Comms Service: ${COMMS_SERVICE_URL}`);
});