import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/**
 * GET a path into { data, error, loading, reload }.
 * Aborts in flight when the path changes or the component unmounts, so a fast
 * sequence of filter changes cannot land an older response last.
 */
export function useFetch(path, { skip = false } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !skip });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (skip || !path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    api.get(path, { signal: controller.signal })
      .then((r) => setState({ data: r, error: null, loading: false }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ data: null, error: err, loading: false });
      });

    return () => controller.abort();
  }, [path, skip, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
