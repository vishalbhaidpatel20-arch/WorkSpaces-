const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export const money = (n) => inr.format(Number(n) || 0);

/** Compact money for stat tiles: 1.2L / 45.6K. */
export function moneyShort(n) {
  const v = Number(n) || 0;
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v}`;
}

export const num = (n) => new Intl.NumberFormat('en-IN').format(Number(n) || 0);

export const WORKSPACE_TYPE_LABELS = {
  private_cabin: 'Private cabin',
  shared_desk: 'Shared desk',
  dedicated_desk: 'Dedicated desk',
  meeting_room: 'Meeting room',
};

export const WORK_STYLE_LABELS = {
  quiet_focus: 'Quiet focus',
  collaborative: 'Collaborative',
  hybrid: 'Hybrid',
  client_facing: 'Client facing',
};

export const typeLabel = (t) => WORKSPACE_TYPE_LABELS[t] ?? t;
export const styleLabel = (s) => (s ? WORK_STYLE_LABELS[s] ?? s : null);

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "12 Mar 2026" */
export function dateLabel(iso) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** "12 Mar" - for dense axes. */
export function dateShort(iso) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export function timeLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** "3 days", "1 month 2 days" - inclusive of both end dates. */
export function stayLength(start, end) {
  const days = Math.round(
    (new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86_400_000
  ) + 1;
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  const rest = days % 30;
  return `${months} month${months === 1 ? '' : 's'}${rest ? ` ${rest} day${rest === 1 ? '' : 's'}` : ''}`;
}

export const relativeTime = (ts) => {
  if (!ts) return '';
  const then = new Date(ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`).getTime();
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};
