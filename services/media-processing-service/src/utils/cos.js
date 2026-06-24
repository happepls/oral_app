const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path');

const cos = new COS({
    SecretId: process.env.TENCENT_SECRET_ID,
    SecretKey: process.env.TENCENT_SECRET_KEY,
    // P2: 显式连接超时与 keep-alive，避免护网期长连接被中间设备 RST 后无超时挂死
    Timeout: 30000,   // 单次请求 30s 超时（默认未设置）
    KeepAlive: true,  // 复用 TCP 连接，减少握手开销（默认 true，显式声明）
});

// 单次 putObject，Promise 化
const putObjectOnce = (filePath, key) => {
    return new Promise((resolve, reject) => {
        cos.putObject({
            Bucket: process.env.TENCENT_BUCKET,
            Region: process.env.TENCENT_REGION,
            Key: key,
            // 每次重试用新的 read stream —— stream 只能消费一次，复用会上传空内容
            Body: fs.createReadStream(filePath),
        }, function(err, data) {
            if (err) return reject(err);
            resolve(data);
        });
    });
};

// 单次 putObject（内存 Buffer 版），Promise 化。
// Buffer 可重复消费，无需像 stream 那样每次重试新建。
const putBufferOnce = (buffer, key, contentType) => {
    return new Promise((resolve, reject) => {
        cos.putObject({
            Bucket: process.env.TENCENT_BUCKET,
            Region: process.env.TENCENT_REGION,
            Key: key,
            Body: buffer,
            ContentType: contentType || 'application/octet-stream',
        }, function(err, data) {
            if (err) return reject(err);
            resolve(data);
        });
    });
};

// 可重试错误：连接被重置 / 超时 / DNS 等瞬时网络故障
const isRetriableError = (err) => {
    const code = err && (err.code || err.error || '');
    return /ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNABORTED|EAI_AGAIN|socket hang up/i.test(String(code) + ' ' + String(err && err.message));
};

const MAX_RETRIES = 3;          // 总尝试次数（1 次正常 + 2 次重试）
const BASE_DELAY_MS = 500;      // 指数退避基数：500ms, 1000ms

const uploadFile = async (filePath, key) => {
    if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
    }

    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await putObjectOnce(filePath, key);
        } catch (err) {
            lastErr = err;
            const retriable = isRetriableError(err);
            console.error(`COS Upload Error (attempt ${attempt}/${MAX_RETRIES}, retriable=${retriable}):`, err);
            // 不可重试错误（如权限/参数错误）立即抛出，不浪费重试
            if (!retriable || attempt === MAX_RETRIES) break;
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 500ms → 1000ms
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastErr;
};

// 从内存 Buffer 上传（图片转存场景：先 download 临时 URL 到 Buffer，再 putObject）。
// 复用 uploadFile 的指数退避重试策略。
const uploadBuffer = async (buffer, key, contentType) => {
    if (!buffer || !buffer.length) {
        throw new Error('Empty buffer');
    }

    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await putBufferOnce(buffer, key, contentType);
        } catch (err) {
            lastErr = err;
            const retriable = isRetriableError(err);
            console.error(`COS Buffer Upload Error (attempt ${attempt}/${MAX_RETRIES}, retriable=${retriable}):`, err);
            if (!retriable || attempt === MAX_RETRIES) break;
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastErr;
};

module.exports = {
    uploadFile,
    uploadBuffer,
    cos
};
