import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/errors.js';
import { listNotifications } from '../lib/notify.js';

const router = Router();

/** The signed-in user's own notification feed (email + SMS audit trail). */
router.get('/', requireAuth, validate(z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
}), 'query'), (req, res) => {
  res.json({ data: listNotifications(req.user.id, req.validQuery.limit) });
});

export default router;
