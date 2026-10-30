import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import db, { transaction } from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError, validate } from '../middleware/errors.js';
import {
  seatsAvailableAcross, adjustBookedSeats, availabilityRange, datesBetween, today,
} from '../lib/spaces.js';
import { notifyAll } from '../lib/notify.js';
import { emitAvailability, emitBookingEvent } from '../realtime.js';

const router = Router();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');

const bookingCode = () => `WS-${randomBytes(3).toString('hex').toUpperCase()}`;

/**
 * Price a stay. Owners may publish a day rate; otherwise a 30-day month is
 * used to derive one from the monthly seat price.
 */
export function quotePrice(space, seats, days) {
  const dayRate = space.price_per_day ?? Math.round(space.price_per_seat_month / 30);
  if (days >= 28 && space.price_per_seat_month) {
    const months = days / 30;
    return Math.round(space.price_per_seat_month * seats * months);
  }
  return dayRate * seats * days;
}

/** Join the rows a booking response needs: space name, city, member contact. */
const BOOKING_SELECT = `
  SELECT b.*, s.name AS space_name, s.city AS space_city, s.image_url AS space_image,
         s.owner_id AS owner_id, s.workspace_type,
         u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
         u.company AS user_company
  FROM bookings b
  JOIN spaces s ON s.id = b.space_id
  JOIN users  u ON u.id = b.user_id`;

function loadBooking(id) {
  return db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(id);
}

/* ------------------------------------------------------------- create --- */

