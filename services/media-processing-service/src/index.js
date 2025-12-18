const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mediaRoutes = require('./routes/mediaRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'media-processing-service' });
});

// Routes
app.use('/api/media', mediaRoutes);

app.listen(PORT, () => {
    console.log(`Media Processing Service running on port ${PORT}`);
});
