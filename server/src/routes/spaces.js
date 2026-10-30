import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth, requireRole, requireSpaceOwner } from '../middleware/auth.js';
import { ApiError, validate } from '../middleware/errors.js';
import {
  searchSpaces, hydrateSpaces, getSpace, listCities,
  availabilityRange, datesBetween, ensureAvailability, today, addDays,
} from '../lib/spaces.js';
import { scoreSpace } from '../lib/match.js';
import { emitAvailability, emitOccupancy } from '../realtime.js';

const router = Router();

const WORKSPACE_TYPES = ['private_cabin', 'shared_desk', 'dedicated_desk', 'meeting_room'];
const WORK_STYLES = ['quiet_focus', 'collaborative', 'hybrid', 'client_facing'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD format');

/** Comma-separated query parameter to a trimmed array. */
const csv = z
  .string()
  .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean))
  .optional();

/* ------------------------------------------------------- search / list --- */

const searchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(80).optional(),
  persons: z.coerce.number().int().min(1).max(5000).optional(),
  area: z.coerce.number().int().min(1).max(1_000_000).optional(),
  budget: z.coerce.number().int().min(1).optional(),
  min_price: z.coerce.number().int().min(0).optional(),
  type: z.enum(WORKSPACE_TYPES).optional(),
  work_style: z.enum(WORK_STYLES).optional(),
  amenities: csv,
  min_rating: z.coerce.number().min(0).max(5).optional(),
  available_on: isoDate.optional(),
  seats: z.coerce.number().int().min(1).optional(),
  sort: z.enum(['match', 'price_asc', 'price_desc', 'rating', 'capacity', 'area', 'newest'])
         .default('match'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
});

/**
 * GET /api/spaces
 * Filter active spaces, then score each result against the same criteria so
 * every card can show its match percentage and the reasons behind it.
 */
router.get('/', validate(searchQuerySchema, 'query'), (req, res) => {
  const q = req.validQuery;

  const rows = searchSpaces({
    q: q.q,
    city: q.city,
    locality: q.locality,
    workspaceType: q.type,
    minCapacity: q.persons,
    minArea: q.area,
    maxPrice: q.budget,
    minPrice: q.min_price,
    minRating: q.min_rating,
    amenities: q.amenities,
    availableOn: q.available_on,
    seats: q.seats ?? q.persons,
    sort: q.sort === 'match' ? 'rating' : q.sort,
  });

  const criteria = {
    persons: q.persons,
    areaRequired: q.area,
    budget: q.budget,
    city: q.city,
    locality: q.locality,
    amenities: q.amenities,
    workspaceType: q.type,
    workStyle: q.work_style,
  };

  // Score every result, then order: match-first by default, otherwise keep the
  // ordering SQL already applied for the requested sort key.
  const scored = hydrateSpaces(rows).map((s) => ({ ...s, match: scoreSpace(s, criteria) }));
  const spaces = q.sort === 'match'
    ? scored.sort((a, b) => b.match.score - a.match.score || b.rating - a.rating)
    : scored;

  const total = spaces.length;
  const start = (q.page - 1) * q.limit;

  res.json({
    data: spaces.slice(start, start + q.limit),
    meta: {
      total,
      page: q.page,
      limit: q.limit,
      pages: Math.max(1, Math.ceil(total / q.limit)),
      sort: q.sort,
      criteria_applied: Object.fromEntries(
        Object.entries(criteria).filter(([, v]) => v !== undefined && v !== null)
      ),
    },
  });
});

router.get('/cities', (_req, res) => {
  res.json({ data: listCities() });
});

/** Filter bounds, so the UI can build sliders from real data. */
router.get('/filters', (_req, res) => {
  // Meeting rooms are priced by the hour and carry a monthly price of 0, so
  // they must not drag the "from" price shown on sliders and the home page.
  const stats = db
    .prepare(`SELECT MIN(NULLIF(price_per_seat_month, 0)) AS min_price,
                     MAX(price_per_seat_month) AS max_price,
                     MIN(capacity) AS min_capacity, MAX(capacity) AS max_capacity,
                     MIN(area_sqft) AS min_area,  MAX(area_sqft) AS max_area,
                     COUNT(*) AS total
              FROM spaces WHERE status = 'active'`)
    .get();
  res.json({
    data: {
      ...stats,
      cities: listCities(),
      workspace_types: WORKSPACE_TYPES,
      work_styles: WORK_STYLES,
      amenities: db.prepare('SELECT id, slug, name, icon, category FROM amenities ORDER BY name').all(),
    },
  });
});

