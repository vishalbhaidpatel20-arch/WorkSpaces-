import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { qs } from '../lib/api.js';
import SpaceCard from '../components/SpaceCard.jsx';
import { Loading, ErrorBanner, SectionHeading } from '../components/ui.jsx';
import { num } from '../lib/format.js';

function QuickSearch() {
  const navigate = useNavigate();
  const { data } = useFetch('/spaces/filters');
  const [form, setForm] = useState({ city: '', persons: '', budget: '' });

  const submit = (e) => {
    e.preventDefault();
    navigate(`/spaces${qs(form)}`);
  };

  return (
    <form onSubmit={submit}
          className="card grid gap-3 p-4 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end">
      <div>
        <label className="label" htmlFor="h-city">City</label>
        <select id="h-city" className="field" value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}>
          <option value="">Any city</option>
          {data?.data?.cities?.map((c) => (
            <option key={c.city} value={c.city}>{c.city}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="h-persons">People</label>
        <input id="h-persons" className="field tabular" type="number" min="1" placeholder="6"
               value={form.persons} onChange={(e) => setForm({ ...form, persons: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="h-budget">Budget / seat</label>
        <input id="h-budget" className="field tabular" type="number" min="0" placeholder="9000"
               value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
      </div>
      <button className="btn btn-primary h-[38px]" type="submit">Search</button>
    </form>
  );
}

export default function Home() {
  const { data, error, loading, reload } = useFetch('/spaces?limit=6&sort=rating');
  const { data: filters } = useFetch('/spaces/filters');
  const stats = filters?.data;

  return (
    <>
      <section className="border-b border-ink/10 bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/20
                          bg-brand-wash px-3 py-1 text-xs font-semibold text-brand-dark">
              <span aria-hidden="true">◉</span> Live availability and occupancy monitoring
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Find a co-working space that actually fits your team.
            </h1>
            <p className="mt-3 text-base text-ink-soft sm:text-lg">
              Filter by team size, area, budget, location and amenities — then let smart
              matching score every space against your requirements and tell you why.
            </p>
          </div>

          <div className="mt-7 max-w-4xl"><QuickSearch /></div>

          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            {[
              ['Spaces listed', stats ? num(stats.total) : '—'],
              ['Cities', stats ? num(stats.cities?.length) : '—'],
              ['Amenities tracked', stats ? num(stats.amenities?.length) : '—'],
              ['From', stats ? `₹${num(stats.min_price)}/seat/mo` : '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
                <dd className="text-xl font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['🎯', 'Smart matching',
             'Score each space on capacity, budget, area, location, amenities and work style — with the reasons shown.'],
            ['◉', 'Real-time availability',
             'Seat counts update as bookings are requested, approved or cancelled. Live occupancy streams in from each floor.'],
            ['🤝', 'Expectation matching',
             'Share your team size, work style and expectations up front, and reach the space manager directly.'],
          ].map(([icon, title, body]) => (
            <article key={title} className="card p-5">
              <span aria-hidden="true" className="text-xl">{icon}</span>
              <h3 className="mt-2 font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16">
        <SectionHeading
          title="Top rated spaces"
          hint="Highest rated listings across every city on the platform."
          action={<Link to="/spaces" className="btn btn-ghost">Browse all</Link>}
        />
        {loading && <Loading />}
        <ErrorBanner error={error} onRetry={reload} />
        {data && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((s) => <SpaceCard key={s.id} space={s} showMatch={false} />)}
          </div>
        )}
      </section>

      <section className="border-t border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-10
                        sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-ink">Run a co-working space?</h2>
            <p className="text-sm text-ink-soft">
              List it, manage availability, and watch live occupancy from one dashboard.
            </p>
          </div>
          <Link to="/register" className="btn btn-primary">List your space</Link>
        </div>
      </section>
    </>
  );
}
