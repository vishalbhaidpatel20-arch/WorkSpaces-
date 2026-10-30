import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { qs } from '../lib/api.js';
import FilterPanel from '../components/FilterPanel.jsx';
import SpaceCard from '../components/SpaceCard.jsx';
import { Loading, ErrorBanner, EmptyState, Pagination } from '../components/ui.jsx';

const SORTS = [
  ['match', 'Best match'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Highest rated'],
  ['capacity', 'Largest capacity'],
  ['area', 'Largest area'],
  ['newest', 'Newest'],
];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  // The URL is the single source of truth, so any search is shareable.
  const filters = useMemo(() => ({
    q: params.get('q') || '',
    city: params.get('city') || '',
    persons: params.get('persons') || '',
    area: params.get('area') || '',
    budget: params.get('budget') || '',
    type: params.get('type') || '',
    work_style: params.get('work_style') || '',
    available_on: params.get('available_on') || '',
    min_rating: params.get('min_rating') || '',
    amenities: params.get('amenities') ? params.get('amenities').split(',') : [],
    sort: params.get('sort') || 'match',
    page: Number(params.get('page')) || 1,
  }), [params]);

  const apply = useCallback((next) => {
    setParams(qs(next).slice(1), { replace: false });
  }, [setParams]);

  const reset = useCallback(() => setParams(''), [setParams]);

  const { data: optionsRes } = useFetch('/spaces/filters');
  const { data, error, loading, reload } = useFetch(`/spaces${qs({ ...filters, limit: 12 })}`);

  const meta = data?.meta;
  const spaces = data?.data || [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-7">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Find a co-working space</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Every result is scored against the filters you set — open a score to see why it matched.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
          <div className="lg:sticky lg:top-20">
            <FilterPanel value={filters} onChange={apply} onReset={reset}
                         options={optionsRes?.data} resultCount={meta?.total} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost lg:hidden" onClick={() => setShowFilters((s) => !s)}
                    aria-expanded={showFilters}>
              {showFilters ? 'Hide filters' : 'Show filters'}
            </button>
            <p className="text-sm text-ink-soft">
              {loading ? 'Searching…' : (
                <>
                  <span className="tabular font-semibold text-ink">{meta?.total ?? 0}</span>{' '}
                  space{meta?.total === 1 ? '' : 's'} found
                </>
              )}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs font-semibold text-ink-soft" htmlFor="sort">Sort</label>
              <select id="sort" className="field w-auto py-1.5" value={filters.sort}
                      onChange={(e) => apply({ ...filters, sort: e.target.value, page: 1 })}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          <ErrorBanner error={error} onRetry={reload} />
          {loading && <Loading label="Scoring spaces against your criteria…" />}

          {!loading && !error && spaces.length === 0 && (
            <EmptyState
              title="No spaces match every filter"
              hint="Try widening the budget, raising the team size, or dropping an amenity. Smart match can also rank near-misses instead of hiding them."
              action={<button className="btn btn-primary" onClick={reset}>Clear filters</button>}
            />
          )}

          {spaces.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {spaces.map((s) => <SpaceCard key={s.id} space={s} />)}
            </div>
          )}

          {meta && (
            <Pagination page={meta.page} pages={meta.pages}
                        onChange={(p) => apply({ ...filters, page: p })} />
          )}
        </div>
      </div>
    </div>
  );
}
