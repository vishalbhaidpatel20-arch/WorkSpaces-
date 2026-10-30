# Implementation plan — FlexoSpaces

How the system was built, in the order it was built, with the decisions that
shaped each stage. Phases 1–9 are **complete**; Phase 10 is the forward plan.

---

## Approach

Built back-to-front: schema, then logic, then API, then UI. The reason is that
booking correctness is the hard part of this brief — a UI built over a shaky
availability model papers over the bug instead of exposing it. By the time the
first React component was written, the API was already passing 76 behavioural
checks including the overbooking cases.

---

## Phase 1 — Data model

**Goal:** a schema that makes overbooking and orphaned records impossible at the
database level, not just in application code.

Nine tables:

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | All three roles in one table | `UNIQUE(email)`, `CHECK(role IN ('user','owner','admin'))` |
| `spaces` | Listings | FK → users, `CHECK` on type and status, indexes on city/status/owner/capacity/price |
| `amenities` | Shared catalogue | `UNIQUE(slug)` |
| `space_amenities` | Many-to-many join | Composite PK prevents duplicates |
| `availability` | **One row per space per day** | `UNIQUE(space_id, date)` |
| `bookings` | Requests and their lifecycle | `UNIQUE(code)`, `CHECK` on five statuses |
| `inquiries` | Expectation-matching threads | `CHECK` on three statuses |
| `notifications` | Email/SMS outbox and audit trail | `CHECK(channel IN ('email','sms'))` |
| `occupancy_readings` | Sensor telemetry | Index on `(space_id, recorded_at DESC)` |

**The decision that matters:** availability is a *materialised row per day*,
not a derived calculation over bookings. It costs ~90 rows per space but it
makes "how many seats are free on the 14th" a single indexed lookup instead of
an aggregate over the booking table, and it gives owners somewhere to store
blocks and per-day seat overrides that have nothing to do with bookings.

`PRAGMA foreign_keys = ON` and WAL mode are set at connection time.

## Phase 2 — Core libraries

Logic that deserves to be testable without HTTP:

- **`lib/auth.js`** — scrypt hashing, JWT signing, and `publicUser()`, the single
  place that strips a password hash. Centralising it is why no endpoint leaks one.
- **`lib/spaces.js`** — date arithmetic, the filtered search query builder,
  hydration (attaching amenities, today's availability and the latest occupancy
  reading in batched queries rather than N+1), and the availability primitives
  `seatsAvailableAcross` and `adjustBookedSeats`.
- **`lib/match.js`** — the scoring engine, a pure function.
- **`lib/notify.js`** — persist-then-deliver, so a provider outage never loses
  the record.

**The decision that matters:** `seatsAvailableAcross(space, start, end)` returns
the **minimum** free seats across every day in the range, not the average and not
the first day's. A 10-day booking is only possible if all 10 days have room. This
single function is what makes multi-day booking correct.

### Matching engine design

Seven criteria, weights summing to 100:

| Criterion | Weight | Scoring |
|---|---|---|
| Capacity | 25 | 1.0 when the team fits at ≥ 60% utilisation; tapers for oversized; near-misses score ~0.35 rather than 0 |
| Budget | 25 | 1.0 at or under budget; decays at 2× the overshoot ratio |
| Amenities | 15 | Fraction of requested amenities present |
| Location | 15 | 1.0 locality match, 0.85 city match, 0 otherwise |
| Area | 10 | 1.0 if met; decays at 1.5× the shortfall ratio |
| Type | 5 | 1.0 exact, 0.3 otherwise — a different type is a compromise, not a disqualification |
| Work style | 5 | 1.0 match, 0.5 mismatch, 0.6 when the space has not declared one |

Blank criteria score 1.0 (neutral) so they neither help nor hurt. A rating ≥ 4.5
adds a 2-point tiebreak. Every criterion returns a sentence, and the API returns
those sentences — a score nobody can interrogate is a score nobody trusts.

**The decision that matters:** `GET /api/spaces` hard-filters, but `POST /api/match`
does not. Matching narrows candidates only on genuinely disqualifying constraints
(city, date availability) and scores the rest, so a space that is 8% over budget
but perfect otherwise still appears — with "8% over your budget" written on it.
Hiding it would be the wrong answer to the brief's actual problem.

## Phase 3 — Middleware

- `attachUser` runs on every request and populates `req.user` from a bearer
  token, failing silently to anonymous. An expired token is not an error until a
  route actually requires auth.
