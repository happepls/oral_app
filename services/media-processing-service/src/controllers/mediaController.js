const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { transcodeAudio } = require('../utils/transcoder');
const { uploadFile } = require('../utils/cos');

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
