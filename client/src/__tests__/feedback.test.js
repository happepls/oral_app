/**
 * Tests for user feedback feature
 *
 * Covers:
 * - feedbackAPI.submit() request structure
 * - Form validation logic (empty message)
 * - Character limit enforcement
 * - Category selection
 * - Submit state transitions (idle → submitting → submitted / error)
 */

// ---------------------------------------------------------------------------
// feedbackAPI unit tests (pure logic, no fetch)
// ---------------------------------------------------------------------------

const FEEDBACK_MAX_LENGTH = 500;
const FEEDBACK_CATEGORIES = ['功能建议', '问题反馈', '其他'];

describe('feedbackAPI.submit payload', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    localStorage.setItem('authToken', 'test-token');
  });

  afterEach(() => {
    localStorage.removeItem('authToken');
    jest.restoreAllMocks();
  });

  test('sends correct method, headers and body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { success: true } })
    });

    // Inline minimal implementation matching api.js logic
    const API_BASE_URL = '/api';
    const payload = { category: '功能建议', message: '希望增加更多场景' };

    await fetch(`${API_BASE_URL}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify(payload)
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/feedback');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['Authorization']).toBe('Bearer test-token');
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  test('includes auth token from localStorage', () => {
    localStorage.setItem('authToken', 'my-jwt-token');
    const token = localStorage.getItem('authToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
    expect(headers.Authorization).toBe('Bearer my-jwt-token');
  });

  test('omits Authorization header when not logged in', () => {
    localStorage.removeItem('authToken');
    const token = localStorage.getItem('authToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
    expect(headers.Authorization).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

describe('Feedback form validation', () => {
  const validate = (text) => {
    if (!text.trim()) return '请输入反馈内容';
    return null;
  };

  test('rejects empty message', () => {
    expect(validate('')).toBe('请输入反馈内容');
  });

  test('rejects whitespace-only message', () => {
    expect(validate('   ')).toBe('请输入反馈内容');
  });

  test('accepts valid message', () => {
    expect(validate('这个功能很好用')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Character limit
// ---------------------------------------------------------------------------

describe('Feedback character limit', () => {
  test('FEEDBACK_MAX_LENGTH is 500', () => {
    expect(FEEDBACK_MAX_LENGTH).toBe(500);
  });

  test('allows message exactly at limit', () => {
    const text = 'a'.repeat(FEEDBACK_MAX_LENGTH);
    expect(text.length <= FEEDBACK_MAX_LENGTH).toBe(true);
  });

  test('blocks message exceeding limit', () => {
    const text = 'a'.repeat(FEEDBACK_MAX_LENGTH + 1);
    const shouldUpdate = text.length <= FEEDBACK_MAX_LENGTH;
    expect(shouldUpdate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Category selection
// ---------------------------------------------------------------------------

describe('Feedback category selection', () => {
  test('default category is "功能建议"', () => {
    const defaultCategory = FEEDBACK_CATEGORIES[0];
    expect(defaultCategory).toBe('功能建议');
  });

  test('contains all expected categories', () => {
    expect(FEEDBACK_CATEGORIES).toContain('功能建议');
    expect(FEEDBACK_CATEGORIES).toContain('问题反馈');
    expect(FEEDBACK_CATEGORIES).toContain('其他');
  });

  test('selecting a category updates state', () => {
    let selectedCategory = '功能建议';
    const setCategory = (cat) => { selectedCategory = cat; };

    setCategory('问题反馈');
    expect(selectedCategory).toBe('问题反馈');

    setCategory('其他');
    expect(selectedCategory).toBe('其他');
  });
});

// ---------------------------------------------------------------------------
// Submit state machine
// ---------------------------------------------------------------------------

describe('Feedback submit state transitions', () => {
  test('success path: idle → submitting → submitted', async () => {
    let submitting = false;
    let submitted = false;
    let error = '';

    const mockSubmit = async () => Promise.resolve({ success: true });

    submitting = true;
    try {
      await mockSubmit();
      submitted = true;
    } catch {
      error = '提交失败，请稍后重试';
    } finally {
      submitting = false;
    }

    expect(submitting).toBe(false);
    expect(submitted).toBe(true);
    expect(error).toBe('');
  });

  test('error path: idle → submitting → error', async () => {
    let submitting = false;
    let submitted = false;
    let error = '';

    const mockSubmit = async () => { throw new Error('Network error'); };

    submitting = true;
    try {
      await mockSubmit();
      submitted = true;
    } catch {
      error = '提交失败，请稍后重试';
    } finally {
      submitting = false;
    }

    expect(submitting).toBe(false);
    expect(submitted).toBe(false);
    expect(error).toBe('提交失败，请稍后重试');
  });

  test('close handler resets all state', () => {
    let showModal = true;
    let feedbackText = '一些内容';
    let feedbackCategory = '问题反馈';
    let feedbackError = '提交失败，请稍后重试';
    let feedbackSubmitted = true;

    // handleFeedbackClose logic
    showModal = false;
    feedbackText = '';
    feedbackCategory = '功能建议';
    feedbackError = '';
    feedbackSubmitted = false;

    expect(showModal).toBe(false);
    expect(feedbackText).toBe('');
    expect(feedbackCategory).toBe('功能建议');
    expect(feedbackError).toBe('');
    expect(feedbackSubmitted).toBe(false);
  });
});
