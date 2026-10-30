import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useSpaceOccupancy } from '../lib/socket.js';
import {
  Loading, ErrorBanner, Modal, StatusPill, Badge, SectionHeading, useToast, Spinner,
} from '../components/ui.jsx';
import { Meter, OccupancyLine, AvailabilityStrip } from '../components/charts.jsx';
import { MatchBadge } from '../components/SpaceCard.jsx';
import {
  money, num, typeLabel, styleLabel, todayISO, addDaysISO, dateLabel, stayLength, timeLabel,
} from '../lib/format.js';

/* ----------------------------------------------------------- booking --- */

function BookingPanel({ space, onBooked }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    start_date: addDaysISO(todayISO(), 1),
    end_date: addDaysISO(todayISO(), 1),
    seats: Math.min(space.capacity, 1),
    notes: '',
  });
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const valid = form.start_date && form.end_date && form.end_date >= form.start_date && form.seats >= 1;

  // Re-price whenever dates or seat count change, so the total is never stale.
  useEffect(() => {
    if (!valid) { setQuote(null); return; }
    const controller = new AbortController();
    setQuoting(true);
    api.post('/bookings/quote', {
      space_id: space.id,
      start_date: form.start_date,
      end_date: form.end_date,
      seats: Number(form.seats),
    }, { signal: controller.signal })
      .then((r) => setQuote(r.data))
      .catch((e) => { if (e.name !== 'AbortError') setQuote(null); })
      .finally(() => setQuoting(false));
    return () => controller.abort();
  }, [space.id, form.start_date, form.end_date, form.seats, valid]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: `/spaces/${space.id}` } });
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api.post('/bookings', {
        space_id: space.id,
        start_date: form.start_date,
        end_date: form.end_date,
        seats: Number(form.seats),
        notes: form.notes || undefined,
      });
      toast.success(`Request ${r.data.code} sent — the owner will confirm shortly.`);
      onBooked?.();
      navigate('/bookings');
    } catch (e) {
      setErr(e);
    } finally {
      setSubmitting(false);
    }
  };

  const isOwnSpace = user?.id === space.owner_id;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
      <div>
        <p className="text-xl font-semibold text-ink">
          {space.price_per_seat_month > 0 ? (
            <>{money(space.price_per_seat_month)}
              <span className="text-sm font-normal text-ink-muted">/seat/month</span></>
          ) : (
            <>{money(space.price_per_hour)}
              <span className="text-sm font-normal text-ink-muted">/hour</span></>
          )}
        </p>
        {space.price_per_day > 0 && (
          <p className="text-sm text-ink-soft">{money(space.price_per_day)} per day pass</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="b-start">Start</label>
          <input id="b-start" type="date" className="field" min={todayISO()}
                 value={form.start_date}
                 onChange={(e) => setForm((f) => ({
                   ...f,
                   start_date: e.target.value,
                   end_date: f.end_date < e.target.value ? e.target.value : f.end_date,
                 }))} />
        </div>
        <div>
          <label className="label" htmlFor="b-end">End</label>
          <input id="b-end" type="date" className="field" min={form.start_date}
                 value={form.end_date}
                 onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="b-seats">
          Seats <span className="font-normal text-ink-muted">(max {space.capacity})</span>
        </label>
        <input id="b-seats" type="number" className="field tabular" min="1" max={space.capacity}
               value={form.seats}
               onChange={(e) => setForm((f) => ({ ...f, seats: e.target.value }))} />
      </div>

      <div>
        <label className="label" htmlFor="b-notes">Notes for the owner <span className="font-normal text-ink-muted">(optional)</span></label>
        <textarea id="b-notes" className="field" rows="2" maxLength="1000"
                  placeholder="Anything they should know?"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </div>

      <div className="rounded-lg border border-ink/10 bg-plane p-3 text-sm">
        {quoting && <p className="flex items-center gap-2 text-ink-muted"><Spinner className="h-4 w-4" /> Pricing…</p>}
        {!quoting && quote && (
          <>
            <div className="flex justify-between text-ink-soft">
              <span>{quote.days} day{quote.days === 1 ? '' : 's'} × {quote.seats} seat{quote.seats === 1 ? '' : 's'}</span>
              <span className="tabular">{stayLength(form.start_date, form.end_date)}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between border-t border-ink/10 pt-1.5">
              <span className="font-semibold text-ink">Total</span>
              <span className="tabular text-lg font-semibold text-ink">{money(quote.total_price)}</span>
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              {quote.bookable
                ? `${quote.seats_available} seat(s) free across those dates`
                : `Only ${quote.seats_available} seat(s) free across those dates`}
            </p>
          </>
        )}
        {!quoting && !quote && <p className="text-ink-muted">Pick valid dates to see a total.</p>}
      </div>

      <ErrorBanner error={err} />

      {isOwnSpace ? (
        <p className="rounded-lg bg-ink/5 p-3 text-center text-sm text-ink-soft">
          This is your own listing.
        </p>
      ) : (
        <button type="submit" className="btn btn-primary w-full"
                disabled={submitting || !valid || (quote && !quote.bookable)}>
          {submitting ? <><Spinner className="h-4 w-4" /> Sending…</>
            : user ? 'Request booking' : 'Sign in to book'}
        </button>
      )}
      <p className="text-center text-xs text-ink-muted">
        Seats are held while the owner reviews your request. No payment is taken here.
      </p>
    </form>
  );
}

