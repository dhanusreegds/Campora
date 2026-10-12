// Rule-based skill matching engine.
//
// This is NOT an AI / machine-learning model. It compares the skills a request needs
// with the skills on Helper profiles using a small vocabulary (aliases + parent/child
// relations) and a transparent scoring formula:
//
//   score = 85 x coverage  +  10 x subject relevance  +  5 (verified Helper)
//
//   coverage = average credit per required skill:
//     exact match (same skill or alias)        = 1.0
//     related (parent / child, e.g. OOP <-> Inheritance) = 0.6
//     partial word overlap (e.g. "Web Design" ~ "Web Development") = 0.4
//
// A Helper is only scored when at least one required skill is covered.
// The same interface (extractSkills / rankHelpers) can be implemented by a real AI service.

const { SKILLS, SHORT_ALIASES_ALLOWED_IN_TEXT } = require('./skillTaxonomy');

const WEIGHTS = { exact: 1, related: 0.6, partial: 0.4 };
const GENERIC_WORDS = new Set([
  'and', 'the', 'for', 'with', 'programming', 'development', 'basics', 'fundamentals', 'concepts',
  'introduction', 'engineering', 'science', 'system', 'systems', 'computer', 'theory', 'skills', 'general',
]);

const BY_KEY = new Map(SKILLS.map((s) => [s.key, s]));

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^a-z0-9+#]+|[^a-z0-9+#]+$/g, '');

const ALIAS_TO_KEY = new Map();
for (const skill of SKILLS) {
  for (const alias of [skill.label, ...skill.aliases]) {
    const n = norm(alias);
    if (!ALIAS_TO_KEY.has(n)) ALIAS_TO_KEY.set(n, skill.key);
  }
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pre-compiled detectors used to find skills inside free text.
const DETECTORS = [];
for (const skill of SKILLS) {
  const aliases = new Set([skill.label, ...skill.aliases].map(norm));
  for (const alias of aliases) {
    if (alias.length < 3 && !SHORT_ALIASES_ALLOWED_IN_TEXT.has(alias)) continue;
    DETECTORS.push({
      key: skill.key,
      regex: new RegExp(`(?<![a-z0-9+#.])${escapeRegex(alias)}(?![a-z0-9+#])`),
    });
  }
}

function canonicalKey(raw) {
  const n = norm(raw);
  return ALIAS_TO_KEY.get(n) || n;
}

function ancestors(key) {
  const out = [];
  let current = BY_KEY.get(key);
  while (current && current.parent) {
    out.push(current.parent);
    current = BY_KEY.get(current.parent);
  }
  return out;
}

const isRelated = (a, b) => a !== b && (ancestors(a).includes(b) || ancestors(b).includes(a));

function tokens(raw) {
  return norm(raw)
    .split(' ')
    .filter((t) => t.length >= 3 && !GENERIC_WORDS.has(t));
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Finds known skills mentioned in free text. Returns display labels. */
function extractSkills(text) {
  const t = norm(text);
  if (!t) return [];
  const found = new Set();
  for (const d of DETECTORS) if (d.regex.test(t)) found.add(d.key);
  return [...found].map((key) => BY_KEY.get(key).label);
}

function bestMatchFor(required, helperSkills) {
  let best = null;
  for (const hs of helperSkills) {
    let type = null;
    if (hs.key === required.key) type = 'exact';
    else if (isRelated(required.key, hs.key)) type = 'related';
    else {
      const a = new Set(tokens(required.raw));
      if (tokens(hs.raw).some((tok) => a.has(tok))) type = 'partial';
    }
    if (type && (!best || WEIGHTS[type] > WEIGHTS[best.type])) {
      best = { type, requiredSkill: required.raw, helperSkill: hs.raw };
    }
  }
  return best;
}

function subjectRelevance(category, helper) {
  const words = tokens(category);
  if (!words.length) return 0;
  const haystack = norm([helper.department, helper.course, helper.expertise, helper.bio, ...(helper.skills || [])].join(' '));
  const hits = words.filter((w) => haystack.includes(w)).length;
  return (10 * hits) / words.length;
}

/**
 * Scores one Helper against a request.
 * @param {{requiredSkills: string[], category?: string}} request
 * @param {object} helper  plain user object (needs skills, verified, ...)
 * @returns {null | {score, matchedSkills, matches, missingSkills, explanation}}
 */
function scoreHelper(request, helper) {
  const seen = new Set();
  const required = [];
  for (const raw of request.requiredSkills || []) {
    const key = canonicalKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    required.push({ raw: String(raw).trim(), key });
  }
  if (!required.length) return null;

  const helperSkills = (helper.skills || []).map((raw) => ({ raw, key: canonicalKey(raw) }));
  const matches = [];
  const missingSkills = [];
  let credit = 0;
  for (const r of required) {
    const m = bestMatchFor(r, helperSkills);
    if (m) {
      matches.push(m);
      credit += WEIGHTS[m.type];
    } else {
      missingSkills.push(r.raw);
    }
  }
  if (!matches.length) return null;

  const coverage = credit / required.length;
  const score = Math.min(100, Math.round(85 * coverage + subjectRelevance(request.category, helper) + (helper.verified ? 5 : 0)));

  const exact = matches.filter((m) => m.type === 'exact').map((m) => m.requiredSkill);
  const related = matches.filter((m) => m.type === 'related').map((m) => `${m.requiredSkill} relates to ${m.helperSkill}`);
  const partial = matches.filter((m) => m.type === 'partial').map((m) => `${m.requiredSkill} overlaps with ${m.helperSkill}`);
  const parts = [];
  if (exact.length) parts.push(`${joinList(exact)} ${exact.length > 1 ? 'match' : 'matches'}.`);
  if (related.length) parts.push(`${joinList(related)}.`);
  if (partial.length) parts.push(`${joinList(partial)}.`);
  if (missingSkills.length) parts.push(`Not covered: ${joinList(missingSkills)}.`);

  const matchedSkills = [...new Set(matches.map((m) => m.helperSkill))];
  return { score, matchedSkills, matches, missingSkills, explanation: parts.join(' ') };
}

/** Ranks Helpers for a request. Returns [{helper, score, matchedSkills, ...}] best first. */
function rankHelpers(request, helpers, { minScore = 1, limit = 10 } = {}) {
  return helpers
    .map((helper) => ({ helper, result: scoreHelper(request, helper) }))
    .filter((x) => x.result && x.result.score >= minScore)
    .map((x) => ({ helper: x.helper, ...x.result }))
    .sort((a, b) => b.score - a.score || (b.helper.points || 0) - (a.helper.points || 0))
    .slice(0, limit);
}

module.exports = {
  info: { name: 'rule-based', ai: false, description: 'Rule-based skill matching (no external AI service).' },
  extractSkills,
  scoreHelper,
  rankHelpers,
};
