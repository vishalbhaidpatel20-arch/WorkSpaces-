# Technology stack — WorkSpace

Every choice below is listed with the reason it was made and, where a different
option was reasonable, what was rejected and why.

---

## Summary

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 24.x (≥ 22.5 required) |
| API framework | Express | 5.x |
| Database | SQLite via `node:sqlite` | built into Node |
| Auth | JSON Web Tokens + scrypt | `jsonwebtoken` 9.x, `node:crypto` |
| Validation | Zod | 4.x |
| Real-time | Socket.IO | 4.x |
| HTTP logging | morgan | 1.x |
| Security headers | helmet | 8.x |
| Rate limiting | express-rate-limit | 8.x |
| Compression | compression | 1.x |
| Frontend | React | 19.x |
| Build tool | Vite | 7.x |
| Routing | React Router | 7.x |
| Styling | Tailwind CSS | 4.x |
| Charts | Hand-built SVG | no dependency |

Total runtime dependencies: **10 server, 4 client**. Nothing paid, nothing that
needs a native toolchain to install.

---

## Backend

### Node.js 24 + Express 5

The brief suggests Node with Express, and it fits: the workload is I/O-bound
CRUD and a WebSocket feed, which is exactly what the event loop is good at. One
language across both halves of the codebase also keeps context-switching down.

Express 5 over Express 4 because async errors now propagate to the error
middleware automatically, so every route handler can `throw` and be handled in
one place rather than wrapping each in a try/catch.

### `node:sqlite` instead of MongoDB or PostgreSQL

The brief suggests MongoDB or PostgreSQL. This build uses SQLite through Node's
**built-in** `node:sqlite` module, for three reasons:

1. **The data is relational.** Users own spaces, spaces have many amenities,
   bookings reference both, availability is one row per space per day. Booking
   correctness depends on constraints and joins — `CHECK` on status values,
   `FOREIGN KEY ... ON DELETE CASCADE`, a `UNIQUE (space_id, date)` on
   availability. A document store would push that integrity into application
   code, which is where overbooking bugs live.
2. **Zero setup for a reviewer.** `npm install && npm run seed && npm start`
   works on any machine with Node 22.5+. No server to install, no connection
   string, no Docker, no cloud account. An evaluator can run this in two minutes.
3. **No native build step.** `better-sqlite3` is faster but compiles against
   node-gyp and routinely fails on fresh Windows machines. `node:sqlite` ships
   with Node, so installation cannot fail.

The SQL used is standard. Migrating to PostgreSQL means swapping the driver and
adjusting three things: `AUTOINCREMENT` → `GENERATED ... AS IDENTITY`,
`datetime('now')` → `now()`, and `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`.
Table definitions and every query otherwise carry over. See
`docs/deployment.md` for the step-by-step path.

**What this costs:** SQLite takes one writer at a time. That is irrelevant at
this scale but is the reason to move to PostgreSQL before heavy concurrent
write traffic — the documented trigger point, not a vague "later".

### scrypt rather than bcrypt

`bcryptjs` is the usual pick, but `node:crypto` already provides `scrypt`, which
is memory-hard and therefore more resistant to GPU attack than bcrypt. It needs
no dependency. Hashes are stored as `salt:hash` with a 16-byte random salt per
user, and verification is constant-time via `timingSafeEqual`.

### JWT rather than server sessions

Stateless tokens mean any API instance can serve any request, so the service
scales horizontally behind a load balancer with no shared session store — which
is what the 99.5% availability target actually requires.

**What this costs:** a token cannot be revoked before it expires. Acceptable at
a 7-day TTL for this phase; a production hardening step is a short access token
plus a refresh token with a revocation list.

### Zod for validation

Every request body and query string is parsed by a schema before a handler runs.
This matters for more than tidiness: it coerces query strings to numbers, strips
unknown keys, and — critically — it is what stops a user registering with
`role: "admin"`, because the public schema only permits `user` and `owner`.
Failures return HTTP 422 with per-field messages the UI renders inline.

### Socket.IO rather than raw WebSocket

Socket.IO gives rooms (`space:<id>`, `monitor`), automatic reconnection, and a
polling fallback for restrictive networks. Hand-rolling reconnection and
room fan-out on `ws` is the bulk of what Socket.IO already does.

**What this costs:** a larger client bundle than raw `ws` and a protocol that is
not plain WebSocket. Both are acceptable for a dashboard feed.

---

## Frontend

### React 19 + Vite

The brief suggests React. Vite over Create React App because CRA is deprecated;
Vite gives sub-second cold start and native ES modules in development.

**Next.js was considered and rejected.** Its advantages — SSR, file routing, API
routes — do not pay for themselves here: the app is behind a login for
everything except browsing, SEO is not a requirement for a capstone, and the API
is deliberately a separate service so it can be deployed, scaled and tested on
its own. Adding Next.js would mean a second server runtime for no gain.

### React Router 7

Standard client-side routing. Route protection is a single `<Protected>`
wrapper that gates on authentication and, optionally, on role. Search state
lives in the URL query string, so a filtered search is shareable and survives a
reload — one of the few decisions here that users actually notice.