- `requireAuth`, `requireRole(...)` and `requireSpaceOwner` are the three guards.
  Admins pass every role check by design.
- `validate(schema, part)` runs Zod and converts failures to 422 with field details.
- One error handler converts `ApiError` and `ZodError` into consistent JSON and
  prevents 5xx internals from reaching the client.

## Phase 4 — API surface

**46 endpoints** across nine routers. Full contract in `docs/openapi.yaml`.

| Router | Covers |
|---|---|
| `auth` | register, login, me, profile, password |
| `spaces` | search, filters, detail, CRUD, amenities, availability read/write, occupancy ingest/history |
| `bookings` | quote, create, list by scope, detail, confirm, reject, cancel |
| `inquiries` | create, list by scope, detail, reply, close |
| `match` | match, explain, peer teams |
| `amenities` | catalogue, admin CRUD |
| `dashboard` | member, owner, admin |
| `admin` | users, roles, listing approval/suspension, settle, notification log |
| `notifications` | personal feed |

### Booking lifecycle

```
          ┌──────────┐  owner confirms   ┌───────────┐  end date passes  ┌───────────┐
 request ►│ pending  │──────────────────►│ confirmed │──────────────────►│ completed │
          └────┬─────┘                   └─────┬─────┘                   └───────────┘
               │ owner declines                │ either party cancels
               ▼                               ▼
          ┌──────────┐                   ┌───────────┐
          │ rejected │                   │ cancelled │
          └──────────┘                   └───────────┘
   seats released                   seats released
```

**The decision that matters:** seats are held the moment a request is created,
not when it is approved. Otherwise two members are both told the last desk is
free while the owner is deciding, and one of them is wrong. Rejection and
cancellation return the seats and emit a live availability event.

## Phase 5 — Real-time layer

Socket.IO with two room types: `space:<id>` for one listing and `monitor` for
the dashboards. Three event types:

- `occupancy` — telemetry, on every reading
- `availability` — seats changed, with a reason (`booking_requested`,
  `booking_cancelled`, `owner_update`, `space_approved`, …)
- `booking` — a booking changed state

`POST /api/spaces/:id/occupancy` is the real ingest path for door counters,
Wi-Fi association hooks or badge readers. A simulator writes the same rows on a
15-second tick, shaped by a plausible office-day curve so dashboards have
believable movement without hardware. It is disabled with
`OCCUPANCY_SIMULATION=off` — which is how the test suite runs deterministically.

## Phase 6 — Frontend

15 routes, with `<Protected>` gating on auth and role.

Order of construction: API client and auth context → design tokens → UI
primitives → charts → feature pages. Building primitives before pages is why
every status chip, modal and toast in the app behaves identically.

**The decision that matters:** search filters live in the URL query string, not
in component state. A filtered search is then shareable, bookmarkable and
survives a reload — and the browser's back button does the right thing.

### Visualisation

Four forms, chosen by the job the data does:

| Need | Form | Why |
|---|---|---|
| A headline number | Stat tile | No plot needed; a number is the clearest encoding of one number |
| Occupancy vs capacity | Meter | One value against its total, with the % always written out |
| Counts by status/city | Horizontal bar list | Identity in the row label, magnitude in bar length |
| Occupancy over time | Line with crosshair | Change over time, with a hover layer because an SVG chart should be interactive |

Colour was chosen last and **validated with a script**, not by eye. The series
blue passes the lightness band, chroma floor and ≥ 3:1 contrast on the card
surface. Keeping every chart single-series means no legend is required and no
colour pair can be confused.

Dark mode is **not** shipped. The honest reason: a correct dark mode means
re-stepping and re-validating every colour against a dark surface, and an
automatic inversion of a light palette produces exactly the low-contrast result
the validation was meant to prevent. Light-only is the better of the two
outcomes available within scope.

## Phase 7 — Seed data

Nine users across three roles, 18 amenities, 13 listings across six cities
(Ahmedabad, Bengaluru, Mumbai, Pune, Hyderabad, Gurugram), ~1,180 availability
rows, 10 bookings in five states, four inquiries, and a backfilled day of
occupancy telemetry.

Deliberately included: **one listing left pending**, so the admin approval queue
is not empty on first login; bookings in rejected and cancelled states, so the
KPI denominators are real; and listings spanning ₹4,200–₹19,500 per seat, so
budget filtering and over-budget matching both have something to act on.

