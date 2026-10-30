import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const DISMISS_KEY = 'workspace.notice.dismissed';

/**
 * Tells the user when the API they are talking to cannot keep their data.
 *
 * The deployed API runs as a serverless function, where the database lives in
 * an instance-local /tmp. Reads are fine, but a booking written by one
 * instance is not reliably visible to the next request - measured at roughly
 * 90% read-back. Letting someone book a desk and then quietly losing it is
 * worse than saying so up front, so the banner is driven by the API's own
 * `storage` flag and disappears by itself once the API runs somewhere durable.
 */
export default function EnvironmentNotice() {
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1'
  );

  useEffect(() => {
    let active = true;
    api.get('/health')
      .then((r) => { if (active) setInfo(r); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (dismissed || info?.storage !== 'ephemeral') return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="border-b border-ink/15 bg-brand-wash" role="status">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5">
        <span aria-hidden="true" className="mt-0.5 text-ink">ⓘ</span>
        <p className="flex-1 text-xs leading-relaxed text-ink">
          <span className="font-semibold">Demo environment.</span>{' '}
          This API runs as a serverless function, so its database is
          instance-local and temporary — browsing, search and matching work
          normally, but a booking you create may not survive the next request.
          Live occupancy refreshes by polling rather than streaming. Hosting the
          same code as an ordinary process with a disk removes both limits.
        </p>
        <button onClick={dismiss}
                className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-ink-soft
                           hover:bg-ink/5 hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  );
}
