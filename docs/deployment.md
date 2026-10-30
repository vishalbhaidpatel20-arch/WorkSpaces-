# Deployment guide — FlexoSpaces

Covers local setup, environment configuration, production deployment, and the
PostgreSQL migration path.

---

## 1. Local development

### Requirements

- **Node.js ≥ 22.5** (24.x recommended). The version floor is real: the app uses
  the built-in `node:sqlite` module, which does not exist before 22.5.
- npm 10+. No database server, no Docker, no native build toolchain.

```bash
node -v   # must be >= 22.5
```

### Install and run

```bash
# from the repository root
npm run install:all     # installs server + client
npm run seed            # creates and seeds server/data/app.db

# terminal 1 — API on :4000
npm run dev:api

# terminal 2 — web app on :5173
npm run dev:web
```

Open **http://localhost:5173**.

> If port 5173 is taken, Vite picks the next free port and prints it. The API
> proxy follows automatically — no config change needed.

### Demo accounts

Every seeded account uses the password `Password123`.

| Role | Email | What it shows |
|---|---|---|
| Admin | `admin@flexospaces.com` | KPIs, approval queue, user management, live monitor |
| Owner | `meera@workloft.in` | 4 listings, booking requests, occupancy |
| Owner | `rohan@hivedesks.in` | 4 listings including the pending one |
| Owner | `kabir@nexushubs.in` | 4 listings |
| Member | `ananya@brightpixel.io` | Team of 6, collaborative |
| Member | `vikram@ledgerly.dev` | Team of 14, quiet focus |
| Member | `priya@freelance.dev` | Solo freelancer |
| Member | `arjun@scalecraft.co` | Team of 25, client facing |
| Member | `sara@designdock.in` | Team of 4, collaborative |

### Resetting

```bash
npm run seed            # wipes and reseeds (runs seed --fresh)
```

The test suite and the Postman collection both mutate data. Reseed before a
demo or a test run.

---

## 2. Environment variables

Copy `server/.env.example` to `server/.env`.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | API port |
| `NODE_ENV` | `development` | `production` disables request logging |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated list of allowed origins |
| `JWT_SECRET` | dev placeholder | **Must be replaced before deploying** |
| `JWT_TTL` | `7d` | Token lifetime |
| `DB_PATH` | `./data/app.db` | SQLite file location |
| `OCCUPANCY_SIMULATION` | `on` | `off` disables the telemetry simulator |
| `OCCUPANCY_INTERVAL_MS` | `15000` | Simulator tick interval |
| `SMTP_URL` | unset | Set to enable real email |
| `SMS_API_KEY` | unset | Set to enable real SMS |

Generate a production secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> With neither `SMTP_URL` nor `SMS_API_KEY` set, notifications are still
> persisted and shown in the app — they are logged rather than sent externally.
> The in-app feed works either way.

---

## 3. Running tests

```bash
cd server
npm run seed:fresh
OCCUPANCY_SIMULATION=off npm start     # terminal 1
npm test                               # terminal 2 — 76 checks
```

Against another environment:

```bash
API_URL=https://api.example.com npm test
```

The Postman collection runs the same way:

```bash
postman collection run docs/postman/FlexoSpaces.postman_collection.json
# 43 requests, 22 assertions
```

Turn the simulator off for tests. Occupancy readings arriving mid-run make
assertions on reading counts non-deterministic.

---

## 4. Production build

### Frontend

```bash
cd client
npm run build        # emits client/dist/
```

`dist/` is static — deploy to Vercel, Netlify, S3 + CloudFront, or any static
host.

**Set the API origin.** In development the Vite proxy makes `/api` same-origin.
In production the SPA and the API are usually on different hosts, so either:

- put both behind one domain with a path rule (`/api/*` → API, everything else →
  static), which keeps the code unchanged and avoids CORS entirely; **or**
- point the client at an absolute API URL and add that origin to `CORS_ORIGIN`.

The first option is simpler and is what the code assumes.

**SPA fallback is required.** Deep links like `/spaces/4` must serve
`index.html`, or a refresh 404s.

- Netlify — `client/public/_redirects`: `/*  /index.html  200`
- Vercel — `vercel.json` rewrite all to `/index.html`
- Nginx — `try_files $uri $uri/ /index.html;`

### Backend

```bash
cd server
npm ci --omit=dev
NODE_ENV=production node src/index.js
```

