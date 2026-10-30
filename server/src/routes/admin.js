import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ApiError, validate } from '../middleware/errors.js';
import { publicUser } from '../lib/auth.js';
import { notifyAll } from '../lib/notify.js';
import { datesBetween, ensureAvailability, today, addDays } from '../lib/spaces.js';
import { emitAvailability } from '../realtime.js';

const router = Router();

// Every route below is admin-only.
router.use(requireAuth, requireRole('admin'));

/* -------------------------------------------------------------- users --- */

router.get('/users', validate(z.object({
  role: z.enum(['user', 'owner', 'admin']).optional(),
  q: z.string().trim().max(80).optional(),
}), 'query'), (req, res) => {
  const { role, q } = req.validQuery;
  const where = [];
  const params = [];
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (q) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR u.company LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const rows = db
    .prepare(`SELECT u.id, u.name, u.email, u.role, u.phone, u.company, u.team_size,
                     u.work_style, u.created_at,
                     (SELECT COUNT(*) FROM spaces   WHERE owner_id = u.id) AS spaces_count,
                     (SELECT COUNT(*) FROM bookings WHERE user_id  = u.id) AS bookings_count
              FROM users u
              ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
              ORDER BY u.created_at DESC`)
    .all(...params);
  res.json({ data: rows });
});

router.patch('/users/:id/role', validate(z.object({
  role: z.enum(['user', 'owner', 'admin']),
})), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) throw new ApiError(404, 'User not found');
  if (target.id === req.user.id) throw new ApiError(409, 'You cannot change your own role');

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, target.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id);

  notifyAll({
    user: updated,
    subject: 'Your account role changed',
    body: `An administrator set your FlexoSpaces role to "${req.body.role}".`,
  });
  res.json({ data: publicUser(updated) });
});

router.delete('/users/:id', (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!target) throw new ApiError(404, 'User not found');
  if (target.id === req.user.id) throw new ApiError(409, 'You cannot delete your own account');
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true, message: 'User deleted' });
});

/* ------------------------------------------------- space moderation --- */

router.get('/spaces', validate(z.object({
  status: z.enum(['pending', 'active', 'suspended']).optional(),
}), 'query'), (req, res) => {
  const { status } = req.validQuery;
  const rows = db
    .prepare(`SELECT s.*, u.name AS owner_name, u.email AS owner_email,
                     (SELECT COUNT(*) FROM bookings WHERE space_id = s.id) AS bookings_count
              FROM spaces s JOIN users u ON u.id = s.owner_id
              ${status ? 'WHERE s.status = ?' : ''}
              ORDER BY s.created_at DESC`)
    .all(...(status ? [status] : []));
  res.json({ data: rows });
});

/** Approve a listing: it becomes visible and bookable. */
router.post('/spaces/:id/approve', (req, res) => {
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.id);
  if (!space) throw new ApiError(404, 'Space not found');
  if (space.status === 'active') throw new ApiError(409, 'This space is already active');

  db.prepare(`UPDATE spaces SET status = 'active' WHERE id = ?`).run(space.id);
  // Guarantee a bookable window exists from the moment it goes live.
  ensureAvailability(space.id, datesBetween(today(), addDays(today(), 90)), space.capacity);

  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(space.owner_id);
  notifyAll({
    user: owner,
    subject: `${space.name} is now live`,
    body: `Your listing "${space.name}" has been approved and is open for bookings.`,
  });

  emitAvailability(space.id, { reason: 'space_approved' });
  res.json({
    data: db.prepare('SELECT * FROM spaces WHERE id = ?').get(space.id),
    message: 'Space approved',
  });
});

router.post('/spaces/:id/suspend', validate(z.object({
  reason: z.string().trim().max(500).optional(),
})), (req, res) => {
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.id);
  if (!space) throw new ApiError(404, 'Space not found');

  db.prepare(`UPDATE spaces SET status = 'suspended' WHERE id = ?`).run(space.id);

  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(space.owner_id);
  notifyAll({
    user: owner,
    subject: `${space.name} has been suspended`,
    body: `Your listing "${space.name}" was suspended by an administrator.${req.body.reason ? ` Reason: ${req.body.reason}` : ''}`,
  });

  emitAvailability(space.id, { reason: 'space_suspended' });
  res.json({
    data: db.prepare('SELECT * FROM spaces WHERE id = ?').get(space.id),
    message: 'Space suspended',
  });
});

/* -------------------------------------------------------- maintenance --- */

/**
 * Close out stays whose end date has passed. In production this runs on a
 * schedule; exposing it keeps the lifecycle testable.
 */
router.post('/bookings/settle', (_req, res) => {
  const info = db
    .prepare(`UPDATE bookings SET status = 'completed'
              WHERE status = 'confirmed' AND end_date < ?`)
    .run(today());
  res.json({ ok: true, completed: info.changes });
});

router.get('/notifications', validate(z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
}), 'query'), (req, res) => {
  const rows = db
    .prepare(`SELECT n.*, u.name AS user_name FROM notifications n
              LEFT JOIN users u ON u.id = n.user_id
              ORDER BY n.created_at DESC, n.id DESC LIMIT ?`)
    .all(req.validQuery.limit);
  res.json({ data: rows });
});

export default router;
