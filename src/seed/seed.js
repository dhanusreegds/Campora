// Seeds MongoDB with demo accounts and sample data.
//   npm run seed        -> wipes the Campora collections and re-creates the demo data
// The server also calls seedDatabase() automatically on an empty database (AUTO_SEED=true).

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const models = require('../models');
const matching = require('../services/matching');
const pointsConfig = require('../config/points');

const { User, HelpRequest, Connection, Message, Announcement, Benefit, Notification, PointTransaction } = models;

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const daysFromNow = (d, hour = 10) => {
  const date = new Date(Date.now() + d * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
};
const ago = (ms) => new Date(Date.now() - ms);

const SEEKER_PASSWORD = 'seeker123';
const HELPER_PASSWORD = 'helper123';

async function seedDatabase({ reset = true } = {}) {
  if (reset) {
    await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
  }

  const [seekerHash, helperHash] = await Promise.all([User.hashPassword(SEEKER_PASSWORD), User.hashPassword(HELPER_PASSWORD)]);

  // ---------- Users ----------
  const seeker = await User.create({
    name: 'Ananya Sharma',
    username: 'seeker_demo',
    password: seekerHash,
    role: 'seeker',
    department: 'Computer Science & Engineering',
    course: 'B.Tech CSE',
    year: 2,
    skills: ['Java', 'Python', 'Operating Systems'],
    bio: 'Second-year CSE student learning Java and getting ready for my first OS course.',
    points: 35,
  });

  const helperData = [
    {
      name: 'Rahul Kumar',
      username: 'helper_demo',
      department: 'Computer Science & Engineering',
      course: 'B.Tech CSE',
      year: 4,
      skills: ['Java', 'Object-Oriented Programming', 'Data Structures', 'Algorithms', 'Operating Systems'],
      bio: 'Final-year CSE student and lab assistant for the Java course. I like turning confusing topics into small runnable examples.',
      expertise: 'Core Java, OOP design, data structures for placements, and OS concepts such as scheduling and deadlocks.',
      availability: 'Weekdays, 6-8 PM',
      verified: true,
      points: 120,
      studentsHelped: 14,
    },
    {
      name: 'Priya Nair',
      username: 'priya_nair',
      department: 'Information Technology',
      course: 'B.Tech IT',
      year: 4,
      skills: ['Python', 'Machine Learning', 'Data Science', 'SQL', 'Statistics'],
      bio: 'Data enthusiast who has interned on two ML projects. Happy to help with first models and messy datasets.',
      expertise: 'Python for data work, pandas, scikit-learn, SQL queries and picking a beginner-friendly ML project.',
      availability: 'Tuesday and Thursday evenings, weekends',
      verified: true,
      points: 180,
      studentsHelped: 21,
    },
    {
      name: 'Arjun Mehta',
      username: 'arjun_mehta',
      department: 'Electronics & Communication',
      course: 'B.Tech ECE',
      year: 3,
      skills: ['Embedded Systems', 'C', 'C++', 'Digital Electronics', 'Arduino'],
      bio: 'Third-year ECE student who runs the robotics club workshop. I love hardware projects that actually blink.',
      expertise: 'Arduino and microcontroller basics, C for embedded work, logic gates and digital design labs.',
      availability: 'Weekends, 10 AM - 1 PM',
      verified: false,
      points: 65,
      studentsHelped: 7,
    },
    {
      name: 'Sneha Iyer',
      username: 'sneha_iyer',
      department: 'Computer Science & Engineering',
      course: 'B.Tech CSE',
      year: 4,
      skills: ['Web Development', 'JavaScript', 'React', 'Node.js', 'MongoDB', 'HTML & CSS'],
      bio: 'Full-stack developer and hackathon regular. I help juniors ship their first web project.',
      expertise: 'Building REST APIs with Express and MongoDB, React components, debugging JavaScript, deploying a first app.',
      availability: 'Monday, Wednesday and Friday, 5-7 PM',
      verified: false,
      points: 95,
      studentsHelped: 11,
    },
    {
      name: 'Vikram Singh',
      username: 'vikram_singh',
      department: 'Mathematics',
      course: 'B.Sc Mathematics (Hons)',
      year: 3,
      skills: ['Calculus', 'Linear Algebra', 'Probability', 'Statistics', 'Discrete Mathematics'],
      bio: 'Maths honours student who tutors first-year engineering maths. Patient with proofs and word problems.',
      expertise: 'Calculus, matrices and eigenvalues, probability problems, and discrete maths for CS students.',
      availability: 'Weekdays, 4-6 PM',
      verified: false,
      points: 40,
      studentsHelped: 5,
    },
    {
      name: 'Divya Menon',
      username: 'divya_menon',
      department: 'Computer Science & Engineering',
      course: 'B.Tech CSE',
      year: 4,
      skills: ['Placement preparation', 'Data Structures', 'Algorithms', 'Communication', 'Technical writing'],
      bio: 'Placed at a product company this year. I run mock interviews and review resumes.',
      expertise: 'Mock interviews, resume reviews, problem-solving practice and explaining your projects clearly.',
      availability: 'Evenings after 7 PM',
      verified: false,
      points: 150,
      studentsHelped: 18,
    },
  ];
  const helpers = {};
  for (const h of helperData) {
    helpers[h.username] = await User.create({ ...h, password: helperHash, role: 'helper' });
  }
  const rahul = helpers.helper_demo;
  const priya = helpers.priya_nair;

  // ---------- Benefits ----------
  await Benefit.insertMany([
    { name: 'Canteen Coupon', description: 'Demo coupon for one meal at the campus canteen.', pointsRequired: 50, availability: 25, icon: 'canteen' },
    { name: 'Library Coupon', description: 'Demo coupon that waives one late fee at the library.', pointsRequired: 30, availability: 40, icon: 'library' },
    { name: 'Printing Credits', description: 'Demo credits for 50 printed pages at the print shop.', pointsRequired: 40, availability: 30, icon: 'print' },
    { name: 'Campus Event Pass', description: 'Demo pass for one campus fest or club event.', pointsRequired: 100, availability: 10, icon: 'ticket' },
  ]);

  // ---------- Announcements ----------
  await Announcement.insertMany([
    {
      title: 'CodeSprint 24-hour hackathon',
      description: 'Team up (up to 4 people) and build a working project in 24 hours. Mentors from final year will be around to help. Snacks and prizes included.',
      eventDate: daysFromNow(9, 9),
      venue: 'Innovation Lab, Block C',
      organizer: 'Coding Club',
      registrationLink: 'https://example.com/codesprint',
      createdBy: helpers.sneha_iyer._id,
    },
    {
      title: 'Resume and interview workshop',
      description: 'Bring your resume. We will review it in small groups and run a short mock interview round for second and third years.',
      eventDate: daysFromNow(4, 16),
      venue: 'Seminar Hall 2',
      organizer: 'Divya Menon and the Placement Cell',
      registrationLink: '',
      createdBy: helpers.divya_menon._id,
    },
    {
      title: 'Git and GitHub for beginners',
      description: 'A hands-on session: create a repository, make commits, open a pull request. Bring a laptop with Git installed.',
      eventDate: daysFromNow(2, 15),
      venue: 'Computer Lab 3',
      organizer: 'Sneha Iyer',
      registrationLink: 'https://example.com/git-workshop',
      createdBy: helpers.sneha_iyer._id,
    },
    {
      title: 'Guest talk: careers in machine learning',
      description: 'An alumnus working in ML will talk about projects, skills to build in college and how to get a first internship.',
      eventDate: daysFromNow(14, 11),
      venue: 'Main Auditorium',
      organizer: 'Department of IT',
      registrationLink: '',
      createdBy: priya._id,
    },
    {
      title: 'Inter-department coding contest',
      description: 'Results are out. Thanks to everyone who took part. Solutions will be discussed in the next club meeting.',
      eventDate: daysFromNow(-5, 14),
      venue: 'Computer Lab 1',
      organizer: 'Rahul Kumar',
      registrationLink: '',
      createdBy: rahul._id,
    },
  ]);

  // ---------- Help requests ----------
  const base = { postedBy: seeker._id };

  const scheduling = await HelpRequest.create({
    ...base,
    type: 'direct',
    assignedHelper: rahul._id,
    title: 'Understanding CPU scheduling algorithms',
    description: 'I get confused between Round Robin and Priority scheduling. Can you walk me through a worked example with Gantt charts?',
    category: 'Operating Systems',
    assistanceType: 'One-to-one session',
    difficulty: 'intermediate',
    requiredSkills: ['Operating Systems', 'Scheduling'],
    matchingScore: 100,
    status: 'accepted',
    acceptedAt: ago(2 * DAY),
    createdAt: ago(3 * DAY),
  });

  const exceptions = await HelpRequest.create({
    ...base,
    type: 'direct',
    assignedHelper: rahul._id,
    title: 'Java exception handling doubts',
    description: 'I do not understand when to use throws versus try-catch, and what a custom exception is for. A short chat would help.',
    category: 'Java Programming',
    assistanceType: 'Chat guidance',
    difficulty: 'basic',
    deadline: daysFromNow(5),
    requiredSkills: ['Java', 'Exception handling'],
    matchingScore: 90,
    status: 'pending',
    createdAt: ago(3 * HOUR),
  });

  const bstRequest = await HelpRequest.create({
    ...base,
    type: 'direct',
    assignedHelper: rahul._id,
    title: 'Binary search tree traversal walkthrough',
    description: 'Please explain inorder, preorder and postorder traversal with one example tree.',
    category: 'Data Structures',
    assistanceType: 'Chat guidance',
    difficulty: 'basic',
    requiredSkills: ['Data Structures', 'Trees'],
    matchingScore: 100,
    status: 'completed',
    acceptedAt: ago(7 * DAY),
    completedAt: ago(6 * DAY),
    pointsAwarded: true,
    pointsValue: pointsConfig.byDifficulty.basic,
    createdAt: ago(8 * DAY),
  });

  await PointTransaction.create({ user: rahul._id, request: bstRequest._id, points: pointsConfig.byDifficulty.basic, createdAt: ago(6 * DAY) });

  const pandas = await HelpRequest.create({
    ...base,
    type: 'direct',
    assignedHelper: priya._id,
    title: 'Cleaning a messy CSV with pandas',
    description: 'My dataset has missing values and duplicate rows. How should I clean it before training a model?',
    category: 'Data Science',
    assistanceType: 'Document or code review',
    difficulty: 'basic',
    requiredSkills: ['Python', 'Data Science'],
    matchingScore: 100,
    status: 'pending',
    createdAt: ago(1 * DAY),
  });

  const publicPosts = [
    {
      title: 'Can someone help me understand Java inheritance and polymorphism?',
      description: 'I can write basic classes but I get lost with super, method overriding and when to use an abstract class. Examples would really help.',
      category: 'Java Programming',
      difficulty: 'intermediate',
      deadline: daysFromNow(4),
      requiredSkills: ['Java', 'OOP', 'Inheritance'],
      createdAt: ago(5 * HOUR),
    },
    {
      title: 'Setting up a REST API with Express and MongoDB',
      description: 'For my mini project I need CRUD routes with Express and Mongoose. I am stuck on connecting the database and structuring the folders.',
      category: 'Web Development',
      difficulty: 'basic',
      requiredSkills: [],
      createdAt: ago(1 * DAY),
    },
  ];
  const publicRequests = [];
  for (const post of publicPosts) {
    const result = await matching.findMatches(post);
    const request = await HelpRequest.create({
      ...base,
      ...post,
      type: 'public',
      requiredSkills: result.skills,
      matchingScore: result.matches[0] ? result.matches[0].score : 0,
      matchedHelpers: result.matches.map((m) => ({
        helper: m.helper._id,
        score: m.score,
        matchedSkills: m.matchedSkills,
        explanation: m.explanation,
      })),
    });
    publicRequests.push({ request, matches: result.matches });
  }

  // ---------- Connection and chat ----------
  await Connection.create({ seeker: seeker._id, helper: rahul._id, status: 'accepted', request: scheduling._id, createdAt: ago(2 * DAY) });

  const chat = [
    [seeker, rahul, 'Hi Rahul! Thanks for accepting my request on CPU scheduling.', 46 * HOUR],
    [rahul, seeker, 'Happy to help, Ananya. Which algorithm confuses you most, Round Robin or Priority?', 45 * HOUR],
    [seeker, rahul, 'Round Robin. I never know how the time quantum changes the waiting time.', 44 * HOUR],
    [rahul, seeker, 'Try this: P1 = 5, P2 = 3, P3 = 8 (burst times), all arriving at time 0, quantum 2. Draw the Gantt chart and find the average waiting time.', 43 * HOUR],
    [seeker, rahul, 'Completion times: P1 = 12, P2 = 9, P3 = 16. So waiting times are 7, 6 and 8. Average is 7?', 26 * HOUR],
    [rahul, seeker, 'Exactly right. Now try quantum 4 and compare the two results. You will see the trade-off the quantum creates.', 25 * HOUR],
    [seeker, rahul, 'Will do! Can we go over priority scheduling tomorrow?', 24 * HOUR],
    [rahul, seeker, 'Sure, I am free 6-8 PM on weekdays. Send me your attempt before then and we will go through it together.', 23 * HOUR],
  ];
  await Message.insertMany(
    chat.map(([from, to, content, offset]) => ({ sender: from._id, receiver: to._id, content, timestamp: ago(offset), read: true }))
  );

  // ---------- Notifications ----------
  const notifications = [
    { recipient: seeker._id, title: 'Request accepted', message: 'Rahul Kumar accepted "Understanding CPU scheduling algorithms". You can chat now.', type: 'accepted', link: `#/chat/${rahul._id}`, read: true, createdAt: ago(2 * DAY) },
    { recipient: rahul._id, title: 'New help request', message: 'Ananya Sharma asked for help: "Java exception handling doubts".', type: 'request', link: '#/requests', createdAt: ago(3 * HOUR) },
    { recipient: priya._id, title: 'New help request', message: 'Ananya Sharma asked for help: "Cleaning a messy CSV with pandas".', type: 'request', link: '#/requests', createdAt: ago(1 * DAY) },
  ];
  for (const { request, matches } of publicRequests) {
    matches.slice(0, 3).forEach((m) =>
      notifications.push({
        recipient: m.helper._id,
        title: 'New Help Request',
        message: `A post matching your skills has been recommended to you: "${request.title}" (matched: ${m.matchedSkills.join(', ')}).`,
        type: 'match',
        link: '#/requests',
        createdAt: request.createdAt,
      })
    );
  }
  await Notification.insertMany(notifications);

  // Help Sessions + Campus Challenges demo data
  await require('./seedFeatures').seedFeatures();

  return { seeker, helpers, exceptions, pandas };
}

module.exports = { seedDatabase, SEEKER_PASSWORD, HELPER_PASSWORD };

if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      console.log('Resetting collections and seeding demo data...');
      await seedDatabase({ reset: true });
      console.log('\nDone. Demo accounts:');
      console.log('  Seeker: seeker_demo / seeker123  (Ananya Sharma)');
      console.log('  Helper: helper_demo / helper123  (Rahul Kumar)');
      console.log('  Other helpers (password helper123): priya_nair, arjun_mehta, sneha_iyer, vikram_singh, divya_menon\n');
    } catch (err) {
      console.error('Seeding failed:', err.message);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}
