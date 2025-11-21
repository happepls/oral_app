const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const handleResponse = async (response) => {
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || '请求失败');
  }
  
  return data;
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
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(userData)
    });
    return handleResponse(response);
  },

  async login(credentials) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(credentials)
    });
    return handleResponse(response);
  }
};

export const userAPI = {
  async getProfile() {
    const response = await fetch(`${API_BASE_URL}/user/profile`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async updateProfile(updates) {
    const response = await fetch(`${API_BASE_URL}/user/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
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

export default {
  auth: authAPI,
  user: userAPI,
  ai: aiAPI
};