### Tailwind CSS 4

Utility classes keep styling next to markup, which keeps responsive behaviour
readable. v4 is configured through CSS (`@theme`) rather than a JS config file,
so the design tokens and the stylesheet are the same artefact.

Design tokens are defined once as CSS custom properties — surfaces, ink levels,
chart series, status roles — and everything else refers to them by role.

### No chart library

Recharts, Chart.js and D3 were all considered. The app needs four chart forms:
a stat tile, a meter, a horizontal bar list and a line chart with a crosshair.
Those are roughly 200 lines of SVG, against ~500 KB of dependency, and
hand-building them means the colours, mark weights and hover behaviour follow
the design system exactly rather than being fought into shape.

**Every chart is deliberately single-series.** One validated categorical colour
carries magnitude and a recessive grey track sits behind it. That means no chart
needs a legend (its title names the series) and no pair of colours can be
confused by a colour-vision-deficient reader. The palette was checked with a
validator, not by eye: the series blue `#2a78d6` passes the lightness band,
chroma floor and ≥ 3:1 contrast against the `#fcfcfb` card surface.

**What this costs:** no zoom, no brush, no animated transitions. None are
required by the brief.

---

## Tooling

| Tool | Use |
|---|---|
| `node --test` | Test runner, built in — no Jest/Vitest dependency |
| `node --watch` | API hot reload, built in — no nodemon |
| OpenAPI 3.1 | API contract at `docs/openapi.yaml` |
| Postman collection | Runnable requests at `docs/postman/` |

---

## Architecture

```
┌──────────────────────┐         ┌──────────────────────────────┐
│  React SPA (Vite)    │  REST   │  Express API                 │
│  localhost:5173      │ ──────► │  localhost:4000              │
│                      │         │                              │
│  • search & match    │ ◄────── │  routes/   auth, spaces,     │
│  • booking flow      │  JSON   │            bookings,         │
│  • 3 dashboards      │         │            inquiries, match, │
│                      │         │            amenities,        │
│                      │ Socket  │            dashboard, admin  │
│  • live occupancy    │ ◄─────► │  lib/      db, auth, match,  │
└──────────────────────┘   .IO   │            spaces, notify    │
                                 │  middleware/ auth, errors    │
                                 └───────────────┬──────────────┘
                                                 │
                                        ┌────────▼────────┐
                                        │  SQLite (WAL)   │
                                        │  9 tables       │
                                        └─────────────────┘
```

**Layering.** Routes handle HTTP and validation only. `lib/` holds the logic
worth testing on its own — matching, availability arithmetic, notifications.
`middleware/` holds cross-cutting auth and error translation. The matching
engine in particular is a pure function of `(space, criteria)`, so it can be
unit-tested without a database or a server.

---

## Security posture

| Concern | Handling |
|---|---|
| Password storage | scrypt, 16-byte per-user salt, constant-time compare |
| Password exposure | `publicUser()` strips the hash before any serialisation |
| Privilege escalation | Role is validated by schema on signup; admin only by admin action; an admin cannot change their own role |
| SQL injection | Every query uses prepared statements with bound parameters — no string interpolation of user input |
| Authorisation | Role and ownership checked server-side on every mutating route; the client never decides access |
| Account enumeration | Login returns one message for both unknown email and wrong password |
| Input validation | Zod on all bodies and query strings, with explicit bounds on numbers and lengths on strings |
| CORS | Restricted to a configured origin list |
| Payload size | JSON capped at 1 MB |
| Secrets | `JWT_SECRET` from the environment; the dev default is obviously named and documented as replace-before-deploy |

### Production hardening

| Concern | Handling |
|---|---|
| Brute force | `express-rate-limit`: 10/15min on credential endpoints, 30/min on writes, 300/min overall |
| Security headers | `helmet` — nosniff, SAMEORIGIN, no-referrer, COOP/CORP; `X-Powered-By` removed |
| Unsafe production config | The process exits non-zero under `NODE_ENV=production` with a default/short `JWT_SECRET` or wildcard `CORS_ORIGIN` |
| Oversell race | Seat check + hold in one `BEGIN IMMEDIATE` transaction; status transitions are conditional updates |
| Proxy awareness | `trust proxy` configurable via `TRUST_PROXY_HOPS`, so rate limits see real client IPs |
| Shutdown | SIGTERM/SIGINT drain in-flight requests and checkpoint the WAL, with a 10s forced timeout |
| Transfer | gzip via `compression` |

**Known gaps, stated rather than hidden:** no refresh-token rotation (so a token
cannot be revoked before its 7-day expiry), rate limiting is in-memory and
therefore per-instance rather than global (move to a Redis store when scaling
out), no CSRF concern because auth is a bearer header rather than a cookie, and
no HTTPS termination in the app itself (expected at the proxy).

---

## Versions

Pinned to the current stable release of each package at build time
(October 2026). `package-lock.json` is committed in both halves, so an install
reproduces exactly.
