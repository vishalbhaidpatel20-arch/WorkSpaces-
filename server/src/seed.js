/**
 * Seeds a demo-ready database: amenities, users for all three roles, listings
 * across six cities, a 90-day availability window, bookings and inquiries in
 * every state, and a day of occupancy telemetry.
 *
 * Run with `npm run seed`. Pass --fresh to wipe existing rows first.
 */
import 'dotenv/config';
import db from './lib/db.js';
import { hashPassword } from './lib/auth.js';
import { datesBetween, ensureAvailability, today, addDays } from './lib/spaces.js';

const FRESH = process.argv.includes('--fresh');

if (FRESH) {
  for (const table of ['occupancy_readings', 'notifications', 'inquiries', 'bookings',
                       'availability', 'space_amenities', 'spaces', 'amenities', 'users']) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.exec(`DELETE FROM sqlite_sequence`);
  console.log('Cleared existing data');
}

/* ---------------------------------------------------------- amenities --- */

const AMENITIES = [
  ['wifi',           'High-Speed Wi-Fi',   '📶', 'connectivity'],
  ['power_backup',   'Power Backup',       '🔌', 'facilities'],
  ['meeting_rooms',  'Meeting Rooms',      '🗣️', 'facilities'],
  ['parking',        'Parking',            '🅿️', 'access'],
  ['cafeteria',      'Cafeteria',          '☕', 'comfort'],
  ['security',       '24x7 Security',      '🛡️', 'access'],
  ['air_con',        'Air Conditioning',   '❄️', 'comfort'],
  ['printing',       'Printing & Scanning','🖨️', 'services'],
  ['phone_booth',    'Phone Booths',       '📞', 'facilities'],
  ['lounge',         'Lounge Area',        '🛋️', 'comfort'],
  ['event_space',    'Event Space',        '🎤', 'facilities'],
  ['gym',            'Gym Access',         '🏋️', 'comfort'],
  ['pantry',         'Pantry',             '🍽️', 'comfort'],
  ['reception',      'Reception Desk',     '🛎️', 'services'],
  ['mail_handling',  'Mail Handling',      '📬', 'services'],
  ['wheelchair',     'Wheelchair Access',  '♿', 'access'],
  ['whiteboards',    'Whiteboards',        '📝', 'facilities'],
  ['day_access',     '24x7 Access',        '🕐', 'access'],
];

const insertAmenity = db.prepare(
  'INSERT OR IGNORE INTO amenities (slug, name, icon, category) VALUES (?,?,?,?)'
);
for (const a of AMENITIES) insertAmenity.run(...a);

const amenityIdBySlug = new Map(
  db.prepare('SELECT id, slug FROM amenities').all().map((r) => [r.slug, r.id])
);

/* -------------------------------------------------------------- users --- */

const USERS = [
  { name: 'Platform Admin',  email: 'admin@workspace.com',  role: 'admin',
    phone: '+91 98250 00001' },

  { name: 'Meera Shah',      email: 'meera@workloft.in',      role: 'owner',
    phone: '+91 98250 10001', company: 'WorkLoft Spaces' },
  { name: 'Rohan Iyer',      email: 'rohan@hivedesks.in',      role: 'owner',
    phone: '+91 98250 10002', company: 'Hive Desks' },
  { name: 'Kabir Malhotra',  email: 'kabir@nexushubs.in',      role: 'owner',
    phone: '+91 98250 10003', company: 'Nexus Hubs' },

  { name: 'Ananya Desai',    email: 'ananya@brightpixel.io',   role: 'user',
    phone: '+91 98250 20001', company: 'BrightPixel', team_size: 6,
    work_style: 'collaborative' },
  { name: 'Vikram Rao',      email: 'vikram@ledgerly.dev',     role: 'user',
    phone: '+91 98250 20002', company: 'Ledgerly', team_size: 14,
    work_style: 'quiet_focus' },
  { name: 'Priya Nair',      email: 'priya@freelance.dev',     role: 'user',
    phone: '+91 98250 20003', team_size: 1, work_style: 'hybrid' },
  { name: 'Arjun Mehta',     email: 'arjun@scalecraft.co',     role: 'user',
    phone: '+91 98250 20004', company: 'ScaleCraft', team_size: 25,
    work_style: 'client_facing' },
  { name: 'Sara Qureshi',    email: 'sara@designdock.in',      role: 'user',
    phone: '+91 98250 20005', company: 'DesignDock', team_size: 4,
    work_style: 'collaborative' },
];

