// Matching service used by the controllers.
//
// The controllers only talk to this file. To plug in a real AI service later:
//   1. create ./aiEngine.js exporting the same functions as ./ruleBasedEngine.js
//      (extractSkills, rankHelpers - either may return a Promise),
//   2. register it in ENGINES below,
//   3. set MATCHING_ENGINE=ai in .env.
// Until then the built-in rule-based engine is used. The prototype makes no AI claims.

const matchingConfig = require('../../config/matching');
const { User } = require('../../models');

const ENGINES = {
  'rule-based': require('./ruleBasedEngine'),
};

function getEngine() {
  const engine = ENGINES[matchingConfig.engine];
  if (!engine) {
    console.warn(`Unknown MATCHING_ENGINE "${matchingConfig.engine}". Falling back to rule-based.`);
    return ENGINES['rule-based'];
  }
  return engine;
}

/**
 * Finds the best Helpers for a request.
 * @param {{title?: string, description?: string, category?: string, requiredSkills?: string[]}} input
 * @param {{excludeUserId?: string, limit?: number, minScore?: number}} [options]
 */
async function findMatches(input, options = {}) {
  const engine = getEngine();
  const { limit = matchingConfig.maxRecommended, minScore = matchingConfig.minScore } = options;

  let skills = (input.requiredSkills || []).filter(Boolean);
  let skillsSource = 'provided';
  if (!skills.length) {
    const text = [input.title, input.description, input.category].filter(Boolean).join(' ');
    skills = await engine.extractSkills(text);
    skillsSource = 'detected';
  }

  const helpers = await User.find({ role: 'helper' })
    .select('name username department course year skills bio expertise verified points studentsHelped profileImage')
    .lean();

  const ranked = await engine.rankHelpers({ requiredSkills: skills, category: input.category }, helpers, { minScore, limit });
  return { engine: engine.info, skills, skillsSource, matches: ranked };
}

/** Scores a single Helper (used for direct requests). */
async function scoreForHelper(input, helper) {
  const engine = getEngine();
  let skills = (input.requiredSkills || []).filter(Boolean);
  if (!skills.length) {
    const text = [input.title, input.description, input.category].filter(Boolean).join(' ');
    skills = await engine.extractSkills(text);
  }
  const [match] = await engine.rankHelpers({ requiredSkills: skills, category: input.category }, [helper], { minScore: 1, limit: 1 });
  return { skills, match: match || null };
}

/** Human readable sentence shown in the "good fit" pop-up. */
function describeFit(match) {
  const list = match.matchedSkills;
  const skillText = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
  return `Your post is a good fit for ${match.helper.name} (@${match.helper.username}), who has expertise in ${skillText}.`;
}

module.exports = { findMatches, scoreForHelper, describeFit, getEngine };
