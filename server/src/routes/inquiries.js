import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError, validate } from '../middleware/errors.js';
import { notifyAll } from '../lib/notify.js';

const router = Router();

const INQUIRY_SELECT = `
  SELECT i.*, s.name AS space_name, s.city AS space_city, s.owner_id AS owner_id,
         u.name AS user_name, u.email AS user_email, u.company AS user_company
  FROM inquiries i
  JOIN spaces s ON s.id = i.space_id
  JOIN users  u ON u.id = i.user_id`;

const loadInquiry = (id) => db.prepare(`${INQUIRY_SELECT} WHERE i.id = ?`).get(id);

const createSchema = z.object({
  space_id: z.coerce.number().int().min(1),
  subject: z.string().trim().min(3).max(140),
  message: z.string().trim().min(10, 'Tell the owner a little more').max(2000),
  team_size: z.coerce.number().int().min(1).max(5000).optional(),
  work_style: z.enum(['quiet_focus', 'collaborative', 'hybrid', 'client_facing']).optional(),
  expectations: z.string().trim().max(1000).optional(),
  wants_meeting: z.boolean().default(false),
});

/**
 * POST /api/inquiries
 * The expectation-matching channel: a member states team size, work style and
 * expectations up front, so the owner can answer with the right details.
 */
router.post('/', requireAuth, validate(createSchema), (req, res) => {
  const b = req.body;
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(b.space_id);
  if (!space) throw new ApiError(404, 'Space not found');
  if (space.status !== 'active') throw new ApiError(409, 'This space is not accepting inquiries');

  const info = db
    .prepare(`INSERT INTO inquiries
      (space_id, user_id, subject, message, team_size, work_style, expectations, wants_meeting)
      VALUES (?,?,?,?,?,?,?,?)`)
    .run(b.space_id, req.user.id, b.subject, b.message,
         b.team_size ?? req.user.team_size ?? null,
         b.work_style ?? req.user.work_style ?? null,
         b.expectations ?? null, b.wants_meeting ? 1 : 0);

  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(space.owner_id);
  notifyAll({
    user: owner,
    subject: `New inquiry: ${b.subject}`,
    body: `${req.user.name}${req.user.company ? ` (${req.user.company})` : ''} asked about ${space.name}.${b.wants_meeting ? ' They would like to schedule a meeting.' : ''}`,
  });

  res.status(201).json({
    data: loadInquiry(Number(info.lastInsertRowid)),
    message: 'Inquiry sent to the space owner',
  });
});

const listSchema = z.object({
  scope: z.enum(['mine', 'owned', 'all']).default('mine'),
  status: z.enum(['open', 'responded', 'closed']).optional(),
});

router.get('/', requireAuth, validate(listSchema, 'query'), (req, res) => {
  const { scope, status } = req.validQuery;
  const where = [];
  const params = [];

  if (scope === 'all') {
    if (req.user.role !== 'admin') throw new ApiError(403, 'Only admins can list all inquiries');
  } else if (scope === 'owned') {
    if (!['owner', 'admin'].includes(req.user.role)) {
      throw new ApiError(403, 'Only space owners can list inquiries for their spaces');
    }
    where.push('s.owner_id = ?');
    params.push(req.user.id);
  } else {
    where.push('i.user_id = ?');
    params.push(req.user.id);
  }
  if (status) { where.push('i.status = ?'); params.push(status); }

  const sql = `${INQUIRY_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY i.created_at DESC, i.id DESC`;
  res.json({ data: db.prepare(sql).all(...params) });
});

router.get('/:id', requireAuth, (req, res) => {
  const inquiry = loadInquiry(Number(req.params.id));
  if (!inquiry) throw new ApiError(404, 'Inquiry not found');
  if (inquiry.user_id !== req.user.id && inquiry.owner_id !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'You cannot view this inquiry');
  }
  res.json({ data: inquiry });
});

router.post('/:id/reply', requireAuth,
  validate(z.object({ reply: z.string().trim().min(2).max(2000) })), (req, res) => {
    const inquiry = loadInquiry(Number(req.params.id));
    if (!inquiry) throw new ApiError(404, 'Inquiry not found');
    if (inquiry.owner_id !== req.user.id && req.user.role !== 'admin') {
      throw new ApiError(403, 'Only the space owner can reply to this inquiry');
    }
    if (inquiry.status === 'closed') throw new ApiError(409, 'This inquiry is closed');

    db.prepare(`UPDATE inquiries SET reply = ?, status = 'responded',
                replied_at = datetime('now') WHERE id = ?`)
      .run(req.body.reply, inquiry.id);

    const member = db.prepare('SELECT * FROM users WHERE id = ?').get(inquiry.user_id);
    notifyAll({
      user: member,
      subject: `Reply about ${inquiry.space_name}`,
      body: `${req.user.name} replied to your inquiry "${inquiry.subject}": ${req.body.reply.slice(0, 200)}`,
    });

    res.json({ data: loadInquiry(inquiry.id), message: 'Reply sent' });
  });

router.post('/:id/close', requireAuth, (req, res) => {
  const inquiry = loadInquiry(Number(req.params.id));
  if (!inquiry) throw new ApiError(404, 'Inquiry not found');
  if (inquiry.user_id !== req.user.id && inquiry.owner_id !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'You cannot close this inquiry');
  }
  db.prepare(`UPDATE inquiries SET status = 'closed' WHERE id = ?`).run(inquiry.id);
  res.json({ data: loadInquiry(inquiry.id), message: 'Inquiry closed' });
});

export default router;