const DEMO_PASSWORD = 'Password123';
const sharedHash = hashPassword(DEMO_PASSWORD);

const insertUser = db.prepare(
  `INSERT OR IGNORE INTO users (name, email, password_hash, role, phone, company, team_size, work_style)
   VALUES (?,?,?,?,?,?,?,?)`
);
for (const u of USERS) {
  insertUser.run(u.name, u.email, sharedHash, u.role, u.phone ?? null,
                 u.company ?? null, u.team_size ?? null, u.work_style ?? null);
}

const userIdByEmail = new Map(
  db.prepare('SELECT id, email FROM users').all().map((r) => [r.email, r.id])
);

/* ------------------------------------------------------------- spaces --- */

const img = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;

const SPACES = [
  {
    owner: 'meera@workloft.in', name: 'WorkLoft Prahladnagar',
    city: 'Ahmedabad', locality: 'Prahladnagar',
    address: '4th Floor, Titanium Square, Prahladnagar, Ahmedabad 380015',
    description: 'Bright loft-style floor above the Prahladnagar corporate strip. Ergonomic desks, two glass meeting rooms and a terrace cafeteria.',
    workspace_type: 'shared_desk', area_sqft: 4200, capacity: 68,
    price_per_seat_month: 6500, price_per_day: 350, price_per_hour: 80,
    rating: 4.6, review_count: 128, work_style: 'collaborative',
    image_url: img('1497366754035-f200968a6e72'),
    amenities: ['wifi', 'power_backup', 'meeting_rooms', 'cafeteria', 'air_con',
                'security', 'printing', 'parking', 'lounge', 'whiteboards'],
  },
  {
    owner: 'meera@workloft.in', name: 'WorkLoft Cabins - SG Highway',
    city: 'Ahmedabad', locality: 'SG Highway',
    address: 'Shapath V, SG Highway, Ahmedabad 380015',
    description: 'Lockable private cabins for 4-12 people with dedicated server cupboards and soundproofed walls. Suited to teams handling client data.',
    workspace_type: 'private_cabin', area_sqft: 2600, capacity: 36,
    price_per_seat_month: 11500, price_per_day: 650,
    rating: 4.8, review_count: 74, work_style: 'quiet_focus',
    image_url: img('1604328698692-f76ea9498e76'),
    amenities: ['wifi', 'power_backup', 'meeting_rooms', 'air_con', 'security',
                'parking', 'phone_booth', 'reception', 'day_access', 'mail_handling'],
  },
  {
    owner: 'rohan@hivedesks.in', name: 'Hive Desks Koramangala',
    city: 'Bengaluru', locality: 'Koramangala',
    address: '80 Feet Road, 4th Block, Koramangala, Bengaluru 560034',
    description: 'The original Hive floor in the middle of the startup belt. Open desks, standing-desk rows and a 60-seat event space downstairs.',
    workspace_type: 'shared_desk', area_sqft: 7800, capacity: 140,
    price_per_seat_month: 9500, price_per_day: 550, price_per_hour: 120,
    rating: 4.7, review_count: 412, work_style: 'collaborative',
    image_url: img('1521737604893-d14cc237f11d'),
    amenities: ['wifi', 'power_backup', 'meeting_rooms', 'cafeteria', 'air_con',
                'security', 'printing', 'event_space', 'lounge', 'gym',
                'phone_booth', 'day_access', 'wheelchair'],
  },
  {
    owner: 'rohan@hivedesks.in', name: 'Hive Quiet Floor Indiranagar',
    city: 'Bengaluru', locality: 'Indiranagar',
    address: '12th Main, Indiranagar, Bengaluru 560038',
    description: 'A deliberately silent floor: no calls at desks, four phone booths, library lighting. Built for deep work.',
    workspace_type: 'dedicated_desk', area_sqft: 3100, capacity: 48,
    price_per_seat_month: 12000, price_per_day: 700,
    rating: 4.9, review_count: 96, work_style: 'quiet_focus',
    image_url: img('1497215728101-856f4ea42174'),
    amenities: ['wifi', 'power_backup', 'air_con', 'security', 'phone_booth',
                'pantry', 'printing', 'day_access', 'whiteboards'],
  },
  {
    owner: 'rohan@hivedesks.in', name: 'Hive Boardroom HSR',
    city: 'Bengaluru', locality: 'HSR Layout',
    address: 'Sector 2, HSR Layout, Bengaluru 560102',
    description: 'A single 14-seat boardroom with video-conference kit, bookable by the hour for client reviews and board meetings.',
    workspace_type: 'meeting_room', area_sqft: 520, capacity: 14,
    price_per_seat_month: 0, price_per_day: 7000, price_per_hour: 1200,
    rating: 4.5, review_count: 58, work_style: 'client_facing',
    image_url: img('1517502884422-41eaead166d4'),
    amenities: ['wifi', 'air_con', 'whiteboards', 'power_backup', 'reception',
                'parking', 'security'],
  },
  {
    owner: 'kabir@nexushubs.in', name: 'Nexus BKC Tower',
    city: 'Mumbai', locality: 'Bandra Kurla Complex',
    address: 'One BKC, G Block, Bandra Kurla Complex, Mumbai 400051',
    description: 'Grade-A tower floor in BKC with a staffed reception, nine meeting rooms and a client-facing lounge on the same level.',
    workspace_type: 'private_cabin', area_sqft: 9400, capacity: 180,
    price_per_seat_month: 19500, price_per_day: 1100,
    rating: 4.7, review_count: 265, work_style: 'client_facing',
    image_url: img('1486406146926-c627a92ad1ab'),
    amenities: ['wifi', 'power_backup', 'meeting_rooms', 'cafeteria', 'air_con',
                'security', 'printing', 'parking', 'reception', 'lounge',
                'mail_handling', 'wheelchair', 'day_access'],
  },
  {
    owner: 'kabir@nexushubs.in', name: 'Nexus Andheri Studio',
    city: 'Mumbai', locality: 'Andheri East',
    address: 'Chakala, Andheri East, Mumbai 400099',
    description: 'Converted studio floor near the metro, popular with media and design teams. Includes a shoot corner and editing bays.',
    workspace_type: 'shared_desk', area_sqft: 5200, capacity: 86,
    price_per_seat_month: 11000, price_per_day: 600, price_per_hour: 150,
    rating: 4.3, review_count: 147, work_style: 'collaborative',
    image_url: img('1524758631624-e2822e304c36'),
    amenities: ['wifi', 'power_backup', 'meeting_rooms', 'cafeteria', 'air_con',
                'security', 'event_space', 'lounge', 'printing'],
  },
  {
    owner: 'meera@workloft.in', name: 'WorkLoft Baner',
    city: 'Pune', locality: 'Baner',
    address: 'Baner Road, Pune 411045',
    description: 'Mid-sized floor with a mix of open desks and six cabins, five minutes from the Mumbai-Bangalore highway.',
    workspace_type: 'dedicated_desk', area_sqft: 3800, capacity: 62,
    price_per_seat_month: 7800, price_per_day: 420, price_per_hour: 100,
    rating: 4.4, review_count: 89, work_style: 'hybrid',
    image_url: img('1600585154340-be6161a56a0c'),
    amenities: ['wifi', 'power_backup', 'meeting_rooms', 'cafeteria', 'air_con',
                'parking', 'security', 'pantry', 'whiteboards'],
  },
  {
    owner: 'kabir@nexushubs.in', name: 'Nexus Kharadi Annexe',
    city: 'Pune', locality: 'Kharadi',
    address: 'EON Free Zone Road, Kharadi, Pune 411014',
    description: 'Compact annexe aimed at two-to-six person teams, inside the Kharadi IT corridor with shuttle access.',
    workspace_type: 'private_cabin', area_sqft: 1450, capacity: 22,
    price_per_seat_month: 9200, price_per_day: 500,
    rating: 4.2, review_count: 41, work_style: 'quiet_focus',
    image_url: img('1572025442646-866d16c84a54'),
    amenities: ['wifi', 'power_backup', 'air_con', 'security', 'parking',
                'pantry', 'reception'],
  },
  {
    owner: 'rohan@hivedesks.in', name: 'Hive HiTech City',
    city: 'Hyderabad', locality: 'HiTech City',
    address: 'Madhapur, HiTech City, Hyderabad 500081',
    description: 'Large campus floor with a 40-seat auditorium, gym access and a full-service canteen. Scales from 1 to 60 seats.',
    workspace_type: 'shared_desk', area_sqft: 8600, capacity: 155,
    price_per_seat_month: 8200, price_per_day: 450, price_per_hour: 110,
    rating: 4.6, review_count: 198, work_style: 'hybrid',
    image_url: img('1542744173-8e7e53415bb0'),
    amenities: ['wifi', 'power_backup', 'meeting_rooms', 'cafeteria', 'air_con',
                'security', 'printing', 'parking', 'gym', 'event_space',
                'lounge', 'wheelchair', 'day_access'],
  },
  {
    owner: 'kabir@nexushubs.in', name: 'Nexus Cyber Hub',
    city: 'Gurugram', locality: 'DLF Cyber City',
    address: 'Building 10, DLF Cyber City, Gurugram 122002',
    description: 'Enterprise-grade floor with dedicated bandwidth, badge access and nine bookable meeting rooms. Used by scaling sales teams.',
    workspace_type: 'private_cabin', area_sqft: 11200, capacity: 210,
    price_per_seat_month: 16500, price_per_day: 950,
    rating: 4.5, review_count: 221, work_style: 'client_facing',
    image_url: img('1556761175-5973dc0f32e7'),
    amenities: ['wifi', 'power_backup', 'meeting_rooms', 'cafeteria', 'air_con',
                'security', 'printing', 'parking', 'reception', 'mail_handling',
                'phone_booth', 'day_access', 'wheelchair'],
  },
  {
    owner: 'meera@workloft.in', name: 'WorkLoft Freelance Bar',
    city: 'Ahmedabad', locality: 'Navrangpura',
    address: 'CG Road, Navrangpura, Ahmedabad 380009',
    description: 'Pay-as-you-go hot desks on CG Road for freelancers and solo founders. Day passes, no lock-in.',
    workspace_type: 'shared_desk', area_sqft: 1100, capacity: 24,
    price_per_seat_month: 4200, price_per_day: 250, price_per_hour: 60,
    rating: 4.1, review_count: 63, work_style: 'hybrid',
    image_url: img('1559136555-9303baea8ebd'),
    amenities: ['wifi', 'power_backup', 'air_con', 'cafeteria', 'printing', 'lounge'],
  },
  // Left pending on purpose, so the admin approval queue is not empty.
  {
    owner: 'rohan@hivedesks.in', name: 'Hive Whitefield (new)',
    city: 'Bengaluru', locality: 'Whitefield',
    address: 'ITPL Main Road, Whitefield, Bengaluru 560066',
    description: 'New floor fitting out near ITPL. Submitted for review.',
    workspace_type: 'dedicated_desk', area_sqft: 4600, capacity: 74,
    price_per_seat_month: 8800, price_per_day: 480,
    rating: 0, review_count: 0, work_style: 'hybrid', status: 'pending',
    image_url: img('1604328727766-a151d1045ab4'),
    amenities: ['wifi', 'power_backup', 'air_con', 'security', 'parking', 'cafeteria'],
  },
];

