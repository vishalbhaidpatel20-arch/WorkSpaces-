import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Loading, ErrorBanner, StatusPill, EmptyState, Modal, useToast, SectionHeading,
} from '../components/ui.jsx';
import { money, dateLabel, stayLength, num } from '../lib/format.js';

const STATUSES = ['', 'pending', 'confirmed', 'rejected', 'cancelled', 'completed'];

export default function MyBookings() {
  const { user } = useAuth();
  const isOwner = user.role === 'owner' || user.role === 'admin';

  const [scope, setScope] = useState('mine');
  const [status, setStatus] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const toast = useToast();

  const query = new URLSearchParams({ scope, ...(status && { status }) });
  const { data, error, loading, reload } = useFetch(`/bookings?${query}`);

  const cancel = async () => {
    try {
      await api.post(`/bookings/${cancelling.id}/cancel`);
      toast.success(`Booking ${cancelling.code} cancelled — the seats are released.`);
      setCancelling(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const decide = async (booking, action) => {
    try {
      await api.post(`/bookings/${booking.id}/${action}`);
      toast.success(action === 'confirm' ? 'Booking confirmed.' : 'Booking declined.');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const bookings = data?.data || [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <SectionHeading
        title={scope === 'owned' ? 'Bookings for my spaces' : 'My bookings'}
        hint="Pending requests already hold their seats. Cancelling releases them immediately."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {isOwner && (
          <select className="field w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="mine">Booked by me</option>
            <option value="owned">For my spaces</option>
            {user.role === 'admin' && <option value="all">All bookings</option>}
          </select>
        )}
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>
          ))}
        </select>
      </div>

      <ErrorBanner error={error} onRetry={reload} />
      {loading && <Loading />}

      {!loading && bookings.length === 0 && (
        <EmptyState icon="🗓️" title="No bookings here"
                    hint={scope === 'owned'
                      ? 'Requests for your listings will show up here.'
                      : 'Once you request a space, it appears here with its live status.'}
                    action={scope !== 'owned'
                      ? <Link to="/spaces" className="btn btn-primary">Find a space</Link>
                      : null} />
      )}

      <ul className="flex flex-col gap-3">
        {bookings.map((b) => {
          const mine = b.user_id === user.id;
          const iDecide = b.owner_id === user.id || user.role === 'admin';
          return (
            <li key={b.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/spaces/${b.space_id}`}
                          className="font-semibold text-ink hover:text-ink">
                      {b.space_name}
                    </Link>
                    <StatusPill status={b.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {dateLabel(b.start_date)} → {dateLabel(b.end_date)} ·{' '}
                    {stayLength(b.start_date, b.end_date)} ·{' '}
                    {num(b.seats)} seat{b.seats === 1 ? '' : 's'}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {b.space_city} · Ref <span className="tabular">{b.code}</span>
                    {!mine && ` · ${b.user_name}${b.user_company ? ` (${b.user_company})` : ''}`}
                  </p>
                  {b.notes && (
                    <p className="mt-2 rounded-lg bg-plane p-2 text-sm text-ink-soft">“{b.notes}”</p>
                  )}
                  {b.decline_reason && (
                    <p className="mt-2 rounded-lg bg-plane/5 p-2 text-sm text-ink">
                      <span className="font-semibold">Declined: </span>{b.decline_reason}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <p className="tabular font-semibold text-ink">{money(b.total_price)}</p>
                  <div className="flex gap-2">
                    {iDecide && b.status === 'pending' && (
                      <>
                        <button className="btn btn-primary" onClick={() => decide(b, 'confirm')}>
                          Confirm
                        </button>
                        <button className="btn btn-danger" onClick={() => decide(b, 'reject')}>
                          Decline
                        </button>
                      </>
                    )}
                    {['pending', 'confirmed'].includes(b.status) && (mine || iDecide) && (
                      <button className="btn btn-ghost" onClick={() => setCancelling(b)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)}
             title={`Cancel booking ${cancelling?.code || ''}?`}
             footer={
               <>
                 <button className="btn btn-ghost" onClick={() => setCancelling(null)}>Keep it</button>
                 <button className="btn btn-danger" onClick={cancel}>Cancel booking</button>
               </>
             }>
        <p className="text-sm text-ink-soft">
          The {cancelling?.seats} held seat{cancelling?.seats === 1 ? '' : 's'} at{' '}
          <strong>{cancelling?.space_name}</strong> are released back to availability and the
          other party is notified. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
