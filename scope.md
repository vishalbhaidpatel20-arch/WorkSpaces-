# Scope — FlexoSpaces

**Project:** Smart Co-Working Space Management Using Real-Time Monitoring
**Client brief:** Unified Mentor / Flexo Spaces
**Phase:** 1 (web only)
**Status of this document:** baseline scope as built

---

## 1. Problem statement

Teams looking for a co-working space today cannot easily:

- find spaces that match their **team size, area need and budget** at the same time;
- **compare amenities** across providers on equal terms;
- see **real-time availability** before they commit;
- state their **expectations** to a provider without a phone-tag loop.

Operators, on the other side, lack a digital channel for availability, approvals
and utilisation, and so coordinate manually.

## 2. Objectives

### Primary

| # | Objective | How this build meets it |
|---|---|---|
| P1 | One platform to discover and book co-working spaces | Public search + detail + booking request flow |
| P2 | Smart matching on user criteria and expectations | Weighted 7-criteria scoring engine with per-space reasons (`POST /api/match`) |
| P3 | Transparent capacity, area, pricing and amenities | Every listing publishes capacity, sq.ft, area/seat, all three price bases, and its full amenity set |

### Secondary

| # | Objective | How this build meets it |
|---|---|---|
| S1 | Improve workspace utilisation for providers | Owner dashboard: utilisation %, 7-day forward seat demand, live occupancy per floor |
| S2 | Reduce manual coordination | Digital request → approve/decline → notify workflow; inquiry threads carry expectations up front |
| S3 | Personalisation and recommendations | Profile work style and team size feed matching; peer-team affinity matching |

## 3. Target users

| Role | Needs | Platform role |
|---|---|---|
| Freelancers | Cheap day passes, flexible access | `user` |
| Remote workers | Quiet space near home, hybrid terms | `user` |
| Startups / small teams | 4–25 seats, collaborative floors | `user` |
| Enterprises | 25+ seats, client-facing, compliance | `user` |
| Space owners / managers | Listings, pricing, availability, approvals, occupancy | `owner` |
| Platform administrators | Moderation, user management, KPIs | `admin` |

## 4. In scope — delivered

### 4.1 Accounts and access
- Registration and login with JWT; passwords hashed with scrypt + per-user salt.
- Three roles — **User (member)**, **Space Owner**, **Admin** — enforced server-side on every route.
- Public signup is limited to `user` and `owner`; **admin cannot be self-assigned**.
- Profile management and password change.

### 4.2 Workspace listings
- Area size (sq.ft), seating capacity, derived area-per-seat.
- Workspace type: private cabin, shared desk, dedicated desk, meeting room.
- Pricing on three bases: per seat/month, per day, per hour.
- Opening hours, work-style tag, cover image, locality and full address.
- Owner CRUD, with admin approval before a listing becomes publicly visible.

### 4.3 Smart search, filtering and matching
- Filters: keyword, city, locality, number of persons, area, budget (min/max),
  workspace type, work style, amenities (AND), minimum rating, available-on date.
- Sorting: best match, price asc/desc, rating, capacity, area, newest. Paginated.
- **Matching engine** scores every result 0–100 across seven weighted criteria
  (capacity 25, budget 25, amenities 15, location 15, area 10, type 5, work style 5)
  and returns human-readable reasons plus a per-criterion breakdown.
- Filtering hides non-matches; matching deliberately **does not** — it surfaces
  near-misses with the shortfall stated.

### 4.4 Amenities
- 18-item seeded catalogue across five categories, admin-managed.
- Per-space amenity assignment; usage counts exposed for filter UIs.

### 4.5 Real-time availability and monitoring
- Day-by-day availability schedule per space (90-day window on approval).
- A booking request **holds its seats immediately**; decline/cancel releases them.
- Owners can set seat counts or block date ranges (maintenance, private events).
- **Occupancy telemetry**: ingest endpoint for sensors, history endpoint, and a
  Socket.IO feed (`occupancy`, `availability`, `booking` events) consumed by the
  space page and the owner/admin dashboards. A simulator stands in for hardware.

### 4.6 Booking and inquiry management
- Price quote preview, booking request, owner confirm/decline with reason,
  cancellation by either party, and an admin settle job for past stays.
- Inquiry threads carrying team size, work style, expectations and a
  meeting-request flag; owner reply and close.

### 4.7 Dashboards
- **Member**: booking counts, spend, upcoming stays, inquiries, notification feed.
- **Owner**: listings, pending requests, open inquiries, revenue, utilisation,
  live occupancy per floor, 7-day forward seat demand.
