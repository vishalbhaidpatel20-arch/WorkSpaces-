# CLAUDE.md

Build notes and working conventions for FlexoSpaces. Read this before changing
code — it records the decisions that are easy to undo by accident.

---

## What this project is

A full-stack co-working space discovery and booking platform built against the
Unified Mentor / Flexo Spaces brief: **Smart Co-Working Space Management Using
Real-Time Monitoring**.

Two halves, deployed independently:

- `server/` — Express 5 REST API + Socket.IO, SQLite via Node's built-in driver
- `client/` — React 19 SPA built with Vite, Tailwind CSS 4

---

## Commands

Run from the repository root:

```bash
npm run install:all     # install both halves
npm run seed            # wipe and reseed the database
npm run dev:api         # API with --watch on :4000
npm run dev:web         # Vite dev server on :5173
npm run build           # production client build
npm test                # 79-check API suite (API must be running)
```

From `server/`:

```bash
npm start               # production start
npm run seed:fresh      # reseed, clearing existing rows
npm run start:test   # deterministic: simulator and rate limits off
```

**Reseed before running tests or a demo.** The test suite and the Postman
collection both mutate data, and several assertions check absolute counts.

---

## Architecture

```
client/ (React SPA)  ──REST──►  server/ (Express)  ──►  SQLite (WAL)
                     ◄─Socket.IO─┘
```

### Server layering — keep this boundary

| Directory | Responsibility |
|---|---|
| `src/routes/` | HTTP only: parse, validate, call a lib, shape the response |
| `src/lib/` | Logic worth testing on its own — matching, availability, notifications |
| `src/middleware/` | Cross-cutting auth guards, validation, error translation |
| `src/realtime.js` | Socket.IO rooms, event emission, telemetry simulator |

Business logic belongs in `lib/`, not in a route handler. `lib/match.js` in
particular is a pure function of `(space, criteria)` — keep it that way so it
stays testable without a database or a server.

### Client layering

| Directory | Responsibility |
|---|---|
| `src/lib/` | API client, auth context, socket hooks, formatting |
| `src/components/` | Reusable primitives — UI, charts, cards, filters, layout |
| `src/pages/` | One file per route, composed from components |

---

## Invariants — do not break these

These are the things that look safe to change and are not.

### 1. Seats are held on request, not on approval

`POST /bookings` calls `adjustBookedSeats(+seats)` immediately. Rejection and
cancellation call it with a negative delta.

Removing the hold means two members are both told the last desk is free while
the owner decides, and one of them is wrong. Covered by test `BOOK-07`.

### 2. Multi-day availability uses the minimum, never the average

`seatsAvailableAcross()` returns the **smallest** free-seat count across every
day in the range. A 10-day booking is only possible if all 10 days have room.
Covered by `BOOK-13`.

### 3. Password hashes never leave the server

`publicUser()` in `lib/auth.js` is the only place a user is serialised. Route
handlers must not return a raw `users` row. Covered by `AUTH-07`.

### 4. `admin` cannot be self-assigned

`registerSchema` permits `user` and `owner` only. The admin role is granted by
an existing admin through `PATCH /admin/users/:id/role`, and an admin cannot
change their own role. Covered by `AUTH-10` and `ADMN-07`.

> `DASH-05` asserts exactly 9 seeded users. If the escalation guard ever breaks,
> that test fails too. Don't "fix" it by loosening the count.

### 5. Matching does not hard-filter

`GET /spaces` filters. `POST /match` **scores** — it narrows candidates only on
genuinely disqualifying constraints (city, date availability) and returns
everything else with the shortfall in `match.reasons`. Covered by `MTCH-07`.

This is the feature, not an oversight. A space 8% over budget but perfect
otherwise should be the user's call.

### 6. Every query uses bound parameters

No user input is ever interpolated into SQL. Where a dynamic `IN (...)` list is
needed, placeholders are generated and values bound separately — see
`searchSpaces()` for the pattern.

### 7. Authorisation is server-side

The client hides controls it shouldn't show; the server decides. Every mutating
route carries `requireAuth` plus `requireRole` and/or `requireSpaceOwner`.

### 8. The seat check and the seat hold are one transaction

