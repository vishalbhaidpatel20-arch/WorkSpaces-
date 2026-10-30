# Test cases — FlexoSpaces

## Running the suite

```bash
# terminal 1 — deterministic API (telemetry simulator off)
cd server
npm run seed:fresh
OCCUPANCY_SIMULATION=off npm start

# terminal 2
cd server
npm test
```

Exit code is 0 when every case passes, 1 otherwise, so it drops into CI
unchanged. Point it at another environment with `API_URL=https://… npm test`.

**The suite mutates data.** Run `npm run seed:fresh` before each run; several
cases assert on absolute counts.

## Latest result

```
79 passed, 0 failed
```

Executed against Node 24.21.0 on Windows 11, API on `localhost:4000`, freshly
seeded database.

---

## Coverage summary

| Area | Cases | Result |
|---|---|---|
| Authentication and registration | 10 | 10 pass |
| Search and filtering | 9 | 9 pass |
| Smart matching | 10 | 10 pass |
| Availability and booking | 13 | 13 pass |
| Owner decisions | 6 | 6 pass |
| Inquiries | 4 | 4 pass |
| Notifications | 2 | 2 pass |
| Real-time monitoring | 4 | 4 pass |
| Dashboards | 6 | 6 pass |
| Admin moderation | 8 | 8 pass |
| Error handling and catalogue | 4 | 4 pass |
| Production hardening | 3 | 3 pass |
| **Total** | **79** | **79 pass** |

---

## 1. Authentication and registration

| ID | Case | Expected | Result |
|---|---|---|---|
| AUTH-01 | Login with a wrong password | 401 | ✅ |
| AUTH-02 | Member login | 200, token + `role: user` | ✅ |
| AUTH-03 | Owner login | 200, `role: owner` | ✅ |
| AUTH-04 | Admin login | 200, `role: admin` | ✅ |
| AUTH-05 | `GET /auth/me` with no token | 401 | ✅ |
| AUTH-06 | `GET /auth/me` with a valid token | 200, correct user | ✅ |
| AUTH-07 | **Password hash never serialised** | `password_hash` absent from every response | ✅ |
| AUTH-08 | Register with an existing email | 409 | ✅ |
| AUTH-09 | Register with a bad email and a 3-char password | 422 with ≥ 2 field errors | ✅ |
| AUTH-10 | **Register with `role: "admin"`** | 422 — privilege escalation refused | ✅ |

## 2. Search and filtering

| ID | Case | Expected | Result |
|---|---|---|---|
| SRCH-01 | List spaces with no filters | 12 active of 13 seeded | ✅ |
| SRCH-02 | **Pending listing hidden from the public list** | Not present | ✅ |
| SRCH-03 | `city=Ahmedabad` | 3 results, all in Ahmedabad | ✅ |
| SRCH-04 | `budget=7000` | Every result ≤ ₹7,000/seat/mo | ✅ |
| SRCH-05 | `persons=100` | Every result seats ≥ 100 | ✅ |
| SRCH-06 | `amenities=gym,event_space` | Every result has **both** (AND, not OR) | ✅ |
| SRCH-07 | `sort=price_asc` | Prices non-decreasing | ✅ |
| SRCH-08 | `limit=5&page=2` | 5 items, `pages: 3` | ✅ |
| SRCH-09 | `q=boardroom` | 1 result, the HSR boardroom | ✅ |

## 3. Smart matching

| ID | Case | Expected | Result |
|---|---|---|---|
| MTCH-01 | Filtered search results carry a score | Every result has a numeric score and ≥ 1 reason | ✅ |
| MTCH-02 | Default ordering | Scores non-increasing | ✅ |
| MTCH-03 | `POST /match` returns recommendations | Non-empty | ✅ |
| MTCH-04 | Match metadata | `weights.capacity === 25`, numeric `average_score` | ✅ |
| MTCH-05 | 6-person collaborative Ahmedabad team | Top match is WorkLoft Prahladnagar | ✅ |
| MTCH-06 | Good fit scores high | Top score ≥ 85 | ✅ |
| MTCH-07 | **Over-budget options are surfaced, not hidden** | Results returned, reason contains "over your budget" | ✅ |
| MTCH-08 | `POST /match/explain/:id` | Per-criterion breakdown with weights and earned points | ✅ |
| MTCH-09 | Peer-team matching | Affinity-scored list returned | ✅ |
| MTCH-10 | **Peers expose no contact details** | No `email` or `phone` on any peer | ✅ |

