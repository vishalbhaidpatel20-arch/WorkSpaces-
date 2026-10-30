const BASE = `${process.env.API_URL || 'http://localhost:4000'}/api`;
let pass = 0, fail = 0;

async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}

const login = async (email) =>
  (await req('POST', '/auth/login', { body: { email, password: 'Password123' } })).json;

console.log('\n== auth ==');
const bad = await req('POST', '/auth/login', { body: { email: 'admin@workspace.com', password: 'wrong' } });
check('wrong password -> 401', bad.status === 401, JSON.stringify(bad.json));

const member = await login('ananya@brightpixel.io');
check('member login returns token + role', !!member.token && member.user.role === 'user');
const owner = await login('meera@workloft.in');
check('owner login', owner.user.role === 'owner');
const admin = await login('admin@workspace.com');
check('admin login', admin.user.role === 'admin');

const noAuth = await req('GET', '/auth/me');
check('me without token -> 401', noAuth.status === 401);
const me = await req('GET', '/auth/me', { token: member.token });
check('me with token', me.json.user.email === 'ananya@brightpixel.io');
check('password hash never leaks', !('password_hash' in me.json.user));

const dupe = await req('POST', '/auth/register', {
  body: { name: 'Dupe', email: 'ananya@brightpixel.io', password: 'Password123' } });
check('duplicate email -> 409', dupe.status === 409);

const weak = await req('POST', '/auth/register', {
  body: { name: 'X', email: 'not-an-email', password: '123' } });
check('validation -> 422 with field details', weak.status === 422 && weak.json.details.length >= 2,
  JSON.stringify(weak.json));

const selfAdmin = await req('POST', '/auth/register', {
  body: { name: 'Sneaky Admin', email: 'sneaky@test.io', password: 'Password123', role: 'admin' } });
check('cannot self-register as admin -> 422', selfAdmin.status === 422, JSON.stringify(selfAdmin.json));

console.log('\n== search & filtering ==');
const all = await req('GET', '/spaces');
check('list active spaces (12 active of 13 seeded)', all.json.meta.total === 12, `got ${all.json.meta.total}`);
check('pending space hidden from public list',
  !all.json.data.some((s) => s.name.includes('Whitefield')));

const ahmd = await req('GET', '/spaces?city=Ahmedabad');
check('city filter', ahmd.json.data.length === 3 && ahmd.json.data.every((s) => s.city === 'Ahmedabad'),
  `got ${ahmd.json.data.length}`);

const cheap = await req('GET', '/spaces?budget=7000');
check('budget filter caps price',
  cheap.json.data.every((s) => s.price_per_seat_month <= 7000), JSON.stringify(cheap.json.data.map(s=>s.price_per_seat_month)));

const big = await req('GET', '/spaces?persons=100');
check('capacity filter', big.json.data.every((s) => s.capacity >= 100));

const amen = await req('GET', '/spaces?amenities=gym,event_space');
check('amenities AND filter',
  amen.json.data.every((s) => {
    const slugs = s.amenities.map((a) => a.slug);
    return slugs.includes('gym') && slugs.includes('event_space');
  }), `got ${amen.json.data.length}`);

const sorted = await req('GET', '/spaces?sort=price_asc&limit=20');
const prices = sorted.json.data.map((s) => s.price_per_seat_month);
check('sort=price_asc honoured', prices.every((p, i) => i === 0 || prices[i - 1] <= p), prices.join(','));

const paged = await req('GET', '/spaces?limit=5&page=2');
check('pagination meta', paged.json.data.length === 5 && paged.json.meta.pages === 3,
  JSON.stringify(paged.json.meta));

const q = await req('GET', '/spaces?q=boardroom');
check('text search', q.json.data.length === 1 && q.json.data[0].name.includes('Boardroom'));

console.log('\n== smart matching ==');
const scoredList = await req('GET', '/spaces?persons=6&budget=9000&city=Ahmedabad&amenities=wifi,cafeteria');
check('every result carries a match score',
  scoredList.json.data.every((s) => typeof s.match.score === 'number' && s.match.reasons.length));
check('results ordered best-match first', (() => {
  const s = scoredList.json.data.map((x) => x.match.score);
  return s.every((v, i) => i === 0 || s[i - 1] >= v);
})());

