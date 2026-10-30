import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ErrorBanner, SectionHeading, useToast } from '../components/ui.jsx';
import { WORK_STYLE_LABELS, dateLabel } from '../lib/format.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user.name || '',
    phone: user.phone || '',
    company: user.company || '',
    team_size: user.team_size || '',
    work_style: user.work_style || '',
  });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [pwErr, setPwErr] = useState(null);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.patch('/auth/me', {
        name: form.name,
        phone: form.phone || null,
        company: form.company || null,
        team_size: form.team_size ? Number(form.team_size) : null,
        work_style: form.work_style || null,
      });
      setUser(r.user);
      toast.success('Profile updated.');
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwBusy(true);
    setPwErr(null);
    try {
      await api.post('/auth/me/password', pw);
      setPw({ current_password: '', new_password: '' });
      toast.success('Password changed.');
    } catch (e) {
      setPwErr(e);
    } finally {
      setPwBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your profile</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Signed in as <strong>{user.email}</strong> ·{' '}
          {user.role === 'user' ? 'Member' : user.role} since {dateLabel(user.created_at)}
        </p>
      </header>

      <section className="mb-8">
        <SectionHeading title="Details"
                        hint="Team size and work style feed directly into smart matching." />
        <form onSubmit={saveProfile} className="card flex flex-col gap-4 p-5">
          <div>
            <label className="label" htmlFor="p-name">Full name</label>
            <input id="p-name" className="field" required minLength="2" value={form.name} onChange={set('name')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="p-phone">Phone</label>
              <input id="p-phone" className="field" value={form.phone} onChange={set('phone')} />
            </div>
            <div>
              <label className="label" htmlFor="p-company">
                {user.role === 'owner' ? 'Operator name' : 'Company'}
              </label>
              <input id="p-company" className="field" value={form.company} onChange={set('company')} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="p-team">Team size</label>
              <input id="p-team" type="number" min="1" className="field tabular"
                     value={form.team_size} onChange={set('team_size')} />
            </div>
            <div>
              <label className="label" htmlFor="p-style">Work style</label>
              <select id="p-style" className="field" value={form.work_style} onChange={set('work_style')}>
                <option value="">Not specified</option>
                {Object.entries(WORK_STYLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <ErrorBanner error={err} />
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <SectionHeading title="Password" />
        <form onSubmit={changePassword} className="card flex flex-col gap-4 p-5">
          <div>
            <label className="label" htmlFor="p-cur">Current password</label>
            <input id="p-cur" type="password" className="field" required autoComplete="current-password"
                   value={pw.current_password}
                   onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="p-new">New password</label>
            <input id="p-new" type="password" className="field" required minLength="8"
                   autoComplete="new-password" value={pw.new_password}
                   onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
            <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
          </div>
          <ErrorBanner error={pwErr} />
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={pwBusy}>
              {pwBusy ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
