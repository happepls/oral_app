const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const historyRoutes = require('./routes/historyRoutes');
const { installDatabaseReadiness } = require('./databaseReadiness');
const { installMigrationWriteGate } = require('./migrationWriteGate');
const { requireInternalService } = require('./middleware/historyAuth');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());
installDatabaseReadiness(app, mongoose.connection);
installMigrationWriteGate(app, { requireInternalService });

// Routes
app.use('/api/history', historyRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'history-analytics-service' });
});

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/oral_app_history';

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('MongoDB Connected'))
.catch(() => console.error('MongoDB connection unavailable'));

// Start Server
app.listen(PORT, () => {
  console.log(`History & Analytics Service running on port ${PORT}`);
});
