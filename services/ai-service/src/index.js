const express = require('express');
const app = express();
const PORT = 8082;

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'AI Service is healthy' });
});

app.get('/', (req, res) => {
  res.send('AI Service is running');
});

app.listen(PORT, () => {
  console.log(`AI Service listening on port ${PORT}`);
});
