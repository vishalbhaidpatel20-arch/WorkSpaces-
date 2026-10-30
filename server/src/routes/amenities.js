import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ApiError, validate } from '../middleware/errors.js';

const router = Router();

/** Amenity catalogue, with how many active spaces offer each one. */
router.get('/', (_req, res) => {
  const data = db
    .prepare(`SELECT a.id, a.slug, a.name, a.icon, a.category,
                     COUNT(sa.space_id) AS space_count
              FROM amenities a
              LEFT JOIN space_amenities sa ON sa.amenity_id = a.id
              LEFT JOIN spaces s ON s.id = sa.space_id AND s.status = 'active'
              GROUP BY a.id
              ORDER BY a.category, a.name`)
    .all();
  res.json({ data });
});

const amenitySchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores').max(40),
  name: z.string().trim().min(2).max(60),
  icon: z.string().trim().max(10).optional(),
  category: z.enum(['connectivity', 'comfort', 'facilities', 'access', 'services']).optional(),
});

router.post('/', requireAuth, requireRole('admin'), validate(amenitySchema), (req, res) => {
  const { slug, name, icon, category } = req.body;
  if (db.prepare('SELECT id FROM amenities WHERE slug = ?').get(slug)) {
    throw new ApiError(409, `An amenity with slug "${slug}" already exists`);
  }
  const info = db
    .prepare('INSERT INTO amenities (slug, name, icon, category) VALUES (?,?,?,?)')
    .run(slug, name, icon ?? null, category ?? 'facilities');
  res.status(201).json({
    data: db.prepare('SELECT * FROM amenities WHERE id = ?').get(Number(info.lastInsertRowid)),
  });
});

router.patch('/:id', requireAuth, requireRole('admin'),
  validate(amenitySchema.partial()), (req, res) => {
    const entries = Object.entries(req.body);
    if (!entries.length) throw new ApiError(422, 'No fields to update');
    const found = db.prepare('SELECT id FROM amenities WHERE id = ?').get(req.params.id);
    if (!found) throw new ApiError(404, 'Amenity not found');

    db.prepare(`UPDATE amenities SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...entries.map(([, v]) => v), req.params.id);
    res.json({ data: db.prepare('SELECT * FROM amenities WHERE id = ?').get(req.params.id) });
  });

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const found = db.prepare('SELECT id FROM amenities WHERE id = ?').get(req.params.id);
  if (!found) throw new ApiError(404, 'Amenity not found');
  db.prepare('DELETE FROM amenities WHERE id = ?').run(req.params.id);
  res.json({ ok: true, message: 'Amenity deleted' });
});

export default router;
