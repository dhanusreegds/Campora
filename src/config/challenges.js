// Campus Challenges settings: week size, streak points, and the challenge pool.
require('./env');

const num = (v, f) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : f;
};

// Verification types
//   self     student writes what they did (note required)   -> honor system, capped per day
//   link     student pastes a proof link (https://...)      -> honor system, link required
//   session  completed Help Room sessions this week         -> verified automatically
//   request  completed help requests this week              -> verified automatically
//   posted   help requests posted this week                 -> verified automatically
//   event    check-ins on Campora announcements/events      -> verified automatically
const WEEKLY_SIZE = num(process.env.CHALLENGE_WEEKLY_SIZE, 5);

const P = (key, title, description, category, difficulty, points, audience, verification, extra = {}) => ({
  key, title, description, category, difficulty, points, audience, verificationType: verification, kind: 'weekly', target: 1, ...extra,
});
const D = (key, title, description, category, points, audience = 'all') => ({
  key, title, description, category, difficulty: 'easy', points, audience, verificationType: 'self', kind: 'daily', target: 1,
});

const POOL = [
  // Coding
  P('w-code-5', 'Solve 5 coding problems', 'Solve five problems on any practice platform and note what you learned.', 'Coding', 'medium', 50, 'all', 'self'),
  P('w-code-1', 'Solve a coding challenge', 'Pick one tough problem, solve it, and write down your approach.', 'Coding', 'medium', 45, 'all', 'self'),
  P('w-code-review', 'Review a peer\'s code', 'Read a classmate\'s code and give them three concrete suggestions.', 'Coding', 'medium', 40, 'all', 'self'),
  P('w-code-opensource', 'Contribute to open source', 'Open a pull request or issue on a public project and paste the link.', 'Coding', 'hard', 90, 'all', 'link'),
  // Learning
  P('w-learn-module', 'Complete a course module', 'Finish one module of an online or college course.', 'Learning', 'medium', 40, 'all', 'self'),
  P('w-learn-cert', 'Finish a certification module', 'Complete a module of a certification and paste the progress link.', 'Learning', 'medium', 50, 'all', 'link'),
  P('w-learn-skill', 'Complete a skill-building task', 'Practise one new skill (a tool, a framework, a concept) for an hour.', 'Learning', 'easy', 25, 'all', 'self'),
  P('w-learn-notes', 'Write summary notes for a topic', 'Summarise one topic from class in five bullet points.', 'Learning', 'easy', 20, 'all', 'self'),
  P('w-learn-interview', 'Practise interview questions', 'Answer three interview questions out loud and note where you hesitated.', 'Learning', 'easy', 25, 'all', 'self'),
  P('w-learn-reflect', 'Write a short learning reflection', 'Write 150 words on something new you learned this week.', 'Learning', 'easy', 20, 'all', 'self'),
  // Projects
  P('w-proj-mini', 'Complete a mini project', 'Build and finish a small project, then paste the repository or demo link.', 'Projects', 'hard', 100, 'all', 'link'),
  P('w-proj-upload', 'Upload a project', 'Publish a project (GitHub, Drive, portfolio) and paste the link.', 'Projects', 'medium', 75, 'all', 'link'),
  P('w-proj-team', 'Contribute to a team project', 'Finish a meaningful task for a team project and describe it.', 'Projects', 'medium', 60, 'all', 'self'),
  P('w-proj-deploy', 'Deploy something small', 'Put a small page or API online and paste the link.', 'Projects', 'hard', 90, 'all', 'link'),
  // Campus events (verified by check-in on Campora announcements)
  P('w-event-workshop', 'Attend a workshop', 'Check in to a workshop posted in Announcements.', 'Campus Events', 'easy', 30, 'all', 'event', { eventCategory: 'workshop' }),
  P('w-event-club', 'Participate in a club event', 'Check in to a club event posted in Announcements.', 'Campus Events', 'easy', 30, 'all', 'event', { eventCategory: 'club' }),
  P('w-event-tech', 'Attend a technical event', 'Check in to a technical talk or seminar posted in Announcements.', 'Campus Events', 'easy', 35, 'all', 'event', { eventCategory: 'technical' }),
  P('w-event-hack', 'Participate in a hackathon', 'Check in to a hackathon posted in Announcements.', 'Campus Events', 'hard', 100, 'all', 'event', { eventCategory: 'hackathon' }),
  // Mentoring: Helpers
  P('w-help-session', 'Help a junior in a Help Session', 'Complete one Help Session as the mentor.', 'Mentoring', 'medium', 40, 'helper', 'session'),
  P('w-help-session-2', 'Mentor two juniors', 'Complete two Help Sessions as the mentor this week.', 'Mentoring', 'hard', 80, 'helper', 'session', { target: 2 }),
  P('w-help-request', 'Resolve a junior\'s help request', 'Mark one accepted help request as completed.', 'Mentoring', 'medium', 40, 'helper', 'request'),
  P('w-help-notes', 'Share study material with a junior', 'Share notes or a resource that helped you, and describe it.', 'Mentoring', 'easy', 25, 'helper', 'self'),
  // Mentoring: Seekers
  P('w-seek-session', 'Learn from a senior in a Help Session', 'Complete one Help Session as the learner.', 'Mentoring', 'medium', 40, 'seeker', 'session'),
  P('w-seek-request', 'Get a doubt resolved', 'Have one of your help requests completed by a Helper.', 'Mentoring', 'easy', 30, 'seeker', 'request'),
  P('w-seek-post', 'Ask for help on something', 'Post a help request or send one to a Helper.', 'Mentoring', 'easy', 20, 'seeker', 'posted'),
  // Community
  P('w-help-peer', 'Help another student', 'Help a classmate with a doubt and describe what you explained.', 'Community', 'medium', 35, 'all', 'self'),
  P('w-comm-study', 'Organise a study group session', 'Run or join a study group and note the topic covered.', 'Community', 'medium', 40, 'all', 'self'),
];

