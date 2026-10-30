import db from './db.js';

/* ---------------------------------------------------------------- dates --- */

export const today = () => new Date().toISOString().slice(0, 10);

/** Inclusive list of ISO dates from start to end. Capped to protect the API. */
export function datesBetween(start, end, max = 370) {
  const out = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && out.length < max) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ----------------------------------------------------------- hydration --- */

function amenitiesBySpace(ids) {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT sa.space_id, a.id, a.slug, a.name, a.icon, a.category
              FROM space_amenities sa
              JOIN amenities a ON a.id = sa.amenity_id
              WHERE sa.space_id IN (${placeholders})
              ORDER BY a.name`)
    .all(...ids);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.space_id)) map.set(r.space_id, []);
    map.get(r.space_id).push({
      id: r.id, slug: r.slug, name: r.name, icon: r.icon, category: r.category,
    });
  }
  return map;
}

function latestOccupancyBySpace(ids) {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT o.space_id, o.seats_occupied, o.seats_total, o.recorded_at
              FROM occupancy_readings o
              JOIN (SELECT space_id, MAX(id) AS id FROM occupancy_readings
                    WHERE space_id IN (${placeholders}) GROUP BY space_id) latest
                ON latest.id = o.id`)
    .all(...ids);
  return new Map(rows.map((r) => [r.space_id, r]));
}

/**
 * Attach amenities, live occupancy and today's availability to each space row,
 * so a single list response carries everything the UI shows.
 */
export function hydrateSpaces(spaces, { date = today() } = {}) {
  if (!spaces.length) return [];
  const ids = spaces.map((s) => s.id);
  const placeholders = ids.map(() => '?').join(',');
  const amenityMap = amenitiesBySpace(ids);
  const occMap = latestOccupancyBySpace(ids);
  const availMap = new Map(
    db
      .prepare(`SELECT space_id, seats_total, seats_booked, is_blocked
                FROM availability
                WHERE date = ? AND space_id IN (${placeholders})`)
      .all(date, ...ids)
      .map((r) => [r.space_id, r])
  );

  return spaces.map((s) => {
    const avail = availMap.get(s.id);
    const occ = occMap.get(s.id);
    const seatsTotal = avail?.seats_total ?? s.capacity;
    const seatsFree = avail?.is_blocked ? 0 : seatsTotal - (avail?.seats_booked ?? 0);
    return {
      ...s,
      amenities: amenityMap.get(s.id) || [],
      availability_today: {
        date,
        seats_total: seatsTotal,
        seats_booked: avail?.seats_booked ?? 0,
        seats_available: Math.max(0, seatsFree),
        is_blocked: Boolean(avail?.is_blocked),
        status: seatsFree > 0 ? 'available' : 'full',
      },
      live_occupancy: occ
        ? {
            seats_occupied: occ.seats_occupied,
            seats_total: occ.seats_total,
            percent: Math.round((occ.seats_occupied / Math.max(1, occ.seats_total)) * 100),
            recorded_at: occ.recorded_at,
          }
        : null,
    };
  });
}

export function getSpace(id, { includeInactive = false } = {}) {
  const row = db.prepare('SELECT * FROM spaces WHERE id = ?').get(id);
  if (!row) return null;
  if (!includeInactive && row.status !== 'active') return null;
  const owner = db
    .prepare('SELECT id, name, email, phone, company FROM users WHERE id = ?')
    .get(row.owner_id);
  const [hydrated] = hydrateSpaces([row]);
  return { ...hydrated, owner };
}

/* -------------------------------------------------------------- search --- */

/**
 * Build and run the filtered space query. Filtering happens in SQL so the
 * result set stays small; match scoring then runs over those rows only.
 */
