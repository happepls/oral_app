const jwt = require('jsonwebtoken');

// Create a proper JWT token
const payload = {
  id: 'test-user-123',
  email: 'test@example.com'
};

const secret = 'your_jwt_secret_key_change_in_production';

const token = jwt.sign(payload, secret);

console.log('Generated JWT token:', token);
console.log('');
console.log('Token parts:');
const parts = token.split('.');
console.log('Header:', Buffer.from(parts[0], 'base64').toString());
console.log('Payload:', Buffer.from(parts[1], 'base64').toString());
console.log('Signature:', parts[2]);