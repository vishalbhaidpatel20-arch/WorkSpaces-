import { useEffect, useMemo, useRef, useState } from 'react';

/*
 * Chart layer.
 *
 * Every chart here is single-series on purpose: one categorical slot
 * (--color-series, validated on this surface) carries magnitude, and
 * --color-track is recessive chrome behind it. A single series means the title
 * names the data and no legend box is needed, and there is no colour pair for a
 * colour-vision-deficient reader to confuse. Grid and axes stay recessive, marks
 * are thin, data-ends are 4px-rounded and anchored to the baseline, and values
 * are directly labelled rather than hidden behind hover alone.
 */

/* ----------------------------------------------------------- stat tile --- */

/**
 * A headline number. Not a chart: no plot, so no hover layer. The delta, when
 * given, pairs an arrow glyph with its text so colour is never the only cue.
 */
export function StatTile({ label, value, sub, delta, deltaTone = 'neutral', icon }) {
  const toneCls = {
    good: 'text-ink',
    critical: 'text-ink',
    neutral: 'text-ink-soft',
  }[deltaTone];

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        {icon && <span aria-hidden="true" className="glyph text-base leading-none">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
      {delta && (
        <p className={`mt-1 text-xs font-medium ${toneCls}`}>
          <span aria-hidden="true">{deltaTone === 'critical' ? '▼' : '▲'}</span> {delta}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- meter --- */

/**
 * Occupancy / utilisation meter: one value against its total.
 * The track is chrome; the fill is the single series. The percentage is always
 * written out, so the bar is a secondary encoding rather than the only one.
 */
export function Meter({ value, total, label, caption, compact = false }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      {(label || !compact) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink">{label}</span>
          <span className="tabular shrink-0 text-sm font-semibold text-ink">
            {pct}%
            <span className="ml-1 font-normal text-ink-muted">
              ({value}/{total})
            </span>
          </span>
        </div>
      )}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-track"
           role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
           aria-label={label ? `${label}: ${pct}% occupied` : `${pct}% occupied`}>
        <div className="h-full rounded-full bg-series transition-[width] duration-700 ease-out"
             style={{ width: `${pct}%` }} />
      </div>
      {caption && <p className="mt-1 text-xs text-ink-muted">{caption}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ bar list --- */

/**
 * Horizontal bars for a categorical breakdown (counts by status, by city).
 * Identity sits in the row label, magnitude in one hue - so this stays a
 * single-series chart. Values are direct-labelled; hover adds detail only.
 */
export function BarList({ data, valueFormat = (v) => v, emptyLabel = 'No data yet' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-6 text-center text-sm text-ink-muted">{emptyLabel}</p>;

  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <li key={d.label} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate capitalize text-ink-soft">{d.label}</span>
              <span className="tabular shrink-0 font-semibold text-ink">{valueFormat(d.value)}</span>
            </div>
            {/* 2px surface gap between the fill and the track edge keeps
                adjacent bars from visually merging. */}
            <div className="h-2.5 w-full rounded-full bg-track/60">
              <div className="h-full rounded-full bg-series transition-[width] duration-500
                              group-hover:brightness-110"
                   style={{ width: `${Math.max(d.value > 0 ? 2 : 0, pct)}%` }}
                   title={`${d.label}: ${valueFormat(d.value)}`} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------- line chart --- */

const PAD = { top: 12, right: 10, bottom: 24, left: 34 };

/**
 * Occupancy over time: a single 2px line with a crosshair-and-tooltip hover
 * layer, as an interactive SVG chart should have. Y axis is a fixed 0-100%
 * scale so readings stay comparable between spaces.
 */
export function OccupancyLine({ points, height = 170, yMax = 100, yLabel = '%' }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(560);

  // Track the container width so the chart is responsive without a library.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(80, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;

  const xy = useMemo(() => {
    if (points.length < 2) return [];
    return points.map((p, i) => [
      PAD.left + (i / (points.length - 1)) * plotW,
      PAD.top + plotH - (Math.min(p.value, yMax) / yMax) * plotH,
    ]);
  }, [points, plotW, plotH, yMax]);

  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Not enough readings yet — the live feed fills this in.
      </p>
    );
  }

  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy.at(-1)[0].toFixed(1)},${PAD.top + plotH} L${xy[0][0].toFixed(1)},${PAD.top + plotH} Z`;
  const ticks = [0, 25, 50, 75, 100].filter((t) => t <= yMax);

  // The hit rect spans exactly the plot area, so the pointer's position within
  // it maps straight onto the point index.
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    const idx = Math.round(ratio * (points.length - 1));
    if (idx >= 0 && idx < points.length) setHover(idx);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
           role="img" aria-label={`Occupancy over time, ${points.length} readings`}>
        {/* Recessive gridlines and axis labels. */}
        {ticks.map((t) => {
          const y = PAD.top + plotH - (t / yMax) * plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y}
                    stroke="var(--color-line)" strokeWidth="1" />
              <text x={PAD.left - 7} y={y + 3.5} textAnchor="end"
                    className="tabular" fontSize="10" fill="var(--color-ink-muted)">
                {t}{yLabel}
              </text>
            </g>
          );
        })}

        <path d={area} fill="var(--color-series)" opacity="0.08" />
        <path d={line} fill="none" stroke="var(--color-series)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />

        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
              stroke="var(--color-axis)" strokeWidth="1" />

        {/* First and last time labels only - a label on every point is noise. */}
        <text x={PAD.left} y={height - 7} fontSize="10" fill="var(--color-ink-muted)">
          {points[0].label}
        </text>
        <text x={width - PAD.right} y={height - 7} textAnchor="end"
              fontSize="10" fill="var(--color-ink-muted)">
          {points.at(-1).label}
        </text>

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={xy[hover][0]} x2={xy[hover][0]} y1={PAD.top} y2={PAD.top + plotH}
                  stroke="var(--color-axis)" strokeWidth="1" strokeDasharray="3 3" />
            {/* 2px surface ring keeps the marker legible over the line. */}
            <circle cx={xy[hover][0]} cy={xy[hover][1]} r="5"
                    fill="var(--color-series)" stroke="var(--color-surface)" strokeWidth="2" />
          </g>
        )}

        {/*
          Explicit hit layer, drawn last and spanning the whole plot. Painted
          SVG shapes only receive pointer events where they are drawn, so a
          transparent rect gives the crosshair a hit target far larger than the
          2px line itself.
        */}
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent"
              onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>

      {hover !== null && (
        <div className="card pointer-events-none absolute z-10 px-2.5 py-1.5 text-xs shadow-md"
             style={{
               left: Math.min(Math.max(xy[hover][0] - 50, 0), Math.max(0, width - 110)),
               // Clear the 5px marker plus its ring, so the dot stays visible.
               top: Math.max(0, xy[hover][1] - 58),
             }}>
          <p className="font-semibold text-ink">
            <span className="tabular">{points[hover].value}</span>{yLabel}
          </p>
          <p className="text-ink-muted">{points[hover].label}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------- availability strip --- */

/**
 * A day-by-day seat-availability strip. Magnitude uses one hue stepped by
 * fullness; the glyph and the tooltip carry the state, so colour is never the
 * only signal.
 */
export function AvailabilityStrip({ days, onPick, selected }) {
  if (!days?.length) return null;
  return (
    <div className="flex flex-wrap gap-1" role="list">
      {days.map((d) => {
        const ratio = d.seats_total ? d.seats_available / d.seats_total : 0;
        const state = d.is_blocked || d.seats_available === 0
          ? 'full'
          : ratio < 0.25 ? 'tight' : 'open';
        const styles = {
          open: 'bg-series text-white',
          tight: 'bg-series-weak text-ink',
          full: 'bg-track text-ink-muted line-through',
        }[state];
        const isSel = selected === d.date;
        return (
          <button key={d.date} role="listitem" type="button"
                  onClick={() => state !== 'full' && onPick?.(d.date)}
                  disabled={state === 'full'}
                  title={`${d.date}: ${d.seats_available} of ${d.seats_total} seats free (${state})`}
                  className={`tabular h-7 w-9 rounded text-[11px] font-semibold transition
                              ${styles} ${isSel ? 'ring-2 ring-ink ring-offset-1' : ''}
                              ${state === 'full' ? 'cursor-not-allowed' : 'hover:opacity-85'}`}>
            {Number(d.date.slice(8, 10))}
          </button>
        );
      })}
    </div>
  );
}