- **Admin**: 11 platform KPIs, bookings by status and city, top spaces, recent
  bookings, approval queue, user management, platform-wide live monitor.

### 4.8 Notifications
- Email and SMS messages on registration, booking request, confirm, decline,
  cancel, inquiry, reply, role change, listing approval and suspension.
- Every message is persisted, giving both an in-app feed and a delivery audit trail.
- Transport is pluggable (`SMTP_URL` / `SMS_API_KEY`); unconfigured, messages are
  logged so the whole workflow stays testable offline.

## 5. Non-functional scope — delivered

| Requirement | How it is met |
|---|---|
| Responsive design | Mobile-first Tailwind layouts; verified at mobile, tablet and desktop widths |
| Secure authentication | scrypt hashing, JWT bearer tokens, role guards, no password hash ever serialised, login does not reveal whether an email exists |
| Fast search and filtering | Filtering runs in SQL with indexes on city, status, owner, capacity and price; scoring runs only over the filtered rows |
| Scalability across cities | No city is hard-coded; cities are derived from data. SQLite via `node:sqlite` in dev, with a documented migration path to PostgreSQL |
| High availability (99.5%) | Stateless API (JWT, no server sessions) so instances scale horizontally behind a load balancer; see `docs/deployment.md` |

## 6. Out of scope — explicitly not built

Per the brief, and not attempted:

- Native mobile applications (Android / iOS)
- AI-driven dynamic pricing optimisation
- Offline bookings or walk-in management
- Third-party accounting or ERP integration
- Long-term lease contract management

Additionally out of scope for Phase 1, and called out so nobody assumes otherwise:

- **Payment processing.** Bookings are requests; no money moves. The booking
  record carries a computed total only.
- **Real occupancy hardware.** The ingest endpoint and event contract are built;
  a simulator drives them. Wiring real sensors is an integration task.
- **Real email/SMS delivery.** The notification layer, persistence and audit
  trail exist; a provider must be configured to send externally.
- **Reviews and ratings capture.** Ratings are displayed from seeded data; there
  is no review submission flow.
- **Map / geospatial search.** Location matching is by city and locality text,
  not coordinates or radius.
- **Dark mode.** Light mode only, using a validated palette. Not shipped rather
  than shipped as an unvalidated automatic inversion.

## 7. Assumptions

- Users have internet access and basic digital literacy.
- Space data is supplied accurately by owners; admin approval is the control.
- Owners keep availability and pricing current.
- Currency is INR throughout; all listings are in India.
- One timezone; dates are handled as calendar dates (`YYYY-MM-DD`), not instants.

## 8. Constraints

- Fixed project timeline and budget.
- Web-only for Phase 1.
- Manual approval and verification of listings initially.
- No paid third-party services required to run or evaluate the build.

## 9. Deliverables

| Deliverable | Location |
|---|---|
| Requirements / scope documentation | `scope.md` (this file) |
| Implementation plan | `implementation-plan.md` |
| Technology stack and rationale | `tech-stack.md` |
| Fully functional web application | `server/`, `client/` |
| Admin dashboard | `/admin` route |
| API contract | `docs/openapi.yaml` |
| Postman collection | `docs/postman/FlexoSpaces.postman_collection.json` |
| Test cases | `docs/test-cases.md` |
| Deployment guide | `docs/deployment.md` |
| Build notes | `CLAUDE.md` |

## 10. Key performance indicators

Exposed live on `GET /api/dashboard/admin`:

| KPI (from the brief) | Field |
|---|---|
| Number of registered users | `registered_users` |
| Workspace search-to-booking conversion | `booking_completion_rate` (share of decided requests approved) |
| Average match accuracy score | `average_score` on `POST /api/match` |
| Booking completion rate | `booking_completion_rate`, with `cancellation_rate` alongside |
| User satisfaction score | **Not implemented** — requires a review-capture flow (see §6) |

Supporting metrics also exposed: spaces listed/active/awaiting approval, total
seats, bookings by status and city, gross booking value, occupancy today,
open inquiries, notifications sent.

## 11. Acceptance criteria

1. A visitor can search and filter spaces and see a match score with reasons. ✅
2. A member can register, request a booking, and be notified of the outcome. ✅
3. Seats cannot be overbooked, including across a multi-day range. ✅
4. An owner can list a space, manage availability, and approve or decline requests. ✅
5. An admin can approve, suspend, and see platform KPIs. ✅
6. Role boundaries hold: no member can reach owner or admin functions. ✅
7. Occupancy updates reach an open dashboard without a page reload. ✅

All seven are covered by the 76-check API suite in `docs/test-cases.md`.
