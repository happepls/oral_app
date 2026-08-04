const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const proxyController = require('../controllers/proxyController'); // Add proxy controller
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function requireInternalService(req, res, next) {
    const expected = process.env.INTERNAL_AUTH_SECRET;
    const supplied = req.get('X-Guaji-Internal-Auth');
    if (!expected || !supplied) return res.status(401).json({ message: 'Internal authentication required' });
    const left = Buffer.from(expected);
    const right = Buffer.from(supplied);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
        return res.status(401).json({ message: 'Invalid internal authentication' });
    }
    next();
}

// Configure Multer for temp storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join('/tmp', 'uploads');
        // Ensure dir exists
        const fs = require('fs');
        if (!fs.existsSync(uploadDir)){
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '.webm'; // Default to webm if unknown
        cb(null, uuidv4() + ext);
    }
});

const upload = multer({ storage: storage });

router.post('/upload', requireInternalService, upload.fields([{ name: 'user_audio', maxCount: 1 }, { name: 'ai_audio', maxCount: 1 }]), mediaController.uploadAndProcessAudio);

// Re-host a remote image (DashScope/OSS temp URL) to COS → permanent URL.
// Body: { image_url }. Used by ai-omni /generate-scenario-image for cover-image persistence.
router.post('/upload-image', requireInternalService, express.json(), mediaController.uploadImageFromUrl);

// Add proxy route for COS audio files
router.get('/proxy', proxyController.proxyAudio);

// Health check route
router.get('/health', proxyController.health);

module.exports = router;
