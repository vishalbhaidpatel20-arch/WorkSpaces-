import { WORKSPACE_TYPE_LABELS, WORK_STYLE_LABELS, todayISO } from '../lib/format.js';

/**
 * Search filters.
 *
 * Filters sit in one group above the results, as a filter row should. Every
 * control writes straight into the URL query via `onChange`, so a filtered
 * search is shareable and survives a reload.
 */
export default function FilterPanel({ value, onChange, options, onReset, resultCount }) {
  const set = (patch) => onChange({ ...value, ...patch, page: 1 });

  const toggleAmenity = (slug) => {
    const current = value.amenities || [];
    set({
      amenities: current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug],
    });
  };

  const active =
    (value.amenities?.length || 0) +
    ['city', 'persons', 'area', 'budget', 'type', 'work_style', 'available_on', 'min_rating', 'q']
      .filter((k) => value[k]).length;

  return (
    <aside className="card flex flex-col gap-5 p-4" aria-label="Search filters">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Filters {active > 0 && <span className="tabular text-ink-muted">({active})</span>}
        </h2>
        {active > 0 && (
          <button onClick={onReset} className="text-xs font-semibold text-ink hover:underline">
            Clear all
          </button>
        )}
      </div>

      <div>
        <label className="label" htmlFor="f-q">Keyword</label>
        <input id="f-q" className="field" type="search" placeholder="Name, area, city…"
               value={value.q || ''} onChange={(e) => set({ q: e.target.value })} />
      </div>

      <div>
        <label className="label" htmlFor="f-city">City</label>
        <select id="f-city" className="field" value={value.city || ''}
                onChange={(e) => set({ city: e.target.value })}>
          <option value="">Any city</option>
          {options?.cities?.map((c) => (
            <option key={c.city} value={c.city}>{c.city} ({c.space_count})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="f-persons">Team size</label>
          <input id="f-persons" className="field tabular" type="number" min="1" placeholder="e.g. 6"
                 value={value.persons || ''}
                 onChange={(e) => set({ persons: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="f-area">Area (ft²)</label>
          <input id="f-area" className="field tabular" type="number" min="1" placeholder="e.g. 800"
                 value={value.area || ''}
                 onChange={(e) => set({ area: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="f-budget">
          Budget per seat / month
          {value.budget && <span className="tabular ml-1 font-normal text-ink-muted">₹{Number(value.budget).toLocaleString('en-IN')}</span>}
        </label>
        <input id="f-budget" type="range" className="w-full accent-[var(--color-ink)]"
               min={options?.min_price ?? 2000} max={options?.max_price ?? 25000} step="500"
               value={value.budget || options?.max_price || 25000}
               onChange={(e) => set({ budget: e.target.value })} />
        <div className="tabular flex justify-between text-[11px] text-ink-muted">
          <span>₹{(options?.min_price ?? 0).toLocaleString('en-IN')}</span>
          <span>₹{(options?.max_price ?? 0).toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="f-type">Workspace type</label>
        <select id="f-type" className="field" value={value.type || ''}
                onChange={(e) => set({ type: e.target.value })}>
          <option value="">Any type</option>
          {Object.entries(WORKSPACE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="f-style">Work style</label>
        <select id="f-style" className="field" value={value.work_style || ''}
                onChange={(e) => set({ work_style: e.target.value })}>
          <option value="">Any style</option>
          {Object.entries(WORK_STYLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="f-date">Available on</label>
        <input id="f-date" className="field" type="date" min={todayISO()}
               value={value.available_on || ''}
               onChange={(e) => set({ available_on: e.target.value })} />
      </div>

      <fieldset>
        <legend className="label">Amenities</legend>
        <div className="flex flex-wrap gap-1.5">
          {options?.amenities?.map((a) => {
            const on = value.amenities?.includes(a.slug);
            return (
              <button key={a.slug} type="button" onClick={() => toggleAmenity(a.slug)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1
                                  text-xs font-medium transition ${
                        on ? 'border-ink bg-brand-wash text-ink'
                           : 'border-ink/12 text-ink-soft hover:bg-ink/5'}`}>
                <span aria-hidden="true" className="glyph">{a.icon}</span>
                {a.name}
                {on && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {typeof resultCount === 'number' && (
        <p className="border-t border-ink/8 pt-3 text-xs text-ink-muted">
          <span className="tabular font-semibold text-ink">{resultCount}</span> space
          {resultCount === 1 ? '' : 's'} match these filters
        </p>
      )}
    </aside>
  );
}