const match = await req('POST', '/match', {
  body: { persons: 6, budget: 9000, city: 'Ahmedabad', amenities: ['wifi', 'cafeteria'],
          work_style: 'collaborative', area_required: 1000 } });
check('match returns ranked recommendations', match.json.data.length > 0);
check('match reports weights + averages',
  match.json.meta.weights.capacity === 25 && typeof match.json.meta.average_score === 'number');
const top = match.json.data[0];
check('top match for a 6-person collaborative Ahmedabad team is WorkLoft Prahladnagar',
  top.name === 'WorkLoft Prahladnagar', `got ${top.name} @ ${top.match.score}`);
check('match score is high for a good fit', top.match.score >= 85, `score ${top.match.score}`);

const overBudget = await req('POST', '/match', { body: { budget: 5000, city: 'Mumbai', persons: 20 } });
check('match still surfaces over-budget options instead of hiding them',
  overBudget.json.data.length > 0 &&
  overBudget.json.data[0].match.reasons.some((r) => r.includes('over your budget')),
  JSON.stringify(overBudget.json.data[0]?.match.reasons));

const explain = await req('POST', `/match/explain/${top.id}`, {
  body: { persons: 6, budget: 9000, city: 'Ahmedabad' } });
check('explain returns a per-criterion breakdown',
  explain.json.data.breakdown.capacity.weight === 25 && explain.json.data.breakdown.budget.earned > 0);

const peers = await req('GET', '/match/peers', { token: member.token });
check('peer matching returns affinity scores', Array.isArray(peers.json.data) && peers.json.data.length > 0);
check('peers never expose contact details',
  peers.json.data.every((p) => !('email' in p) && !('phone' in p)));

console.log('\n== availability & booking ==');
const spaceId = ahmd.json.data.find((s) => s.name === 'WorkLoft Freelance Bar').id;
const avail = await req('GET', `/spaces/${spaceId}/availability`);
check('availability returns a date-by-date window',
  avail.json.data.length === 31 && avail.json.data[0].status === 'available',
  `${avail.json.data.length} rows`);

const quote = await req('POST', '/bookings/quote', {
  body: { space_id: spaceId, start_date: iso(60), end_date: iso(64), seats: 2 } });
check('quote prices 5 days x 2 seats at the day rate',
  quote.json.data.days === 5 && quote.json.data.total_price === 250 * 2 * 5,
  JSON.stringify(quote.json.data));
check('quote reports bookability', quote.json.data.bookable === true);

const anon = await req('POST', '/bookings', {
  body: { space_id: spaceId, start_date: iso(60), end_date: iso(64), seats: 2 } });
check('booking without auth -> 401', anon.status === 401);

const booking = await req('POST', '/bookings', { token: member.token,
  body: { space_id: spaceId, start_date: iso(60), end_date: iso(64), seats: 2,
          notes: 'Two of us trying the floor' } });
check('member creates a pending booking',
  booking.status === 201 && booking.json.data.status === 'pending', JSON.stringify(booking.json));
check('booking gets a human-readable code', /^WS-/.test(booking.json.data.code || ''));

const afterHold = await req('GET', `/spaces/${spaceId}/availability?start=${iso(60)}&end=${iso(60)}`);
check('pending booking immediately holds the seats',
  afterHold.json.data[0].seats_booked === 2, JSON.stringify(afterHold.json.data[0]));

const past = await req('POST', '/bookings', { token: member.token,
  body: { space_id: spaceId, start_date: '2020-01-01', end_date: '2020-01-02', seats: 1 } });
check('past start_date -> 422', past.status === 422, JSON.stringify(past.json));

const reversed = await req('POST', '/bookings', { token: member.token,
  body: { space_id: spaceId, start_date: iso(70), end_date: iso(65), seats: 1 } });
check('end before start -> 422', reversed.status === 422);

const tooBig = await req('POST', '/bookings', { token: member.token,
  body: { space_id: spaceId, start_date: iso(60), end_date: iso(61), seats: 9999 } });
check('seats beyond capacity -> 422', tooBig.status === 422, JSON.stringify(tooBig.json));

const ownBook = await req('POST', '/bookings', { token: owner.token,
  body: { space_id: spaceId, start_date: iso(60), end_date: iso(61), seats: 1 } });
check('owner cannot book own space -> 409', ownBook.status === 409, JSON.stringify(ownBook.json));

