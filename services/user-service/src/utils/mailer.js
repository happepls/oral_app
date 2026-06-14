/**
 * mailer.js — Zeabur ZSend 邮件发送封装
 *
 * 通过 ZSend REST API 发信（无 SMTP 依赖）。文档：
 * https://zeabur.com/docs/zh-TW/email/quick-start
 *   POST https://api.zeabur.com/api/v1/zsend/emails
 *   Authorization: Bearer <ZSEND_API_KEY>
 *
 * 环境变量（services/user-service/.env）：
 *   ZSEND_API_KEY  — ZSend API key（zs_...），send_only 或 all 权限
 *   ZSEND_FROM     — 发信地址，必须是 ZSend 已验证的域名（如 noreply@guajiguaji.top）
 *
 * 未配置 ZSEND_API_KEY 时 sendEmail 返回 {sent:false, reason:'not_configured'}，
 * 不抛错——调用方（密码重置）据此走开发期 fallback（日志输出链接）。
 */

const ZSEND_ENDPOINT = 'https://api.zeabur.com/api/v1/zsend/emails';

function isConfigured() {
  return Boolean(process.env.ZSEND_API_KEY && process.env.ZSEND_FROM);
}

/**
 * 发送一封邮件。
 * @param {{to: string|string[], subject: string, html?: string, text?: string}} opts
 * @returns {Promise<{sent: boolean, reason?: string, id?: string}>}
 */
async function sendEmail({ to, subject, html, text }) {
  if (!isConfigured()) {
    return { sent: false, reason: 'not_configured' };
  }
  const recipients = Array.isArray(to) ? to : [to];
  const body = {
    from: process.env.ZSEND_FROM,
    to: recipients,
    subject,
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (!html && !text) body.text = subject;

  try {
    const res = await fetch(ZSEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ZSEND_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[mailer] ZSend send failed ${res.status}: ${errText.slice(0, 300)}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    return { sent: true, id: data.id || data.message_id };
  } catch (err) {
    console.error('[mailer] ZSend send error:', err.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { sendEmail, isConfigured };
