import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, StatusPill } from './ui.jsx';
import { money, num, typeLabel, styleLabel } from '../lib/format.js';

/**
 * Match score chip.
 *
 * The score is written as a number and the fit as a word, so the chip never
 * relies on its tint to communicate. Reasons expand on click - a match is only
 * persuasive if the user can see why it scored the way it did.
 */
export function MatchBadge({ match, expandable = true }) {
  const [open, setOpen] = useState(false);
  if (!match) return null;

  // Fit is a four-step ramp in ink weight: the better the match, the heavier
  // the chip reads. The percentage and the word carry the meaning regardless.
  const tone = {
    excellent: 'border-ink bg-ink text-surface',
    good: 'border-ink/45 bg-surface text-ink',
    fair: 'border-ink/20 bg-plane text-ink-soft',
    poor: 'border-ink/12 bg-plane text-ink-muted',
  }[match.fit];

  return (
    <div className="relative">
      <button type="button" disabled={!expandable}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
              aria-expanded={expandable ? open : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
                          text-xs font-semibold ${tone} ${expandable ? 'hover:brightness-95' : ''}`}>
          <span className="tabular">{match.score}%</span>
          <span className="font-medium capitalize opacity-80">{match.fit} fit</span>
          {expandable && <span aria-hidden="true" className="text-[10px] opacity-70">{open ? '▴' : '▾'}</span>}
      </button>

      {open && match.reasons?.length > 0 && (
        <div className="card absolute right-0 top-full z-20 mt-1.5 w-64 p-3 text-left shadow-lg">
          <p className="mb-1.5 text-xs font-semibold text-ink">Why this score</p>
          <ul className="flex flex-col gap-1">
            {match.reasons.map((r, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-ink-soft">
                <span aria-hidden="true" className="text-ink-muted">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Initials-on-gradient placeholder, so a missing or blocked image still reads. */
function Thumb({ space }) {
  const [failed, setFailed] = useState(false);
  const initials = space.name.split(' ').filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase();

  if (!space.image_url || failed) {
    return (
      <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br
                      from-brand-wash to-track text-2xl font-bold text-ink"
           aria-hidden="true">
        {initials}
      </div>
    );
  }
  return (
    <img src={space.image_url} alt="" loading="lazy" onError={() => setFailed(true)}
         className="h-40 w-full object-cover" />
  );
}

export default function SpaceCard({ space, showMatch = true }) {
  const avail = space.availability_today;
  const live = space.live_occupancy;

  return (
    <article className="card card-interactive group flex flex-col overflow-hidden">
      <Link to={`/spaces/${space.id}`} className="relative block">
        <Thumb space={space} />
        {avail && (
          <span className="absolute left-2 top-2">
            <StatusPill status={avail.status}>
              {avail.status === 'available' ? `${avail.seats_available} seats free` : 'Full today'}
            </StatusPill>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-ink">
              <Link to={`/spaces/${space.id}`} className="hover:text-ink">{space.name}</Link>
            </h3>
            <p className="truncate text-sm text-ink-soft">
              {space.locality ? `${space.locality}, ` : ''}{space.city}
            </p>
          </div>
          {showMatch && <MatchBadge match={space.match} />}
        </header>

        <dl className="grid grid-cols-3 gap-2 border-y border-ink/8 py-2.5 text-center">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Seats</dt>
            <dd className="tabular text-sm font-semibold text-ink">{num(space.capacity)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Area</dt>
            <dd className="tabular text-sm font-semibold text-ink">{num(space.area_sqft)} ft²</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Rating</dt>
            <dd className="tabular text-sm font-semibold text-ink">
              {space.rating > 0 ? `★ ${space.rating.toFixed(1)}` : '—'}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone="brand">{typeLabel(space.workspace_type)}</Badge>
          {styleLabel(space.work_style) && <Badge>{styleLabel(space.work_style)}</Badge>}
          {space.amenities?.slice(0, 3).map((a) => (
            <Badge key={a.slug}>
              <span aria-hidden="true" className="glyph">{a.icon}</span> {a.name}
            </Badge>
          ))}
          {space.amenities?.length > 3 && <Badge>+{space.amenities.length - 3} more</Badge>}
        </div>

        {live && (
          <p className="text-xs text-ink-soft">
            <span aria-hidden="true" className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink align-middle" />
            Live: <span className="tabular font-semibold text-ink">{live.percent}%</span> of seats in use
          </p>
        )}

        <footer className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            {space.price_per_seat_month > 0 ? (
              <p className="text-base font-semibold text-ink">
                {money(space.price_per_seat_month)}
                <span className="text-xs font-normal text-ink-muted">/seat/mo</span>
              </p>
            ) : (
              <p className="text-base font-semibold text-ink">
                {money(space.price_per_hour)}
                <span className="text-xs font-normal text-ink-muted">/hour</span>
              </p>
            )}
            {space.price_per_day > 0 && space.price_per_seat_month > 0 && (
              <p className="text-xs text-ink-muted">{money(space.price_per_day)}/day pass</p>
            )}
          </div>
          <Link to={`/spaces/${space.id}`} className="btn btn-primary">View</Link>
        </footer>
      </div>
    </article>
  );
}
