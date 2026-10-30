# WorkSpace

**Smart Co-Working Space Management Using Real-Time Monitoring**

A full-stack web platform for discovering, comparing and booking co-working
spaces — with a smart matching engine that scores every space against a team's
actual requirements and explains why, plus live seat-occupancy monitoring for
operators.

Built against the Unified Mentor / Flexo Spaces capstone brief.

---

## What it does

Finding a co-working space usually means opening six tabs and guessing. This
platform fixes four specific problems from the brief:

| Problem | How it is solved |
|---|---|
| Spaces that don't fit team size, area and budget together | A weighted engine scores all three at once, 0–100, with reasons |
| Amenities are hard to compare | One normalised 18-item catalogue, filterable with AND semantics |
| Availability is unknown until you ask | Day-by-day seat availability, with seats held the moment a request is made |
| Expectations get lost in phone tag | Inquiries carry team size, work style and expectations up front |

### Smart matching, not just filtering

Filtering hides what doesn't match. Matching shouldn't.

`POST /api/match` scores every candidate across **seven weighted criteria** —
capacity (25), budget (25), amenities (15), location (15), area (10), type (5),
work style (5) — and returns them best-first **with the shortfall written out**:

```json
{
  "name": "WorkLoft Prahladnagar",
  "match": {
    "score": 89,
    "fit": "excellent",
    "reasons": [
      "Right-sized for 6 (capacity 68)",
      "28% under your budget at ₹6,500/seat",
      "Has all 2 amenities you asked for",
      "In Prahladnagar, Ahmedabad",
      "Shares your \"collaborative\" work style"
    ]
  }
}
```

A space 8% over budget but perfect otherwise still appears — labelled "8% over
your budget" — because that is a trade-off a team should get to make, not one
the platform should make for them. Criteria left blank score neutrally.

### Real-time monitoring

Socket.IO pushes three event types (`occupancy`, `availability`, `booking`) to
per-space and platform-wide rooms. Owner and admin dashboards update seat
occupancy in place, with no reload.

`POST /api/spaces/:id/occupancy` is the integration point for door counters,
Wi-Fi association hooks or badge readers. A simulator drives the same endpoint
on a realistic office-day curve so the feature is demonstrable without hardware
— and is switched off with one environment variable.

---

