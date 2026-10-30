import db from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';
import { ApiError } from './errors.js';

/** Attach req.user when a valid bearer token is present; never throws. */
export function attachUser(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) {
    try {
      const payload = verifyToken(token);
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
      if (row) req.user = row;
    } catch {
      // Expired or tampered token: treated as anonymous. requireAuth reports it.
    }
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  next();
}

/** Restrict a route to the listed roles. Admins pass every role check. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    next(new ApiError(403, `Requires one of these roles: ${roles.join(', ')}`));
  };
}

/** Load a space into req.space and assert the caller owns it (or is admin). */
export function requireSpaceOwner(req, _res, next) {
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.id);
  if (!space) return next(new ApiError(404, 'Space not found'));
  if (req.user.role !== 'admin' && space.owner_id !== req.user.id) {
    return next(new ApiError(403, 'You do not manage this space'));
  }
  req.space = space;
  next();
}
