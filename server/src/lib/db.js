import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || resolve(here, '../../data/app.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user'
                        CHECK (role IN ('user','owner','admin')),
  phone         TEXT,
  company       TEXT,
  team_size     INTEGER,
  work_style    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spaces (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,
  description          TEXT,
  city                 TEXT    NOT NULL,
  locality             TEXT,
  address              TEXT,
  workspace_type       TEXT    NOT NULL
                               CHECK (workspace_type IN
                                 ('private_cabin','shared_desk','dedicated_desk','meeting_room')),
  area_sqft            INTEGER NOT NULL,
  capacity             INTEGER NOT NULL,
  price_per_seat_month INTEGER NOT NULL,
  price_per_day        INTEGER,
  price_per_hour       INTEGER,
  rating               REAL    NOT NULL DEFAULT 0,
  review_count         INTEGER NOT NULL DEFAULT 0,
  image_url            TEXT,
  work_style           TEXT,
  opens_at             TEXT    DEFAULT '09:00',
  closes_at            TEXT    DEFAULT '21:00',
  status               TEXT    NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','active','suspended')),
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_spaces_city     ON spaces(city);
CREATE INDEX IF NOT EXISTS idx_spaces_status   ON spaces(status);
CREATE INDEX IF NOT EXISTS idx_spaces_owner    ON spaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_spaces_capacity ON spaces(capacity);
CREATE INDEX IF NOT EXISTS idx_spaces_price    ON spaces(price_per_seat_month);

CREATE TABLE IF NOT EXISTS amenities (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug     TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  icon     TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS space_amenities (
  space_id   INTEGER NOT NULL REFERENCES spaces(id)    ON DELETE CASCADE,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (space_id, amenity_id)
);

-- One row per space per day: the availability schedule that drives booking checks.
CREATE TABLE IF NOT EXISTS availability (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id        INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  date            TEXT    NOT NULL,
  seats_total     INTEGER NOT NULL,
  seats_booked    INTEGER NOT NULL DEFAULT 0,
  is_blocked      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (space_id, date)
);
CREATE INDEX IF NOT EXISTS idx_avail_space_date ON availability(space_id, date);

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,
  space_id    INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  start_date  TEXT    NOT NULL,
  end_date    TEXT    NOT NULL,
  seats       INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','rejected','cancelled','completed')),
  notes       TEXT,
  decline_reason TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  decided_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_user  ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_space ON bookings(space_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE TABLE IF NOT EXISTS inquiries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id     INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  subject      TEXT    NOT NULL,
  message      TEXT    NOT NULL,
  team_size    INTEGER,
  work_style   TEXT,
  expectations TEXT,
  wants_meeting INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','responded','closed')),
  reply        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  replied_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_inquiries_space ON inquiries(space_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_user  ON inquiries(user_id);

-- Outbox for the email/SMS notification layer. Rows are the audit trail.
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  channel    TEXT    NOT NULL CHECK (channel IN ('email','sms')),
  recipient  TEXT    NOT NULL,
  subject    TEXT,
  body       TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','queued')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- Real-time occupancy telemetry: one row per sensor tick per space.
CREATE TABLE IF NOT EXISTS occupancy_readings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id       INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  seats_occupied INTEGER NOT NULL,
  seats_total    INTEGER NOT NULL,
  source         TEXT    NOT NULL DEFAULT 'sensor',
  recorded_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_occupancy_space_time
  ON occupancy_readings(space_id, recorded_at DESC);
`);

export default db;
