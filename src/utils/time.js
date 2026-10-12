// Time-zone aware day and week helpers (no dependencies). A "dateKey" is YYYY-MM-DD in the challenge time zone.
const { TIMEZONE } = require('../config/challenges');

const DAY_MS = 24 * 60 * 60 * 1000;
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const dateKeyOf = (date = new Date()) => fmt.format(date);
const keyToUTC = (key) => new Date(`${key}T00:00:00Z`);
const addDays = (key, n) => new Date(keyToUTC(key).getTime() + n * DAY_MS).toISOString().slice(0, 10);

function tzOffset(date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

function startOfDay(key) {
  const guess = keyToUTC(key).getTime();
  let t = guess - tzOffset(new Date(guess));
  t = guess - tzOffset(new Date(t));
  return new Date(t);
}

function isoWeekInfo(mondayKey) {
  const d = keyToUTC(mondayKey);
  const thursday = new Date(d.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return { year, week };
}

/** Week (Monday to Sunday) containing the given instant. */
function weekOf(date = new Date()) {
  const today = dateKeyOf(date);
  const dow = keyToUTC(today).getUTCDay();
  const startKey = addDays(today, -((dow + 6) % 7));
  const { year, week } = isoWeekInfo(startKey);
  return {
    weekKey: `${year}-W${String(week).padStart(2, '0')}`, year, week, startKey, endKey: addDays(startKey, 6),
    start: startOfDay(startKey), end: startOfDay(addDays(startKey, 7)),
    days: Array.from({ length: 7 }, (_, i) => addDays(startKey, i)), today,
  };
}

module.exports = { dateKeyOf, addDays, startOfDay, weekOf, DAY_MS };
