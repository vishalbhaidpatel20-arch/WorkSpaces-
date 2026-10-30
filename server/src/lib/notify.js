import db from './db.js';

/**
 * Notification layer for booking/inquiry events.
 *
 * Every message is persisted to the `notifications` table, which doubles as the
 * in-app notification feed and the delivery audit trail. Actual transport is
 * pluggable: set SMTP_* / SMS_* env vars in production and swap `deliver()` for
 * a real provider call. With no provider configured the message is logged, so
 * the full workflow stays testable offline.
 */
const PROVIDER_CONFIGURED = Boolean(process.env.SMTP_URL || process.env.SMS_API_KEY);

function deliver(channel, recipient, subject, body) {
  if (!PROVIDER_CONFIGURED) {
    console.log(`[notify:${channel}] -> ${recipient} :: ${subject || body.slice(0, 60)}`);
    return 'sent';
  }
  // Production: hand off to SMTP / SMS provider here.
  return 'queued';
}

const insert = () =>
  db.prepare(`INSERT INTO notifications (user_id, channel, recipient, subject, body, status)
              VALUES (?, ?, ?, ?, ?, ?)`);

export function notify({ user, channel = 'email', subject = '', body }) {
  if (!user) return null;
  const recipient = channel === 'sms' ? user.phone || '' : user.email;
  if (!recipient) return null;
  const status = deliver(channel, recipient, subject, body);
  const info = insert().run(user.id, channel, recipient, subject, body, status);
  return Number(info.lastInsertRowid);
}

/** Send the same message over every channel the user can receive. */
export function notifyAll({ user, subject, body }) {
  const sent = [];
  const email = notify({ user, channel: 'email', subject, body });
  if (email) sent.push(email);
  if (user?.phone) {
    const sms = notify({ user, channel: 'sms', subject, body });
    if (sms) sent.push(sms);
  }
  return sent;
}

export function listNotifications(userId, limit = 50) {
  return db
    .prepare(`SELECT * FROM notifications WHERE user_id = ?
              ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(userId, limit);
}
