import db from './lib/db.js';
import { today } from './lib/spaces.js';

/**
 * Real-time monitoring layer.
 *
 * Two kinds of events go out over Socket.IO:
 *   - `occupancy`   : live seat-occupancy telemetry per space (sensor feed)
 *   - `availability`: bookable-seat changes, pushed when a booking moves
 *
 * Clients join the `space:<id>` room for one space, or `monitor` for the
 * platform-wide feed used by the owner and admin dashboards.
 */

let io = null;

export function initRealtime(server, options = {}) {
  io = server;

  io.on('connection', (socket) => {
    socket.on('watch:space', (spaceId) => {
      const id = Number(spaceId);
      if (Number.isInteger(id)) socket.join(`space:${id}`);
    });
    socket.on('unwatch:space', (spaceId) => {
      socket.leave(`space:${Number(spaceId)}`);
    });
    socket.on('watch:monitor', () => socket.join('monitor'));

    socket.emit('hello', { ok: true, at: new Date().toISOString() });
  });

  if (options.simulate !== false) startOccupancySimulator();
  return io;
}

export function emitOccupancy(reading) {
  if (!io) return;
  io.to(`space:${reading.space_id}`).emit('occupancy', reading);
  io.to('monitor').emit('occupancy', reading);
}

export function emitAvailability(spaceId, payload) {
  if (!io) return;
  const event = { space_id: spaceId, ...payload, at: new Date().toISOString() };
  io.to(`space:${spaceId}`).emit('availability', event);
  io.to('monitor').emit('availability', event);
}

export function emitBookingEvent(booking) {
  if (!io) return;
  io.to(`space:${booking.space_id}`).emit('booking', booking);
  io.to('monitor').emit('booking', booking);
}

/* ------------------------------------------------------------- sensors --- */

/**
 * Expected share of seats in use at a given hour, modelling a normal office
 * day: quiet early, busy mid-morning and mid-afternoon, dipping over lunch.
 */
function expectedLoad(hour) {
  if (hour < 7 || hour >= 22) return 0.02;
  const curve = {
    7: 0.1, 8: 0.25, 9: 0.5, 10: 0.72, 11: 0.85, 12: 0.78,
    13: 0.62, 14: 0.8, 15: 0.88, 16: 0.82, 17: 0.68,
    18: 0.45, 19: 0.3, 20: 0.18, 21: 0.08,
  };
  return curve[hour] ?? 0.4;
}

/**
 * Produce one reading per active space and persist it. In a real deployment
 * this is replaced by door-sensor / Wi-Fi-association webhooks posting to
 * POST /api/spaces/:id/occupancy, which emits the same event.
 */
export function tickOccupancy() {
  const spaces = db
    .prepare(`SELECT id, capacity FROM spaces WHERE status = 'active'`)
    .all();
  if (!spaces.length) return [];

  const date = today();
  const hour = new Date().getHours();
  const base = expectedLoad(hour);

  const booked = new Map(
    db
      .prepare('SELECT space_id, seats_booked FROM availability WHERE date = ?')
      .all(date)
      .map((r) => [r.space_id, r.seats_booked])
  );

  const insert = db.prepare(
    `INSERT INTO occupancy_readings (space_id, seats_occupied, seats_total, source)
     VALUES (?, ?, ?, 'sensor')`
  );

  const readings = [];
  for (const space of spaces) {
    // Confirmed bookings set the floor; the rest is walk-in style variation.
    const reserved = booked.get(space.id) ?? 0;
    const jitter = (Math.random() - 0.45) * 0.25;
    const target = Math.max(reserved * base, space.capacity * (base + jitter));
    const occupied = Math.max(0, Math.min(space.capacity, Math.round(target)));

    insert.run(space.id, occupied, space.capacity);
    const reading = {
      space_id: space.id,
      seats_occupied: occupied,
      seats_total: space.capacity,
      percent: Math.round((occupied / Math.max(1, space.capacity)) * 100),
      recorded_at: new Date().toISOString(),
      source: 'sensor',
    };
    readings.push(reading);
    emitOccupancy(reading);
  }
  return readings;
}

let timer = null;

export function startOccupancySimulator(intervalMs = Number(process.env.OCCUPANCY_INTERVAL_MS) || 15000) {
  if (timer) return timer;
  tickOccupancy();
  timer = setInterval(tickOccupancy, intervalMs);
  timer.unref?.();
  return timer;
}

export function stopOccupancySimulator() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Trim telemetry so the dev database does not grow without bound. */
export function pruneReadings(keepPerSpace = 500) {
  db.prepare(
    `DELETE FROM occupancy_readings WHERE id NOT IN (
       SELECT id FROM occupancy_readings o
       WHERE (SELECT COUNT(*) FROM occupancy_readings x
              WHERE x.space_id = o.space_id AND x.id >= o.id) <= ?
     )`
  ).run(keepPerSpace);
}
