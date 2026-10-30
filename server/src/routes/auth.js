import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { hashPassword, verifyPassword, signToken, publicUser } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError, validate } from '../middleware/errors.js';
import { notify } from '../lib/notify.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  // Admins are provisioned by seed/migration, never through public signup.
  role: z.enum(['user', 'owner']).default('user'),
  phone: z.string().trim().max(20).optional(),
  company: z.string().trim().max(120).optional(),
  team_size: z.coerce.number().int().min(1).max(5000).optional(),
  work_style: z.enum(['quiet_focus', 'collaborative', 'hybrid', 'client_facing']).optional(),
});

router.post('/register', validate(registerSchema), (req, res) => {
  const { name, email, password, role, phone, company, team_size, work_style } = req.body;

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) throw new ApiError(409, 'An account with this email already exists');

  const info = db
    .prepare(`INSERT INTO users (name, email, password_hash, role, phone, company, team_size, work_style)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, email, hashPassword(password), role, phone ?? null, company ?? null,
         team_size ?? null, work_style ?? null);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));

  notify({
    user,
    subject: 'Welcome to WorkSpace',
    body: `Hi ${user.name}, your ${user.role === 'owner' ? 'space owner' : 'member'} account is ready.`,
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required'),
});

router.post('/login', validate(loginSchema), (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Same message either way, so the endpoint cannot be used to enumerate emails.
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new ApiError(401, 'Invalid email or password');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  team_size: z.coerce.number().int().min(1).max(5000).nullable().optional(),
  work_style: z.enum(['quiet_focus', 'collaborative', 'hybrid', 'client_facing']).nullable().optional(),
});

router.patch('/me', requireAuth, validate(profileSchema), (req, res) => {
  const fields = Object.entries(req.body);
  if (!fields.length) throw new ApiError(422, 'No fields to update');

  const sql = `UPDATE users SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...fields.map(([, v]) => v), req.user.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

router.post('/me/password', requireAuth, validate(passwordSchema), (req, res) => {
  if (!verifyPassword(req.body.current_password, req.user.password_hash)) {
    throw new ApiError(401, 'Current password is incorrect');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hashPassword(req.body.new_password), req.user.id);
  res.json({ ok: true, message: 'Password updated' });
});

export default router;
