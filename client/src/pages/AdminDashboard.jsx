import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { api } from '../lib/api.js';
import { useMonitorFeed } from '../lib/socket.js';
import {
  Loading, ErrorBanner, SectionHeading, StatusPill, Modal, useToast, LiveDot, Badge,
} from '../components/ui.jsx';
import { StatTile, Meter, BarList } from '../components/charts.jsx';
import { money, moneyShort, num, dateLabel, typeLabel, timeLabel, relativeTime } from '../lib/format.js';

const TABS = [
  ['overview', 'Overview'],
  ['approvals', 'Approvals'],
  ['monitor', 'Live monitor'],
  ['users', 'Users'],
  ['spaces', 'All spaces'],
];

/* ------------------------------------------------------------ approvals --- */

function Approvals({ pending, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [suspending, setSuspending] = useState(null);
  const [reason, setReason] = useState('');

  const approve = async (space) => {
    setBusy(space.id);
    try {
      await api.post(`/admin/spaces/${space.id}/approve`);
      toast.success(`${space.name} is now live.`);
      onChange();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const suspend = async () => {
    setBusy(suspending.id);
    try {
      await api.post(`/admin/spaces/${suspending.id}/suspend`, { reason: reason || undefined });
      toast.success(`${suspending.name} suspended.`);
      setSuspending(null);
      setReason('');
      onChange();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SectionHeading title="Listings awaiting approval"
                      hint="A listing stays invisible to members until it is approved." />
      {pending.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink-muted">
          Nothing in the queue — every listing has been reviewed.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((s) => (
            <li key={s.id} className="card flex flex-wrap items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/spaces/${s.id}`} className="font-semibold text-ink hover:text-brand">
                    {s.name}
                  </Link>
                  <StatusPill status={s.status} />
                  <Badge tone="brand">{typeLabel(s.workspace_type)}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {s.locality ? `${s.locality}, ` : ''}{s.city} · {num(s.capacity)} seats ·{' '}
                  {num(s.area_sqft)} sq.ft · {money(s.price_per_seat_month)}/seat/mo
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Submitted by {s.owner_name} ({s.owner_email}) on {dateLabel(s.created_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={busy === s.id} onClick={() => approve(s)}>
                  Approve
                </button>
                <button className="btn btn-danger" disabled={busy === s.id}
                        onClick={() => setSuspending(s)}>
                  Suspend
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={Boolean(suspending)} onClose={() => setSuspending(null)}
             title={`Suspend ${suspending?.name || ''}?`}
             footer={
               <>
                 <button className="btn btn-ghost" onClick={() => setSuspending(null)}>Cancel</button>
                 <button className="btn btn-danger" onClick={suspend}>Suspend listing</button>
               </>
             }>
        <p className="text-sm text-ink-soft">
          The listing is hidden from search and the owner is notified.
        </p>
        <div className="mt-3">
          <label className="label" htmlFor="susp-reason">Reason <span className="font-normal text-ink-muted">(optional)</span></label>
          <textarea id="susp-reason" className="field" rows="3" maxLength="500" value={reason}
                    onChange={(e) => setReason(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}

/* ---------------------------------------------------------------- users --- */

function Users() {
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useFetch(
    `/admin/users${role || q ? `?${new URLSearchParams({ ...(role && { role }), ...(q && { q }) })}` : ''}`
  );
  const toast = useToast();

  const changeRole = async (user, nextRole) => {
    try {
      await api.patch(`/admin/users/${user.id}/role`, { role: nextRole });
      toast.success(`${user.name} is now ${nextRole}.`);
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <SectionHeading title="Users" hint="Members, space owners and administrators." />
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="field max-w-xs" type="search" placeholder="Search name, email, company…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="user">Members</option>
          <option value="owner">Space owners</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {loading && <Loading />}
      {data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-4 py-2.5 text-right font-semibold">Spaces</th>
                <th className="px-4 py-2.5 text-right font-semibold">Bookings</th>
                <th className="px-4 py-2.5 font-semibold">Joined</th>
                <th className="px-4 py-2.5 font-semibold">Change role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {data.data.map((u) => (
                <tr key={u.id} className="hover:bg-ink/[0.02]">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink">{u.name}</p>
                    <p className="text-xs text-ink-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>
                      {u.role === 'user' ? 'member' : u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{u.company || '—'}</td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-soft">{u.spaces_count}</td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-soft">{u.bookings_count}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">{dateLabel(u.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <select className="field w-auto py-1 text-xs" value={u.role}
                            onChange={(e) => changeRole(u, e.target.value)}>
                      <option value="user">member</option>
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- spaces --- */

function AllSpaces() {
  const [status, setStatus] = useState('');
  const { data, loading } = useFetch(`/admin/spaces${status ? `?status=${status}` : ''}`);

  return (
    <>
      <SectionHeading title="All spaces" hint="Every listing on the platform, in any state." />
      <div className="mb-3">
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      {loading && <Loading />}
      {data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Space</th>
                <th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Seats</th>
                <th className="px-4 py-2.5 text-right font-semibold">Area</th>
                <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                <th className="px-4 py-2.5 text-right font-semibold">Bookings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {data.data.map((s) => (
                <tr key={s.id} className="hover:bg-ink/[0.02]">
                  <td className="px-4 py-2.5">
                    <Link to={`/spaces/${s.id}`} className="font-medium text-ink hover:text-brand">
                      {s.name}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {s.locality ? `${s.locality}, ` : ''}{s.city}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{s.owner_name}</td>
                  <td className="px-4 py-2.5"><StatusPill status={s.status} /></td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-soft">{num(s.capacity)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-soft">{num(s.area_sqft)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-soft">
                    {money(s.price_per_seat_month)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-soft">{s.bookings_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- monitor --- */

function LiveMonitor({ seeded, bySpace, connected }) {
  // Seeded readings are the baseline; socket events overwrite them per space.
  const rows = seeded.map((r) => {
    const live = bySpace[r.space_id];
    return live ? { ...r, ...live } : r;
  });

  return (
    <>
      <SectionHeading
        title="Platform-wide live occupancy"
        hint="Latest reading per active space, busiest first."
        action={<LiveDot connected={connected} />}
      />
      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink-muted">No readings yet.</p>
      ) : (
        <div className="card flex flex-col gap-4 p-5">
          {rows.map((r) => (
            <Meter key={r.space_id} label={`${r.space_name} — ${r.city}`}
                   value={r.seats_occupied} total={r.seats_total}
                   caption={`Updated ${timeLabel(r.recorded_at)}`} />
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- page --- */

export default function AdminDashboard() {
  const { data, error, loading, reload } = useFetch('/dashboard/admin');
  const [tab, setTab] = useState('overview');
  const { bySpace, connected } = useMonitorFeed();

  if (loading) return <Loading label="Loading platform data…" />;
  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-12"><ErrorBanner error={error} onRetry={reload} /></div>;
  }

  const d = data.data;
  const k = d.kpis;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Admin dashboard</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
          Platform KPIs, moderation queue and live monitoring. <LiveDot connected={connected} />
        </p>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-ink/10" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
                  aria-current={tab === key ? 'page' : undefined}
                  className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition ${
                    tab === key
                      ? 'border-brand text-brand-dark'
                      : 'border-transparent text-ink-soft hover:text-ink'}`}>
            {label}
            {key === 'approvals' && k.spaces_awaiting_approval > 0 && (
              <span className="tabular ml-1.5 rounded-full bg-warning/25 px-1.5 text-xs">
                {k.spaces_awaiting_approval}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <StatTile label="Registered users" value={num(k.registered_users)}
                      sub={`${k.members} members · ${k.space_owners} owners`} icon="👥" />
            <StatTile label="Spaces listed" value={num(k.spaces_listed)}
                      sub={`${k.spaces_active} active`} icon="🏢" />
            <StatTile label="Total seats" value={num(k.total_seats)}
                      sub="Across every listing" icon="🪑" />
            <StatTile label="Bookings" value={num(k.bookings_total)}
                      sub={`${k.bookings_pending} pending`} icon="📋" />
            <StatTile label="Gross booking value" value={moneyShort(k.gross_booking_value)}
                      sub={money(k.gross_booking_value)} icon="₹" />
            <StatTile label="Approval rate" value={`${k.booking_completion_rate}%`}
                      sub="Of all decided requests" icon="✓" />
            <StatTile label="Cancellation rate" value={`${k.cancellation_rate}%`}
                      sub="Of all bookings"
                      deltaTone={k.cancellation_rate > 20 ? 'critical' : 'neutral'} icon="⊘" />
            <StatTile label="Occupancy today" value={`${k.occupancy_today_percent}%`}
                      sub="Seats booked vs available" icon="◉" />
            <StatTile label="Awaiting approval" value={num(k.spaces_awaiting_approval)}
                      sub="Listings in the queue" icon="⏳" />
            <StatTile label="Open inquiries" value={num(k.open_inquiries)}
                      sub="Unanswered by owners" icon="💬" />
            <StatTile label="Alerts sent" value={num(k.notifications_sent)}
                      sub="Email and SMS" icon="🔔" />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-ink">Bookings by status</h2>
              <p className="mb-3 text-xs text-ink-muted">Count of booking requests in each state.</p>
              <BarList data={d.bookings_by_status.map((r) => ({ label: r.status, value: r.count }))}
                       valueFormat={(v) => num(v)} />
            </section>

            <section className="card p-5">
              <h2 className="text-sm font-semibold text-ink">Bookings by city</h2>
              <p className="mb-3 text-xs text-ink-muted">Where demand is concentrated.</p>
              <BarList data={d.bookings_by_city.map((r) => ({ label: r.city, value: r.bookings }))}
                       valueFormat={(v) => num(v)} />
            </section>

            <section className="card p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold text-ink">Top spaces by bookings</h2>
              <p className="mb-3 text-xs text-ink-muted">Active listings, ranked by request volume.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="py-2 pr-4 font-semibold">Space</th>
                      <th className="py-2 pr-4 font-semibold">City</th>
                      <th className="py-2 pr-4 text-right font-semibold">Rating</th>
                      <th className="py-2 pr-4 text-right font-semibold">Seats</th>
                      <th className="py-2 pr-4 text-right font-semibold">Bookings</th>
                      <th className="py-2 text-right font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/8">
                    {d.top_spaces.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 pr-4">
                          <Link to={`/spaces/${s.id}`} className="font-medium text-ink hover:text-brand">
                            {s.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-ink-soft">{s.city}</td>
                        <td className="tabular py-2 pr-4 text-right text-ink-soft">
                          {s.rating > 0 ? s.rating.toFixed(1) : '—'}
                        </td>
                        <td className="tabular py-2 pr-4 text-right text-ink-soft">{num(s.capacity)}</td>
                        <td className="tabular py-2 pr-4 text-right font-semibold text-ink">{s.bookings}</td>
                        <td className="tabular py-2 text-right text-ink-soft">{money(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold text-ink">Recent bookings</h2>
              <ul className="mt-3 divide-y divide-ink/8">
                {d.recent_bookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <StatusPill status={b.status} />
                    <span className="font-medium text-ink">{b.space_name}</span>
                    <span className="text-sm text-ink-soft">
                      {b.user_name} · {b.seats} seat{b.seats === 1 ? '' : 's'}
                    </span>
                    <span className="tabular ml-auto text-sm font-semibold text-ink">
                      {money(b.total_price)}
                    </span>
                    <span className="w-full text-xs text-ink-muted sm:w-auto">
                      {relativeTime(b.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {tab === 'approvals' && <Approvals pending={d.pending_spaces} onChange={reload} />}
      {tab === 'monitor' && (
        <LiveMonitor seeded={d.live_occupancy} bySpace={bySpace} connected={connected} />
      )}
      {tab === 'users' && <Users />}
      {tab === 'spaces' && <AllSpaces />}
    </div>
  );
}
