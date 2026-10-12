const mongoose = require('mongoose');
const ApiError = require('./ApiError');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsRegex = (s) => new RegExp(escapeRegex(String(s).trim()), 'i');

function assertObjectId(id, label = 'id') {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${label}.`);
  return id;
}

// Accepts an array or a comma / newline separated string; returns unique, trimmed skills.
function parseSkills(input, { max = 15, maxLength = 40 } = {}) {
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (typeof input === 'string') list = input.split(/[,\n;]/);
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const s = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function cleanText(value, { max = 500, required = false, label = 'Field' } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) throw new ApiError(400, `${label} is required.`);
  if (s.length > max) throw new ApiError(400, `${label} must be ${max} characters or fewer.`);
  return s;
}

function cleanUrl(value, label = 'Link') {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return '';
  let url;
  try {
    url = new URL(s);
  } catch {
    throw new ApiError(400, `${label} must be a valid URL starting with http:// or https://.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(400, `${label} must start with http:// or https://.`);
  }
  return url.toString();
}

function parseDate(value, { label = 'Date', required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, `${label} is required.`);
    return undefined;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `${label} is not a valid date.`);
  return d;
}

const PUBLIC_USER_FIELDS =
  'name username role department course year skills bio expertise availability verified points studentsHelped profileImage createdAt';

const MINI_USER_FIELDS = 'name username role department course year verified profileImage';

module.exports = {
  escapeRegex,
  containsRegex,
  assertObjectId,
  parseSkills,
  cleanText,
  cleanUrl,
  parseDate,
  PUBLIC_USER_FIELDS,
  MINI_USER_FIELDS,
};
