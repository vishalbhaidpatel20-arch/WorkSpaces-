import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server as SocketServer } from 'socket.io';

import db, { closeDatabase } from './lib/db.js';
import { attachUser } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { initRealtime, stopOccupancySimulator } from './realtime.js';

import authRoutes from './routes/auth.js';
import spaceRoutes from './routes/spaces.js';
import bookingRoutes from './routes/bookings.js';
import inquiryRoutes from './routes/inquiries.js';
import matchRoutes from './routes/match.js';
import amenityRoutes from './routes/amenities.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';
const ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/* ------------------------------------------------- startup safety checks --- */

const DEFAULT_SECRET = 'dev-only-secret-change-me-in-production';

/**
 * Refuse to start a production process with a known-public signing key or a
 * wide-open CORS policy. Failing loudly at boot beats shipping a service whose
 * tokens anyone can forge.
 */
function assertProductionConfig() {
  if (!IS_PROD) return;
  const fatal = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_SECRET) {
    fatal.push(
      'JWT_SECRET is unset or still the development default. Generate one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    fatal.push('JWT_SECRET is shorter than 32 characters.');
  }
  if (ORIGINS.includes('*')) {
    fatal.push('CORS_ORIGIN must name real origins in production, never "*".');
  }

  if (fatal.length) {
    console.error('\nRefusing to start in production:\n');
    for (const line of fatal) console.error(`  - ${line}`);
    console.error('');
    process.exit(1);
  }

  if (process.env.OCCUPANCY_SIMULATION !== 'off') {
    // Not fatal, but publishing invented occupancy to real users is a product
    // problem, so it must not pass silently.
    console.warn(
      '[warn] The occupancy simulator is ON in production. It publishes ' +
      'fabricated readings. Set OCCUPANCY_SIMULATION=off unless this is a demo.'
    );
  }
}

assertProductionConfig();

/* ---------------------------------------------------------------- app --- */

const app = express();

// Required for correct client IPs (and therefore rate limiting) behind a proxy.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || (IS_PROD ? 1 : 0));
app.disable('x-powered-by');

app.use(helmet({
  // The SPA is served from a different origin in most deployments, and the API
  // returns JSON only, so a restrictive CSP here would buy nothing.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());

/**
 * In development any loopback origin is allowed, because the dev server hops
 * ports whenever one is busy (5173 -> 5174 -> …) and a fixed allowlist turns
 * that into a confusing 500 on the first POST. Production stays strict: only
 * the configured origins.
 */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function isAllowedOrigin(origin) {
  if (ORIGINS.includes(origin)) return true;
  return !IS_PROD && LOOPBACK.test(origin);
}

app.use(cors({
  origin(origin, callback) {
    // Same-origin and non-browser clients (curl, mobile, server-to-server)
    // send no Origin header; those are not the case CORS protects against.
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    // A blocked origin is a refusal, not a server fault - say so with a 403
    // rather than letting it surface as "Internal server error".
    const err = new Error(
      `Origin ${origin} is not allowed. Add it to CORS_ORIGIN.`
    );
    err.status = 403;
    callback(err);
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
if (!IS_PROD) app.use(morgan('dev'));

/* -------------------------------------------------------- rate limiting --- */

const limiterOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Keep the suite and local development usable; throttling is a production concern.
  skip: () => process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT === 'off',
};

/** Tight limit on credential endpoints: this is the brute-force surface. */
const authLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

/** Writes are cheap to issue and expensive to serve; cap them per IP. */
const writeLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 60 * 1000,
  limit: 30,
  message: { error: 'Too many requests. Slow down and try again shortly.' },
});

/** Backstop across the whole API. */
const globalLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 60 * 1000,
  limit: 300,
  message: { error: 'Too many requests.' },
});

app.use('/api', globalLimiter);
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/me/password'], authLimiter);
app.use(['/api/bookings', '/api/inquiries'], (req, res, next) =>
  (req.method === 'POST' ? writeLimiter(req, res, next) : next()));

// Every request gets req.user when a valid token is present.
app.use(attachUser);

/* -------------------------------------------------------------- routes --- */

app.get('/api/health', (_req, res) => {
  try {
    const { n: spaces } = db.prepare('SELECT COUNT(*) AS n FROM spaces').get();
    res.json({
      status: 'ok',
      service: 'workspace-api',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      spaces,
      uptime_seconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  } catch (err) {
    // A health check that cannot reach the database must not report "ok".
    res.status(503).json({ status: 'degraded', error: 'database unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/amenities', amenityRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

/*
 * Optional single-origin deployment: if the client has been built, serve it
 * from here so the SPA and the API share an origin and CORS never applies.
 * Unknown non-API paths fall through to index.html, so deep links survive a
 * refresh.
 */
const CLIENT_DIST = path.resolve(here, '../../client/dist');
if (existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST, { maxAge: IS_PROD ? '1y' : 0, index: false }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  console.log(`Serving built client from ${CLIENT_DIST}`);
}

app.use(notFound);
app.use(errorHandler);

/* -------------------------------------------------------------- server --- */

const server = http.createServer(app);
const io = new SocketServer(server, {
  // Same origin rule as the REST layer, so the live feed never fails on a
  // port the API would otherwise accept.
  cors: {
    origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
    credentials: true,
  },
});
initRealtime(io, { simulate: process.env.OCCUPANCY_SIMULATION !== 'off' });

server.listen(PORT, () => {
  console.log(`WorkSpace API listening on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Allowed origins: ${ORIGINS.join(', ')}`);
});

/* ---------------------------------------------------- graceful shutdown --- */

let shuttingDown = false;

/**
 * Stop accepting connections, let in-flight requests finish, then close the
 * database so WAL content is checkpointed. Without this a container restart can
 * cut a request mid-write.
 */
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down…`);

  stopOccupancySimulator();
  io.close();

  const forced = setTimeout(() => {
    console.error('Shutdown timed out after 10s, exiting.');
    closeDatabase();
    process.exit(1);
  }, 10_000);
  forced.unref();

  server.close(() => {
    closeDatabase();
    console.log('Closed cleanly.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  // An uncaught exception leaves the process in an unknown state: log and leave.
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});

export { app, server };