`POST /bookings` wraps `seatsAvailableAcross` + insert + `adjustBookedSeats` in
`transaction()`, which uses `BEGIN IMMEDIATE`. Splitting them back apart
reintroduces the oversell race: two requests both read "1 free" before either
writes.

Status transitions (`confirm`, `reject`, `cancel`) use **conditional updates**
(`WHERE id = ? AND status = 'pending'`) and treat `changes === 0` as a 409. Do
not replace these with a read-then-write — a double decline would release the
same seats twice.

### 9. Production config is validated at boot

`assertProductionConfig()` in `index.js` exits non-zero under
`NODE_ENV=production` with a default or short `JWT_SECRET`, or a wildcard
`CORS_ORIGIN`. Do not downgrade these to warnings — failing loudly at boot is
the point.

---

## Data model notes

Nine tables in `src/lib/db.js`. Two worth understanding before changing:

**`availability` — one row per space per day.** Not derived from bookings. It
costs ~90 rows per listing and buys a single indexed lookup for "seats free on
the 14th", plus somewhere for owners to store blocks and per-day seat overrides
that have nothing to do with bookings. `UNIQUE(space_id, date)` enforces it.

**`notifications` — persist first, deliver second.** The row is the audit trail
and the in-app feed. A provider outage must never lose the record.

Constraints are enforced in SQL (`CHECK`, `FOREIGN KEY ... ON DELETE CASCADE`,
`UNIQUE`), not only in application code. `PRAGMA foreign_keys = ON` is set at
connection time — it is off by default in SQLite.

---

## Conventions

### API responses

```jsonc
{ "data": [...], "meta": {...} }   // collections
{ "data": {...} }                  // single resource
{ "error": "message" }             // errors
{ "error": "...", "details": [{ "field": "...", "message": "..." }] }  // 422
```

### Status codes

| Code | Meaning here |
|---|---|
| 401 | Not authenticated, or token expired |
| 403 | Authenticated but wrong role, or not your resource |
| 404 | Not found, or not visible to you |
| 409 | Conflicts with current state (duplicate email, overbooking, bad transition) |
| 422 | Failed schema validation |

### Validation

Every body and query string goes through Zod before a handler runs. Query
results land on `req.validQuery` (not `req.query`, which is read-only in
Express 5). Use `validate(schema, 'query')`.

### Dates

Calendar dates as `YYYY-MM-DD` strings, never `Date` objects or instants. Date
ranges are **inclusive of both ends**. Helpers live in `lib/spaces.js`
(`datesBetween`, `addDays`, `today`).

### Money

Whole rupees as integers. No floats, no currency conversion. Stays of 28+ days
bill from the monthly rate; shorter stays use the day rate, derived from
`price_per_seat_month / 30` when no day rate is published.

### Hourly-only listings store `price_per_seat_month = 0`

Meeting rooms are priced by the hour. Any aggregate over monthly price must use
`NULLIF(price_per_seat_month, 0)` — this already bit once (see Defects below).

---

## Visualisation rules

Charts are hand-built SVG in `components/charts.jsx`. No chart library.

**Every chart is single-series, deliberately.** One validated categorical colour
(`--color-series`, `#2a78d6`) carries magnitude; `--color-track` is recessive
chrome behind it. Consequences:

- No chart needs a legend — the title names the series.
- No colour pair exists for a colour-vision-deficient reader to confuse.

The palette was checked with a validator, not by eye: the series blue passes the
lightness band, chroma floor and ≥ 3:1 contrast against the `#fcfcfb` card
surface. **If you add a second series, re-validate the pair** — do not just pick
a colour that looks fine.

Other rules in force:

- Status colours (`good`/`warning`/`serious`/`critical`) are reserved for state
  and always ship with a glyph plus a word — never colour alone. See
  `StatusPill`.
- Values are direct-labelled; hover adds detail, it is not the only way to read
  a number.
- Text uses ink tokens, never a series colour.
- `tabular-nums` only where figures must align in a column — not on hero numbers.

**Light mode only.** A correct dark mode means re-stepping and re-validating
every colour against a dark surface. An automatic inversion produces exactly the
low-contrast result the validation exists to prevent, so it was left out rather
than done badly. If you add it, validate the dark steps as a set.

