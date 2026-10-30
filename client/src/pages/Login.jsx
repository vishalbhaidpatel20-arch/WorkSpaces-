import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { ErrorBanner, Spinner } from '../components/ui.jsx';

/** Seeded accounts, so a reviewer can try each role without signing up. */
const DEMO = [
  ['admin@flexospaces.com', 'Admin', 'Approvals, users, platform KPIs'],
  ['meera@workloft.in', 'Space owner', '4 listings, live occupancy, booking requests'],
  ['ananya@brightpixel.io', 'Member', 'Team of 6, collaborative work style'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const user = await login(form.email, form.password);
      navigate(location.state?.from || homeFor(user), { replace: true });
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const useDemo = (email) => setForm({ email, password: 'Password123' });

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-2 lg:py-16">
      <div className="order-2 lg:order-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Welcome back. Use your account, or pick a demo role on the right.
        </p>

        <form onSubmit={submit} className="card mt-5 flex flex-col gap-4 p-5">
          <div>
            <label className="label" htmlFor="l-email">Email</label>
            <input id="l-email" type="email" className="field" required autoComplete="email"
                   value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="l-password">Password</label>
            <input id="l-password" type="password" className="field" required
                   autoComplete="current-password" value={form.password}
                   onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>

          <ErrorBanner error={err} />

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? <><Spinner className="h-4 w-4" /> Signing in…</> : 'Sign in'}
          </button>

          <p className="text-center text-sm text-ink-soft">
            No account?{' '}
            <Link to="/register" className="font-semibold text-ink hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>

      <aside className="order-1 lg:order-2">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Demo accounts</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Every seeded account uses the password <code className="rounded bg-ink/5 px-1">Password123</code>.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {DEMO.map(([email, role, hint]) => (
              <li key={email}>
                <button onClick={() => useDemo(email)}
                        className="w-full rounded-lg border border-ink/10 px-3 py-2.5 text-left
                                   transition hover:border-ink/40 hover:bg-brand-wash">
                  <p className="text-sm font-semibold text-ink">{role}</p>
                  <p className="text-xs text-ink-soft">{email}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">
            Clicking a role fills the form — press Sign in to continue.
          </p>
        </div>
      </aside>
    </div>
  );
}
