const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const handleResponse = async (response) => {
  let data;
  
  try {
    // 首先尝试解析为JSON
    data = await response.json();
  } catch (jsonError) {
    // 如果JSON解析失败，可能是HTML错误页面
    try {
      const text = await response.text();
      console.error('Non-JSON response:', text.substring(0, 200));
      
      // 如果是404错误，返回一个模拟的错误响应
      if (response.status === 404) {
        return {
          success: false,
          message: '资源未找到 (404)',
          data: null
        };
      }
      
      // 其他错误情况
      throw new Error(`服务器返回了非JSON响应 (状态码: ${response.status}): ${text.substring(0, 100)}...`);
    } catch (textError) {
      throw new Error(`无法解析服务器响应 (状态码: ${response.status})`);
    }
  }
  
  if (response.status === 401) {
    // Token expired or invalid — clear auth state and redirect to login
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('登录已过期，请重新登录');
  }

  if (!response.ok) {
    throw new Error(data.message || `请求失败 (状态码: ${response.status})`);
  }
  
  // Extract data from the new response format
  return data.data || data;
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

export const authAPI = {
  async register(userData) {
    const response = await fetch(`${API_BASE_URL}/users/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });
    return handleResponse(response);
  },

  async login(credentials) {
    const response = await fetch(`${API_BASE_URL}/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });
    return handleResponse(response);
  }
};

export const userAPI = {
  async getProfile() {
    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async updateProfile(updates) {
    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    return handleResponse(response);
  },

  async createGoal(goalData) {
    const response = await fetch(`${API_BASE_URL}/users/goals`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(goalData)
    });
    return handleResponse(response);
  },

  async getActiveGoal() {
    const response = await fetch(`${API_BASE_URL}/users/goals/active`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async getCurrentTask() {
    const response = await fetch(`${API_BASE_URL}/users/goals/current-task`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async resetTask(taskId, scenarioTitle) {
    const response = await fetch(`${API_BASE_URL}/users/goals/reset-task`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        task_id: taskId,
        scenario_title: scenarioTitle
      })
    });
    return handleResponse(response);
  },

  // Check-in APIs
  async checkin() {
    const response = await fetch(`${API_BASE_URL}/users/checkin`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  // Get scenario review for completion modal
  async getScenarioReview(scenarioTitle) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/goals/active`, {
        headers: getAuthHeaders()
      });
      const data = await handleResponse(response);
      // The scenario review is stored in the active_goal's scenario_review field
      return data?.goal?.scenario_review || null;
    } catch (error) {
      console.error('Failed to get scenario review:', error);
      return null;
    }
  },

  async getCheckinHistory(days = 30) {
    const response = await fetch(`${API_BASE_URL}/users/checkin/history?days=${days}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async getCheckinStats() {
    const response = await fetch(`${API_BASE_URL}/users/checkin/stats`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  }
};

export const aiAPI = {
  async chat(messages, scenario = null) {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ messages, scenario })
    });
    return handleResponse(response);
  },

  async generateScenarios(goalParams) {
    const response = await fetch(`${API_BASE_URL}/ai/generate-scenarios`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(goalParams)
    });
    return handleResponse(response);
  },

  async tts(text, voice = null) {
    const body = { text };
    if (voice) {
        body.voice = voice;
    }

    const response = await fetch(`${API_BASE_URL}/ai/tts`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        throw new Error('语音合成失败');
    }
    
    return response.blob();
  },

  async getScenarios() {
    const response = await fetch(`${API_BASE_URL}/ai/scenarios`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async chatStream(messages, scenario = null, onChunk) {
    const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ messages, scenario })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || '流式请求失败');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                onChunk(parsed.content);
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
};

export const conversationAPI = {
  async startSession(data) {
    const response = await fetch(`${API_BASE_URL}/conversation/start`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(response);
  },

  async endSession(sessionId) {
    const response = await fetch(`${API_BASE_URL}/conversation/end`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ sessionId })
    });
    return handleResponse(response);
  },

  async saveHistory(sessionId, messages, userId) {
    // Use conversation-service for saving history (history-analytics-service is for GET only)
    const response = await fetch(`${API_BASE_URL}/conversation/history/${sessionId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ messages, userId })
    });
    return handleResponse(response);
  },

  async getHistory(sessionId) {
    const response = await fetch(`${API_BASE_URL}/history/session/${sessionId}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async getActiveSessions(userId, goalId) {
    const params = new URLSearchParams({ userId, goalId });
    const response = await fetch(`${API_BASE_URL}/conversation/sessions?${params.toString()}`, {
        headers: getAuthHeaders()
    });
    return handleResponse(response);
  }
};

export const historyAPI = {
  async getUserHistory(userId) {
    const response = await fetch(`${API_BASE_URL}/history/user/${userId}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async getConversationDetail(sessionId) {
    const response = await fetch(`${API_BASE_URL}/history/session/${sessionId}/messages`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async getStats(userId) {
    const response = await fetch(`${API_BASE_URL}/history/stats/${userId}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async saveProficiencyMetrics(userId, metrics) {
    const response = await fetch(`${API_BASE_URL}/history/proficiency/${userId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(metrics)
    });
    return handleResponse(response);
  },

  async getProficiencyMetrics(userId) {
    const response = await fetch(`${API_BASE_URL}/history/proficiency/${userId}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  }
};

export const feedbackAPI = {
  async submit({ category, message }) {
    const response = await fetch(`${API_BASE_URL}/feedback`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ category, message })
    });
    return handleResponse(response);
  }
};

export { getAuthHeaders };

export default {
  auth: authAPI,
  user: userAPI,
  ai: aiAPI,
  conversation: conversationAPI,
  history: historyAPI,
  feedback: feedbackAPI
};