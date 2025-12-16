const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const historyRoutes = require('./routes/historyRoutes');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/history', historyRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'history-analytics-service' });
});

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/oral_app_history';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

// Start Server
app.listen(PORT, () => {
  console.log(`History & Analytics Service running on port ${PORT}`);
});
