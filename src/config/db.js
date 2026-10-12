const mongoose = require('mongoose');
const { mongoUri } = require('./env');

async function connectDB() {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    console.error('\nCould not connect to MongoDB at:', mongoUri.replace(/\/\/([^@/]+)@/, '//***@'));
    console.error('Reason:', err.message);
    console.error('\nMake sure MongoDB is running (or set MONGODB_URI in your .env file). See README.md.\n');
    throw err;
  }
  console.log(`MongoDB connected (${mongoose.connection.name})`);
}

module.exports = { connectDB };
