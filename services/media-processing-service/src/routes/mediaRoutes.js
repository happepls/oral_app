const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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

router.post('/upload', upload.fields([{ name: 'user_audio', maxCount: 1 }, { name: 'ai_audio', maxCount: 1 }]), mediaController.uploadAndProcessAudio);

module.exports = router;
