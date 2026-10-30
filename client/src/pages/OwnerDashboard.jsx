import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { api } from '../lib/api.js';
import { useMonitorFeed } from '../lib/socket.js';
import {
  Loading, ErrorBanner, SectionHeading, StatusPill, EmptyState, Modal, useToast, LiveDot,
} from '../components/ui.jsx';
import { StatTile, Meter, BarList } from '../components/charts.jsx';
import { money, moneyShort, num, dateLabel, stayLength, dateShort, timeLabel } from '../lib/format.js';

/** Confirm or decline a request, with a reason captured on decline. */
function DecisionRow({ booking, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const act = async (path, body) => {
    setBusy(true);
    try {
      await api.post(`/bookings/${booking.id}/${path}`, body);
      toast.success(path === 'confirm' ? `Booking ${booking.code} confirmed.` : `Booking ${booking.code} declined.`);
      setRejecting(false);
      onDone();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{booking.space_name}</p>
          <StatusPill status={booking.status} />
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">
          {booking.user_name}{booking.user_company ? ` · ${booking.user_company}` : ''} ·{' '}
          {booking.seats} seat{booking.seats === 1 ? '' : 's'}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {dateLabel(booking.start_date)} → {dateLabel(booking.end_date)} ·{' '}
          {stayLength(booking.start_date, booking.end_date)} · Ref{' '}
          <span className="tabular">{booking.code}</span>
        </p>
        {booking.notes && (
          <p className="mt-1.5 rounded-lg bg-plane p-2 text-xs text-ink-soft">“{booking.notes}”</p>
        )}
      </div>
      <p className="tabular font-semibold text-ink">{money(booking.total_price)}</p>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => act('confirm')}>
          Confirm
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={() => setRejecting(true)}>
          Decline
        </button>
      </div>

      <Modal open={rejecting} onClose={() => setRejecting(false)}
             title={`Decline booking ${booking.code}?`}
             footer={
               <>
                 <button className="btn btn-ghost" onClick={() => setRejecting(false)}>Keep pending</button>
                 <button className="btn btn-danger" disabled={busy}
                         onClick={() => act('reject', { reason: reason || undefined })}>
                   Decline booking
                 </button>
               </>
             }>
        <p className="text-sm text-ink-soft">
          The held seats are released immediately and {booking.user_name} is notified.
        </p>
        <div className="mt-3">
          <label className="label" htmlFor="reject-reason">Reason <span className="font-normal text-ink-muted">(optional, shared with the member)</span></label>
          <textarea id="reject-reason" className="field" rows="3" maxLength="500" value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. That floor is reserved for an event that week." />
        </div>
      </Modal>
    </li>
  );
}

function ReplyModal({ inquiry, onClose, onDone }) {
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/inquiries/${inquiry.id}/reply`, { reply });
      toast.success('Reply sent.');
      onDone();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(inquiry)} onClose={onClose} title="Reply to inquiry" wide
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary" disabled={busy || reply.trim().length < 2} onClick={send}>
                 {busy ? 'Sending…' : 'Send reply'}
               </button>
             </>
           }>
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-ink/10 bg-plane p-3">
          <p className="text-sm font-semibold text-ink">{inquiry.subject}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {inquiry.user_name}{inquiry.user_company ? ` · ${inquiry.user_company}` : ''} ·{' '}
            {inquiry.space_name}
          </p>
          <p className="mt-2 text-sm text-ink-soft">{inquiry.message}</p>
          {inquiry.expectations && (
            <p className="mt-2 text-sm text-ink-soft">
              <span className="font-semibold text-ink">Expectations: </span>{inquiry.expectations}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-muted">
            {inquiry.team_size && <span>Team of {inquiry.team_size}</span>}
            {inquiry.work_style && <span>{inquiry.work_style.replace('_', ' ')}</span>}
            {inquiry.wants_meeting ? <span>Wants a call or visit</span> : null}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="reply-body">Your reply</label>
          <textarea id="reply-body" className="field" rows="5" maxLength="2000" value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Answer their questions and suggest next steps." />
        </div>
      </div>
    </Modal>
  );
}

export default function OwnerDashboard() {
  const { data, error, loading, reload } = useFetch('/dashboard/owner');
  const [replyTo, setReplyTo] = useState(null);
  const toast = useToast();

  // Live feed: occupancy ticks update in place, and a new request reloads the
  // queue so the owner never acts on stale numbers.
  const { bySpace, connected } = useMonitorFeed({
    poll: reload,
    onBooking: (b) => {
      if (b.status === 'pending') {
        toast.info(`New booking request for ${b.space_name}`);
        reload();
      }
    },
  });

  if (loading) return <Loading label="Loading your dashboard…" />;
  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-12"><ErrorBanner error={error} onRetry={reload} /></div>;
  }

  const {
    stats, spaces, pending_bookings: pending,
    open_inquiries: inquiries, upcoming_availability: forward,
  } = data.data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Owner dashboard</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
            Listings, requests and live floor occupancy. <LiveDot connected={connected} />
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/owner/spaces" className="btn btn-ghost">Manage listings</Link>
          <Link to="/owner/spaces/new" className="btn btn-primary">Add a space</Link>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Listings" value={num(stats.spaces_total)}
                  sub={`${stats.spaces_active} active`} icon="🏢" />
        <StatTile label="Awaiting approval" value={num(stats.spaces_pending)}
                  sub="Admin review" icon="⏳" />
        <StatTile label="Requests pending" value={num(stats.bookings_pending)}
                  sub="Need your decision" icon="📥" />
        <StatTile label="Confirmed bookings" value={num(stats.bookings_confirmed)}
                  sub={`${stats.bookings_total} all time`} icon="✓" />
        <StatTile label="Revenue" value={moneyShort(stats.revenue_total)}
                  sub={money(stats.revenue_total)} icon="₹" />
        <StatTile label="Seats booked today" value={`${stats.utilisation_percent}%`}
                  sub="Across all listings" icon="◉" />
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-8">
          <section>
            <SectionHeading title="Booking requests"
                            hint="Seats are already held — confirming finalises them, declining frees them." />
            {pending.length === 0 ? (
              <EmptyState icon="✓" title="No requests waiting"
                          hint="New requests appear here the moment a member sends one." />
            ) : (
              <ul className="flex flex-col gap-3">
                {pending.map((b) => <DecisionRow key={b.id} booking={b} onDone={reload} />)}
              </ul>
            )}
          </section>

          <section>
            <SectionHeading title="Open inquiries"
                            hint="Members who shared their team size and expectations up front." />
            {inquiries.length === 0 ? (
              <p className="card p-5 text-sm text-ink-muted">No open inquiries.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {inquiries.map((q) => (
                  <li key={q.id} className="card flex flex-wrap items-start gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{q.subject}</p>
                        {q.wants_meeting ? <StatusPill status="pending">Wants a meeting</StatusPill> : null}
                      </div>
                      <p className="mt-0.5 text-sm text-ink-soft">
                        {q.user_name}{q.user_company ? ` · ${q.user_company}` : ''} · {q.space_name}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{q.message}</p>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-ink-muted">
                        {q.team_size && <span>Team of {q.team_size}</span>}
                        {q.work_style && <span className="capitalize">{q.work_style.replace('_', ' ')}</span>}
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => setReplyTo(q)}>Reply</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <section>
            <SectionHeading title="Live occupancy" hint="Streaming from each floor." />
            {spaces.length === 0 ? (
              <p className="card p-5 text-sm text-ink-muted">Add a listing to see occupancy.</p>
            ) : (
              <div className="card flex flex-col gap-4 p-5">
                {spaces.map((s) => {
                  const liveNow = bySpace[s.id] || s.live_occupancy;
                  return (
                    <div key={s.id}>
                      {liveNow ? (
                        <Meter label={s.name} value={liveNow.seats_occupied} total={liveNow.seats_total}
                               caption={`${s.city} · updated ${timeLabel(liveNow.recorded_at)}`} />
                      ) : (
                        <div>
                          <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                          <p className="text-xs text-ink-muted">
                            {s.status === 'active' ? 'Waiting for a reading…' : `Listing ${s.status}`}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <SectionHeading title="Seats booked, next 7 days"
                            hint="Across every listing you manage." />
            <div className="card p-5">
              <BarList
                data={forward.map((d) => ({ label: dateShort(d.date), value: d.seats_booked }))}
                valueFormat={(v) => num(v)}
                emptyLabel="No availability window yet"
              />
              {forward.length > 0 && (
                <p className="mt-3 border-t border-ink/8 pt-2.5 text-xs text-ink-muted">
                  Capacity today:{' '}
                  <span className="tabular font-semibold text-ink">
                    {num(forward[0]?.seats_total ?? 0)}
                  </span> seats
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {replyTo && (
        <ReplyModal inquiry={replyTo} onClose={() => setReplyTo(null)} onDone={reload} />
      )}
    </div>
  );
}
