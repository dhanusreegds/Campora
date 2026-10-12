// Point values are configurable from environment variables (see .env.example).
require('./env'); // makes sure .env is loaded first

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

module.exports = {
  byDifficulty: {
    basic: num(process.env.POINTS_BASIC, 10),
    intermediate: num(process.env.POINTS_INTERMEDIATE, 15),
    advanced: num(process.env.POINTS_ADVANCED, 20),
  },
  // A small thank-you bonus for the Seeker whose request was completed.
  seekerBonus: num(process.env.POINTS_SEEKER_BONUS, 2),
};
