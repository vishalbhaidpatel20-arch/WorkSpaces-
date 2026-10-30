import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Loading, ErrorBanner, StatusPill, EmptyState, Modal, useToast, SectionHeading, Badge,
} from '../components/ui.jsx';
import { relativeTime, WORK_STYLE_LABELS } from '../lib/format.js';

export default function MyInquiries() {
  const { user } = useAuth();
  const isOwner = user.role === 'owner' || user.role === 'admin';

  const [scope, setScope] = useState(isOwner ? 'owned' : 'mine');
  const [status, setStatus] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const query = new URLSearchParams({ scope, ...(status && { status }) });
  const { data, error, loading, reload } = useFetch(`/inquiries?${query}`);

  const sendReply = async () => {
    setBusy(true);
    try {
      await api.post(`/inquiries/${replyTo.id}/reply`, { reply });
      toast.success('Reply sent.');
      setReplyTo(null);
      setReply('');
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const close = async (q) => {
    try {
      await api.post(`/inquiries/${q.id}/close`);
      toast.success('Inquiry closed.');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const inquiries = data?.data || [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <SectionHeading
        title={scope === 'owned' ? 'Inquiries for my spaces' : 'My inquiries'}
        hint="Team size, work style and expectations travel with every inquiry."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {isOwner && (
          <select className="field w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="mine">Sent by me</option>
            <option value="owned">For my spaces</option>
            {user.role === 'admin' && <option value="all">All inquiries</option>}
          </select>
        )}
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="responded">Responded</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <ErrorBanner error={error} onRetry={reload} />
      {loading && <Loading />}

      {!loading && inquiries.length === 0 && (
        <EmptyState icon="💬" title="No inquiries yet"
                    hint={scope === 'owned'
                      ? 'Questions about your listings will appear here.'
                      : 'Open a space and use “Ask a question” to start a conversation.'}
                    action={scope !== 'owned'
                      ? <Link to="/spaces" className="btn btn-primary">Browse spaces</Link>
                      : null} />
      )}

      <ul className="flex flex-col gap-3">
        {inquiries.map((q) => {
          const iReply = (q.owner_id === user.id || user.role === 'admin') && q.status !== 'closed';
          return (
            <li key={q.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{q.subject}</p>
                    <StatusPill status={q.status} />
                    {q.wants_meeting ? <Badge tone="brand">Wants a meeting</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    <Link to={`/spaces/${q.space_id}`} className="hover:text-brand">
                      {q.space_name}
                    </Link>
                    {scope !== 'mine' && ` · from ${q.user_name}${q.user_company ? ` (${q.user_company})` : ''}`}
                    {' · '}{relativeTime(q.created_at)}
                  </p>
                </div>
              </div>

              <p className="mt-2.5 text-sm text-ink-soft">{q.message}</p>

              {q.expectations && (
                <p className="mt-2 text-sm text-ink-soft">
                  <span className="font-semibold text-ink">Expectations: </span>{q.expectations}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.team_size && <Badge>Team of {q.team_size}</Badge>}
                {q.work_style && <Badge>{WORK_STYLE_LABELS[q.work_style] || q.work_style}</Badge>}
              </div>

              {q.reply && (
                <div className="mt-3 rounded-lg bg-brand-wash p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
                    Reply from the space
                  </p>
                  <p className="mt-1 text-sm text-ink">{q.reply}</p>
                  <p className="mt-1 text-xs text-ink-muted">{relativeTime(q.replied_at)}</p>
                </div>
              )}

              {(iReply || q.status !== 'closed') && (
                <div className="mt-3 flex gap-2 border-t border-ink/8 pt-3">
                  {iReply && (
                    <button className="btn btn-primary"
                            onClick={() => { setReplyTo(q); setReply(q.reply || ''); }}>
                      {q.reply ? 'Update reply' : 'Reply'}
                    </button>
                  )}
                  {q.status !== 'closed' && (
                    <button className="btn btn-ghost" onClick={() => close(q)}>Close</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Modal open={Boolean(replyTo)} onClose={() => setReplyTo(null)} title="Reply to inquiry"
             footer={
               <>
                 <button className="btn btn-ghost" onClick={() => setReplyTo(null)}>Cancel</button>
                 <button className="btn btn-primary" disabled={busy || reply.trim().length < 2}
                         onClick={sendReply}>
                   {busy ? 'Sending…' : 'Send reply'}
                 </button>
               </>
             }>
        <p className="text-sm text-ink-soft">
          Answering <strong>{replyTo?.subject}</strong> from {replyTo?.user_name}.
        </p>
        <div className="mt-3">
          <label className="label" htmlFor="inq-reply">Your reply</label>
          <textarea id="inq-reply" className="field" rows="5" maxLength="2000" value={reply}
                    onChange={(e) => setReply(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
