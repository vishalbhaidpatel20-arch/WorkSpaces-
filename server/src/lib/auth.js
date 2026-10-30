import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const KEYLEN = 64;
const JWT_TTL = process.env.JWT_TTL || '7d';

export const JWT_SECRET =
  process.env.JWT_SECRET || 'dev-only-secret-change-me-in-production';

/** Hash a plaintext password as `salt:hash` using scrypt. */
export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/** Constant-time verification of a plaintext password against a stored hash. */
export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(plain, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Strip the password hash before a user record ever leaves the API. */
export function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return safe;
}

