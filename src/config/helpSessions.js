// Help Session (mentoring) settings. Everything here can be tuned without touching the logic.
require('./env');

const num = (v, f) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : f;
};

const CATEGORIES = [
  { key: 'resume_review', label: 'Resume Review', hint: 'Get feedback on your resume or LinkedIn profile.' },
  { key: 'coding_help', label: 'Coding Help', hint: 'Debug code or understand a programming concept.' },
  { key: 'project_guidance', label: 'Project Guidance', hint: 'Plan, scope or unblock a project.' },
  { key: 'career_guidance', label: 'Career Guidance', hint: 'Internships, higher studies, career paths.' },
  { key: 'subject_doubt', label: 'Subject Doubt', hint: 'Clear a doubt from a course or subject.' },
  { key: 'interview_prep', label: 'Interview Preparation', hint: 'Mock interviews and question practice.' },
  { key: 'general_mentorship', label: 'General Mentorship', hint: 'Open conversation with a senior.' },
];

module.exports = {
  CATEGORIES,
  CATEGORY_KEYS: CATEGORIES.map((c) => c.key),
  categoryLabel: (key) => (CATEGORIES.find((c) => c.key === key) || { label: 'Help Session' }).label,
  DURATIONS: [15, 20, 30, 45, 60],
  MIN_LEAD_MINUTES: num(process.env.SESSION_MIN_LEAD_MINUTES, 15),
  MAX_DAYS_AHEAD: num(process.env.SESSION_MAX_DAYS_AHEAD, 30),
  // The Help Room opens this many minutes before the scheduled start.
  JOIN_EARLY_MINUTES: num(process.env.ROOM_JOIN_EARLY_MINUTES, 5),
  REMINDER_MINUTES: 60,
  STARTING_SOON_MINUTES: 10,
  MAX_OPEN_REQUESTS_PER_SEEKER: 6,
  MAX_FILE_BYTES: num(process.env.ROOM_MAX_FILE_BYTES, 4 * 1024 * 1024),
  MAX_FILES_PER_ROOM: 20,
  MAX_EVENTS_PER_ROOM: 6000,
  // Optional TURN/STUN override, e.g. ICE_SERVERS='[{"urls":"turn:turn.example.com","username":"u","credential":"p"}]'
  iceServers() {
    try {
      if (process.env.ICE_SERVERS) {
        const parsed = JSON.parse(process.env.ICE_SERVERS);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      console.warn('ICE_SERVERS is not valid JSON. Falling back to the public STUN server.');
    }
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  },
};
