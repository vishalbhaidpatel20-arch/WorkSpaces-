import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { ErrorBanner, Spinner } from '../components/ui.jsx';
import { WORK_STYLE_LABELS } from '../lib/format.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'user',
    phone: '', company: '', team_size: '', work_style: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const fieldErrors = err?.fieldErrors || {};

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const user = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        phone: form.phone || undefined,
        company: form.company || undefined,
        team_size: form.team_size ? Number(form.team_size) : undefined,
        work_style: form.work_style || undefined,
      });
      navigate(homeFor(user), { replace: true });
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const Err = ({ field }) =>
    fieldErrors[field] ? <p className="mt-1 text-xs text-critical">{fieldErrors[field]}</p> : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Join as a member to find and book spaces, or as a space owner to list and manage them.
      </p>

      <form onSubmit={submit} className="card mt-5 flex flex-col gap-4 p-5">
        <fieldset>
          <legend className="label">I am signing up as</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['user', 'Member', 'Find and book spaces'],
              ['owner', 'Space owner', 'List and manage spaces'],
            ].map(([value, title, hint]) => (
              <label key={value}
                     className={`cursor-pointer rounded-lg border px-3 py-2.5 transition ${
                       form.role === value
                         ? 'border-brand bg-brand-wash'
                         : 'border-ink/12 hover:bg-ink/5'}`}>
                <input type="radio" name="role" value={value} className="sr-only"
                       checked={form.role === value} onChange={set('role')} />
                <span className="block text-sm font-semibold text-ink">{title}</span>
                <span className="block text-xs text-ink-soft">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="r-name">Full name</label>
          <input id="r-name" className="field" required minLength="2" value={form.name} onChange={set('name')} />
          <Err field="name" />
        </div>

        <div>
          <label className="label" htmlFor="r-email">Email</label>
          <input id="r-email" type="email" className="field" required autoComplete="email"
                 value={form.email} onChange={set('email')} />
          <Err field="email" />
        </div>

        <div>
          <label className="label" htmlFor="r-password">Password</label>
          <input id="r-password" type="password" className="field" required minLength="8"
                 autoComplete="new-password" value={form.password} onChange={set('password')} />
          <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
          <Err field="password" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="r-phone">Phone <span className="font-normal text-ink-muted">(for SMS alerts)</span></label>
            <input id="r-phone" className="field" value={form.phone} onChange={set('phone')} />
            <Err field="phone" />
          </div>
          <div>
            <label className="label" htmlFor="r-company">
              {form.role === 'owner' ? 'Operator name' : 'Company'}
            </label>
            <input id="r-company" className="field" value={form.company} onChange={set('company')} />
          </div>
        </div>

        {form.role === 'user' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="r-team">Team size</label>
              <input id="r-team" type="number" min="1" className="field tabular"
                     value={form.team_size} onChange={set('team_size')} />
            </div>
            <div>
              <label className="label" htmlFor="r-style">Work style</label>
              <select id="r-style" className="field" value={form.work_style} onChange={set('work_style')}>
                <option value="">Not sure yet</option>
                {Object.entries(WORK_STYLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <ErrorBanner error={err?.status === 422 ? null : err} />

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? <><Spinner className="h-4 w-4" /> Creating account…</> : 'Create account'}
        </button>

        <p className="text-center text-sm text-ink-soft">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
