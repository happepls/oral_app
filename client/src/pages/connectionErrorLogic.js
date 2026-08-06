const ERROR_TEXT_KEYS = ['message', 'error', 'detail', 'reason'];

export function normalizeConnectionError(value, fallback = '连接异常，请稍后重试') {
  if (typeof value === 'string') {
    const text = value.trim();
    return text && text !== '[object Object]' ? text : fallback;
  }

  if (value instanceof Error) {
    return normalizeConnectionError(value.message, fallback);
  }

  if (value && typeof value === 'object') {
    for (const key of ERROR_TEXT_KEYS) {
      if (value[key] !== undefined && value[key] !== value) {
        const text = normalizeConnectionError(value[key], '');
        if (text) return text;
      }
    }
  }

  return fallback;
}

export function shouldShowConnectionError(error, isConnected, isRejected = false) {
  return Boolean(error) && (isRejected || !isConnected);
}
