import { Router } from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { attachUser, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/errors.js';
import { searchSpaces, hydrateSpaces } from '../lib/spaces.js';
import { rankSpaces, scoreSpace, WEIGHTS } from '../lib/match.js';

const router = Router();

const WORKSPACE_TYPES = ['private_cabin', 'shared_desk', 'dedicated_desk', 'meeting_room'];
const WORK_STYLES = ['quiet_focus', 'collaborative', 'hybrid', 'client_facing'];

const criteriaSchema = z.object({
  persons: z.coerce.number().int().min(1).max(5000).optional(),
  area_required: z.coerce.number().int().min(1).max(1_000_000).optional(),
  budget: z.coerce.number().int().min(1).optional(),
  city: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(80).optional(),
  amenities: z.array(z.string()).optional(),
  workspace_type: z.enum(WORKSPACE_TYPES).optional(),
  work_style: z.enum(WORK_STYLES).optional(),
  available_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const toCriteria = (b) => ({
  persons: b.persons,
  areaRequired: b.area_required,
  budget: b.budget,
  city: b.city,
  locality: b.locality,
  amenities: b.amenities,
  workspaceType: b.workspace_type,
  workStyle: b.work_style,
});

/**
 * POST /api/match
 *
 * Unlike GET /api/spaces, matching deliberately does **not** hard-filter on
 * capacity, budget, area or amenities. A space that misses one criterion but
 * nails the rest is often the right answer, so every candidate is scored and
 * the shortfall is reported in `match.reasons` instead of hiding the space.
 */
router.post('/', attachUser, validate(criteriaSchema), (req, res) => {
  const b = req.body;
  const criteria = toCriteria(b);

  // Only genuinely disqualifying constraints narrow the candidate pool.
  const candidates = searchSpaces({
    city: b.city,
    availableOn: b.available_on,
    seats: b.persons,
  });

  const ranked = rankSpaces(hydrateSpaces(candidates), criteria);
  const results = ranked.slice(0, b.limit);

  res.json({
    data: results,
    meta: {
      candidates_considered: candidates.length,
      returned: results.length,
      criteria: Object.fromEntries(
        Object.entries(criteria).filter(([, v]) => v !== undefined && v !== null)
      ),
      weights: WEIGHTS,
      best_score: results[0]?.match.score ?? 0,
      // Average across returned results - the "match accuracy" KPI.
      average_score: results.length
        ? Math.round(results.reduce((s, r) => s + r.match.score, 0) / results.length)
        : 0,
    },
  });
});

/** Explain the score for one space against one set of criteria. */
router.post('/explain/:spaceId', validate(criteriaSchema), (req, res) => {
  const row = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.spaceId);
  if (!row) return res.status(404).json({ error: 'Space not found' });
  const [space] = hydrateSpaces([row]);
  res.json({
    data: {
      space_id: space.id,
      name: space.name,
      ...scoreSpace(space, toCriteria(req.body)),
      weights: WEIGHTS,
    },
  });
});

/**
 * GET /api/match/peers
 *
 * Expectation matching between teams: surfaces other members who share your
 * work style and sit in a comparable team-size band, with the cities they
 * actually book in. Contact details stay hidden; the owner introduces people.
 */
router.get('/peers', requireAuth, validate(z.object({
  city: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(8),
}), 'query'), (req, res) => {
  const { city, limit } = req.validQuery;
  const me = req.user;
  const myTeam = me.team_size ?? 1;

  const rows = db
    .prepare(`SELECT u.id, u.name, u.company, u.team_size, u.work_style,
                     COUNT(b.id) AS bookings,
                     GROUP_CONCAT(DISTINCT s.city) AS cities
              FROM users u
              LEFT JOIN bookings b ON b.user_id = u.id AND b.status IN ('confirmed','completed')
              LEFT JOIN spaces  s ON s.id = b.space_id
              WHERE u.id != ? AND u.role = 'user'
              GROUP BY u.id
              HAVING (? IS NULL OR cities LIKE '%' || ? || '%')`)
    .all(me.id, city ?? null, city ?? '');

  const peers = rows
    .map((r) => {
      // Same work style is the strongest signal; team size within 2x is close.
      const styleScore = r.work_style && me.work_style
        ? (r.work_style === me.work_style ? 1 : 0.3)
        : 0.5;
      const theirTeam = r.team_size ?? 1;
      const ratio = Math.min(myTeam, theirTeam) / Math.max(myTeam, theirTeam);
      const activity = Math.min(1, r.bookings / 3);
      const score = Math.round((styleScore * 55 + ratio * 30 + activity * 15));
      return {
        id: r.id,
        name: r.name,
        company: r.company,
        team_size: r.team_size,
        work_style: r.work_style,
        bookings: r.bookings,
        cities: r.cities ? r.cities.split(',') : [],
        affinity_score: score,
        shared: [
          r.work_style === me.work_style ? `Same work style (${r.work_style})` : null,
          ratio >= 0.5 ? `Similar team size (${theirTeam} vs your ${myTeam})` : null,
          r.bookings > 0 ? `${r.bookings} completed booking(s)` : null,
        ].filter(Boolean),
      };
    })
    .sort((a, b) => b.affinity_score - a.affinity_score)
    .slice(0, limit);

  res.json({ data: peers, meta: { your_work_style: me.work_style, your_team_size: me.team_size } });
});

export default router;