Run it under a supervisor (systemd, PM2, or a container restart policy).

#### Example systemd unit

```ini
[Unit]
Description=FlexoSpaces API
After=network.target

[Service]
Type=simple
User=flexo
WorkingDirectory=/srv/flexospaces/server
EnvironmentFile=/srv/flexospaces/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### Example Dockerfile

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
RUN mkdir -p data
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "src/index.js"]
```

**Mount `/app/data` as a volume.** Without it the SQLite file lives in the
container's writable layer and every deploy wipes the database.

#### Reverse proxy

WebSocket upgrade headers are required or the live feed silently falls back to
polling:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /socket.io/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

---

## 5. Before going live

Ordered by risk.

- [ ] Replace `JWT_SECRET` with a generated value. The default is a known string.
- [ ] Set `CORS_ORIGIN` to the real frontend origin only — never `*`.
- [ ] Terminate TLS at the proxy and redirect HTTP to HTTPS.
- [ ] **Add login rate limiting.** This is the one exploitable gap in the current
      build — `express-rate-limit` on `/api/auth/login` and `/api/auth/register`.
- [ ] Change every seeded account password, or delete the seed accounts entirely.
- [ ] Back up `data/app.db` on a schedule (`sqlite3 app.db ".backup"` works on a
      live database in WAL mode).
- [ ] Schedule `POST /api/admin/bookings/settle` daily so past stays complete.
- [ ] Configure `SMTP_URL` / `SMS_API_KEY` for real notification delivery.
- [ ] Add uptime monitoring against `GET /api/health`.
- [ ] Decide the occupancy source: wire real sensors to
      `POST /api/spaces/:id/occupancy`, or set `OCCUPANCY_SIMULATION=off` and
      accept empty telemetry. Leaving the simulator on in production publishes
      fabricated numbers.

That last point matters: the simulator exists so the feature can be demonstrated
without hardware. Shipping it to real users would mean showing them invented
occupancy data.

---

## 6. Scaling

### Current limits

SQLite serialises writes — one writer at a time, with readers unblocked thanks
to WAL. For a single-city pilot (hundreds of bookings a day) this is comfortably
sufficient and keeps operations trivial.

**Move to PostgreSQL when** concurrent write traffic becomes real, or when you
need more than one API instance. Two API processes against one SQLite file is
the failure mode to avoid — it works on one host but not across hosts, and it is
exactly where a "it worked yesterday" outage comes from.

### Migrating to PostgreSQL

The SQL is deliberately standard. Four mechanical changes:

| SQLite | PostgreSQL |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `GENERATED ALWAYS AS IDENTITY` |
| `datetime('now')` | `now()` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `info.lastInsertRowid` | `RETURNING id` |

Then:

1. `npm install pg`
2. Rewrite `server/src/lib/db.js` to export a `pg` pool with the same
   `prepare().get()/all()/run()` shape, or convert call sites to `await`.
3. Run the schema from `db.js` with the substitutions above.
4. Re-run `npm test` — 76 checks over the full surface will find anything missed.

Table definitions, indexes, constraints and every query otherwise carry over
unchanged.

### Horizontal scaling

The API is stateless (JWT, no server-side sessions), so instances scale behind a
load balancer once the database is shared. Two caveats:

- **Socket.IO needs a shared adapter** across instances
  (`@socket.io/redis-adapter`), or a client connected to instance A never
  receives an event emitted by instance B.
- **Run the occupancy simulator on exactly one instance**, or every instance
  writes its own readings.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module 'node:sqlite'` | Node older than 22.5 | Upgrade Node |
| `EADDRINUSE :4000` | API already running | Stop it, or set `PORT` |
| Frontend loads, API calls 404 | API not running | Start the API; Vite proxies `/api` to `:4000` |
| CORS error in production | Origin not allowlisted | Add it to `CORS_ORIGIN` |
| "Live" indicator stuck offline | WebSocket upgrade blocked | Add the `/socket.io/` proxy block above |
| No occupancy data | Simulator off and no sensors | Set `OCCUPANCY_SIMULATION=on`, or POST readings |
| Refresh on `/spaces/4` returns 404 | No SPA fallback | Add the rewrite rule for your host |
| Tests fail on counts | Database already mutated | `npm run seed:fresh` first |
| Database empty after deploy | SQLite file not on a volume | Mount persistent storage at `data/` |