## Quick start

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`). No database
server, no Docker, no native build step.

```bash
npm run install:all     # install server + client
npm run seed            # create and seed the database
npm run dev:api         # terminal 1 — API on :4000
npm run dev:web         # terminal 2 — web app on :5173
```

Open **http://localhost:5173**.

### Demo accounts

Password for all of them: `Password123`

| Role | Email | Shows |
|---|---|---|
| **Admin** | `admin@workspace.com` | Platform KPIs, approval queue, users, live monitor |
| **Owner** | `meera@workloft.in` | 4 listings, booking requests, per-floor occupancy |
| **Member** | `ananya@brightpixel.io` | Team of 6, collaborative — bookings and inquiries |

The login page has one-click shortcuts for each.

---

## Features

### For members
- Search by keyword, city, locality, team size, area, budget, workspace type, work style, amenities, rating and date
- Smart match with an explained score per space
- Live availability and occupancy before booking
- Price quote that updates as dates and seat counts change
- Booking requests with status tracking and cancellation
- Inquiries carrying expectations, with a meeting-request flag
- Peer matching: find teams with a similar work style and size
- Dashboard with spend, upcoming stays and a notification feed

### For space owners
- List spaces with area, capacity, three pricing bases, hours and amenities
- Day-range availability control, including blocking for maintenance or events
- Approve or decline requests, with a reason shared with the member
- Reply to inquiries
- Live occupancy per floor, utilisation, revenue, 7-day forward seat demand

### For administrators
- 11 platform KPIs including booking approval rate, cancellation rate, gross booking value and occupancy
- Listing approval and suspension queue
- User management and role changes
- Bookings broken down by status and by city, plus top-performing spaces
- Platform-wide live occupancy monitor

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24 |
| API | Express 5 |
| Database | SQLite via built-in `node:sqlite` |
| Auth | JWT + scrypt (`node:crypto`) |
| Validation | Zod 4 |
| Real-time | Socket.IO 4 |
| Frontend | React 19 + Vite 7 |
| Routing | React Router 7 |
| Styling | Tailwind CSS 4 |
| Charts | Hand-built SVG (no chart library) |

Ten server dependencies, four client dependencies. Full reasoning — including
what was rejected and why — in [`tech-stack.md`](tech-stack.md).

---

## Project structure

```
StartCo/
├── server/                  Express API
│   ├── src/
│   │   ├── lib/             db, auth, matching, availability, notifications
│   │   ├── middleware/      auth guards, validation, error handling
│   │   ├── routes/          9 routers, 46 endpoints
│   │   ├── realtime.js      Socket.IO + occupancy telemetry
│   │   ├── seed.js          demo data
│   │   └── index.js
│   └── test/api-suite.mjs   79 behavioural checks
│
├── client/                  React SPA
│   └── src/
│       ├── components/      layout, cards, filters, charts, UI primitives
│       ├── pages/           15 routes
│       └── lib/             API client, auth context, socket hooks, formatting
│
├── docs/
│   ├── openapi.yaml         OpenAPI 3.1 contract
│   ├── postman/             runnable collection (43 requests, 22 assertions)
│   ├── test-cases.md        full test matrix
│   └── deployment.md        setup, production, PostgreSQL migration
│
├── scope.md                 what is in and out of scope
├── tech-stack.md            every technology choice and its rationale
├── implementation-plan.md   how it was built, and what comes next
└── CLAUDE.md                build notes
```

---

## API

46 endpoints. Full contract in [`docs/openapi.yaml`](docs/openapi.yaml);
runnable requests in [`docs/postman/`](docs/postman/).

```
POST   /api/auth/register           create an account (user or owner)
POST   /api/auth/login              sign in
GET    /api/spaces                  search and filter, with match scores
GET    /api/spaces/:id              detail + availability + occupancy history
POST   /api/match                   smart match with explained scores
POST   /api/match/explain/:id       per-criterion breakdown
GET    /api/match/peers             teams with a similar work style
GET    /api/spaces/:id/availability day-by-day seats
PUT    /api/spaces/:id/availability block dates or change seat counts (owner)
POST   /api/spaces/:id/occupancy    sensor ingest (owner)
POST   /api/bookings/quote          price preview
POST   /api/bookings                request a booking — holds seats immediately
POST   /api/bookings/:id/confirm    owner approves
POST   /api/bookings/:id/reject     owner declines, seats released
POST   /api/inquiries               ask, with expectations attached
GET    /api/dashboard/{user|owner|admin}
POST   /api/admin/spaces/:id/approve
```

---

## Testing

```bash
cd server
npm run seed:fresh
npm run start:test                   # terminal 1 (simulator + rate limits off)
npm test                             # terminal 2
```

```
79 passed, 0 failed
```

Covers happy paths, every role boundary, and the failure cases that matter:
overbooking refused with the remaining seat count, reversed and past date
ranges, an owner booking their own space, one owner deciding another's booking,
members reaching owner or admin routes, admin self-demotion, pending listings
staying invisible, password hashes never being serialised, and the security
headers being present.

The Postman collection runs the same surface:

```bash
postman collection run docs/postman/WorkSpace.postman_collection.json
# 43 requests, 22 assertions, 0 failures
```

Full matrix, plus **an honest list of what is not covered**, in
[`docs/test-cases.md`](docs/test-cases.md).

---

## Production readiness

The build is hardened rather than demo-only. What is in place:

| Concern | Handling |
|---|---|
| **Overselling under concurrency** | The seat check and seat hold run in one `BEGIN IMMEDIATE` transaction, so two simultaneous requests for the last desk cannot both succeed. Status transitions are conditional updates, so a double-confirm or double-cancel cannot release seats twice. |
| **Brute force** | Rate limiting: 10 attempts per 15 min on credential endpoints, 30/min on writes, 300/min overall. Verified — the 11th login attempt returns 429. |
| **Security headers** | `helmet` — `nosniff`, `SAMEORIGIN`, `no-referrer`, COOP/CORP. `X-Powered-By` removed. Asserted in the test suite. |
| **Unsafe production config** | The process **refuses to start** under `NODE_ENV=production` with a default/short `JWT_SECRET` or a wildcard `CORS_ORIGIN`, and warns if the occupancy simulator is left on. |
| **Proxies** | `trust proxy` is configurable, so client IPs — and therefore rate limits — are correct behind a load balancer. |
| **Shutdown** | SIGTERM/SIGINT drain in-flight requests, stop the simulator, close Socket.IO, and checkpoint the WAL before exit, with a 10s forced timeout. |
| **Health** | `GET /api/health` returns 503 if the database is unreachable, rather than a misleading "ok". |
| **Payload / transport** | 1 MB JSON cap, gzip compression, strict origin allowlist. |
| **Single-origin deploy** | If `client/dist` exists, the API serves the SPA with a history fallback, so CORS never applies and deep links survive a refresh. |

Remaining pre-launch items are listed in [`docs/deployment.md`](docs/deployment.md) § *Before going live*.

---

## Design notes

**Seats are held on request, not on approval.** Otherwise two members are both
told the last desk is free while the owner decides, and one of them is wrong.
Declining or cancelling releases them and emits a live availability event.

**Availability is one row per space per day**, not a calculation over bookings.
It costs ~90 rows per listing and makes "how many seats on the 14th" a single
indexed lookup — and gives owners somewhere to store blocks that have nothing
to do with bookings.

**Multi-day bookings use the minimum free seats across the range**, never the
first day's or the average. A 10-day booking only works if all 10 days have room.

**Search state lives in the URL.** A filtered search is shareable, bookmarkable
and survives a reload.

**Charts are single-series by design.** One validated colour carries magnitude
against a recessive grey track, so no chart needs a legend and no colour pair
can be confused by a colour-vision-deficient reader. The palette was checked
with a validator, not by eye.

---

## Current limitations

Stated plainly rather than left to be discovered:

- **No payment processing.** Bookings are requests; the total is computed but no money moves.
- **Occupancy is simulated** unless real sensors POST to the ingest endpoint.
- **Notifications are persisted and logged**, not sent externally, until an SMTP or SMS provider is configured.
- **No review submission.** Ratings are displayed from seed data, so the brief's "user satisfaction score" KPI is not yet measurable.
- **No refresh-token rotation**, so a JWT cannot be revoked before it expires (7-day default TTL).
- **Light mode only.** A correct dark mode means re-validating every colour against a dark surface; an automatic inversion would produce exactly the low-contrast result the validation exists to prevent.
- **Location matching is by city and locality text**, not coordinates or radius.
- **No frontend unit tests**; UI verification was manual, in Chrome.

See [`scope.md`](scope.md) for the full in/out boundary and
[`implementation-plan.md`](implementation-plan.md) for the prioritised forward plan.

---

## Documentation

| Document | Contents |
|---|---|
| [`scope.md`](scope.md) | Objectives, in/out of scope, KPIs, acceptance criteria |
| [`tech-stack.md`](tech-stack.md) | Every technology choice, with rejected alternatives |
| [`implementation-plan.md`](implementation-plan.md) | Build phases, key decisions, forward plan |
| [`docs/openapi.yaml`](docs/openapi.yaml) | OpenAPI 3.1 contract |
| [`docs/test-cases.md`](docs/test-cases.md) | 79-case matrix and coverage gaps |
| [`docs/deployment.md`](docs/deployment.md) | Local setup, production, PostgreSQL migration |
| [`CLAUDE.md`](CLAUDE.md) | Build notes and conventions |

---

## License

Built as a capstone project for the Unified Mentor / Flexo Spaces brief.
