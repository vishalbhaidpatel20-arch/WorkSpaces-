import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-5xl font-semibold tracking-tight text-ink-muted">404</p>
      <h1 className="mt-3 text-xl font-semibold text-ink">We could not find that page</h1>
      <p className="mt-2 text-sm text-ink-soft">
        The link may be out of date, or the space may have been removed.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/" className="btn btn-ghost">Go home</Link>
        <Link to="/spaces" className="btn btn-primary">Browse spaces</Link>
      </div>
    </div>
  );
}
