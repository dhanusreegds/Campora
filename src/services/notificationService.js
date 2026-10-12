const { Notification, NoticeLog } = require('../models');

// Creates an in-app notification. Failures are logged but never break the main action.
async function notify(recipientId, { title, message, type = 'system', link = '', actionLabel = '', meta }) {
  try {
    return await Notification.create({ recipient: recipientId, title, message, type, link, actionLabel, meta });
  } catch (err) {
    console.error('Could not create notification:', err.message);
    return null;
  }
}

// Sends a notification only once per (user, key), so restarts and repeated checks never duplicate it.
async function notifyOnce(recipientId, key, payload) {
  try {
    await NoticeLog.create({ user: recipientId, key });
  } catch (err) {
    if (err.code === 11000) return null;
    console.error('Could not record notice:', err.message);
    return null;
  }
  return notify(recipientId, payload);
}

module.exports = { notify, notifyOnce };
