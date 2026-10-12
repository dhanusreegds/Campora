require('./env'); // makes sure .env is loaded first

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

module.exports = {
  engine: process.env.MATCHING_ENGINE || 'rule-based',
  // Helpers below this score are not recommended or notified.
  minScore: num(process.env.MATCH_MIN_SCORE, 30),
  // Maximum number of Helpers notified for a single public post.
  maxNotified: num(process.env.MATCH_MAX_NOTIFIED, 3),
  // Maximum number of recommended Helpers stored / shown per post.
  maxRecommended: 5,
};
