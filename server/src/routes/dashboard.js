import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listNotifications } from '../lib/notify.js';
import { today, addDays } from '../lib/spaces.js';
import { refreshIfStale } from '../realtime.js';

const router = Router();

const one = (sql, ...params) => db.prepare(sql).get(...params);
const many = (sql, ...params) => db.prepare(sql).all(...params);

/* ------------------------------------------------------------ member --- */

router.get('/user', requireAuth, (req, res) => {
  const uid = req.user.id;

  const counts = one(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'pending')   AS pending,
       SUM(status = 'confirmed') AS confirmed,
       SUM(status = 'cancelled') AS cancelled,
       SUM(status = 'completed') AS completed,
       COALESCE(SUM(CASE WHEN status IN ('confirmed','completed') THEN total_price END), 0) AS spend
     FROM bookings WHERE user_id = ?`, uid);

  res.json({
    data: {
      stats: {
        bookings_total: counts.total ?? 0,
        bookings_pending: counts.pending ?? 0,
        bookings_confirmed: counts.confirmed ?? 0,
        bookings_cancelled: counts.cancelled ?? 0,
        bookings_completed: counts.completed ?? 0,
        total_spend: counts.spend ?? 0,
        open_inquiries: one(
          `SELECT COUNT(*) AS n FROM inquiries WHERE user_id = ? AND status != 'closed'`, uid).n,
      },
      upcoming: many(
        `SELECT b.*, s.name AS space_name, s.city AS space_city, s.image_url AS space_image
         FROM bookings b JOIN spaces s ON s.id = b.space_id
         WHERE b.user_id = ? AND b.status IN ('pending','confirmed') AND b.end_date >= ?
         ORDER BY b.start_date LIMIT 5`, uid, today()),
      recent_inquiries: many(
        `SELECT i.*, s.name AS space_name FROM inquiries i
         JOIN spaces s ON s.id = i.space_id
         WHERE i.user_id = ? ORDER BY i.created_at DESC LIMIT 5`, uid),
      notifications: listNotifications(uid, 10),
    },
  });
});

/* ------------------------------------------------------------- owner --- */

router.get('/owner', requireAuth, requireRole('owner'), (req, res) => {
  refreshIfStale();
  const uid = req.user.id;
  const day = today();

  const spaces = many(
    `SELECT id, name, city, capacity, status, price_per_seat_month, image_url
     FROM spaces WHERE owner_id = ? ORDER BY created_at DESC`, uid);
  const spaceIds = spaces.map((s) => s.id);
  const slots = spaceIds.length ? spaceIds.map(() => '?').join(',') : 'NULL';

  const revenue = one(
    `SELECT COALESCE(SUM(b.total_price), 0) AS total
     FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE s.owner_id = ? AND b.status IN ('confirmed','completed')`, uid).total;

  const bookingCounts = one(
    `SELECT COUNT(*) AS total,
            SUM(b.status = 'pending')   AS pending,
            SUM(b.status = 'confirmed') AS confirmed,
            SUM(b.status = 'rejected')  AS rejected
     FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE s.owner_id = ?`, uid);

  // Today's utilisation across every space this owner runs.
  const util = spaceIds.length
    ? one(`SELECT COALESCE(SUM(seats_booked), 0) AS booked,
                  COALESCE(SUM(seats_total), 0)  AS total
           FROM availability WHERE date = ? AND space_id IN (${slots})`, day, ...spaceIds)
    : { booked: 0, total: 0 };

  const live = spaceIds.length
    ? many(`SELECT o.space_id, o.seats_occupied, o.seats_total, o.recorded_at
            FROM occupancy_readings o
            JOIN (SELECT space_id, MAX(id) AS id FROM occupancy_readings
                  WHERE space_id IN (${slots}) GROUP BY space_id) l ON l.id = o.id`, ...spaceIds)
    : [];

  const liveBySpace = new Map(live.map((r) => [r.space_id, r]));

  res.json({
    data: {
      stats: {
        spaces_total: spaces.length,
        spaces_active: spaces.filter((s) => s.status === 'active').length,
        spaces_pending: spaces.filter((s) => s.status === 'pending').length,
        bookings_total: bookingCounts.total ?? 0,
        bookings_pending: bookingCounts.pending ?? 0,
        bookings_confirmed: bookingCounts.confirmed ?? 0,
        revenue_total: revenue,
        utilisation_percent: util.total
          ? Math.round((util.booked / util.total) * 100)
          : 0,
        open_inquiries: one(
          `SELECT COUNT(*) AS n FROM inquiries i JOIN spaces s ON s.id = i.space_id
           WHERE s.owner_id = ? AND i.status = 'open'`, uid).n,
      },
      spaces: spaces.map((s) => {
        const reading = liveBySpace.get(s.id);
        return {
          ...s,
          live_occupancy: reading
            ? {
                seats_occupied: reading.seats_occupied,
                seats_total: reading.seats_total,
                percent: Math.round((reading.seats_occupied / Math.max(1, reading.seats_total)) * 100),
                recorded_at: reading.recorded_at,
              }
            : null,
        };
      }),
      pending_bookings: many(
        `SELECT b.*, s.name AS space_name, u.name AS user_name, u.company AS user_company,
                u.email AS user_email
         FROM bookings b JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = b.user_id
         WHERE s.owner_id = ? AND b.status = 'pending'
         ORDER BY b.created_at`, uid),
      open_inquiries: many(
        `SELECT i.*, s.name AS space_name, u.name AS user_name, u.company AS user_company
         FROM inquiries i JOIN spaces s ON s.id = i.space_id JOIN users u ON u.id = i.user_id
         WHERE s.owner_id = ? AND i.status = 'open' ORDER BY i.created_at LIMIT 10`, uid),
      // Seven-day forward availability, for the owner's capacity view.
      upcoming_availability: spaceIds.length
        ? many(`SELECT date, SUM(seats_total) AS seats_total, SUM(seats_booked) AS seats_booked
                FROM availability
                WHERE space_id IN (${slots}) AND date BETWEEN ? AND ?
                GROUP BY date ORDER BY date`, ...spaceIds, day, addDays(day, 6))
        : [],
    },
  });
});

/* ------------------------------------------------------------- admin --- */

router.get('/admin', requireAuth, requireRole('admin'), (_req, res) => {
  refreshIfStale();
  const day = today();

  const users = one(
    `SELECT COUNT(*) AS total,
            SUM(role = 'user')  AS members,
            SUM(role = 'owner') AS owners,
            SUM(role = 'admin') AS admins
     FROM users`);

  const bookings = one(
    `SELECT COUNT(*) AS total,
            SUM(status = 'pending')   AS pending,
            SUM(status = 'confirmed') AS confirmed,
            SUM(status = 'rejected')  AS rejected,
            SUM(status = 'cancelled') AS cancelled,
            SUM(status = 'completed') AS completed,
            COALESCE(SUM(CASE WHEN status IN ('confirmed','completed')
                              THEN total_price END), 0) AS gmv
     FROM bookings`);

  const spaces = one(
    `SELECT COUNT(*) AS total,
            SUM(status = 'active')    AS active,
            SUM(status = 'pending')   AS pending,
            SUM(status = 'suspended') AS suspended,
            COALESCE(SUM(capacity), 0) AS seats
     FROM spaces`);

  const util = one(
    `SELECT COALESCE(SUM(seats_booked), 0) AS booked, COALESCE(SUM(seats_total), 0) AS total
     FROM availability WHERE date = ?`, day);

  const decided = (bookings.confirmed ?? 0) + (bookings.rejected ?? 0);

  res.json({
    data: {
      // The KPI set named in the project brief.
      kpis: {
        registered_users: users.total ?? 0,
        members: users.members ?? 0,
        space_owners: users.owners ?? 0,
        spaces_listed: spaces.total ?? 0,
        spaces_active: spaces.active ?? 0,
        spaces_awaiting_approval: spaces.pending ?? 0,
        total_seats: spaces.seats ?? 0,
        bookings_total: bookings.total ?? 0,
        bookings_pending: bookings.pending ?? 0,
        gross_booking_value: bookings.gmv ?? 0,
        // Of all decided requests, the share the owner approved.
        booking_completion_rate: decided
          ? Math.round(((bookings.confirmed ?? 0) / decided) * 100)
          : 0,
        cancellation_rate: bookings.total
          ? Math.round(((bookings.cancelled ?? 0) / bookings.total) * 100)
          : 0,
        occupancy_today_percent: util.total ? Math.round((util.booked / util.total) * 100) : 0,
        open_inquiries: one(`SELECT COUNT(*) AS n FROM inquiries WHERE status = 'open'`).n,
        notifications_sent: one(`SELECT COUNT(*) AS n FROM notifications`).n,
      },
      bookings_by_status: [
        { status: 'pending', count: bookings.pending ?? 0 },
        { status: 'confirmed', count: bookings.confirmed ?? 0 },
        { status: 'rejected', count: bookings.rejected ?? 0 },
        { status: 'cancelled', count: bookings.cancelled ?? 0 },
        { status: 'completed', count: bookings.completed ?? 0 },
      ],
      bookings_by_city: many(
        `SELECT s.city, COUNT(b.id) AS bookings,
                COALESCE(SUM(CASE WHEN b.status IN ('confirmed','completed')
                                  THEN b.total_price END), 0) AS revenue
         FROM spaces s LEFT JOIN bookings b ON b.space_id = s.id
         GROUP BY s.city ORDER BY bookings DESC`),
      top_spaces: many(
        `SELECT s.id, s.name, s.city, s.rating, s.capacity,
                COUNT(b.id) AS bookings,
                COALESCE(SUM(CASE WHEN b.status IN ('confirmed','completed')
                                  THEN b.total_price END), 0) AS revenue
         FROM spaces s LEFT JOIN bookings b ON b.space_id = s.id
         WHERE s.status = 'active'
         GROUP BY s.id ORDER BY bookings DESC, s.rating DESC LIMIT 8`),
      pending_spaces: many(
        `SELECT s.*, u.name AS owner_name, u.email AS owner_email
         FROM spaces s JOIN users u ON u.id = s.owner_id
         WHERE s.status = 'pending' ORDER BY s.created_at`),
      recent_bookings: many(
        `SELECT b.id, b.code, b.status, b.seats, b.total_price, b.start_date, b.created_at,
                s.name AS space_name, s.city AS space_city, u.name AS user_name
         FROM bookings b JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = b.user_id
         ORDER BY b.created_at DESC, b.id DESC LIMIT 10`),
      // Platform-wide live occupancy: latest reading per active space.
      live_occupancy: many(
        `SELECT o.space_id, s.name AS space_name, s.city,
                o.seats_occupied, o.seats_total, o.recorded_at
         FROM occupancy_readings o
         JOIN (SELECT space_id, MAX(id) AS id FROM occupancy_readings GROUP BY space_id) l
           ON l.id = o.id
         JOIN spaces s ON s.id = o.space_id
         WHERE s.status = 'active'
         ORDER BY (CAST(o.seats_occupied AS REAL) / MAX(1, o.seats_total)) DESC`)
        .map((r) => ({
          ...r,
          percent: Math.round((r.seats_occupied / Math.max(1, r.seats_total)) * 100),
        })),
    },
  });
});

export default router;