// Fill the remaining 22 seats, then prove the 23rd request is refused.
const fill = await req('POST', '/bookings', { token: member.token,
  body: { space_id: spaceId, start_date: iso(60), end_date: iso(60), seats: 22 } });
check('can book up to remaining capacity', fill.status === 201, JSON.stringify(fill.json));
const overbook = await req('POST', '/bookings', { token: member.token,
  body: { space_id: spaceId, start_date: iso(60), end_date: iso(60), seats: 1 } });
check('overbooking refused -> 409 with seats_available',
  overbook.status === 409 && overbook.json.details.seats_available === 0,
  JSON.stringify(overbook.json));

console.log('\n== owner decisions ==');
const stranger = await req('POST', `/bookings/${booking.json.data.id}/confirm`, { token: admin.token });
check('admin may act on any booking', stranger.status === 200);

const otherOwner = await login('rohan@hivedesks.in');
const wrongOwner = await req('POST', `/bookings/${fill.json.data.id}/confirm`, { token: otherOwner.token });
check('another owner cannot decide this booking -> 403', wrongOwner.status === 403);

const confirmed = await req('POST', `/bookings/${fill.json.data.id}/confirm`, { token: owner.token });
check('owner confirms booking', confirmed.json.data.status === 'confirmed');
const twice = await req('POST', `/bookings/${fill.json.data.id}/confirm`, { token: owner.token });
check('double confirm -> 409', twice.status === 409, JSON.stringify(twice.json));

const cancel = await req('POST', `/bookings/${fill.json.data.id}/cancel`, { token: member.token });
check('member cancels own booking', cancel.json.data.status === 'cancelled');
const released = await req('GET', `/spaces/${spaceId}/availability?start=${iso(60)}&end=${iso(60)}`);
check('cancelling releases the held seats',
  released.json.data[0].seats_booked === 2, JSON.stringify(released.json.data[0]));

console.log('\n== inquiries ==');
const inq = await req('POST', '/inquiries', { token: member.token,
  body: { space_id: spaceId, subject: 'Smoke test inquiry',
          message: 'Checking the inquiry workflow end to end.', wants_meeting: true } });
check('member raises an inquiry', inq.status === 201 && inq.json.data.status === 'open');
const shortMsg = await req('POST', '/inquiries', { token: member.token,
  body: { space_id: spaceId, subject: 'Hi', message: 'too short' } });
check('short message -> 422', shortMsg.status === 422);
const reply = await req('POST', `/inquiries/${inq.json.data.id}/reply`, { token: owner.token,
  body: { reply: 'Yes, happy to host a visit this week.' } });
check('owner replies, status becomes responded', reply.json.data.status === 'responded');
const wrongReply = await req('POST', `/inquiries/${inq.json.data.id}/reply`, { token: otherOwner.token,
  body: { reply: 'I do not own this space' } });
check('non-owner cannot reply -> 403', wrongReply.status === 403);

console.log('\n== notifications ==');
const notes = await req('GET', '/notifications', { token: member.token });
check('member has notifications from the booking flow', notes.json.data.length >= 3,
  `got ${notes.json.data.length}`);
check('both email and sms channels recorded',
  new Set(notes.json.data.map((n) => n.channel)).size === 2);

console.log('\n== real-time monitoring ==');
const occPost = await req('POST', `/spaces/${spaceId}/occupancy`, { token: owner.token,
  body: { seats_occupied: 17, source: 'door-sensor' } });
check('owner ingests a sensor reading',
  occPost.status === 201 && occPost.json.data.percent === Math.round(17 / 24 * 100),
  JSON.stringify(occPost.json));
const occBad = await req('POST', `/spaces/${spaceId}/occupancy`, { token: owner.token,
  body: { seats_occupied: 999 } });
check('reading above capacity -> 422', occBad.status === 422);
const occMember = await req('POST', `/spaces/${spaceId}/occupancy`, { token: member.token,
  body: { seats_occupied: 5 } });
check('members cannot post telemetry -> 403', occMember.status === 403);
const occGet = await req('GET', `/spaces/${spaceId}/occupancy?limit=10`);
check('occupancy history + latest + average',
  occGet.json.data.latest.seats_occupied === 17 && typeof occGet.json.data.average_percent === 'number');