## 4. Availability and booking

| ID | Case | Expected | Result |
|---|---|---|---|
| BOOK-01 | 30-day availability window | 31 day rows, first is `available` | ✅ |
| BOOK-02 | Quote: 5 days × 2 seats at ₹250/day | `total_price === 2500`, `days === 5` | ✅ |
| BOOK-03 | Quote reports bookability | `bookable: true` | ✅ |
| BOOK-04 | Booking without a token | 401 | ✅ |
| BOOK-05 | Member creates a request | 201, status `pending` | ✅ |
| BOOK-06 | Booking reference generated | Matches `FLX-…` | ✅ |
| BOOK-07 | **Pending request holds seats immediately** | `seats_booked === 2` on the start date | ✅ |
| BOOK-08 | Start date in the past | 422 | ✅ |
| BOOK-09 | End date before start date | 422 | ✅ |
| BOOK-10 | Seats beyond capacity | 422 | ✅ |
| BOOK-11 | Owner books their own space | 409 | ✅ |
| BOOK-12 | Book exactly the remaining seats | 201 | ✅ |
| BOOK-13 | **Overbooking by one seat** | 409 with `details.seats_available: 0` | ✅ |

## 5. Owner decisions

| ID | Case | Expected | Result |
|---|---|---|---|
| DECI-01 | Admin acts on any booking | 200 | ✅ |
| DECI-02 | **A different owner decides someone else's booking** | 403 | ✅ |
| DECI-03 | Owner confirms | status `confirmed` | ✅ |
| DECI-04 | Confirm an already-confirmed booking | 409 | ✅ |
| DECI-05 | Member cancels their own booking | status `cancelled` | ✅ |
| DECI-06 | **Cancellation releases the held seats** | `seats_booked` drops by the cancelled seats | ✅ |

## 6. Inquiries

| ID | Case | Expected | Result |
|---|---|---|---|
| INQ-01 | Member raises an inquiry | 201, status `open` | ✅ |
| INQ-02 | Message under 10 characters | 422 | ✅ |
| INQ-03 | Owner replies | status becomes `responded` | ✅ |
| INQ-04 | **Non-owner replies** | 403 | ✅ |

## 7. Notifications

| ID | Case | Expected | Result |
|---|---|---|---|
| NOTI-01 | Booking flow generates alerts | ≥ 3 notifications for the member | ✅ |
| NOTI-02 | Both channels used | `email` and `sms` both present | ✅ |

## 8. Real-time monitoring

| ID | Case | Expected | Result |
|---|---|---|---|
| OCCU-01 | Owner posts a sensor reading | 201, percent computed correctly | ✅ |
| OCCU-02 | Reading above capacity | 422 | ✅ |
| OCCU-03 | **Member posts telemetry** | 403 | ✅ |
| OCCU-04 | Occupancy history | Latest reading plus average percent | ✅ |

**Not covered by the automated suite:** Socket.IO event delivery. Verified
manually in Chrome — the owner and admin dashboards show a connected "Live"
indicator and occupancy meters update in place without a reload.

## 9. Dashboards

| ID | Case | Expected | Result |
|---|---|---|---|
| DASH-01 | Member dashboard | Booking stats and upcoming list | ✅ |
| DASH-02 | Owner dashboard | 4 listings, numeric utilisation | ✅ |
| DASH-03 | Owner dashboard carries live occupancy | At least one space has a reading | ✅ |
| DASH-04 | **Member requests the owner dashboard** | 403 | ✅ |
| DASH-05 | Admin KPIs | 9 users, 1 listing awaiting approval | ✅ |
| DASH-06 | **Owner requests the admin dashboard** | 403 | ✅ |

