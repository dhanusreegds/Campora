const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate, requireRole } = require('../middleware/auth');

const auth = require('../controllers/authController');
const users = require('../controllers/userController');
const requests = require('../controllers/requestController');
const connections = require('../controllers/connectionController');
const chat = require('../controllers/chatController');
const announcements = require('../controllers/announcementController');
const leaderboard = require('../controllers/leaderboardController');
const benefits = require('../controllers/benefitController');
const notifications = require('../controllers/notificationController');
const dashboard = require('../controllers/dashboardController');
const sessions = require('../controllers/meetingController');
const rooms = require('../controllers/roomController');
const challenges = require('../controllers/challengeController');
const { MAX_FILE_BYTES } = require('../config/helpSessions');

const router = express.Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', app: 'Campora' }));

// ---- Authentication (rate limited to slow down password guessing) ----
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/register', authLimiter, auth.register);
router.get('/auth/me', authenticate, auth.me);

// Everything below requires a logged-in user.
router.use(authenticate);

// ---- Profiles and Helper search ----
router.put('/users/me', users.updateMe);
router.get('/helpers', requireRole('seeker'), users.searchHelpers);
router.get('/helpers/:id', users.getHelper);

// ---- Dashboards ----
router.get('/dashboard/seeker', requireRole('seeker'), dashboard.seeker);
router.get('/dashboard/helper', requireRole('helper'), dashboard.helper);

// ---- Help requests ----
router.post('/requests/direct', requireRole('seeker'), requests.createDirect);
router.post('/requests/public', requireRole('seeker'), requests.createPublic);
router.get('/requests/mine', requireRole('seeker'), requests.listMine);
router.get('/requests/incoming', requireRole('helper'), requests.listForHelper);
router.post('/requests/:id/accept', requireRole('helper'), requests.accept);
router.post('/requests/:id/reject', requireRole('helper'), requests.reject);
router.post('/requests/:id/complete', requireRole('helper'), requests.complete);

// ---- Connections and chat ----
router.get('/connections', connections.list);
router.get('/chat/conversations', chat.conversations);
router.get('/chat/:userId', chat.history);
router.post('/chat/:userId', chat.send);

// ---- Announcements and leaderboard ----
router.get('/announcements/checkins/mine', challenges.myCheckins);
router.post('/announcements/:id/checkin', challenges.checkin);
router.get('/announcements', announcements.list);
router.post('/announcements', requireRole('helper'), announcements.create);
router.delete('/announcements/:id', requireRole('helper'), announcements.remove);
router.get('/leaderboard', leaderboard.list);

// ---- Campus benefits and demo QR redemptions ----
router.get('/benefits', benefits.list);
router.post('/benefits/:id/redeem', benefits.redeem);
router.get('/redemptions', benefits.myRedemptions);
router.post('/redemptions/validate', benefits.validate);
router.post('/redemptions/use', benefits.markUsed);
router.get('/redemptions/:redemptionId', benefits.getRedemption);

// ---- Notifications ----
router.get('/notifications', notifications.list);
router.post('/notifications/read-all', notifications.markAllRead);
router.post('/notifications/:id/read', notifications.markRead);

// ---- Help Sessions (meeting requests) ----
router.get('/sessions/meta', sessions.meta);
router.get('/sessions', sessions.list);
router.post('/sessions/requests', requireRole('seeker'), sessions.create);
router.post('/sessions/requests/:id/accept', sessions.accept);
router.post('/sessions/requests/:id/reject', sessions.reject);
router.post('/sessions/requests/:id/suggest', requireRole('helper'), sessions.suggest);
router.post('/sessions/requests/:id/cancel', sessions.cancel);

// ---- Help Rooms (private, one per accepted session; only the seeker and helper can open them) ----
router.get('/rooms/:code', rooms.get);
router.post('/rooms/:code/join', rooms.join);
router.post('/rooms/:code/leave', rooms.leave);
router.get('/rooms/:code/sync', rooms.sync);
router.post('/rooms/:code/chat', rooms.chat);
router.post('/rooms/:code/strokes', rooms.stroke);
router.post('/rooms/:code/clear', rooms.clear);
router.post('/rooms/:code/undo', rooms.undo);
router.put('/rooms/:code/notes', rooms.notes);
router.put('/rooms/:code/code', rooms.code);
router.post('/rooms/:code/signal', rooms.signal);
router.post('/rooms/:code/files', express.raw({ type: () => true, limit: MAX_FILE_BYTES + 1024 }), rooms.upload);
router.get('/rooms/:code/files/:fileId', rooms.download);
router.post('/rooms/:code/end', rooms.end);

// ---- Campus Challenges and streaks ----
router.get('/challenges', challenges.dashboard);
router.get('/challenges/summary', challenges.summary);
router.get('/challenges/leaderboard', challenges.leaderboard);
router.post('/challenges/complete', challenges.complete);

module.exports = router;