router.get('/:id', (req, res) => {
  const includeInactive = req.user?.role === 'admin' ||
    (req.user && db.prepare('SELECT owner_id FROM spaces WHERE id = ?').get(req.params.id)?.owner_id === req.user.id);
  const space = getSpace(Number(req.params.id), { includeInactive });
  if (!space) throw new ApiError(404, 'Space not found');

  const horizon = addDays(today(), 30);
  res.json({
    data: {
      ...space,
      availability: availabilityRange(space.id, today(), horizon),
      recent_occupancy: db
        .prepare(`SELECT seats_occupied, seats_total, recorded_at FROM occupancy_readings
                  WHERE space_id = ? ORDER BY id DESC LIMIT 24`)
        .all(space.id)
        .reverse(),
    },
  });
});

/* ------------------------------------------------------------ owner CRUD --- */

const spaceSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  city: z.string().trim().min(2).max(80),
  locality: z.string().trim().max(80).optional(),
  address: z.string().trim().max(240).optional(),
  workspace_type: z.enum(WORKSPACE_TYPES),
  area_sqft: z.coerce.number().int().min(10).max(1_000_000),
  capacity: z.coerce.number().int().min(1).max(5000),
  price_per_seat_month: z.coerce.number().int().min(0),
  price_per_day: z.coerce.number().int().min(0).optional(),
  price_per_hour: z.coerce.number().int().min(0).optional(),
  image_url: z.string().trim().max(500).optional(),
  work_style: z.enum(WORK_STYLES).optional(),
  opens_at: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closes_at: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  amenities: z.array(z.string()).optional(),
});

function setAmenities(spaceId, slugs = []) {
  db.prepare('DELETE FROM space_amenities WHERE space_id = ?').run(spaceId);
  if (!slugs.length) return;
  const find = db.prepare('SELECT id FROM amenities WHERE slug = ?');
  const link = db.prepare(
    'INSERT OR IGNORE INTO space_amenities (space_id, amenity_id) VALUES (?, ?)'
  );
  for (const slug of slugs) {
    const amenity = find.get(slug);
    if (amenity) link.run(spaceId, amenity.id);
  }
}

router.post('/', requireAuth, requireRole('owner'), validate(spaceSchema), (req, res) => {
  const b = req.body;
  const info = db
    .prepare(`INSERT INTO spaces
      (owner_id, name, description, city, locality, address, workspace_type, area_sqft,
       capacity, price_per_seat_month, price_per_day, price_per_hour, image_url,
       work_style, opens_at, closes_at, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')`)
    .run(req.user.id, b.name, b.description ?? null, b.city, b.locality ?? null,
         b.address ?? null, b.workspace_type, b.area_sqft, b.capacity,
         b.price_per_seat_month, b.price_per_day ?? null, b.price_per_hour ?? null,
         b.image_url ?? null, b.work_style ?? null, b.opens_at ?? '09:00', b.closes_at ?? '21:00');

  const id = Number(info.lastInsertRowid);
  setAmenities(id, b.amenities);
  // Open a 90-day availability window so the space is bookable once approved.
  ensureAvailability(id, datesBetween(today(), addDays(today(), 90)), b.capacity);

  res.status(201).json({
    data: getSpace(id, { includeInactive: true }),
    message: 'Space created and submitted for admin approval',
  });
});

