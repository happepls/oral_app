require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

const userRoutes = require('./routes/userRoutes');
app.use('/', userRoutes);

app.get('/', (req, res) => {
    res.send('User Service is running');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`User service listening on port ${PORT}`);
});