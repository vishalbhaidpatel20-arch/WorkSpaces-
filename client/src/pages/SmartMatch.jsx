import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../lib/auth.jsx';
import SpaceCard from '../components/SpaceCard.jsx';
import { Loading, ErrorBanner, SectionHeading, Badge, EmptyState } from '../components/ui.jsx';
import { WORKSPACE_TYPE_LABELS, WORK_STYLE_LABELS, todayISO, num } from '../lib/format.js';

const WEIGHT_LABELS = {
  capacity: 'Team fit',
  budget: 'Budget',
  amenities: 'Amenities',
  location: 'Location',
  area: 'Area',
  type: 'Workspace type',
  workStyle: 'Work style',
};

/** How the score was composed, so the recommendation is auditable. */
function WeightLegend({ weights }) {
  if (!weights) return null;
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        How the score is weighted
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(weights).map(([k, w]) => (
          <li key={k}>
            <Badge>{WEIGHT_LABELS[k] || k} <span className="tabular font-semibold">{w}</span></Badge>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-soft">
        Criteria you leave blank are neutral — they neither help nor hurt a space.
        Spaces that miss one criterion are still shown, with the shortfall spelled out.
      </p>
    </div>
  );
}

function PeerTeams() {
  const { user } = useAuth();
  const { data, loading } = useFetch('/match/peers?limit=6', { skip: !user });
  if (!user) return null;

  return (
    <section>
      <SectionHeading
        title="Teams like yours"
        hint="Members with a similar work style and team size. Reach them through a space manager."
      />
      {loading && <Loading label="Finding similar teams…" />}
      {data?.data?.length === 0 && (
        <p className="card p-5 text-sm text-ink-muted">
          No similar teams yet. Set your work style and team size in your profile to improve this.
        </p>
      )}
      {data?.data?.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-semibold text-ink">{p.company || p.name}</p>
                <span className="tabular shrink-0 text-sm font-semibold text-brand-dark">
                  {p.affinity_score}%
                </span>
              </div>
              <p className="text-sm text-ink-soft">
                {p.team_size ? `Team of ${p.team_size}` : 'Team size not set'}
                {p.work_style ? ` · ${WORK_STYLE_LABELS[p.work_style] || p.work_style}` : ''}
              </p>
              {p.shared.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {p.shared.map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-ink-soft">
                      <span aria-hidden="true" className="text-good-ink">✓</span>{s}
                    </li>
                  ))}
                </ul>
              )}
              {p.cities.length > 0 && (
                <p className="mt-2 text-xs text-ink-muted">Books in {p.cities.join(', ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SmartMatch() {
  const { user } = useAuth();
  const { data: optionsRes } = useFetch('/spaces/filters');
  const options = optionsRes?.data;

  const [form, setForm] = useState({
    persons: '', area_required: '', budget: '', city: '',
    workspace_type: '', work_style: '', available_on: '', amenities: [],
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const toggleAmenity = (slug) =>
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(slug)
        ? f.amenities.filter((s) => s !== slug)
        : [...f.amenities, slug],
    }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = {
        persons: form.persons ? Number(form.persons) : undefined,
        area_required: form.area_required ? Number(form.area_required) : undefined,
        budget: form.budget ? Number(form.budget) : undefined,
        city: form.city || undefined,
        workspace_type: form.workspace_type || undefined,
        work_style: form.work_style || undefined,
        available_on: form.available_on || undefined,
        amenities: form.amenities.length ? form.amenities : undefined,
        limit: 9,
      };
      setResult(await api.post('/match', body));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-7">
      <header className="mb-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Smart match</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Describe what your team needs and every space is scored against it. Unlike a
          filter, matching does not hide a space that misses one requirement — it shows
          you the trade-off instead.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="m-persons">Number of persons</label>
                <input id="m-persons" type="number" min="1" className="field tabular" placeholder="6"
                       value={form.persons}
                       onChange={(e) => setForm({ ...form, persons: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="m-area">Area needed (ft²)</label>
                <input id="m-area" type="number" min="1" className="field tabular" placeholder="800"
                       value={form.area_required}
                       onChange={(e) => setForm({ ...form, area_required: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="m-budget">Budget per seat / month (₹)</label>
              <input id="m-budget" type="number" min="0" step="500" className="field tabular"
                     placeholder="9000" value={form.budget}
                     onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </div>

            <div>
              <label className="label" htmlFor="m-city">City</label>
              <select id="m-city" className="field" value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}>
                <option value="">Any city</option>
                {options?.cities?.map((c) => (
                  <option key={c.city} value={c.city}>{c.city}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="m-type">Workspace type</label>
                <select id="m-type" className="field" value={form.workspace_type}
                        onChange={(e) => setForm({ ...form, workspace_type: e.target.value })}>
                  <option value="">Any</option>
                  {Object.entries(WORKSPACE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="m-style">Work style</label>
                <select id="m-style" className="field" value={form.work_style}
                        onChange={(e) => setForm({ ...form, work_style: e.target.value })}>
                  <option value="">Any</option>
                  {Object.entries(WORK_STYLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="m-date">Needed from</label>
              <input id="m-date" type="date" className="field" min={todayISO()}
                     value={form.available_on}
                     onChange={(e) => setForm({ ...form, available_on: e.target.value })} />
            </div>

            <fieldset>
              <legend className="label">Must-have amenities</legend>
              <div className="flex flex-wrap gap-1.5">
                {options?.amenities?.map((a) => {
                  const on = form.amenities.includes(a.slug);
                  return (
                    <button key={a.slug} type="button" onClick={() => toggleAmenity(a.slug)}
                            aria-pressed={on}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1
                                        text-xs font-medium transition ${
                              on ? 'border-brand bg-brand-wash text-brand-dark'
                                 : 'border-ink/12 text-ink-soft hover:bg-ink/5'}`}>
                      <span aria-hidden="true">{a.icon}</span>{a.name}{on && <span aria-hidden="true">✓</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? 'Matching…' : 'Find my match'}
            </button>
          </form>

          <WeightLegend weights={result?.meta?.weights} />
        </div>

        <div className="flex flex-col gap-6">
          <ErrorBanner error={err} />

          {!result && !busy && (
            <EmptyState icon="🎯" title="Tell us what you need"
                        hint="Fill in as much or as little as you like — team size and budget alone are usually enough for a useful ranking." />
          )}

          {busy && <Loading label="Scoring every space against your criteria…" />}

          {result && (
            <>
              <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
                {[
                  ['Spaces considered', num(result.meta.candidates_considered)],
                  ['Shown', num(result.meta.returned)],
                  ['Best score', `${result.meta.best_score}%`],
                  ['Average score', `${result.meta.average_score}%`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</p>
                    <p className="tabular mt-0.5 text-lg font-semibold text-ink">{v}</p>
                  </div>
                ))}
              </div>

              {result.data.length === 0 ? (
                <EmptyState title="Nothing to rank yet"
                            hint="No space is available for that city and date. Try removing the date or widening the city."
                            action={<Link to="/spaces" className="btn btn-primary">Browse all spaces</Link>} />
              ) : (
                <section>
                  <SectionHeading title="Your best matches"
                                  hint="Ranked by weighted score. Open a score to read the reasons behind it." />
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {result.data.map((s) => <SpaceCard key={s.id} space={s} />)}
                  </div>
                </section>
              )}
            </>
          )}

          <PeerTeams />
        </div>
      </div>
    </div>
  );
}
