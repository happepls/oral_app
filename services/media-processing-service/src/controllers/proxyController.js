const axios = require('axios');

// Proxy controller to handle COS audio requests and add CORS headers
exports.proxyAudio = async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        // Validate URL format to prevent SSRF attacks
        try {
            const parsedUrl = new URL(url);
            if (!parsedUrl.protocol.match(/^https?:$/) || !parsedUrl.hostname.includes('.cos.')) {
                return res.status(400).json({ error: 'Invalid URL format' });
            }
        } catch (e) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Fetch the audio file from COS
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream', // Stream the response to avoid buffering
            timeout: 30000, // 30 second timeout
        });

        // Set appropriate headers for audio content
        res.set({
            'Content-Type': response.headers['content-type'] || 'audio/mpeg',
            'Content-Length': response.headers['content-length'],
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization',
        });

        // Pipe the response from COS to the client
        response.data.pipe(res);

    } catch (error) {
        console.error('Proxy error:', error.message);
        
        if (error.response) {
            // If COS returned an error, forward it
            res.status(error.response.status).send(error.response.data);
        } else {
            // Network or other error
            res.status(500).json({ 
                error: 'Failed to fetch audio from COS', 
                details: process.env.NODE_ENV === 'development' ? error.message : undefined 
            });
        }
    }
};

// Health check endpoint
exports.health = (req, res) => {
    res.status(200).json({ status: 'ok', service: 'media-processing-service' });
};