---

## Real-time

Socket.IO rooms: `space:<id>` for one listing, `monitor` for dashboards.

Events: `occupancy`, `availability` (carries a `reason`), `booking`.

`POST /spaces/:id/occupancy` is the real ingest path for sensors. The simulator
in `realtime.js` writes the same rows on a 15-second tick, shaped by a plausible
office-day curve.

**Turn the simulator off for tests** (`OCCUPANCY_SIMULATION=off`) — readings
arriving mid-run make count assertions non-deterministic.

**Do not ship the simulator to production users.** It publishes invented
occupancy numbers. It exists so the feature is demonstrable without hardware.

---

## Testing

`server/test/api-suite.mjs` — 79 behavioural checks against a running API.
Plain Node, no test framework. Exits 0/1 so it drops into CI unchanged.

```bash
cd server
npm run seed:fresh
npm run start:test                   # terminal 1 (simulator + rate limits off)
npm test                             # terminal 2
API_URL=https://... npm test         # against another environment
```

When you add a feature, add cases to this file. When you add a role boundary,
add the negative case — most of the value in the suite is in the 403s.

Known gaps are listed honestly in `docs/test-cases.md`: no frontend unit tests,
Socket.IO delivery verified manually, no load testing, Chrome only, no
accessibility audit, and no real concurrency test on the last-seat race.

---

## Defects found during the build

Recorded so they are not reintroduced.

| # | Defect | Cause | Fix |
|---|---|---|---|
| 1 | Chart crosshair and tooltip never appeared | Painted SVG shapes receive pointer events only where drawn; handlers sat on the `<svg>` root with a 2px line as the only mark | Transparent hit `<rect>` spanning the plot area, drawn last, carrying the handlers |
| 2 | Home page advertised "from ₹0/seat/mo" | `MIN(price_per_seat_month)` included the hourly-only meeting room, which stores 0 | `MIN(NULLIF(price_per_seat_month, 0))` |

A third was a defect in the *test*, not the app: an assertion expected 10 users,
but the suite's own admin-escalation attempt is correctly rejected, so 9 is
right. Corrected to 9, where it now doubles as a guard on `AUTH-10`.

---

## Gotchas

- **Node ≥ 22.5 is a hard floor.** `node:sqlite` does not exist before it.
- **Express 5 makes `req.query` read-only.** Validated query data goes to
  `req.validQuery`.
- **Zod 4 deprecated `z.string().email()`.** Use
  `z.string().trim().toLowerCase().pipe(z.email())` when you also want
  normalisation.
- **`node:sqlite` returns null-prototype objects.** Spread them before passing
  to code that expects a plain object.
- **`lastInsertRowid` is a BigInt.** Wrap in `Number()`.
- **Vite falls back to another port** if 5173 is taken. The `/api` proxy follows
  automatically; no config change needed.
- **SQLite serialises writes.** Fine at this scale. The migration trigger and
  the PostgreSQL path are documented in `docs/deployment.md` — four mechanical
  SQL substitutions.

---

## Known gaps

Not hidden, not pretending otherwise:

- No payment processing — bookings are requests.
- No refresh-token rotation, so a token cannot be revoked before it expires.
- Notifications are persisted and logged, not sent, until a provider is set.
- No review capture, so the brief's "user satisfaction score" KPI is not
  measurable.
- Rate limiting is per-process and in-memory. Across multiple instances it is
  per-instance, not global — move to a shared store (Redis) when you scale out.

Prioritised forward plan in `implementation-plan.md` § Phase 10.

---

## Documentation map

| File | Contents |
|---|---|
| `README.md` | Overview, quick start, features |
| `scope.md` | In/out of scope, KPIs, acceptance criteria |
| `tech-stack.md` | Every technology choice, with rejected alternatives |
| `implementation-plan.md` | Build phases, key decisions, forward plan |
| `docs/openapi.yaml` | OpenAPI 3.1 contract for all 46 endpoints |
| `docs/postman/` | Runnable collection — 43 requests, 22 assertions |
| `docs/test-cases.md` | 79-case matrix and coverage gaps |
| `docs/deployment.md` | Local, production, PostgreSQL migration |
