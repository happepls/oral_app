/**
 * aliyunSms.js — 阿里云短信服务（国内 +86 号码验证码登录，登录-1）
 *
 * 中国大陆手机号 Twilio 不支持（监管限制，error 60220），故 +86 号走阿里云短信。
 * 与 Twilio Verify 的关键差异：阿里云只负责「发短信」，不托管验证码生命周期——
 * 验证码由本服务自行生成、存 Redis（带 TTL）、并在校验时比对。
 *
 * 直调阿里云 Dysmsapi RPC API（无 SDK 依赖，Node 18 原生 fetch + 手写 RPC 签名，
 * 遵循 CLAUDE.md「Node 服务 copy node_modules、不在 docker build 跑 npm install」哲学）：
 *   GET https://dysmsapi.aliyuncs.com/?Action=SendSms&...  (签名版本 1.0, HMAC-SHA1)
 *   文档: https://help.aliyun.com/document_detail/101343.html
 *
 * 环境变量（services/user-service/.env）：
 *   ALIYUN_SMS_ACCESS_KEY_ID
 *   ALIYUN_SMS_ACCESS_KEY_SECRET
 *   ALIYUN_SMS_SIGN_NAME       — 已审核签名，如「咕叽口语」
 *   ALIYUN_SMS_TEMPLATE_CODE   — 已审核模板，如 SMS_123456789（变量名须为 ${code}）
 *
 * 未配置时拒绝发送和验证。测试必须 mock 供应商，禁止固定验证码后门。
 *
 * 验证码 Redis 形状：
 *   key   = sms_code:v2:{sha256(phone)}
 *   value = HMAC-SHA256(phone + code)，不存明文验证码
 *   TTL   = 300s (5 分钟，与短信模板「5 分钟内有效」一致)
 */

const crypto = require('crypto');
const redis = require('./redisClient');
const { phoneKey } = require('./phoneAuth');

const ENDPOINT = 'https://dysmsapi.aliyuncs.com/';
const SMS_CODE_PREFIX = 'sms_code:v2:';
const SMS_CODE_TTL = 300; // 5 分钟
const CONSUME_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
`;

function codeDigest(phone, code) {
  return crypto.createHmac('sha256', process.env.ALIYUN_SMS_ACCESS_KEY_SECRET)
    .update(`${phone}:${code}`).digest('hex');
}

function isConfigured() {
  return Boolean(
    process.env.ALIYUN_SMS_ACCESS_KEY_ID &&
    process.env.ALIYUN_SMS_ACCESS_KEY_SECRET &&
    process.env.ALIYUN_SMS_SIGN_NAME &&
    process.env.ALIYUN_SMS_TEMPLATE_CODE
  );
}

/** 阿里云 RPC 风格 percent-encode（RFC3986，且 * 也要编码、~ 不编码） */
function _percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

/**
 * 构造阿里云 RPC 1.0 签名并返回完整请求 URL。
 * 签名算法（GET）：
 *   1. 公共参数 + 业务参数全部进签名（除 Signature 本身）
 *   2. 参数名升序排序，percent-encode key 与 value，用 & 连接 → canonicalized query
 *   3. StringToSign = "GET" + "&" + enc("/") + "&" + enc(canonicalized query)
 *   4. HMAC-SHA1(AccessKeySecret + "&", StringToSign) → base64 → Signature
 */
function _buildSignedUrl(bizParams) {
  const akSecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
  const params = {
    // 公共参数
    Format: 'JSON',
    Version: '2017-05-25',
    AccessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ...bizParams,
  };

  const sortedKeys = Object.keys(params).sort();
  const canonical = sortedKeys
    .map((k) => `${_percentEncode(k)}=${_percentEncode(params[k])}`)
    .join('&');

  const stringToSign = `GET&${_percentEncode('/')}&${_percentEncode(canonical)}`;
  const signature = crypto
    .createHmac('sha1', akSecret + '&')
    .update(stringToSign)
    .digest('base64');

  return `${ENDPOINT}?Signature=${_percentEncode(signature)}&${canonical}`;
}

/** 生成 6 位数字验证码 */
function _genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * 发送验证码到指定（国内）手机号。
 * 自行生成 6 位 code、存 Redis（5min TTL）、调阿里云发短信。
 * @param {string} phone E.164 格式，如 +8613800138000
 * @returns {Promise<{sent:boolean, devMode?:boolean, reason?:string}>}
 */
async function sendCode(phone) {
  if (!isConfigured()) return { sent: false, reason: 'not_configured' };
  const code = _genCode();

  // 阿里云国内号要求去掉 +86 前缀（PhoneNumbers 传 11 位手机号）
  const cnNumber = phone.replace(/^\+86/, '');
  const url = _buildSignedUrl({
    Action: 'SendSms',
    RegionId: 'cn-hangzhou',
    PhoneNumbers: cnNumber,
    SignName: process.env.ALIYUN_SMS_SIGN_NAME,
    TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
    TemplateParam: JSON.stringify({ code }),
  });

  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.Code === 'OK') {
      // A failed provider call must never activate its code. The controller
      // reserves a 60s per-number cooldown before entering this method.
      try {
        await redis.setex(`${SMS_CODE_PREFIX}${phoneKey(phone)}`, SMS_CODE_TTL, codeDigest(phone, code));
      } catch {
        return { sent: false, reason: 'redis_error' };
      }
      return { sent: true };
    }
    return { sent: false, reason: 'provider_error' };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
}

/**
 * 校验验证码（从 Redis 读 + 比对，成功即删除防重放）。
 * @param {string} phone
 * @param {string} code
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function checkCode(phone, code) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const consumed = await redis.eval(CONSUME_SCRIPT, 1,
      `${SMS_CODE_PREFIX}${phoneKey(phone)}`, codeDigest(phone, String(code).trim()));
    return { ok: consumed === 1 };
  } catch {
    return { ok: false, reason: 'redis_error' };
  }
}

module.exports = { sendCode, checkCode, isConfigured };
