import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* ------------------------------------------------------------ feedback --- */

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-muted" role="status">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    // Errors are marked by a heavier border and a glyph, not by red.
    <div className="card flex flex-wrap items-center gap-3 border-ink/45 bg-plane p-4"
         role="alert">
      <span aria-hidden="true" className="text-ink">⚠</span>
      <p className="flex-1 text-sm text-ink">{error.message || String(error)}</p>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ icon = '🔍', title, hint, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="glyph text-3xl" aria-hidden="true">{icon}</span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {hint && <p className="max-w-md text-sm text-ink-soft">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- chips --- */

/**
 * Status chip.
 *
 * The palette is monochrome on purpose, so state is carried by three channels
 * that all survive greyscale and forced-colours: a glyph, the status word, and
 * fill weight. The weight scale runs solid-ink (settled) -> outlined (waiting)
 * -> muted (closed), which reads as importance rather than as category.
 */
const STATUS_STYLES = {
  // Settled and good: solid ink, the strongest mark on the row.
  confirmed: { cls: 'bg-ink text-surface border-ink', icon: '✓' },
  active: { cls: 'bg-ink text-surface border-ink', icon: '✓' },
  available: { cls: 'bg-ink text-surface border-ink', icon: '✓' },
  responded: { cls: 'bg-ink text-surface border-ink', icon: '✓' },

  // Waiting on someone: outlined, full-strength ink.
  pending: { cls: 'bg-surface text-ink border-ink/45', icon: '○' },
  open: { cls: 'bg-surface text-ink border-ink/45', icon: '○' },

  // Stopped: outlined and struck, so it reads as negated.
  rejected: { cls: 'bg-surface text-ink border-ink/45 line-through decoration-1', icon: '✕' },
  full: { cls: 'bg-surface text-ink border-ink/45 line-through decoration-1', icon: '✕' },
  blocked: { cls: 'bg-surface text-ink border-ink/45 line-through decoration-1', icon: '✕' },
  cancelled: { cls: 'bg-plane text-ink-soft border-ink/15 line-through decoration-1', icon: '⊘' },
  suspended: { cls: 'bg-plane text-ink-soft border-ink/15 line-through decoration-1', icon: '⊘' },

  // Done and filed away: recessive.
  completed: { cls: 'bg-plane text-ink-soft border-ink/15', icon: '✓' },
  closed: { cls: 'bg-plane text-ink-muted border-ink/12', icon: '•' },
};

export function StatusPill({ status, children }) {
  const s = STATUS_STYLES[status] || { cls: 'bg-plane text-ink-soft border-ink/15', icon: '•' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs
                      font-semibold capitalize ${s.cls}`}>
      <span aria-hidden="true" className="text-[0.9em] leading-none no-underline">{s.icon}</span>
      {children ?? status}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-plane text-ink-soft border-ink/10',
    // "brand" now means emphasis, carried by ink weight rather than a hue.
    brand: 'bg-brand-wash text-ink border-ink/20 font-semibold',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs
                      font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- modal --- */

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
         role="dialog" aria-modal="true" aria-label={title}
         onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`card my-auto w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-xl`}>
        <header className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close"
                  className="rounded-md px-2 text-xl leading-none text-ink-muted hover:bg-ink/5">
            ×
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-ink/10 px-5 py-3.5">{footer}</footer>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- toast --- */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = 'good') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const value = useMemo(() => ({
    success: (m) => push(m, 'good'),
    error: (m) => push(m, 'critical'),
    info: (m) => push(m, 'neutral'),
  }), [push]);

  // Toasts differ by glyph and border weight, not by hue.
  const tones = {
    good: 'border-ink/25 bg-surface text-ink',
    critical: 'border-ink/55 bg-surface text-ink',
    neutral: 'border-ink/12 bg-surface text-ink-soft',
  };
  const icons = { good: '✓', critical: '⚠', neutral: 'ℹ' };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
           aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id}
               className={`pointer-events-auto card flex items-start gap-2.5 px-4 py-3 text-sm shadow-lg ${tones[t.tone]}`}>
            <span aria-hidden="true">{icons[t.tone]}</span>
            <p className="flex-1">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ---------------------------------------------------------- pagination --- */

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const windowed = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) windowed.push(p);

  return (
    <nav className="flex items-center justify-center gap-1.5 pt-2" aria-label="Pagination">
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {windowed.map((p) => (
        <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}
                className={`tabular h-9 w-9 rounded-lg text-sm font-semibold ${
                  p === page ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink/5'}`}>
          {p}
        </button>
      ))}
      <button className="btn btn-ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

/* --------------------------------------------------------------- misc --- */

export function SectionHeading({ title, hint, action }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {hint && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Live-feed indicator: a dot plus the word, never colour alone.
 *
 * "Polling" rather than "Offline" when the socket is unavailable, because the
 * data is still refreshing - just on an interval instead of a push. Calling
 * that offline would be wrong.
 */
export function LiveDot({ connected, polling = true }) {
  const state = connected ? 'live' : polling ? 'polling' : 'offline';
  const label = { live: 'Live', polling: 'Polling', offline: 'Offline' }[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft"
          title={connected
            ? 'Streaming over a websocket'
            : polling
              ? 'No websocket available here — refreshing on an interval instead'
              : 'Not receiving updates'}>
      <span aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              state === 'live' ? 'animate-pulse bg-ink'
                : state === 'polling' ? 'bg-ink-muted'
                : 'bg-ink-muted opacity-40'}`} />
      {label}
    </span>
  );
}