console.log('\n== dashboards ==');
const userDash = await req('GET', '/dashboard/user', { token: member.token });
check('member dashboard stats', userDash.json.data.stats.bookings_total >= 2 &&
  Array.isArray(userDash.json.data.upcoming));
const ownerDash = await req('GET', '/dashboard/owner', { token: owner.token });
check('owner dashboard reports spaces + utilisation',
  ownerDash.json.data.stats.spaces_total === 4 &&
  typeof ownerDash.json.data.stats.utilisation_percent === 'number',
  JSON.stringify(ownerDash.json.data.stats));
check('owner dashboard carries live occupancy per space',
  ownerDash.json.data.spaces.some((s) => s.live_occupancy));
const ownerDashAsMember = await req('GET', '/dashboard/owner', { token: member.token });
check('member cannot read owner dashboard -> 403', ownerDashAsMember.status === 403);
const adminDash = await req('GET', '/dashboard/admin', { token: admin.token });
// 9 seeded users: the rejected admin self-registration must NOT have created one.
check('admin KPIs present',
  adminDash.json.data.kpis.registered_users === 9 &&
  adminDash.json.data.kpis.spaces_awaiting_approval === 1,
  JSON.stringify(adminDash.json.data.kpis));
const adminDashAsOwner = await req('GET', '/dashboard/admin', { token: owner.token });
check('owner cannot read admin dashboard -> 403', adminDashAsOwner.status === 403);

console.log('\n== admin moderation ==');
const pending = await req('GET', '/admin/spaces?status=pending', { token: admin.token });
check('approval queue lists the pending listing', pending.json.data.length === 1);
const approve = await req('POST', `/admin/spaces/${pending.json.data[0].id}/approve`, { token: admin.token });
check('admin approves listing', approve.json.data.status === 'active');
const nowActive = await req('GET', '/spaces?city=Bengaluru');
check('approved listing becomes publicly visible',
  nowActive.json.data.some((s) => s.name.includes('Whitefield')));
const suspend = await req('POST', `/admin/spaces/${pending.json.data[0].id}/suspend`,
  { token: admin.token, body: { reason: 'Smoke test' } });
check('admin suspends listing', suspend.json.data.status === 'suspended');
const users = await req('GET', '/admin/users?role=owner', { token: admin.token });
check('admin lists owners with counts',
  users.json.data.length === 3 && users.json.data.every((u) => 'spaces_count' in u));
const roleChange = await req('PATCH', `/admin/users/${member.user.id}/role`,
  { token: admin.token, body: { role: 'owner' } });
check('admin changes a role', roleChange.json.data.role === 'owner');
await req('PATCH', `/admin/users/${member.user.id}/role`, { token: admin.token, body: { role: 'user' } });
const selfRole = await req('PATCH', `/admin/users/${admin.user.id}/role`,
  { token: admin.token, body: { role: 'user' } });
check('admin cannot demote self -> 409', selfRole.status === 409);
const adminAsOwner = await req('GET', '/admin/users', { token: owner.token });
check('non-admin blocked from admin routes -> 403', adminAsOwner.status === 403);

console.log('\n== production hardening ==');
const headRes = await fetch(`${BASE}/health`);
check('security headers present (helmet)',
  headRes.headers.get('x-content-type-options') === 'nosniff' &&
  headRes.headers.get('referrer-policy') === 'no-referrer' &&
  headRes.headers.get('x-frame-options') === 'SAMEORIGIN',
  `got ${[...headRes.headers.keys()].join(',')}`);
check('server does not advertise its stack',
  headRes.headers.get('x-powered-by') === null);
check('health reports the environment', (await headRes.json()).environment !== undefined);

console.log('\n== misc ==');
const missing = await req('GET', '/spaces/99999');
check('unknown space -> 404', missing.status === 404);
const badRoute = await req('GET', '/nope');
check('unknown endpoint -> 404', badRoute.status === 404);
const filters = await req('GET', '/spaces/filters');
check('filter bounds endpoint', filters.json.data.cities.length === 6 &&
  filters.json.data.amenities.length === 18, JSON.stringify(filters.json.data.cities?.length));
const amenList = await req('GET', '/amenities');
check('amenity catalogue reports usage counts',
  amenList.json.data.every((a) => 'space_count' in a));

function iso(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`);
process.exit(fail ? 1 : 0);