const insertSpace = db.prepare(
  `INSERT INTO spaces
   (owner_id, name, description, city, locality, address, workspace_type, area_sqft,
    capacity, price_per_seat_month, price_per_day, price_per_hour, rating, review_count,
    image_url, work_style, status)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
);
const linkAmenity = db.prepare(
  'INSERT OR IGNORE INTO space_amenities (space_id, amenity_id) VALUES (?,?)'
);

const spaceIdByName = new Map();

for (const s of SPACES) {
  const existing = db.prepare('SELECT id FROM spaces WHERE name = ?').get(s.name);
  if (existing) { spaceIdByName.set(s.name, existing.id); continue; }

  const info = insertSpace.run(
    userIdByEmail.get(s.owner), s.name, s.description, s.city, s.locality, s.address,
    s.workspace_type, s.area_sqft, s.capacity, s.price_per_seat_month,
    s.price_per_day ?? null, s.price_per_hour ?? null, s.rating, s.review_count,
    s.image_url, s.work_style, s.status ?? 'active'
  );
  const id = Number(info.lastInsertRowid);
  spaceIdByName.set(s.name, id);

  for (const slug of s.amenities) {
    const amenityId = amenityIdBySlug.get(slug);
    if (amenityId) linkAmenity.run(id, amenityId);
  }

  // 90-day bookable window from today.
  ensureAvailability(id, datesBetween(today(), addDays(today(), 90)), s.capacity);
}

/* ----------------------------------------------------------- bookings --- */

const BOOKINGS = [
  { space: 'WorkLoft Prahladnagar',      user: 'ananya@brightpixel.io', offset: 3,  nights: 29, seats: 6,  status: 'confirmed' },
  { space: 'Hive Quiet Floor Indiranagar', user: 'vikram@ledgerly.dev', offset: 7,  nights: 29, seats: 14, status: 'confirmed' },
  { space: 'WorkLoft Freelance Bar',     user: 'priya@freelance.dev',   offset: 1,  nights: 4,  seats: 1,  status: 'confirmed' },
  { space: 'Nexus Cyber Hub',            user: 'arjun@scalecraft.co',   offset: 14, nights: 29, seats: 25, status: 'pending'   },
  { space: 'Hive Boardroom HSR',         user: 'sara@designdock.in',    offset: 2,  nights: 0,  seats: 10, status: 'pending'   },
  { space: 'Nexus Andheri Studio',       user: 'sara@designdock.in',    offset: 5,  nights: 9,  seats: 4,  status: 'confirmed' },
  { space: 'Hive HiTech City',           user: 'ananya@brightpixel.io', offset: 20, nights: 6,  seats: 6,  status: 'pending'   },
  { space: 'WorkLoft Cabins - SG Highway', user: 'vikram@ledgerly.dev', offset: 40, nights: 29, seats: 8,  status: 'pending'   },
  { space: 'WorkLoft Baner',             user: 'priya@freelance.dev',   offset: 9,  nights: 2,  seats: 1,  status: 'rejected'  },
  { space: 'Nexus BKC Tower',            user: 'arjun@scalecraft.co',   offset: 11, nights: 14, seats: 20, status: 'cancelled' },
];

const insertBooking = db.prepare(
  `INSERT INTO bookings
   (code, space_id, user_id, start_date, end_date, seats, total_price, status, notes, decided_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`
);
const bumpBooked = db.prepare(
  `UPDATE availability SET seats_booked = MIN(seats_total, seats_booked + ?)
   WHERE space_id = ? AND date = ?`
);

let seq = 0;
for (const b of BOOKINGS) {
  const spaceId = spaceIdByName.get(b.space);
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId);
  if (!space) continue;

  const start = addDays(today(), b.offset);
  const end = addDays(start, b.nights);
  const days = datesBetween(start, end).length;

  const dayRate = space.price_per_day ?? Math.round(space.price_per_seat_month / 30);
  const total = days >= 28 && space.price_per_seat_month
    ? Math.round(space.price_per_seat_month * b.seats * (days / 30))
    : dayRate * b.seats * days;

  const code = `WS-S${String(++seq).padStart(5, '0')}`;
  if (db.prepare('SELECT id FROM bookings WHERE code = ?').get(code)) continue;

  insertBooking.run(code, spaceId, userIdByEmail.get(b.user), start, end, b.seats, total,
                    b.status, null,
                    ['confirmed', 'rejected', 'cancelled'].includes(b.status)
                      ? new Date().toISOString() : null);

  // Only live holds consume seats; rejected and cancelled rows release them.
  if (['pending', 'confirmed'].includes(b.status)) {
    for (const date of datesBetween(start, end)) bumpBooked.run(b.seats, spaceId, date);
  }
}

/* ---------------------------------------------------------- inquiries --- */

const INQUIRIES = [
  {
    space: 'Nexus BKC Tower', user: 'arjun@scalecraft.co',
    subject: 'Space for a 25-person sales team from January',
    message: 'We need 25 seats with at least three bookable meeting rooms for client calls through the day. Can you hold a floor section for a 12-month term, and what is the notice period?',
    team_size: 25, work_style: 'client_facing', wants_meeting: 1,
    expectations: 'Dedicated badge access, guaranteed meeting-room hours, invoicing against a PO.',
    status: 'open',
  },
  {
    space: 'Hive Quiet Floor Indiranagar', user: 'vikram@ledgerly.dev',
    subject: 'Noise policy and compliance questions',
    message: 'Our team handles financial records, so we need to confirm the no-calls-at-desk policy is actually enforced and ask whether lockable storage is available per desk.',
    team_size: 14, work_style: 'quiet_focus', wants_meeting: 0,
    expectations: 'Enforced silence, lockable storage, a signed NDA with the operator.',
    status: 'responded',
    reply: 'The policy is enforced by floor staff and all calls move to one of our four booths. Every dedicated desk has a lockable under-desk unit, and we sign operator NDAs - happy to share our template.',
  },
  {
    space: 'WorkLoft Prahladnagar', user: 'sara@designdock.in',
    subject: 'Trial day for a 4-person design team',
    message: 'Could the four of us try the space for a day before committing to a month? We would like to sit together and test the Wi-Fi with large file uploads.',
    team_size: 4, work_style: 'collaborative', wants_meeting: 1,
    expectations: 'Seats together, upload speed above 40 Mbps, a whiteboard nearby.',
    status: 'open',
  },
  {
    space: 'WorkLoft Freelance Bar', user: 'priya@freelance.dev',
    subject: 'Weekend access for a solo desk',
    message: 'Is the Navrangpura floor open on Sundays? I work a weekend-heavy schedule and want to know before buying a pass.',
    team_size: 1, work_style: 'hybrid', wants_meeting: 0,
    status: 'responded',
    reply: 'We are open 10:00 to 19:00 on Sundays with reduced staffing. Day passes are valid any open day, including weekends.',
  },
];

const insertInquiry = db.prepare(
  `INSERT INTO inquiries
   (space_id, user_id, subject, message, team_size, work_style, expectations,
    wants_meeting, status, reply, replied_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`
);
for (const q of INQUIRIES) {
  const spaceId = spaceIdByName.get(q.space);
  if (!spaceId) continue;
  if (db.prepare('SELECT id FROM inquiries WHERE subject = ?').get(q.subject)) continue;
  insertInquiry.run(spaceId, userIdByEmail.get(q.user), q.subject, q.message,
                    q.team_size ?? null, q.work_style ?? null, q.expectations ?? null,
                    q.wants_meeting ?? 0, q.status, q.reply ?? null,
                    q.reply ? new Date().toISOString() : null);
}

/* --------------------------------------------------------- telemetry --- */

/** Backfill a day of readings so occupancy charts have history on first load. */
const activeSpaces = db.prepare(`SELECT id, capacity FROM spaces WHERE status = 'active'`).all();
const insertReading = db.prepare(
  `INSERT INTO occupancy_readings (space_id, seats_occupied, seats_total, source, recorded_at)
   VALUES (?,?,?,'seed',?)`
);
const existingReadings = db.prepare('SELECT COUNT(*) AS n FROM occupancy_readings').get().n;

if (existingReadings === 0) {
  const curve = [0.1, 0.25, 0.5, 0.72, 0.85, 0.78, 0.62, 0.8, 0.88, 0.82, 0.68, 0.45, 0.3, 0.18];
  const now = Date.now();
  for (const space of activeSpaces) {
    curve.forEach((load, i) => {
      const jitter = (Math.random() - 0.5) * 0.12;
      const occupied = Math.max(0, Math.min(space.capacity,
        Math.round(space.capacity * (load + jitter))));
      const at = new Date(now - (curve.length - i) * 60 * 60 * 1000).toISOString();
      insertReading.run(space.id, occupied, space.capacity, at);
    });
  }
}

/* ------------------------------------------------------------ summary --- */

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

console.log(`
Seed complete
  users        ${count('users')}
  amenities    ${count('amenities')}
  spaces       ${count('spaces')}  (${count('spaces') - db.prepare(`SELECT COUNT(*) AS n FROM spaces WHERE status='active'`).get().n} awaiting approval)
  availability ${count('availability')} day rows
  bookings     ${count('bookings')}
  inquiries    ${count('inquiries')}
  readings     ${count('occupancy_readings')}

Demo logins (password for every account: ${DEMO_PASSWORD})
  Admin   admin@workspace.com
  Owner   meera@workloft.in      (WorkLoft, 4 listings)
  Owner   rohan@hivedesks.in     (Hive Desks, 4 listings)
  Owner   kabir@nexushubs.in     (Nexus Hubs, 4 listings)
  Member  ananya@brightpixel.io  (team of 6, collaborative)
  Member  vikram@ledgerly.dev    (team of 14, quiet focus)
  Member  priya@freelance.dev    (solo freelancer)
  Member  arjun@scalecraft.co    (team of 25, client facing)
  Member  sara@designdock.in     (team of 4, collaborative)
`);
