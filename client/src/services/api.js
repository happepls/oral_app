const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const handleResponse = async (response) => {
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || '请求失败');
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
    const response = await fetch(`${API_BASE_URL}/history/session/${sessionId}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  }
};

export default {
  auth: authAPI,
  user: userAPI,
  ai: aiAPI,
  conversation: conversationAPI,
  history: historyAPI
};