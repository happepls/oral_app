/**
 * mailer.js — Resend 邮件发送封装
 *
 * 通过 Resend REST API 发信（无 SMTP 依赖）。文档：
 * https://resend.com/docs/api-reference/emails/send-email
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer <RESEND_API_KEY>
 *   Content-Type: application/json
 *   Body: { from, to: [...], subject, html?, text? }
 *   成功响应 JSON: { id }
 *
 * 环境变量（services/user-service/.env）：
 *   RESEND_API_KEY — Resend API key（re_...），在 https://resend.com/api-keys 创建
 *   RESEND_FROM    — 发信地址，必须来自 Resend 已验证的域名
 *                    （如 "Guaji AI <noreply@guajiguaji.top>"）
 *
 * 未配置 RESEND_API_KEY 时 sendEmail 返回 {sent:false, reason:'not_configured'}，
 * 不抛错——调用方（密码重置）据此走开发期 fallback（日志输出链接）。
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
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
    from: process.env.RESEND_FROM,
    to: recipients,
    subject,
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (!html && !text) body.text = subject;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[mailer] Resend send failed ${res.status}: ${errText.slice(0, 300)}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    return { sent: true, id: data.id };
  } catch (err) {
    console.error('[mailer] Resend send error:', err.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { sendEmail, isConfigured };