## Phase 8 — Verification

A 79-check behavioural suite against the running API, covering happy paths,
every role boundary and the failure cases that matter:

- overbooking refused with the remaining seat count returned
- past and reversed date ranges rejected
- an owner cannot book their own space
- a second owner cannot decide another owner's booking
- a member cannot post telemetry, read an owner dashboard, or reach admin routes
- admin self-demotion refused
- a pending listing is invisible publicly until approved
- password hashes never serialised

**All 79 pass.** Full matrix in `docs/test-cases.md`. The UI was then verified in
a real browser across the public, member, owner and admin surfaces, with a clean
console.

Two defects were found and fixed during this phase, both recorded in `CLAUDE.md`:
an SVG hit-testing bug that stopped the chart crosshair firing, and a `MIN()`
over monthly price that let an hourly-only meeting room advertise "from ₹0".

---

## Phase 9 — Production hardening

Added after the first verification pass, to move the build from "works" to
"safe to expose". Each item closes a specific, named risk.

### Correctness under concurrency

The booking path was a read-then-write: check free seats, then insert and hold
them. Under real parallelism two requests for the last desk can both read
"1 free" before either writes, and the space is oversold.

`transaction()` in `lib/db.js` now wraps the check and the hold in a single
`BEGIN IMMEDIATE`, which takes the write lock up front so the second caller
blocks rather than overselling. The status transitions had the same shape, and
are now **conditional updates** — `WHERE id = ? AND status = 'pending'`, with
`changes === 0` returning 409 — so a double confirm or double decline cannot
release the same seats twice.

### Security

| Added | Closes |
|---|---|
| `express-rate-limit` — 10/15min on credentials, 30/min writes, 300/min overall | Brute-forcing login; verified, the 11th attempt returns 429 |
| `helmet` + `x-powered-by` removed | Clickjacking, MIME sniffing, referrer leakage, stack fingerprinting |
| `assertProductionConfig()` | Booting production with a forgeable default `JWT_SECRET` or wildcard CORS — the process now exits non-zero with an explanation |
| `trust proxy` via `TRUST_PROXY_HOPS` | Rate limiting counting the proxy's IP instead of the client's, which would make it useless behind a load balancer |

### Operations

- **Graceful shutdown** on SIGTERM/SIGINT: stop the simulator, close Socket.IO,
  drain in-flight requests, checkpoint the WAL, exit — with a 10s forced
  timeout. Without this a container restart can cut a request mid-write.
- **Honest health check**: `GET /api/health` returns 503 when the database is
  unreachable instead of reporting "ok", so a load balancer can act on it.
- **Single-origin option**: if `client/dist` exists the API serves the SPA with
  a history fallback, so CORS never applies and deep links survive a refresh.
- **gzip** via `compression`.

Three checks were added to the suite for the headers and the environment
report. **All 79 pass.** The config guard and the rate limiter were verified by
running them directly, not by assuming.

---

## Phase 10 — Forward plan (not built)

Ordered by value per unit of effort.

| # | Item | Why it is next | Effort |
|---|---|---|---|
| 1 | Payment gateway (Razorpay/Stripe) | Turns a request into a transaction; the single biggest product gap | L |
| 2 | Review capture | The one brief KPI not currently measurable | M |
| 3 | Real email/SMS provider | Layer and audit trail exist; needs credentials and a worker | S |
| 4 | PostgreSQL migration | Before concurrent write load; path documented in `docs/deployment.md` | M |
| 5 | Refresh-token rotation | Makes revocation possible before token expiry | M |
| 6 | Redis-backed rate limiting | Current limiter is in-memory, so per-instance rather than global | S |
| 7 | Map and radius search | Location matching is text-only today | M |
| 8 | Real sensor integration | Contract and ingest endpoint are ready | M |
| 9 | Dark mode | Needs a re-validated dark palette, not an inversion | M |
| 10 | Dynamic pricing, mobile apps | Explicitly out of scope for Phase 1 | XL |

---

## What a reviewer should look at first

1. `server/src/lib/match.js` — the matching engine, and the reasons it returns.
2. `server/src/lib/spaces.js` — `seatsAvailableAcross` and `adjustBookedSeats`.
3. `server/src/routes/bookings.js` — the lifecycle and its guards.
4. `docs/test-cases.md` — what is actually proven, and what is not.
