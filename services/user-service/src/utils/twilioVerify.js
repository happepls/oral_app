/**
 * twilioVerify.js — Twilio Verify 短信验证码（手机号登录，登录-2）
 *
 * 直调 Twilio Verify REST API（无 twilio SDK 依赖，Node 18 原生 fetch + Basic Auth）：
 *   发码: POST https://verify.twilio.com/v2/Services/{VA}/Verifications   (To, Channel=sms)
 *   验码: POST https://verify.twilio.com/v2/Services/{VA}/VerificationCheck (To, Code)
 *
 * 环境变量（services/user-service/.env）：
 *   TWILIO_ACCOUNT_SID        — AC...
 *   TWILIO_AUTH_TOKEN         — Basic Auth 密码
 *   TWILIO_VERIFY_SERVICE_SID — VA...
 *
 * 未配置时 isConfigured()=false：调用方走开发期 fallback
 * （sendCode 返回 {sent:false, devMode:true}，checkCode 接受固定 dev 验证码）。
 */

const VERIFY_BASE = 'https://verify.twilio.com/v2/Services';
const DEV_CODE = '000000'; // 未配置 Twilio 时的开发期固定验证码

function isConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SERVICE_SID
  );
}

function _authHeader() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

/**
 * 发送短信验证码。
 * @param {string} phone E.164 格式手机号，如 +8613800138000
 * @returns {Promise<{sent:boolean, devMode?:boolean, reason?:string}>}
 */
async function sendCode(phone) {
  if (!isConfigured()) {
    console.warn(`[twilioVerify] 未配置 Twilio，dev 模式：手机 ${phone} 的验证码固定为 ${DEV_CODE}`);
    return { sent: false, devMode: true };
  }
  const svc = process.env.TWILIO_VERIFY_SERVICE_SID;
  const body = new URLSearchParams({ To: phone, Channel: 'sms' });
  try {
    const res = await fetch(`${VERIFY_BASE}/${svc}/Verifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: _authHeader() },
      body: body.toString(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[twilioVerify] sendCode failed ${res.status}: ${errText.slice(0, 300)}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[twilioVerify] sendCode error:', err.message);
    return { sent: false, reason: 'network_error' };
  }
}

/**
 * 校验验证码。
 * @param {string} phone
 * @param {string} code
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function checkCode(phone, code) {
  if (!isConfigured()) {
    // dev 模式：固定码通过
    return { ok: code === DEV_CODE };
  }
  const svc = process.env.TWILIO_VERIFY_SERVICE_SID;
  const body = new URLSearchParams({ To: phone, Code: code });
  try {
    const res = await fetch(`${VERIFY_BASE}/${svc}/VerificationCheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: _authHeader() },
      body: body.toString(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[twilioVerify] checkCode failed ${res.status}: ${errText.slice(0, 300)}`);
      return { ok: false, reason: `http_${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    // Twilio 返回 status: 'approved' 表示验证通过
    return { ok: data.status === 'approved' };
  } catch (err) {
    console.error('[twilioVerify] checkCode error:', err.message);
    return { ok: false, reason: 'network_error' };
  }
}

module.exports = { sendCode, checkCode, isConfigured };
