const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { transcodeAudio } = require('../utils/transcoder');
const { uploadFile } = require('../utils/cos');

exports.uploadAndProcessAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        const inputPath = req.file.path;
        const fileId = uuidv4();
        // Assuming input is PCM/WAV or WebM. Let's convert to MP3 for storage/playback compatibility.
        // If it's raw PCM, we might need to specify input options, but multer usually saves with extension if we config it.
        // For now, assume the container handles extension or we detect it.
        
        const outputFilename = `${fileId}.mp3`;
        const outputPath = path.join(path.dirname(inputPath), outputFilename);
        
        // Transcode
        await transcodeAudio(inputPath, outputPath, 'mp3');

        // Upload to COS
        // We'll organize by date YYYY/MM/DD
        const date = new Date();
        const key = `audio/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}/${outputFilename}`;
        
        const uploadResult = await uploadFile(outputPath, key);

        // Cleanup local files
        fs.unlink(inputPath, (err) => { if (err) console.error('Error deleting input file:', err); });
        fs.unlink(outputPath, (err) => { if (err) console.error('Error deleting output file:', err); });

        // Construct public URL (assuming public read or needing presigned URL)
        // For standard public bucket: https://<bucket>.cos.<region>.myqcloud.com/<key>
        const bucket = process.env.TENCENT_BUCKET;
        const region = process.env.TENCENT_REGION;
        const publicUrl = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;

        res.json({
            success: true,
            url: publicUrl,
            key: key,
            location: uploadResult.Location
        });

    } catch (error) {
        console.error('Media processing error:', error);
        res.status(500).json({ error: 'Internal processing error', details: error.message });
    }
};
