export const __BUILD_MARKER__ = '2026-06-01-subscription-cookie-fix';
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';
const V1_BASE_URL = `${API_BASE_URL}/v1`;
const idempotencyKey = () => window.crypto?.randomUUID?.() || `guaji-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const handleResponse = async (response, { redirectOnUnauthorized = true } = {}) => {
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
  
  if (response.status === 401 && redirectOnUnauthorized) {
    // Token expired or invalid — clear auth state and redirect to login
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('登录已过期，请重新登录');
  }

  if (!response.ok) {
    const error = new Error(data.error?.message || data.message || `请求失败 (状态码: ${response.status})`);
    error.status = response.status;
    throw error;
  }
  
  // Extract data from the new response format
  return data.data || data;
};

const getAuthHeaders = () => {
  // Cookie-based auth: no longer send token in headers
  // httpOnly cookie is automatically included by browser
  return {
    'Content-Type': 'application/json'
  };
};

const handleAuthResponse = async (response) => {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`无法解析服务器响应 (状态码: ${response.status})`);
  }
  if (!response.ok) {
    throw new Error(data.message || `请求失败 (状态码: ${response.status})`);
  }
  return data.data || data;
};

export const authAPI = {
  async register(userData) {
    const response = await fetch(`${API_BASE_URL}/users/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(userData)
    });
    return handleAuthResponse(response);
  },

  async login(credentials) {
    const response = await fetch(`${API_BASE_URL}/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(credentials)
    });
    return handleAuthResponse(response);
  },

  async googleSignIn(token) {
    const response = await fetch(`${API_BASE_URL}/users/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token })
    });
    return handleAuthResponse(response);
  },

  // 发起密码重置（后端永远返回 200 防枚举）
  async forgotPassword(email) {
    const response = await fetch(`${API_BASE_URL}/users/password/forgot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return response.json();
  },

  // 用 token 设置新密码
  async resetPassword(token, password) {
    const response = await fetch(`${API_BASE_URL}/users/password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });
    return response.json();
  },

  // 发送手机验证码
  async sendPhoneCode(phone) {
    const response = await fetch(`${API_BASE_URL}/users/phone/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    return response.json();
  },

  // 手机验证码登录（成功后 cookie 已种，返回 user）
  async phoneLogin(phone, code) {
    const response = await fetch(`${API_BASE_URL}/users/phone/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, code })
    });
    return handleAuthResponse(response);
  }
};