export function searchSpaces(f = {}) {
  const where = ['s.status = ?'];
  const params = [f.status || 'active'];

  if (f.city) { where.push('LOWER(s.city) = LOWER(?)'); params.push(f.city); }
  if (f.locality) { where.push('LOWER(s.locality) LIKE LOWER(?)'); params.push(`%${f.locality}%`); }
  if (f.workspaceType) { where.push('s.workspace_type = ?'); params.push(f.workspaceType); }
  if (f.minCapacity) { where.push('s.capacity >= ?'); params.push(f.minCapacity); }
  if (f.minArea) { where.push('s.area_sqft >= ?'); params.push(f.minArea); }
  if (f.maxPrice) { where.push('s.price_per_seat_month <= ?'); params.push(f.maxPrice); }
  if (f.minPrice) { where.push('s.price_per_seat_month >= ?'); params.push(f.minPrice); }
  if (f.minRating) { where.push('s.rating >= ?'); params.push(f.minRating); }
  if (f.ownerId) { where.push('s.owner_id = ?'); params.push(f.ownerId); }
  if (f.q) {
    where.push('(s.name LIKE ? OR s.description LIKE ? OR s.locality LIKE ? OR s.city LIKE ?)');
    const like = `%${f.q}%`;
    params.push(like, like, like, like);
  }

  // Amenities are an AND filter: a space must carry every requested slug.
  if (f.amenities?.length) {
    const slots = f.amenities.map(() => '?').join(',');
    where.push(`(SELECT COUNT(DISTINCT a.slug) FROM space_amenities sa
                 JOIN amenities a ON a.id = sa.amenity_id
                 WHERE sa.space_id = s.id AND a.slug IN (${slots})) = ?`);
    params.push(...f.amenities, f.amenities.length);
  }

  // "Available on a date" means at least the requested seats are free that day.
  if (f.availableOn) {
    where.push(`NOT EXISTS (SELECT 1 FROM availability av
                 WHERE av.space_id = s.id AND av.date = ?
                   AND (av.is_blocked = 1 OR (av.seats_total - av.seats_booked) < ?))`);
    params.push(f.availableOn, f.seats || 1);
  }

  const sortSql = {
    price_asc: 's.price_per_seat_month ASC',
    price_desc: 's.price_per_seat_month DESC',
    rating: 's.rating DESC',
    capacity: 's.capacity DESC',
    area: 's.area_sqft DESC',
    newest: 's.created_at DESC',
  }[f.sort] || 's.rating DESC';

  const sql = `SELECT s.* FROM spaces s WHERE ${where.join(' AND ')} ORDER BY ${sortSql}`;
  return db.prepare(sql).all(...params);
}

export function listCities() {
  return db
    .prepare(`SELECT city, COUNT(*) AS space_count FROM spaces
              WHERE status = 'active' GROUP BY city ORDER BY space_count DESC, city`)
    .all();
}

/* -------------------------------------------------------- availability --- */

/** Create missing availability rows for a date range, defaulting to capacity. */
export function ensureAvailability(spaceId, dates, seatsTotal) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO availability (space_id, date, seats_total, seats_booked)
     VALUES (?, ?, ?, 0)`
  );
  for (const date of dates) insert.run(spaceId, date, seatsTotal);
}

export function availabilityRange(spaceId, start, end) {
  const space = db.prepare('SELECT capacity FROM spaces WHERE id = ?').get(spaceId);
  if (!space) return [];
  ensureAvailability(spaceId, datesBetween(start, end), space.capacity);
  return db
    .prepare(`SELECT date, seats_total, seats_booked, is_blocked,
                     (seats_total - seats_booked) AS seats_available
              FROM availability
              WHERE space_id = ? AND date BETWEEN ? AND ?
              ORDER BY date`)
    .all(spaceId, start, end)
    .map((r) => ({
      ...r,
      is_blocked: Boolean(r.is_blocked),
      seats_available: r.is_blocked ? 0 : Math.max(0, r.seats_available),
      status: r.is_blocked ? 'blocked' : r.seats_available > 0 ? 'available' : 'full',
    }));
}

/**
 * Smallest number of seats free on any day in the range - the true bookable
 * quantity for a multi-day request.
 */
export function seatsAvailableAcross(spaceId, start, end) {
  const rows = availabilityRange(spaceId, start, end);
  if (!rows.length) return 0;
  return rows.reduce((min, r) => Math.min(min, r.seats_available), Infinity);
}

/** Move seats in or out of the booked count across a date range. */
export function adjustBookedSeats(spaceId, start, end, delta) {
  const space = db.prepare('SELECT capacity FROM spaces WHERE id = ?').get(spaceId);
  if (!space) return;
  const dates = datesBetween(start, end);
  ensureAvailability(spaceId, dates, space.capacity);
  const update = db.prepare(
    `UPDATE availability
     SET seats_booked = MAX(0, MIN(seats_total, seats_booked + ?))
     WHERE space_id = ? AND date = ?`
  );
  for (const date of dates) update.run(delta, spaceId, date);
}