> DASH-05 asserts 9 users specifically to prove AUTH-10 did not create an
> account. If the escalation attempt ever succeeds, this case fails too.

## 10. Admin moderation

| ID | Case | Expected | Result |
|---|---|---|---|
| ADMN-01 | Approval queue | 1 pending listing | ✅ |
| ADMN-02 | Approve a listing | status `active` | ✅ |
| ADMN-03 | **Approved listing becomes publicly visible** | Appears in public search | ✅ |
| ADMN-04 | Suspend a listing | status `suspended` | ✅ |
| ADMN-05 | List owners | 3, each with `spaces_count` | ✅ |
| ADMN-06 | Change a user's role | Role updated | ✅ |
| ADMN-07 | **Admin demotes themselves** | 409 | ✅ |
| ADMN-08 | **Owner calls an admin route** | 403 | ✅ |

## 11. Error handling and catalogue

| ID | Case | Expected | Result |
|---|---|---|---|
| MISC-01 | Unknown space id | 404 | ✅ |
| MISC-02 | Unknown endpoint | 404 | ✅ |
| MISC-03 | Filter bounds endpoint | 6 cities, 18 amenities | ✅ |
| MISC-04 | Amenity catalogue | Every entry has `space_count` | ✅ |

---

## Manual UI verification

Performed in Chrome against the dev server, console clean (no errors, no React
warnings) on every page.

| Screen | Verified |
|---|---|
| Home | Hero, quick search, live platform stats, featured listings |
| Search | Filters applied from the URL, match badges with reasons, sort, pagination |
| Space detail | Gallery, amenities, **live occupancy meter**, **occupancy line chart with working crosshair tooltip**, 30-day availability strip, live price quote |
| Login | Demo-account shortcuts, role-aware redirect |
| Owner dashboard | KPI tiles, pending request with confirm/decline, open inquiries, per-floor occupancy meters, 7-day demand |
| Admin dashboard | 11 KPI tiles, bookings by status and city, approval queue, user table, platform-wide live monitor |

Responsive behaviour checked at mobile, tablet and desktop widths.

---

## Defects found and fixed during testing

| # | Defect | Root cause | Fix |
|---|---|---|---|
| 1 | Chart crosshair and tooltip never appeared | Painted SVG shapes only receive pointer events where drawn; handlers were on the `<svg>` root with a 2px line as the only mark | Added a transparent hit `<rect>` spanning the plot area, drawn last, carrying the handlers |
| 2 | Home page advertised "from ₹0/seat/mo" | `MIN(price_per_seat_month)` included the hourly-only meeting room, which stores 0 | `MIN(NULLIF(price_per_seat_month, 0))` |

A third issue was a defect in the **test**, not the app: an early assertion
expected 10 registered users, but the suite's own admin-escalation attempt is
correctly rejected, so 9 is right. The assertion was corrected to 9 and now
doubles as a guard on AUTH-10.

---

## Known gaps in coverage

Stated plainly rather than implied by omission:

- **No frontend unit or component tests.** UI verification was manual.
- **Socket.IO events are not asserted programmatically** — verified by eye.
- **No load or performance testing.** Response times were not measured under
  concurrency; the brief's "fast search" requirement is addressed structurally
  (SQL filtering, indexes) but is unproven under load.
- **No cross-browser matrix.** Chrome only.
- **No accessibility audit.** Semantic HTML, ARIA roles on charts and meters,
  focus-visible styling and non-colour-alone status cues are implemented, but no
  screen-reader pass or automated axe run was performed.
- **Concurrency:** two simultaneous requests for the last seat were not tested
  under real parallelism. The read-then-write in the booking path is not wrapped
  in a transaction, so this is the most likely place for a race under load —
  worth addressing before production traffic.