export const developerAPI = {
  async getAuthorizationRequest(params) {
    const query = new URLSearchParams(params);
    const response = await fetch(`${V1_BASE_URL}/oauth/authorize?${query}`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async decideAuthorization(request, approved) {
    const response = await fetch(`${V1_BASE_URL}/oauth/authorize`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Idempotency-Key': idempotencyKey() },
      credentials: 'include',
      body: JSON.stringify({ ...request, approved })
    });
    return handleResponse(response);
  }
};

export const userAPI = {
  async getProfile() {
    const response = await fetch(`${V1_BASE_URL}/profile`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async updateProfile(updates) {
    const response = await fetch(`${V1_BASE_URL}/profile`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(updates)
    });
    return handleResponse(response);
  },

  async createGoal(goalData) {
    const response = await fetch(`${V1_BASE_URL}/goals`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Idempotency-Key': idempotencyKey() },
      credentials: 'include',
      body: JSON.stringify(goalData)
    });
    return handleResponse(response);
  },

  async getActiveGoal(options = {}) {
    const { signal } = options;
    const requestOptions = {
      headers: getAuthHeaders(),
      credentials: 'include',
      ...(signal && { signal })
    };
    const [goalsResponse, tasksResponse] = await Promise.all([
      fetch(`${V1_BASE_URL}/goals?limit=100`, requestOptions),
      fetch(`${V1_BASE_URL}/tasks?limit=100`, requestOptions),
    ]);
    const [goals, tasks] = await Promise.all([handleResponse(goalsResponse), handleResponse(tasksResponse)]);
    const goal = (Array.isArray(goals) ? goals : []).find((item) => item.status === 'active') || null;
    if (!goal || !Array.isArray(goal.scenarios)) return { goal };

    const currentTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => String(task.goal_id) === String(goal.id));
    return {
      goal: {
        ...goal,
        scenarios: goal.scenarios.map((scenario) => ({
          ...scenario,
          tasks: (Array.isArray(scenario.tasks) ? scenario.tasks : []).map((task) => {
            const text = typeof task === 'string' ? task : task.text;
            const current = currentTasks.find((candidate) => candidate.scenario_title === scenario.title && candidate.task_description === text);
            const score = current?.score || 0;
            const completed = current?.status === 'completed';
            return {
              ...(typeof task === 'object' ? task : {}),
              id: current?.id ?? null,
              text,
              status: current?.status || 'pending',
              score,
              interaction_count: current?.interaction_count || 0,
              scoring_generation: current?.scoring_generation || 0,
              feedback: current?.feedback || null,
              completed_at: current?.completed_at || null,
              progress: completed ? 100 : Math.min(99, Math.round((score / 9) * 100)),
            };
          }),
        })),
      },
    };
  },

  async getCurrentTask() {
    const response = await fetch(`${V1_BASE_URL}/tasks?limit=100`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    const tasks = await handleResponse(response);
    return { task: (Array.isArray(tasks) ? tasks : []).find((task) => task.status !== 'completed') || null };
  },

  async resetTask(taskId, scenarioTitle) {
    // Step 1: Reset tasks in database via user-service
    const response = await fetch(`${API_BASE_URL}/users/goals/reset-task`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        task_id: taskId,
        scenario_title: scenarioTitle
      })
    });
    const result = await handleResponse(response);

    // Step 2: Reset phase state in ai-omni-service (if user is available)
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        const userId = user?.id || user?.userId;
        if (userId) {
          await fetch(`${API_BASE_URL}/ai/reset-phase`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({
              user_id: String(userId),
              scenario: scenarioTitle || '',
              task_id: taskId || null,
              scoring_generation: result.scoring_generation ?? null,
              scoring_generations: result.tasks || [],
            })
          });
          console.log('[resetTask] Phase state reset for user', userId);
        }
      }
    } catch (err) {
      console.error('[resetTask] Failed to reset phase state:', err);
    }

    return result;
  },

  // Check-in APIs
  async checkin() {
    const response = await fetch(`${API_BASE_URL}/users/checkin`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  // Get scenario review for completion modal
  async getScenarioReview(scenarioTitle) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/goals/active`, {
        headers: getAuthHeaders(),
        credentials: 'include'
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
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async getCheckinStats() {
    const response = await fetch(`${API_BASE_URL}/users/checkin/stats`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async getSubscription() {
    // Do not route subscription errors through handleResponse: an upstream auth
    // problem must not trigger a global logout. Callers still need a rejected
    // promise so they can distinguish an unavailable service from a free plan.
    const response = await fetch(`${API_BASE_URL}/stripe/subscription`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    if (!response.ok) {
      const error = new Error(`Subscription request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    return data?.data || data;
  },

  async getUserGoals() {
    const response = await fetch(`${V1_BASE_URL}/goals?limit=100`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return { goals: await handleResponse(response) };
  },

  async switchGoal(goalId) {
    const response = await fetch(`${API_BASE_URL}/users/goals/${goalId}/activate`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async archiveGoal(goalId) {
    const response = await fetch(`${V1_BASE_URL}/goals/${goalId}/archive`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async restoreGoal(goalId) {
    const response = await fetch(`${V1_BASE_URL}/goals/${goalId}/restore`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async deleteGoal(goalId) {
    const response = await fetch(`${V1_BASE_URL}/goals/${goalId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async confirmTaskComplete(taskId) {
    const response = await fetch(`${API_BASE_URL}/users/goals/confirm-complete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ task_id: taskId })
    });
    return handleResponse(response);
  },

  async getDailyQAPassStatus() {
    const response = await fetch(`${API_BASE_URL}/users/daily-qa-pass`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  // Onboarding Tour state (first-login guided tour; backend-authoritative)
  async getOnboardingTour() {
    const response = await fetch(`${API_BASE_URL}/users/onboarding-tour`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  async markOnboardingTourComplete() {
    const response = await fetch(`${API_BASE_URL}/users/onboarding-tour/complete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  // Daily Recall state APIs (backend-authoritative switch count + completion)
  async getRecallDailyState() {
    const response = await fetch(`${API_BASE_URL}/users/recall/daily-state`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  async incrementRecallSwitch() {
    const response = await fetch(`${API_BASE_URL}/users/recall/switch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  async markRecallComplete() {
    const response = await fetch(`${API_BASE_URL}/users/recall/complete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  async achievements() {
    const response = await fetch(`${API_BASE_URL}/users/achievements`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  async recordPracticeTime(minutes) {
    const response = await fetch(`${API_BASE_URL}/users/practice-time`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ minutes }),
    });
    return response.json();
  },

  async getDailyProgress() {
    const response = await fetch(`${API_BASE_URL}/users/daily-progress`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return response.json();
  }
};

export const aiAPI = {
  async chat(messages, scenario = null) {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ messages, scenario })
    });
    return handleResponse(response);
  },

  async generateScenarios(goalParams) {
    const response = await fetch(`${V1_BASE_URL}/ai/scenarios`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Idempotency-Key': idempotencyKey() },
      credentials: 'include',
      body: JSON.stringify(goalParams)
    });
    return handleResponse(response);
  },

  // Lazy per-card cover image. Returns { image_url, source }; image_url is ''
  // on any backend failure/timeout so the caller keeps its emoji placeholder.
  // Never throws (UI cosmetic only).
  async generateScenarioImage(scenarioTitle, goalId) {
    try {
      const body = { scenario_title: scenarioTitle };
      // 带上 goal_id → 后端转存 COS 后直接写回 user_goals.scenarios[i].image_url，
      // 实现「生成一次永久有效」。
      if (goalId != null) body.goal_id = goalId;
      const response = await fetch(`${API_BASE_URL}/ai/generate-scenario-image`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(body)
      });
      if (!response.ok) return { image_url: '', source: 'none' };
      const data = await response.json();
      return data.data || data || { image_url: '', source: 'none' };
    } catch {
      return { image_url: '', source: 'none' };
    }
  },

  async tts(text, voice = 'Serena') {
    const body = { text, voice };

    const response = await fetch(`${V1_BASE_URL}/ai/tts`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Idempotency-Key': idempotencyKey() },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error('语音合成失败');
    }

    return response.blob();
  },

  async translate(text, targetLang = 'zh') {
    const res = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text, target_lang: targetLang }),
    });
    if (!res.ok) throw new Error('Translation failed');
    return res.json();
  },

  async getScenarios() {
    const response = await fetch(`${API_BASE_URL}/ai/scenarios`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  },

  async chatStream(messages, scenario = null, onChunk) {
    const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
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
  },

  async getDailyQuestion(options = {}) {
    const { signal } = options;
    const response = await fetch(`${API_BASE_URL}/ai/daily-question`, {
      headers: getAuthHeaders(),
      credentials: 'include',
      ...(signal && { signal })
    });
    return handleResponse(response);
  },

  async getDailyRecall(variant = 0, options = {}) {
    const { signal } = options;
    const response = await fetch(
      `${API_BASE_URL}/ai/daily-recall?variant=${encodeURIComponent(variant)}`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
        ...(signal && { signal })
      }
    );
    return handleResponse(response);
  },

  async reAnswerDaily() {
    const response = await fetch(`${API_BASE_URL}/ai/daily-question/re-answer`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (response.status === 403) {
      const err = new Error('pro_required');
      err.status = 403;
      throw err;
    }
    return handleResponse(response);
  },

  async changeDailyQuestion() {
    const response = await fetch(`${API_BASE_URL}/ai/daily-question/change-question`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (response.status === 403) {
      const err = new Error('pro_required');
      err.status = 403;
      throw err;
    }
    return handleResponse(response);
  },

  async getDailyQuestionPool() {
    const response = await fetch(`${API_BASE_URL}/ai/daily-question/pool`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (response.status === 403) {
      const err = new Error('pro_required');
      err.status = 403;
      throw err;
    }
    return handleResponse(response);
  },

  async selectDailyQuestion(index) {
    const response = await fetch(`${API_BASE_URL}/ai/daily-question/select`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ index }),
    });
    if (response.status === 403) {
      const err = new Error('pro_required');
      err.status = 403;
      throw err;
    }
    return handleResponse(response);
  }
};

export const conversationAPI = {
  async startSession(data = {}, options = {}) {
    const response = await fetch(`${V1_BASE_URL}/conversations`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Idempotency-Key': idempotencyKey() },
      credentials: 'include',
      ...(options.signal && { signal: options.signal }),
      body: JSON.stringify({ goal_id: data?.goalId ?? data?.goal_id, force_new: data?.forceNew ?? data?.force_new })
    });
    return handleResponse(response);
  },

  async createRealtimeTicket(options = {}) {
    const response = await fetch(`${V1_BASE_URL}/realtime/tickets`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Idempotency-Key': idempotencyKey() },
      credentials: 'include',
      ...(options.signal && { signal: options.signal })
    });
    return handleResponse(response);
  },

  async endSession(sessionId) {
    const response = await fetch(`${API_BASE_URL}/conversation/end`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ sessionId })
    });
    return handleResponse(response);
  },

  async saveHistory(sessionId, messages, userId, options = {}) {
    // Use conversation-service for saving history (history-analytics-service is for GET only)
    const response = await fetch(`${API_BASE_URL}/conversation/history/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      ...(options.keepalive ? { keepalive: true } : {}),
      body: JSON.stringify({ messages, userId })
    });
    const data = await handleResponse(response);
    return { success: true, data };
  },

  async getHistory(sessionId, options = {}) {
    const { signal } = options;
    const response = await fetch(`${API_BASE_URL}/history/session/${encodeURIComponent(sessionId)}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
      ...(signal && { signal })
    });
    if (response.status === 404) {
      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      return {
        success: false,
        status: 404,
        message: data.message || '资源未找到 (404)',
        data: data.data || null,
      };
    }
    const data = await handleResponse(response);
    return { success: true, ...data, data };
  },

  async getActiveSessions(userId, goalId) {
    const params = new URLSearchParams({ userId, goalId });
    const response = await fetch(`${API_BASE_URL}/conversation/sessions?${params.toString()}`, {
        headers: getAuthHeaders(),
        credentials: 'include'
    });
    return handleResponse(response);
  }
};

export const historyAPI = {
  async getUserHistory(userId) {
    const response = await fetch(`${V1_BASE_URL}/conversations?limit=100`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response, { redirectOnUnauthorized: false });
  },

  async getConversationDetail(sessionId) {
    const response = await fetch(`${V1_BASE_URL}/conversations/${encodeURIComponent(sessionId)}`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response, { redirectOnUnauthorized: false });
  },

  async getStats(userId) {
    const response = await fetch(`${API_BASE_URL}/history/stats/${userId}`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response, { redirectOnUnauthorized: false });
  },

  async saveProficiencyMetrics(userId, metrics) {
    const response = await fetch(`${API_BASE_URL}/history/proficiency/${userId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(metrics)
    });
    return handleResponse(response);
  },

  async getProficiencyMetrics(userId) {
    const response = await fetch(`${API_BASE_URL}/history/proficiency/${userId}`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    return handleResponse(response);
  }
};

export const feedbackAPI = {
  async submit({ category, message }) {
    const response = await fetch(`${API_BASE_URL}/users/feedback`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
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
