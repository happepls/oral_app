const crypto = require('crypto');

// Encryption configuration
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  tagLength: 16,
  saltLength: 64
};

// Generate encryption key from password (for user data encryption)
const generateKeyFromPassword = (password, salt) => {
  return crypto.pbkdf2Sync(
    password, 
    salt, 
    100000, // iterations
    ENCRYPTION_CONFIG.keyLength, 
    'sha256'
  );
};

// Generate secure random key
const generateSecureKey = () => {
  return crypto.randomBytes(ENCRYPTION_CONFIG.keyLength);
};

// Generate secure IV
const generateIV = () => {
  return crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);
};

// Generate secure salt
const generateSalt = () => {
  return crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);
};

// Encrypt sensitive data
const encryptData = (data, key, iv = null) => {
  try {
    if (!iv) {
      iv = generateIV();
    }
    
    const cipher = crypto.createCipher(ENCRYPTION_CONFIG.algorithm, key);
    cipher.setAAD(Buffer.from('oral-app-data', 'utf8')); // Additional authenticated data
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Data encryption failed');
  }
};

// Decrypt sensitive data
const decryptData = (encryptedData, key, iv, tag) => {
  try {
    const decipher = crypto.createDecipher(ENCRYPTION_CONFIG.algorithm, key);
    decipher.setAAD(Buffer.from('oral-app-data', 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Data decryption failed');
  }
};

// Encrypt sensitive fields in user data
const encryptUserSensitiveData = (userData, masterKey) => {
  const sensitiveFields = ['email', 'phone', 'address', 'paymentInfo'];
  const encryptedData = { ...userData };
  
  sensitiveFields.forEach(field => {
    if (userData[field]) {
      try {
        const iv = generateIV();
        const encrypted = encryptData(
          JSON.stringify(userData[field]), 
          masterKey, 
          iv
        );
        
        encryptedData[field] = {
          encrypted: true,
          data: encrypted.encrypted,
          iv: encrypted.iv,
          tag: encrypted.tag
        };
      } catch (error) {
        console.error(`Failed to encrypt field ${field}:`, error);
        // Keep original data if encryption fails
      }
    }
  });
  
  return encryptedData;
};

// Decrypt sensitive fields in user data
const decryptUserSensitiveData = (encryptedData, masterKey) => {
  const decryptedData = { ...encryptedData };
  
  Object.keys(encryptedData).forEach(field => {
    if (encryptedData[field] && encryptedData[field].encrypted) {
      try {
        const decrypted = decryptData(
          encryptedData[field].data,
          masterKey,
          encryptedData[field].iv,
          encryptedData[field].tag
        );
        
        decryptedData[field] = JSON.parse(decrypted);
      } catch (error) {
        console.error(`Failed to decrypt field ${field}:`, error);
        // Keep encrypted data if decryption fails
      }
    }
  });
  
  return decryptedData;
};

// Hash sensitive data (for non-reversible operations)
const hashSensitiveData = (data, salt = '') => {
  try {
    return crypto
      .createHash('sha256')
      .update(data + salt)
      .digest('hex');
  } catch (error) {
    console.error('Hashing error:', error);
    throw new Error('Data hashing failed');
  }
};

// Generate secure hash for API keys
const generateApiKey = () => {
  const prefix = 'oral_';
  const randomPart = crypto.randomBytes(32).toString('hex');
  return prefix + randomPart;
};

// Mask sensitive data for logging
const maskSensitiveData = (data) => {
  if (typeof data !== 'string') {
    return data;
  }
  
  if (data.length <= 4) {
    return '*'.repeat(data.length);
  }
  
  const start = data.slice(0, 2);
  const end = data.slice(-2);
  const masked = '*'.repeat(data.length - 4);
  
  return `${start}${masked}${end}`;
};

// Secure random string generator
const generateSecureRandomString = (length = 32) => {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

// Time-based one-time password (TOTP) for 2FA
const generateTOTPSecret = () => {
  return generateSecureRandomString(32);
};

const generateTOTP = (secret, timeStep = 30, digits = 6) => {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(time));
  
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (hash.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits);
  
  return code.toString().padStart(digits, '0');
};

const verifyTOTP = (token, secret, timeStep = 30, digits = 6, window = 1) => {
  const currentTime = Math.floor(Date.now() / 1000 / timeStep);
  
  for (let i = -window; i <= window; i++) {
    const expectedToken = generateTOTP(secret, timeStep, digits, currentTime + i);
    if (timingSafeEqual(token, expectedToken)) {
      return true;
    }
  }
  
  return false;
};

// Timing-safe string comparison
const timingSafeEqual = (a, b) => {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch (error) {
    return false;
  }
};

module.exports = {
  // Encryption/decryption
  encryptData,
  decryptData,
  encryptUserSensitiveData,
  decryptUserSensitiveData,
  
  // Key generation
  generateKeyFromPassword,
  generateSecureKey,
  generateIV,
  generateSalt,
  generateApiKey,
  generateSecureRandomString,
  
  // Hashing
  hashSensitiveData,
  
  // Utilities
  maskSensitiveData,
  
  // 2FA/TOTP
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  timingSafeEqual,
  
  // Configuration
  ENCRYPTION_CONFIG
};