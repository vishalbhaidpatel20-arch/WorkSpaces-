import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { Server as SocketServer } from 'socket.io';

import db from './lib/db.js';
import { attachUser } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { initRealtime } from './realtime.js';

import authRoutes from './routes/auth.js';
import spaceRoutes from './routes/spaces.js';
import bookingRoutes from './routes/bookings.js';
import inquiryRoutes from './routes/inquiries.js';
import matchRoutes from './routes/match.js';
import amenityRoutes from './routes/amenities.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';

const PORT = Number(process.env.PORT) || 4000;
const ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const app = express();

app.use(cors({ origin: ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Every request gets req.user when a valid token is present.
app.use(attachUser);

app.get('/api/health', (_req, res) => {
  const { n: spaces } = db.prepare(`SELECT COUNT(*) AS n FROM spaces`).get();
  res.json({
    status: 'ok',
    service: 'flexospaces-api',
    version: '1.0.0',
    spaces,
    uptime_seconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
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

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: ORIGIN.split(',').map((o) => o.trim()), credentials: true },
});
initRealtime(io, { simulate: process.env.OCCUPANCY_SIMULATION !== 'off' });

server.listen(PORT, () => {
  console.log(`FlexoSpaces API listening on http://localhost:${PORT}`);
  console.log(`CORS origin: ${ORIGIN}`);
});

export { app, server };
