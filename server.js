const mongoose = require('mongoose');
const config = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const app = require('./src/app');
const { User } = require('./src/models');
const { ensurePool } = require('./src/services/challengeService');
const { startScheduler } = require('./src/services/schedulerService');

async function start() {
  await connectDB();

  if (config.autoSeed && (await User.estimatedDocumentCount()) === 0) {
    console.log('Empty database detected. Seeding demo data...');
    const { seedDatabase } = require('./src/seed/seed');
    await seedDatabase({ reset: false });
  }

  // Campus Challenges: make sure the challenge pool exists (safe on every start).
  await ensurePool();

  if (config.usingDefaultSecret) {
    console.warn('Warning: JWT_SECRET is not set. Using an insecure development secret. Copy .env.example to .env.');
  }

  const server = app.listen(config.port, () => {
    console.log(`\nCampora is running at http://localhost:${config.port}\n`);
  });

  const stopScheduler = process.env.SCHEDULER === 'false' ? () => {} : startScheduler();

  const shutdown = async () => {
    stopScheduler();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
