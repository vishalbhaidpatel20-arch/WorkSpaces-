import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { api } from '../lib/api.js';
import {
  Loading, ErrorBanner, StatusPill, EmptyState, Modal, useToast, SectionHeading,
} from '../components/ui.jsx';
import { AvailabilityStrip } from '../components/charts.jsx';
import { money, num, todayISO, addDaysISO } from '../lib/format.js';

/** Block dates or change the seat count over a range. */
function AvailabilityModal({ space, onClose }) {
  const toast = useToast();
  const [range, setRange] = useState({
    start: todayISO(),
    end: addDaysISO(todayISO(), 6),
  });
  const [seats, setSeats] = useState(space.capacity);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const { data, reload } = useFetch(
    `/spaces/${space.id}/availability?start=${todayISO()}&end=${addDaysISO(todayISO(), 29)}`
  );

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.put(`/spaces/${space.id}/availability`, {
        start: range.start,
        end: range.end,
        seats_total: Number(seats),
        is_blocked: blocked,
      });
      toast.success('Availability updated.');
      reload();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={`Availability — ${space.name}`}
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Done</button>
               <button className="btn btn-primary" disabled={busy || range.end < range.start}
                       onClick={save}>
                 {busy ? 'Saving…' : 'Apply to range'}
               </button>
             </>
           }>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Next 30 days
          </p>
          <AvailabilityStrip days={data?.data || []} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-muted">
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

        <div className="grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="av-start">From</label>
            <input id="av-start" type="date" className="field" min={todayISO()} value={range.start}
                   onChange={(e) => setRange((r) => ({
                     ...r,
                     start: e.target.value,
                     end: r.end < e.target.value ? e.target.value : r.end,
                   }))} />
          </div>
          <div>
            <label className="label" htmlFor="av-end">To</label>
            <input id="av-end" type="date" className="field" min={range.start} value={range.end}
                   onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="av-seats">
            Seats available per day <span className="font-normal text-ink-muted">(capacity {space.capacity})</span>
          </label>
          <input id="av-seats" type="number" min="0" max={space.capacity} className="field tabular"
                 value={seats} onChange={(e) => setSeats(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
          Block these dates entirely (maintenance, private event)
        </label>

        <ErrorBanner error={err} />
        <p className="text-xs text-ink-muted">
          Changes apply to every day in the range and push a live availability update to anyone
          viewing this space.
        </p>
      </div>
    </Modal>
  );
}

export default function OwnerSpaces() {
  const toast = useToast();
  const [managing, setManaging] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // The owner dashboard already returns this owner's listings with live
  // occupancy attached, so there is no second endpoint to call here.
  const mine = useFetch('/dashboard/owner');
  const spaces = mine.data?.data?.spaces || [];

  const remove = async () => {
    try {
      await api.del(`/spaces/${deleting.id}`);
      toast.success(`${deleting.name} deleted.`);
      setDeleting(null);
      mine.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (mine.loading) return <Loading label="Loading your listings…" />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <SectionHeading
        title="My listings"
        hint="Manage pricing, amenities and day-by-day availability."
        action={<Link to="/owner/spaces/new" className="btn btn-primary">Add a space</Link>}
      />

      <ErrorBanner error={mine.error} onRetry={mine.reload} />

      {spaces.length === 0 ? (
        <EmptyState icon="🏢" title="No listings yet"
                    hint="Add your first co-working space. An admin reviews it before it goes live."
                    action={<Link to="/owner/spaces/new" className="btn btn-primary">Add a space</Link>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {spaces.map((s) => (
            <li key={s.id} className="card flex flex-wrap items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/spaces/${s.id}`} className="font-semibold text-ink hover:text-brand">
                    {s.name}
                  </Link>
                  <StatusPill status={s.status} />
                </div>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {s.city} · {num(s.capacity)} seats · {money(s.price_per_seat_month)}/seat/mo
                </p>
                {s.live_occupancy && (
                  <p className="mt-1 text-xs text-ink-muted">
                    <span aria-hidden="true"
                          className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good align-middle" />
                    Live: <span className="tabular font-semibold text-ink">{s.live_occupancy.percent}%</span>{' '}
                    ({s.live_occupancy.seats_occupied}/{s.live_occupancy.seats_total} seats)
                  </p>
                )}
                {s.status === 'pending' && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Awaiting admin approval — not yet visible to members.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost" onClick={() => setManaging(s)}>Availability</button>
                <Link to={`/owner/spaces/${s.id}/edit`} className="btn btn-ghost">Edit</Link>
                <button className="btn btn-danger" onClick={() => setDeleting(s)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {managing && <AvailabilityModal space={managing} onClose={() => setManaging(null)} />}

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)}
             title={`Delete ${deleting?.name || ''}?`}
             footer={
               <>
                 <button className="btn btn-ghost" onClick={() => setDeleting(null)}>Keep it</button>
                 <button className="btn btn-danger" onClick={remove}>Delete listing</button>
               </>
             }>
        <p className="text-sm text-ink-soft">
          This permanently removes the listing, its amenities and its availability schedule.
          Listings with pending or confirmed bookings cannot be deleted — cancel those first.
        </p>
      </Modal>
    </div>
  );
}
