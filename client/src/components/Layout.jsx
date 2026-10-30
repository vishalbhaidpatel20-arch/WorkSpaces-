import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import { Spinner } from './ui.jsx';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white"
            aria-hidden="true">F</span>
      <span>FlexoSpaces</span>
    </Link>
  );
}

const linkCls = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-brand-wash text-brand-dark' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'}`;

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!open || items) return;
    api.get('/notifications?limit=12').then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [open, items]);

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Notifications" aria-expanded={open}
              className="rounded-lg px-2.5 py-2 text-ink-soft hover:bg-ink/5">
        <span aria-hidden="true">🔔</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="card absolute right-0 z-20 mt-1 max-h-96 w-80 overflow-y-auto p-2 shadow-lg">
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Notifications
            </p>
            {items === null && <div className="grid place-items-center py-6"><Spinner /></div>}
            {items?.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-ink-muted">Nothing yet.</p>
            )}
            {items?.map((n) => (
              <article key={n.id} className="border-t border-ink/8 px-2 py-2.5 first:border-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{n.subject || 'Update'}</p>
                  <span className="shrink-0 text-[11px] uppercase text-ink-muted">{n.channel}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">{n.body}</p>
                <p className="mt-1 text-[11px] text-ink-muted">{relativeTime(n.created_at)}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const initials = user.name.split(' ').filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-ink/5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-wash text-xs
                         font-bold text-brand-dark" aria-hidden="true">{initials}</span>
        <span className="hidden text-sm font-medium text-ink sm:block">{user.name.split(' ')[0]}</span>
        <span aria-hidden="true" className="text-[10px] text-ink-muted">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="card absolute right-0 z-20 mt-1 w-56 p-1.5 shadow-lg">
            <div className="border-b border-ink/8 px-2.5 pb-2 pt-1.5">
              <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
                {user.role === 'user' ? 'Member' : user.role}
              </p>
            </div>
            {[
              ['Dashboard', homeFor(user)],
              ['My bookings', '/bookings'],
              ['My inquiries', '/inquiries'],
              ['Profile', '/profile'],
            ].map(([label, to]) => (
              <Link key={to} to={to} onClick={() => setOpen(false)}
                    className="block rounded-md px-2.5 py-2 text-sm text-ink-soft hover:bg-ink/5 hover:text-ink">
                {label}
              </Link>
            ))}
            <button onClick={() => { setOpen(false); logout(); navigate('/'); }}
                    className="mt-1 block w-full rounded-md border-t border-ink/8 px-2.5 py-2
                               text-left text-sm text-critical hover:bg-critical/5">
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const nav = (
    <>
      <NavLink to="/spaces" className={linkCls}>Find spaces</NavLink>
      <NavLink to="/match" className={linkCls}>Smart match</NavLink>
      {user?.role === 'owner' && <NavLink to="/owner/spaces" className={linkCls}>My listings</NavLink>}
      {user && <NavLink to={homeFor(user)} className={linkCls}>Dashboard</NavLink>}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">{nav}</nav>

          <div className="ml-auto flex items-center gap-1.5">
            {loading ? (
              <Spinner className="h-4 w-4 text-ink-muted" />
            ) : user ? (
              <>
                <NotificationBell />
                <UserMenu />
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">Sign in</Link>
                <Link to="/register" className="btn btn-primary">Get started</Link>
              </>
            )}
            <button className="ml-1 rounded-lg px-2.5 py-2 text-ink-soft hover:bg-ink/5 md:hidden"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Toggle navigation" aria-expanded={menuOpen}>
              <span aria-hidden="true">☰</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-ink/10 px-4 py-2 md:hidden"
               aria-label="Mobile">
            {nav}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-ink-muted
                        sm:flex-row sm:items-center sm:justify-between">
          <p>FlexoSpaces — smart co-working discovery, booking and live occupancy monitoring.</p>
          <p>Built for the Unified Mentor capstone brief.</p>
        </div>
      </footer>
    </div>
  );
}