/* ---------------------------------------------------------- inquiry --- */

function InquiryModal({ space, open, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    subject: `Question about ${space.name}`,
    message: '',
    team_size: user?.team_size || '',
    work_style: user?.work_style || '',
    expectations: '',
    wants_meeting: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/inquiries', {
        space_id: space.id,
        subject: form.subject,
        message: form.message,
        team_size: form.team_size || undefined,
        work_style: form.work_style || undefined,
        expectations: form.expectations || undefined,
        wants_meeting: form.wants_meeting,
      });
      toast.success('Inquiry sent to the space manager.');
      onClose();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Contact the space manager"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary" onClick={submit}
                       disabled={busy || form.message.trim().length < 10}>
                 {busy ? 'Sending…' : 'Send inquiry'}
               </button>
             </>
           }>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          Sharing your team size, work style and expectations up front lets the manager
          answer with the details that matter to you.
        </p>
        <div>
          <label className="label" htmlFor="i-subject">Subject</label>
          <input id="i-subject" className="field" maxLength="140" value={form.subject}
                 onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="i-message">Your question</label>
          <textarea id="i-message" className="field" rows="4" maxLength="2000"
                    placeholder="What do you need to know before booking?"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <p className="mt-1 text-xs text-ink-muted">{form.message.trim().length}/10 characters minimum</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="i-team">Team size</label>
            <input id="i-team" type="number" min="1" className="field tabular" value={form.team_size}
                   onChange={(e) => setForm({ ...form, team_size: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="i-style">Work style</label>
            <select id="i-style" className="field" value={form.work_style}
                    onChange={(e) => setForm({ ...form, work_style: e.target.value })}>
              <option value="">Not specified</option>
              <option value="quiet_focus">Quiet focus</option>
              <option value="collaborative">Collaborative</option>
              <option value="hybrid">Hybrid</option>
              <option value="client_facing">Client facing</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="i-exp">Your expectations</label>
          <textarea id="i-exp" className="field" rows="2" maxLength="1000"
                    placeholder="e.g. seats together, 40+ Mbps uploads, guaranteed meeting-room hours"
                    value={form.expectations}
                    onChange={(e) => setForm({ ...form, expectations: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={form.wants_meeting}
                 onChange={(e) => setForm({ ...form, wants_meeting: e.target.checked })} />
          I would like to schedule a call or visit
        </label>
        <ErrorBanner error={err} />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- page --- */

export default function SpaceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(`/spaces/${id}`);
  const space = data?.data;

  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const live = useSpaceOccupancy(id, space?.live_occupancy);

  const occupancyPoints = useMemo(() => {
    if (!space?.recent_occupancy?.length) return [];
    return space.recent_occupancy.map((r) => ({
      value: Math.round((r.seats_occupied / Math.max(1, r.seats_total)) * 100),
      label: timeLabel(r.recorded_at),
    }));
  }, [space]);

  if (loading) return <Loading label="Loading space…" />;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ErrorBanner error={error} onRetry={reload} />
        <p className="mt-4 text-center text-sm text-ink-soft">
          <Link to="/spaces" className="font-semibold text-brand hover:underline">
            Back to all spaces
          </Link>
        </p>
      </div>
    );
  }
  if (!space) return null;

  const current = live || space.live_occupancy;

  return (
    <div className="mx-auto max-w-7xl px-4 py-7">
      <nav className="mb-4 text-sm text-ink-muted" aria-label="Breadcrumb">
        <Link to="/spaces" className="hover:text-brand">Spaces</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">{space.city}</span>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink">{space.name}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{space.name}</h1>
                <p className="mt-1 text-sm text-ink-soft">
                  {space.address || `${space.locality}, ${space.city}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {space.status !== 'active' && <StatusPill status={space.status} />}
                {space.availability_today && (
                  <StatusPill status={space.availability_today.status}>
                    {space.availability_today.status === 'available'
                      ? `${space.availability_today.seats_available} seats free today`
                      : 'Full today'}
                  </StatusPill>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{typeLabel(space.workspace_type)}</Badge>
              {styleLabel(space.work_style) && <Badge>{styleLabel(space.work_style)}</Badge>}
              {space.rating > 0 && (
                <Badge>★ {space.rating.toFixed(1)} ({num(space.review_count)} reviews)</Badge>
              )}
              <Badge>Open {space.opens_at}–{space.closes_at}</Badge>
            </div>
          </header>

          {space.image_url && !imgFailed ? (
            <img src={space.image_url} alt={space.name} onError={() => setImgFailed(true)}
                 className="h-72 w-full rounded-xl border border-ink/10 object-cover sm:h-96" />
          ) : (
            <div className="grid h-56 w-full place-items-center rounded-xl border border-ink/10
                            bg-gradient-to-br from-brand-wash to-track text-4xl font-bold text-brand-dark"
                 aria-hidden="true">
              {space.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <dl className="card grid grid-cols-2 divide-ink/8 sm:grid-cols-4 sm:divide-x">
            {[
              ['Seating capacity', `${num(space.capacity)} people`],
              ['Total area', `${num(space.area_sqft)} sq.ft`],
              ['Area per seat', `${Math.round(space.area_sqft / space.capacity)} sq.ft`],
              ['Workspace type', typeLabel(space.workspace_type)],
            ].map(([k, v]) => (
              <div key={k} className="px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {space.description && (
            <section>
              <SectionHeading title="About this space" />
              <p className="text-sm leading-relaxed text-ink-soft">{space.description}</p>
            </section>
          )}

          <section>
            <SectionHeading title="Amenities" hint={`${space.amenities.length} shared amenities`} />
            {space.amenities.length === 0 ? (
              <p className="text-sm text-ink-muted">No amenities listed yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {space.amenities.map((a) => (
                  <li key={a.slug}
                      className="flex items-center gap-2 rounded-lg border border-ink/10 bg-surface px-3 py-2">
                    <span aria-hidden="true">{a.icon}</span>
                    <span className="text-sm text-ink">{a.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeading
              title="Live occupancy"
              hint="Seat-level telemetry from the floor, streamed as readings arrive."
            />
            <div className="card flex flex-col gap-4 p-5">
              {current ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold tracking-tight text-ink">
                        {current.percent}%
                      </p>
                      <p className="text-sm text-ink-soft">
                        <span className="tabular">{current.seats_occupied}</span> of{' '}
                        <span className="tabular">{current.seats_total}</span> seats in use
                      </p>
                    </div>
                    <p className="text-xs text-ink-muted">
                      <span aria-hidden="true"
                            className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good align-middle" />
                      Updated {timeLabel(current.recorded_at)}
                    </p>
                  </div>
                  <Meter value={current.seats_occupied} total={current.seats_total} compact />
                </>
              ) : (
                <p className="text-sm text-ink-muted">Waiting for the first reading…</p>
              )}

              {occupancyPoints.length >= 2 && (
                <div className="border-t border-ink/8 pt-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Occupancy over the last readings
                  </p>
                  <OccupancyLine points={occupancyPoints} />
                </div>
              )}
            </div>
          </section>

          <section>
            <SectionHeading
              title="Availability"
              hint="Seats free each day for the next 30 days. Struck-through days are full or blocked."
            />
            <div className="card p-4">
              <AvailabilityStrip days={space.availability} />
              <div className="mt-3 flex flex-wrap gap-4 border-t border-ink/8 pt-3 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-3 w-3 rounded bg-series" /> Seats free
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-3 w-3 rounded bg-series-weak" /> Nearly full
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-3 w-3 rounded bg-track" /> Full or blocked
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          {space.match && (
            <div className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Match for your criteria
                </p>
                <p className="text-sm text-ink-soft">Tap the score to see the reasons</p>
              </div>
              <MatchBadge match={space.match} />
            </div>
          )}

          <BookingPanel space={space} onBooked={reload} />

          <div className="card flex flex-col gap-3 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Managed by
              </p>
              <p className="mt-1 font-semibold text-ink">{space.owner?.company || space.owner?.name}</p>
              <p className="text-sm text-ink-soft">{space.owner?.name}</p>
            </div>
            <button className="btn btn-ghost w-full"
                    onClick={() => (user ? setInquiryOpen(true) : null)}
                    disabled={!user}>
              {user ? 'Ask a question' : 'Sign in to contact'}
            </button>
            {!user && (
              <p className="text-center text-xs text-ink-muted">
                <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
                {' '}to send an inquiry or request a booking.
              </p>
            )}
          </div>
        </div>
      </div>

      {user && <InquiryModal space={space} open={inquiryOpen} onClose={() => setInquiryOpen(false)} />}
    </div>
  );
}
