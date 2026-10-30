import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { ErrorBanner, Loading, useToast, SectionHeading } from '../components/ui.jsx';
import { WORKSPACE_TYPE_LABELS, WORK_STYLE_LABELS, num } from '../lib/format.js';

const BLANK = {
  name: '', description: '', city: '', locality: '', address: '',
  workspace_type: 'shared_desk', area_sqft: '', capacity: '',
  price_per_seat_month: '', price_per_day: '', price_per_hour: '',
  image_url: '', work_style: '', opens_at: '09:00', closes_at: '21:00',
  amenities: [],
};

export default function SpaceForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const { data: optionsRes } = useFetch('/spaces/filters');
  const { data: existing, loading: loadingSpace } = useFetch(`/spaces/${id}`, { skip: !editing });

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Hydrate the form once the existing space arrives.
  useEffect(() => {
    const s = existing?.data;
    if (!s) return;
    setForm({
      name: s.name ?? '',
      description: s.description ?? '',
      city: s.city ?? '',
      locality: s.locality ?? '',
      address: s.address ?? '',
      workspace_type: s.workspace_type ?? 'shared_desk',
      area_sqft: s.area_sqft ?? '',
      capacity: s.capacity ?? '',
      price_per_seat_month: s.price_per_seat_month ?? '',
      price_per_day: s.price_per_day ?? '',
      price_per_hour: s.price_per_hour ?? '',
      image_url: s.image_url ?? '',
      work_style: s.work_style ?? '',
      opens_at: s.opens_at ?? '09:00',
      closes_at: s.closes_at ?? '21:00',
      amenities: (s.amenities || []).map((a) => a.slug),
    });
  }, [existing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleAmenity = (slug) =>
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(slug)
        ? f.amenities.filter((s) => s !== slug)
        : [...f.amenities, slug],
    }));

  const fieldErrors = err?.fieldErrors || {};
  const Err = ({ field }) =>
    fieldErrors[field] ? <p className="mt-1 text-xs text-ink">{fieldErrors[field]}</p> : null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    const payload = {
      name: form.name,
      description: form.description || undefined,
      city: form.city,
      locality: form.locality || undefined,
      address: form.address || undefined,
      workspace_type: form.workspace_type,
      area_sqft: Number(form.area_sqft),
      capacity: Number(form.capacity),
      price_per_seat_month: Number(form.price_per_seat_month || 0),
      price_per_day: form.price_per_day ? Number(form.price_per_day) : undefined,
      price_per_hour: form.price_per_hour ? Number(form.price_per_hour) : undefined,
      image_url: form.image_url || undefined,
      work_style: form.work_style || undefined,
      opens_at: form.opens_at,
      closes_at: form.closes_at,
      amenities: form.amenities,
    };

    try {
      if (editing) {
        await api.patch(`/spaces/${id}`, payload);
        toast.success('Listing updated.');
      } else {
        const r = await api.post('/spaces', payload);
        toast.success(r.message || 'Listing submitted for approval.');
      }
      navigate('/owner/spaces');
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  if (editing && loadingSpace) return <Loading label="Loading listing…" />;

  const areaPerSeat = form.area_sqft && form.capacity
    ? Math.round(Number(form.area_sqft) / Number(form.capacity))
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <SectionHeading
        title={editing ? 'Edit listing' : 'Add a co-working space'}
        hint={editing
          ? 'Changes to capacity flow into future availability immediately.'
          : 'New listings are reviewed by an admin before they become visible to members.'}
        action={<Link to="/owner/spaces" className="btn btn-ghost">Back to listings</Link>}
      />

      <form onSubmit={submit} className="flex flex-col gap-6">
        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold text-ink">Basics</h2>
          <div>
            <label className="label" htmlFor="s-name">Space name</label>
            <input id="s-name" className="field" required minLength="3" maxLength="120"
                   placeholder="e.g. WorkLoft Prahladnagar"
                   value={form.name} onChange={set('name')} />
            <Err field="name" />
          </div>
          <div>
            <label className="label" htmlFor="s-desc">Description</label>
            <textarea id="s-desc" className="field" rows="4" maxLength="2000"
                      placeholder="What makes this floor worth booking?"
                      value={form.description} onChange={set('description')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="s-city">City</label>
              <input id="s-city" className="field" required list="city-list"
                     value={form.city} onChange={set('city')} />
              <datalist id="city-list">
                {optionsRes?.data?.cities?.map((c) => <option key={c.city} value={c.city} />)}
              </datalist>
              <Err field="city" />
            </div>
            <div>
              <label className="label" htmlFor="s-locality">Locality</label>
              <input id="s-locality" className="field" value={form.locality} onChange={set('locality')} />
            </div>
            <div>
              <label className="label" htmlFor="s-type">Workspace type</label>
              <select id="s-type" className="field" value={form.workspace_type}
                      onChange={set('workspace_type')}>
                {Object.entries(WORKSPACE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="s-address">Full address</label>
            <input id="s-address" className="field" maxLength="240"
                   value={form.address} onChange={set('address')} />
          </div>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold text-ink">Capacity and area</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-capacity">Seating capacity</label>
              <input id="s-capacity" type="number" min="1" max="5000" required
                     className="field tabular" value={form.capacity} onChange={set('capacity')} />
              <Err field="capacity" />
            </div>
            <div>
              <label className="label" htmlFor="s-area">Total area (sq.ft)</label>
              <input id="s-area" type="number" min="10" required
                     className="field tabular" value={form.area_sqft} onChange={set('area_sqft')} />
              <Err field="area_sqft" />
            </div>
          </div>
          {areaPerSeat !== null && (
            <p className="text-xs text-ink-muted">
              That works out to <span className="tabular font-semibold text-ink">{num(areaPerSeat)} sq.ft</span>{' '}
              per seat{areaPerSeat < 30 ? ' — tight for most teams.' : '.'}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="s-style">Work style</label>
              <select id="s-style" className="field" value={form.work_style} onChange={set('work_style')}>
                <option value="">Not specified</option>
                {Object.entries(WORK_STYLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="s-open">Opens at</label>
              <input id="s-open" type="time" className="field" value={form.opens_at} onChange={set('opens_at')} />
            </div>
            <div>
              <label className="label" htmlFor="s-close">Closes at</label>
              <input id="s-close" type="time" className="field" value={form.closes_at} onChange={set('closes_at')} />
            </div>
          </div>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold text-ink">Pricing</h2>
          <p className="-mt-2 text-xs text-ink-muted">
            Set a monthly seat price for desks and cabins, or an hourly price for meeting rooms.
            Stays of 28 days or more are billed from the monthly rate.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="s-month">Per seat / month (₹)</label>
              <input id="s-month" type="number" min="0" className="field tabular"
                     value={form.price_per_seat_month} onChange={set('price_per_seat_month')} />
              <Err field="price_per_seat_month" />
            </div>
            <div>
              <label className="label" htmlFor="s-day">Per day (₹)</label>
              <input id="s-day" type="number" min="0" className="field tabular"
                     value={form.price_per_day} onChange={set('price_per_day')} />
            </div>
            <div>
              <label className="label" htmlFor="s-hour">Per hour (₹)</label>
              <input id="s-hour" type="number" min="0" className="field tabular"
                     value={form.price_per_hour} onChange={set('price_per_hour')} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="s-image">Cover image URL</label>
            <input id="s-image" type="url" className="field" maxLength="500"
                   placeholder="https://…" value={form.image_url} onChange={set('image_url')} />
            <p className="mt-1 text-xs text-ink-muted">
              Leave blank to use a generated placeholder.
            </p>
          </div>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold text-ink">
            Amenities <span className="tabular font-normal text-ink-muted">({form.amenities.length} selected)</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {optionsRes?.data?.amenities?.map((a) => {
              const on = form.amenities.includes(a.slug);
              return (
                <button key={a.slug} type="button" onClick={() => toggleAmenity(a.slug)}
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1
                                    text-xs font-medium transition ${
                          on ? 'border-ink bg-brand-wash text-ink'
                             : 'border-ink/12 text-ink-soft hover:bg-ink/5'}`}>
                  <span aria-hidden="true" className="glyph">{a.icon}</span>{a.name}{on && <span aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        </section>

        <ErrorBanner error={err?.status === 422 ? null : err} />
        {err?.status === 422 && (
          <p className="text-sm text-ink">
            Some fields need attention — see the messages above.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Link to="/owner/spaces" className="btn btn-ghost">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Submit for approval'}
          </button>
        </div>
      </form>
    </div>
  );
}