const createSchema = z.object({
  space_id: z.coerce.number().int().min(1),
  start_date: isoDate,
  end_date: isoDate,
  seats: z.coerce.number().int().min(1).max(5000),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/bookings
 * Creates a pending request and immediately holds the seats, so two members
 * cannot both be told the last desk is free while the owner decides.
 */
router.post('/', requireAuth, validate(createSchema), (req, res) => {
  const { space_id, start_date, end_date, seats, notes } = req.body;

  if (end_date < start_date) throw new ApiError(422, 'end_date must not be before start_date');
  if (start_date < today()) throw new ApiError(422, 'start_date cannot be in the past');

  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(space_id);
  if (!space) throw new ApiError(404, 'Space not found');
  if (space.status !== 'active') throw new ApiError(409, 'This space is not open for bookings');
  if (space.owner_id === req.user.id) throw new ApiError(409, 'You cannot book your own space');
  if (seats > space.capacity) {
    throw new ApiError(422, `This space seats at most ${space.capacity}`);
  }

  const days = datesBetween(start_date, end_date).length;
  const total = quotePrice(space, seats, days);

  /*
   * The seat check and the seat hold must be atomic. Without the transaction,
   * two requests for the last desk can both read "1 free" before either writes,
   * and the space is oversold. BEGIN IMMEDIATE makes the second caller wait.
   */
  const bookingId = transaction(() => {
    const free = seatsAvailableAcross(space_id, start_date, end_date);
    if (free < seats) {
      throw new ApiError(409, `Only ${Math.max(0, free)} seat(s) available for the whole of that period`, {
        seats_requested: seats,
        seats_available: Math.max(0, free),
      });
    }

    const info = db
      .prepare(`INSERT INTO bookings
        (code, space_id, user_id, start_date, end_date, seats, total_price, status, notes)
        VALUES (?,?,?,?,?,?,?,'pending',?)`)
      .run(bookingCode(), space_id, req.user.id, start_date, end_date, seats, total, notes ?? null);

    adjustBookedSeats(space_id, start_date, end_date, seats);
    return Number(info.lastInsertRowid);
  });

  const booking = loadBooking(bookingId);
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(space.owner_id);

  notifyAll({
    user: req.user,
    subject: `Booking request ${booking.code} received`,
    body: `Your request for ${seats} seat(s) at ${space.name} (${start_date} to ${end_date}) is awaiting owner approval. Total: Rs.${total}.`,
  });
  notifyAll({
    user: owner,
    subject: `New booking request ${booking.code}`,
    body: `${req.user.name} requested ${seats} seat(s) at ${space.name} from ${start_date} to ${end_date}. Review it in your dashboard.`,
  });

  emitAvailability(space_id, { reason: 'booking_requested', seats_held: seats, start: start_date, end: end_date });
  emitBookingEvent(booking);

  res.status(201).json({ data: booking, message: 'Booking request sent to the space owner' });
});

/** Price preview before committing - lets the UI show a total as dates change. */
const quoteSchema = createSchema.omit({ notes: true });

router.post('/quote', validate(quoteSchema), (req, res) => {
  const { space_id, start_date, end_date, seats } = req.body;
  if (end_date < start_date) throw new ApiError(422, 'end_date must not be before start_date');

  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(space_id);
  if (!space) throw new ApiError(404, 'Space not found');

  const days = datesBetween(start_date, end_date).length;
  const free = seatsAvailableAcross(space_id, start_date, end_date);

  res.json({
    data: {
      space_id, start_date, end_date, seats, days,
      seats_available: Math.max(0, free),
      bookable: free >= seats,
      total_price: quotePrice(space, seats, days),
      currency: 'INR',
    },
  });
});

/* --------------------------------------------------------------- read --- */

const listSchema = z.object({
  scope: z.enum(['mine', 'owned', 'all']).default('mine'),
  status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled', 'completed']).optional(),
  space_id: z.coerce.number().int().min(1).optional(),
});

router.get('/', requireAuth, validate(listSchema, 'query'), (req, res) => {
  const { scope, status, space_id } = req.validQuery;
  const where = [];
  const params = [];

  if (scope === 'all') {
    if (req.user.role !== 'admin') throw new ApiError(403, 'Only admins can list all bookings');
  } else if (scope === 'owned') {
    if (!['owner', 'admin'].includes(req.user.role)) {
      throw new ApiError(403, 'Only space owners can list bookings for their spaces');
    }
    where.push('s.owner_id = ?');
    params.push(req.user.id);
  } else {
    where.push('b.user_id = ?');
    params.push(req.user.id);
  }

  if (status) { where.push('b.status = ?'); params.push(status); }
  if (space_id) { where.push('b.space_id = ?'); params.push(space_id); }

  const sql = `${BOOKING_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY b.created_at DESC, b.id DESC`;

  res.json({ data: db.prepare(sql).all(...params) });
});

router.get('/:id', requireAuth, (req, res) => {
  const booking = loadBooking(Number(req.params.id));
  if (!booking) throw new ApiError(404, 'Booking not found');
  const mine = booking.user_id === req.user.id;
  const mySpace = booking.owner_id === req.user.id;
  if (!mine && !mySpace && req.user.role !== 'admin') {
    throw new ApiError(403, 'You cannot view this booking');
  }
  res.json({
    data: {
      ...booking,
      days: datesBetween(booking.start_date, booking.end_date).length,
      availability: mySpace || req.user.role === 'admin'
        ? availabilityRange(booking.space_id, booking.start_date, booking.end_date)
        : undefined,
    },
  });
});

/* ----------------------------------------------------- state transitions --- */

/** Guard a transition and return the booking, or throw with the reason. */
function forDecision(req, { owner = false } = {}) {
  const booking = loadBooking(Number(req.params.id));
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (owner && booking.owner_id !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only the space owner can decide this booking');
  }
  return booking;
}

router.post('/:id/confirm', requireAuth, (req, res) => {
  const booking = forDecision(req, { owner: true });
  if (booking.status !== 'pending') {
    throw new ApiError(409, `Cannot confirm a booking that is already ${booking.status}`);
  }

  // Conditional on status, so two concurrent confirms cannot both succeed.
  const changed = db
    .prepare(`UPDATE bookings SET status = 'confirmed', decided_at = datetime('now')
              WHERE id = ? AND status = 'pending'`)
    .run(booking.id).changes;
  if (!changed) throw new ApiError(409, 'This booking was already decided');

  const member = db.prepare('SELECT * FROM users WHERE id = ?').get(booking.user_id);
  notifyAll({
    user: member,
    subject: `Booking ${booking.code} confirmed`,
    body: `Your booking at ${booking.space_name} from ${booking.start_date} to ${booking.end_date} is confirmed. ${booking.seats} seat(s), total Rs.${booking.total_price}.`,
  });

  const updated = loadBooking(booking.id);
  emitBookingEvent(updated);
  res.json({ data: updated, message: 'Booking confirmed' });
});

router.post('/:id/reject', requireAuth,
  validate(z.object({ reason: z.string().trim().max(500).optional() })), (req, res) => {
    const booking = forDecision(req, { owner: true });
    if (booking.status !== 'pending') {
      throw new ApiError(409, `Cannot reject a booking that is already ${booking.status}`);
    }

    // Decide and release the seats atomically, and only if still pending, so a
    // double decline cannot release the same seats twice.
    transaction(() => {
      const changed = db
        .prepare(`UPDATE bookings SET status = 'rejected', decline_reason = ?,
                  decided_at = datetime('now') WHERE id = ? AND status = 'pending'`)
        .run(req.body.reason ?? null, booking.id).changes;
      if (!changed) throw new ApiError(409, 'This booking was already decided');
      adjustBookedSeats(booking.space_id, booking.start_date, booking.end_date, -booking.seats);
    });

    const member = db.prepare('SELECT * FROM users WHERE id = ?').get(booking.user_id);
    notifyAll({
      user: member,
      subject: `Booking ${booking.code} declined`,
      body: `Your request for ${booking.space_name} was declined.${req.body.reason ? ` Reason: ${req.body.reason}` : ''} Try a different date or space.`,
    });

    emitAvailability(booking.space_id, { reason: 'booking_rejected', seats_released: booking.seats });
    const updated = loadBooking(booking.id);
    emitBookingEvent(updated);
    res.json({ data: updated, message: 'Booking declined' });
  });

router.post('/:id/cancel', requireAuth, (req, res) => {
  const booking = forDecision(req);
  const isMember = booking.user_id === req.user.id;
  const isOwner = booking.owner_id === req.user.id;
  if (!isMember && !isOwner && req.user.role !== 'admin') {
    throw new ApiError(403, 'You cannot cancel this booking');
  }
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw new ApiError(409, `Cannot cancel a booking that is already ${booking.status}`);
  }

  // Same guard as decline: release the held seats exactly once.
  transaction(() => {
    const changed = db
      .prepare(`UPDATE bookings SET status = 'cancelled', decided_at = datetime('now')
                WHERE id = ? AND status IN ('pending','confirmed')`)
      .run(booking.id).changes;
    if (!changed) throw new ApiError(409, 'This booking was already closed');
    adjustBookedSeats(booking.space_id, booking.start_date, booking.end_date, -booking.seats);
  });

  const counterpartId = isMember ? booking.owner_id : booking.user_id;
  const counterpart = db.prepare('SELECT * FROM users WHERE id = ?').get(counterpartId);
  notifyAll({
    user: counterpart,
    subject: `Booking ${booking.code} cancelled`,
    body: `Booking ${booking.code} for ${booking.space_name} (${booking.start_date} to ${booking.end_date}) was cancelled by the ${isMember ? 'member' : 'space owner'}.`,
  });

  emitAvailability(booking.space_id, { reason: 'booking_cancelled', seats_released: booking.seats });
  const updated = loadBooking(booking.id);
  emitBookingEvent(updated);
  res.json({ data: updated, message: 'Booking cancelled' });
});

export default router;
