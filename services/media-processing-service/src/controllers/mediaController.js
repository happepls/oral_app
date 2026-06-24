const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { transcodeAudio } = require('../utils/transcoder');
const { uploadFile, uploadBuffer } = require('../utils/cos');

exports.uploadAndProcessAudio = async (req, res) => {
    try {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ error: 'No audio files provided' });
        }

        const results = {};
        const processingTasks = [];

        // Helper function to process a single file
        const processFile = async (fieldname, file) => {
            const inputPath = file.path;
            const fileId = uuidv4();
            const outputFilename = `${fileId}_${fieldname === 'user_audio' ? 'user' : 'ai'}.mp3`;
            const outputPath = path.join(path.dirname(inputPath), outputFilename);
            
            let inputOptions = [];
            if (fieldname === 'user_audio') {
                // User Audio: 16kHz
                inputOptions = ['-f s16le', '-ar 16000', '-ac 1'];
            } else if (fieldname === 'ai_audio') {
                // AI Audio: 24kHz
                inputOptions = ['-f s16le', '-ar 24000', '-ac 1'];
            }

            try {
                // Transcode
                await transcodeAudio(inputPath, outputPath, 'mp3', inputOptions);

                // Upload to COS
                const date = new Date();
                const key = `audio/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}/${outputFilename}`;
                const uploadResult = await uploadFile(outputPath, key);
                
                // Public URL
                const bucket = process.env.TENCENT_BUCKET;
                const region = process.env.TENCENT_REGION;
                const publicUrl = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;

                results[`${fieldname}Url`] = publicUrl;
                results[`${fieldname}Key`] = key;

            } catch (err) {
                console.error(`Error processing ${fieldname}:`, err);
                throw err;
            } finally {
                // Cleanup
                if (fs.existsSync(inputPath)) fs.unlink(inputPath, () => {});
                if (fs.existsSync(outputPath)) fs.unlink(outputPath, () => {});
            }
        };

        if (req.files['user_audio']) {
            processingTasks.push(processFile('user_audio', req.files['user_audio'][0]));
        }
        if (req.files['ai_audio']) {
            processingTasks.push(processFile('ai_audio', req.files['ai_audio'][0]));
        }

        await Promise.all(processingTasks);

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Media processing error:', error);
        res.status(500).json({ error: 'Internal processing error', details: error.message });
    }
};

// ---------------------------------------------------------------------------
// POST /api/media/upload-image  — 把一张远程图片（DashScope/OSS 临时 URL）
// 转存到腾讯 COS，返回永久 https://*.myqcloud.com URL。
// 用于场景卡封面图持久化（ai-omni /generate-scenario-image 调用本接口）。
// SSRF 防护：只允许从 DashScope/阿里云 OSS 域名 fetch（与 ai-omni 的
// _validated_urlopen 白名单一致）。
// ---------------------------------------------------------------------------

// 允许下载的源域名（DashScope 文生图临时 URL 的 OSS 输出域）
const ALLOWED_IMAGE_HOSTS = [
    'dashscope.aliyuncs.com',
    'dashscope-intl.aliyuncs.com',
    'oss-cn-beijing.aliyuncs.com',
    'oss-cn-hangzhou.aliyuncs.com',
    'oss-cn-shanghai.aliyuncs.com',
    'oss-ap-southeast-1.aliyuncs.com',
];

const isAllowedImageHost = (hostname) => {
    if (!hostname) return false;
    return ALLOWED_IMAGE_HOSTS.some(d => hostname === d || hostname.endsWith('.' + d));
};

// content-type → 文件扩展名
const extFromContentType = (ct) => {
    const c = (ct || '').toLowerCase();
    if (c.includes('png')) return '.png';
    if (c.includes('webp')) return '.webp';
    if (c.includes('gif')) return '.gif';
    return '.jpg'; // 默认/jpeg
};

exports.uploadImageFromUrl = async (req, res) => {
    try {
        const sourceUrl = (req.body && req.body.image_url || '').trim();
        if (!sourceUrl) {
            return res.status(400).json({ error: 'Missing image_url' });
        }

        let parsed;
        try {
            parsed = new URL(sourceUrl);
        } catch {
            return res.status(400).json({ error: 'Invalid image_url' });
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return res.status(400).json({ error: 'URL scheme not allowed' });
        }
        if (!isAllowedImageHost(parsed.hostname)) {
            return res.status(400).json({ error: `Source host not allowed: ${parsed.hostname}` });
        }

        // 下载远程图片到内存（Node 18+ 内置 fetch）
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 20000);
        let resp;
        try {
            resp = await fetch(sourceUrl, { signal: controller.signal });
        } finally {
            clearTimeout(t);
        }
        if (!resp.ok) {
            return res.status(502).json({ error: `Fetch source failed: ${resp.status}` });
        }
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        const arrayBuf = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (!buffer.length) {
            return res.status(502).json({ error: 'Empty image body' });
        }

        // 上传到 COS：scenario-images/YYYY/M/D/<uuid>.<ext>
        const ext = extFromContentType(contentType);
        const date = new Date();
        const key = `scenario-images/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}/${uuidv4()}${ext}`;
        await uploadBuffer(buffer, key, contentType);

        const bucket = process.env.TENCENT_BUCKET;
        const region = process.env.TENCENT_REGION;
        const publicUrl = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;

        res.json({ success: true, data: { image_url: publicUrl, key } });

    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ error: 'Image upload failed', details: error.message });
    }
};
