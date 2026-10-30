const TOKEN_KEY = 'workspace.token';

/**
 * Where the API lives.
 *
 * Empty by default, which keeps requests same-origin: in development the Vite
 * proxy forwards /api to localhost:4000, and in a single-origin deployment the
 * API serves the built SPA itself. Set VITE_API_URL at build time when the SPA
 * and the API are on different hosts (for example the SPA on a static host and
 * the API on a container platform) - that origin must also appear in the API's
 * CORS_ORIGIN allowlist.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/** An API error that keeps the server's status and field-level details. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  /** Field errors keyed by field name, for inline form messages. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

async function request(method, path, body, { signal } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    signal,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // 204s and empty bodies are fine.
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload?.error || `Request failed (${res.status})`,
      payload?.details
    );
  }
  return payload;
}

/** Build a query string, dropping empty values and joining arrays. */
export function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      sp.set(key, value.join(','));
    } else {
      sp.set(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body ?? {}, opts),
  patch: (path, body, opts) => request('PATCH', path, body ?? {}, opts),
  put: (path, body, opts) => request('PUT', path, body ?? {}, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts),
};