router.patch('/:id', requireAuth, requireRole('owner'), requireSpaceOwner,
  validate(spaceSchema.partial()), (req, res) => {
    const { amenities, ...fields } = req.body;
    const entries = Object.entries(fields);
    if (entries.length) {
      db.prepare(`UPDATE spaces SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...entries.map(([, v]) => v), req.space.id);
    }
    if (amenities) setAmenities(req.space.id, amenities);

    // Capacity changes must flow into future availability rows.
    if (fields.capacity) {
      db.prepare(`UPDATE availability SET seats_total = ?
                  WHERE space_id = ? AND date >= ?`)
        .run(fields.capacity, req.space.id, today());
      emitAvailability(req.space.id, { reason: 'capacity_changed', capacity: fields.capacity });
    }

    res.json({ data: getSpace(req.space.id, { includeInactive: true }) });
  });

router.delete('/:id', requireAuth, requireRole('owner'), requireSpaceOwner, (req, res) => {
  const active = db
    .prepare(`SELECT COUNT(*) AS n FROM bookings
              WHERE space_id = ? AND status IN ('pending','confirmed')`)
    .get(req.space.id).n;
  if (active > 0) {
    throw new ApiError(409, `Cannot delete: ${active} pending or confirmed booking(s) exist`);
  }
  db.prepare('DELETE FROM spaces WHERE id = ?').run(req.space.id);
  res.json({ ok: true, message: 'Space deleted' });
});

/* ----------------------------------------------------------- amenities --- */

router.put('/:id/amenities', requireAuth, requireRole('owner'), requireSpaceOwner,
  validate(z.object({ amenities: z.array(z.string()) })), (req, res) => {
    setAmenities(req.space.id, req.body.amenities);
    res.json({ data: getSpace(req.space.id, { includeInactive: true }).amenities });
  });

/* -------------------------------------------------------- availability --- */

const rangeSchema = z.object({
  start: isoDate.optional(),
  end: isoDate.optional(),
});

router.get('/:id/availability', validate(rangeSchema, 'query'), (req, res) => {
  const space = db.prepare('SELECT id FROM spaces WHERE id = ?').get(req.params.id);
  if (!space) throw new ApiError(404, 'Space not found');
  const start = req.validQuery.start || today();
  const end = req.validQuery.end || addDays(start, 30);
  if (end < start) throw new ApiError(422, 'end must not be before start');
  res.json({ data: availabilityRange(space.id, start, end) });
});

const availabilityUpdateSchema = z.object({
  start: isoDate,
  end: isoDate,
  seats_total: z.coerce.number().int().min(0).max(5000).optional(),
  is_blocked: z.boolean().optional(),
});

/** Owners block dates or change seat counts over a range (maintenance, events). */
router.put('/:id/availability', requireAuth, requireRole('owner'), requireSpaceOwner,
  validate(availabilityUpdateSchema), (req, res) => {
    const { start, end, seats_total, is_blocked } = req.body;
    if (end < start) throw new ApiError(422, 'end must not be before start');
    if (seats_total === undefined && is_blocked === undefined) {
      throw new ApiError(422, 'Provide seats_total, is_blocked, or both');
    }

    const dates = datesBetween(start, end);
    ensureAvailability(req.space.id, dates, req.space.capacity);

    const sets = [];
    const params = [];
    if (seats_total !== undefined) { sets.push('seats_total = ?'); params.push(seats_total); }
    if (is_blocked !== undefined) { sets.push('is_blocked = ?'); params.push(is_blocked ? 1 : 0); }

    db.prepare(`UPDATE availability SET ${sets.join(', ')}
                WHERE space_id = ? AND date BETWEEN ? AND ?`)
      .run(...params, req.space.id, start, end);

    emitAvailability(req.space.id, { reason: 'owner_update', start, end, seats_total, is_blocked });
    res.json({ data: availabilityRange(req.space.id, start, end) });
  });

/* ---------------------------------------------- real-time monitoring --- */

const occupancySchema = z.object({
  seats_occupied: z.coerce.number().int().min(0).max(5000),
  source: z.string().trim().max(40).default('sensor'),
});

/**
 * Occupancy ingest endpoint. Real sensors (door counters, Wi-Fi association
 * hooks, badge readers) POST here; the simulator writes the same rows.
 */
router.post('/:id/occupancy', requireAuth, requireRole('owner'), requireSpaceOwner,
  validate(occupancySchema), (req, res) => {
    const { seats_occupied, source } = req.body;
    if (seats_occupied > req.space.capacity) {
      throw new ApiError(422, `seats_occupied cannot exceed capacity (${req.space.capacity})`);
    }
    db.prepare(`INSERT INTO occupancy_readings (space_id, seats_occupied, seats_total, source)
                VALUES (?, ?, ?, ?)`)
      .run(req.space.id, seats_occupied, req.space.capacity, source);

    const reading = {
      space_id: req.space.id,
      seats_occupied,
      seats_total: req.space.capacity,
      percent: Math.round((seats_occupied / Math.max(1, req.space.capacity)) * 100),
      recorded_at: new Date().toISOString(),
      source,
    };
    emitOccupancy(reading);
    res.status(201).json({ data: reading });
  });

router.get('/:id/occupancy', validate(z.object({
  limit: z.coerce.number().int().min(1).max(500).default(60),
}), 'query'), (req, res) => {
  const space = db.prepare('SELECT id, capacity FROM spaces WHERE id = ?').get(req.params.id);
  if (!space) throw new ApiError(404, 'Space not found');

  const readings = db
    .prepare(`SELECT seats_occupied, seats_total, source, recorded_at
              FROM occupancy_readings WHERE space_id = ?
              ORDER BY id DESC LIMIT ?`)
    .all(space.id, req.validQuery.limit)
    .reverse()
    .map((r) => ({ ...r, percent: Math.round((r.seats_occupied / Math.max(1, r.seats_total)) * 100) }));

  const latest = readings.at(-1) || null;
  const avg = readings.length
    ? Math.round(readings.reduce((s, r) => s + r.percent, 0) / readings.length)
    : 0;

  res.json({ data: { space_id: space.id, latest, average_percent: avg, readings } });
});

export default router;
