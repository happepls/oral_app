// mailer.test.js — sendEmail / isConfigured 单元测试
// mock 全局 fetch，隔离 process.env，覆盖 sendEmail 五分支 + isConfigured 两态。

const { sendEmail, isConfigured } = require('../utils/mailer');

const ORIG_ENV = {};
const ENV_KEYS = ['RESEND_API_KEY', 'RESEND_FROM'];

beforeEach(() => {
  // 存原始 env
  for (const k of ENV_KEYS) ORIG_ENV[k] = process.env[k];
  // 默认已配置，个别用例再覆盖/删除
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM = 'Guaji AI <noreply@guajiguaji.top>';
  global.fetch = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // 还原 env
  for (const k of ENV_KEYS) {
    if (ORIG_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIG_ENV[k];
  }
  jest.restoreAllMocks();
  delete global.fetch;
});

describe('isConfigured', () => {
  test('两个变量齐备时返回 true', () => {
    expect(isConfigured()).toBe(true);
  });

  test('缺 RESEND_API_KEY 时返回 false', () => {
    delete process.env.RESEND_API_KEY;
    expect(isConfigured()).toBe(false);
  });

  test('缺 RESEND_FROM 时返回 false', () => {
    delete process.env.RESEND_FROM;
    expect(isConfigured()).toBe(false);
  });
});

describe('sendEmail', () => {
  test('未配置 → {sent:false, reason:not_configured}，不调 fetch', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    const result = await sendEmail({ to: 'a@b.com', subject: 'hi' });
    expect(result).toEqual({ sent: false, reason: 'not_configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('HTTP 非 2xx → {sent:false, reason:http_<status>}', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Unprocessable',
    });
    const result = await sendEmail({ to: 'a@b.com', subject: 'hi', text: 'body' });
    expect(result).toEqual({ sent: false, reason: 'http_422' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('响应 JSON 解析失败 → 仍 {sent:true}，id undefined', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('invalid json'); },
    });
    const result = await sendEmail({ to: 'a@b.com', subject: 'hi', html: '<p>x</p>' });
    expect(result).toEqual({ sent: true, id: undefined });
  });

  test('fetch 抛异常 → {sent:false, reason:network_error}', async () => {
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await sendEmail({ to: 'a@b.com', subject: 'hi' });
    expect(result).toEqual({ sent: false, reason: 'network_error' });
  });

  test('成功 → {sent:true, id}', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_123' }),
    });
    const result = await sendEmail({ to: 'a@b.com', subject: 'hi', text: 'body' });
    expect(result).toEqual({ sent: true, id: 'email_123' });
  });

  test('to 为字符串时按单收件人数组发送，携带正确 headers 与 from', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_456' }),
    });
    await sendEmail({ to: 'solo@b.com', subject: 'S', html: '<b>h</b>' });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer re_test_key');
    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(['solo@b.com']);
    expect(body.from).toBe('Guaji AI <noreply@guajiguaji.top>');
    expect(body.html).toBe('<b>h</b>');
  });

  test('无 html/text 时用 subject 兜底为 text', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_789' }),
    });
    await sendEmail({ to: ['x@y.com'], subject: 'Fallback Subject' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.text).toBe('Fallback Subject');
    expect(body.html).toBeUndefined();
  });
});
