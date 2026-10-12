require('dotenv').config({ quiet: true });

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production.');
}

module.exports = {
  isProduction,
  port: num(process.env.PORT, 3000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campora',
  jwtSecret: process.env.JWT_SECRET || 'campora-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  autoSeed: String(process.env.AUTO_SEED || 'true').toLowerCase() !== 'false',
  usingDefaultSecret: !process.env.JWT_SECRET,
};