// One small task per day. These keep the streak alive on days without a weekly challenge.
const DAILY = [
  D('d-code-1', 'Solve one coding problem', 'Any difficulty. Note which problem and how you solved it.', 'Coding', 10),
  D('d-code-snippet', 'Write a small program from scratch', 'No copy-paste: write a short program and note what it does.', 'Coding', 10),
  D('d-read-article', 'Read a technical article', 'Note three takeaways in your own words.', 'Learning', 5),
  D('d-revise', 'Revise today\'s class notes for 20 minutes', 'Note the topic you revised.', 'Learning', 5),
  D('d-tutorial', 'Follow a short tutorial', 'Try the example yourself and note what you built.', 'Learning', 10),
  D('d-weak-topic', 'Review a concept you find hard', 'Note the concept and one thing that finally made sense.', 'Learning', 10),
  D('d-explain', 'Explain a topic out loud for 5 minutes', 'Teach it to an imaginary student. Note the topic.', 'Learning', 5),
  D('d-plan', 'Plan your study schedule for tomorrow', 'Write down tomorrow\'s top three study tasks.', 'Productivity', 5),
  D('d-focus', 'Do a 25-minute focused study block', 'No phone. Note what you worked on.', 'Productivity', 5),
  D('d-resume', 'Improve one line of your resume', 'Note what you changed.', 'Career', 10),
  D('d-explore-event', 'Explore a campus event or club', 'Read Announcements and note one that interests you.', 'Campus Events', 5),
  D('d-help-peer', 'Help a classmate with a doubt', 'Note the doubt and how you helped.', 'Community', 10),
  D('d-help-junior', 'Help a junior with a coding doubt', 'Note the doubt and how you helped.', 'Mentoring', 20, 'helper'),
  D('d-ask-doubt', 'Write down one doubt and look it up', 'Note the doubt and what you found.', 'Learning', 10, 'seeker'),
  D('d-new-keyword', 'Learn one new concept or keyword', 'Note it and use it in a sentence or code line.', 'Learning', 5),
];

module.exports = {
  WEEKLY_SIZE,
  POOL: [...POOL, ...DAILY],
  TIMEZONE: process.env.CHALLENGE_TZ || 'Asia/Kolkata',
  // Streak points: day 1 = 5, day 2 = 10, day 3 and later = 15. Bonuses on day 5 and every 7th day.
  streak: { perDay: 5, maxDailyMultiplier: 3, fiveDayBonus: 25, weeklyBonus: 50, milestones: [3, 5, 7, 14, 21, 30, 60, 100] },
  MAX_SELF_REPORTED_PER_DAY: num(process.env.CHALLENGE_MAX_SELF_PER_DAY, 3),
  ENDING_SOON_HOURS: 24,
};
