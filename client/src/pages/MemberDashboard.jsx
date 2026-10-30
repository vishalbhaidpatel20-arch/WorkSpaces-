import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../lib/auth.jsx';
import { Loading, ErrorBanner, SectionHeading, StatusPill, EmptyState } from '../components/ui.jsx';
import { StatTile } from '../components/charts.jsx';
import { money, moneyShort, num, dateLabel, stayLength, relativeTime } from '../lib/format.js';

export default function MemberDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch('/dashboard/user');

  if (loading) return <Loading label="Loading your dashboard…" />;
  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-12"><ErrorBanner error={error} onRetry={reload} /></div>;
  }

  const { stats, upcoming, recent_inquiries: inquiries, notifications } = data.data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Your bookings, inquiries and alerts in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/match" className="btn btn-ghost">Smart match</Link>
          <Link to="/spaces" className="btn btn-primary">Find a space</Link>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Bookings" value={num(stats.bookings_total)}
                  sub={`${stats.bookings_completed} completed`} icon="📋" />
        <StatTile label="Awaiting approval" value={num(stats.bookings_pending)}
                  sub="Owner is reviewing" icon="⏳" />
        <StatTile label="Confirmed" value={num(stats.bookings_confirmed)}
                  sub="Ready to use" icon="✓" />
        <StatTile label="Total spend" value={moneyShort(stats.total_spend)}
                  sub={money(stats.total_spend)} icon="₹" />
        <StatTile label="Open inquiries" value={num(stats.open_inquiries)}
                  sub="Awaiting a reply" icon="💬" />
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-8">
          <section>
            <SectionHeading title="Upcoming bookings"
                            action={<Link to="/bookings" className="btn btn-ghost">All bookings</Link>} />
            {upcoming.length === 0 ? (
              <EmptyState icon="🗓️" title="Nothing booked yet"
                          hint="Find a space that matches your team and send a booking request."
                          action={<Link to="/spaces" className="btn btn-primary">Browse spaces</Link>} />
            ) : (
              <ul className="flex flex-col gap-3">
                {upcoming.map((b) => (
                  <li key={b.id} className="card flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/spaces/${b.space_id}`}
                              className="font-semibold text-ink hover:text-brand">
                          {b.space_name}
                        </Link>
                        <StatusPill status={b.status} />
                      </div>
                      <p className="mt-0.5 text-sm text-ink-soft">
                        {dateLabel(b.start_date)} → {dateLabel(b.end_date)} ·{' '}
                        {stayLength(b.start_date, b.end_date)} · {b.seats} seat{b.seats === 1 ? '' : 's'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {b.space_city} · Ref <span className="tabular">{b.code}</span>
                      </p>
                    </div>
                    <p className="tabular text-right font-semibold text-ink">{money(b.total_price)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeading title="Recent inquiries"
                            action={<Link to="/inquiries" className="btn btn-ghost">All inquiries</Link>} />
            {inquiries.length === 0 ? (
              <p className="card p-5 text-sm text-ink-muted">
                You have not asked any space a question yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {inquiries.map((q) => (
                  <li key={q.id} className="card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{q.subject}</p>
                      <StatusPill status={q.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-ink-soft">{q.space_name}</p>
                    {q.reply && (
                      <p className="mt-2 rounded-lg bg-brand-wash p-2.5 text-sm text-ink">
                        <span className="font-semibold">Reply: </span>{q.reply}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section>
          <SectionHeading title="Notifications" hint="Email and SMS alerts sent to you." />
          {notifications.length === 0 ? (
            <p className="card p-5 text-sm text-ink-muted">No alerts yet.</p>
          ) : (
            <ul className="card divide-y divide-ink/8">
              {notifications.map((n) => (
                <li key={n.id} className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{n.subject || 'Update'}</p>
                    <span className="shrink-0 rounded bg-ink/5 px-1.5 text-[11px] uppercase text-ink-muted">
                      {n.channel}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-muted">{relativeTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
