'use client';

import { useCallback, useEffect, useState } from 'react';
import { RawHtml } from './RawHtml.js';

interface ThreadReply {
  id: string;
  actor_id: string | null;
  event_type: 'admin_reply' | 'user_reply';
  body_html: string | null;
  body_text: string | null;
  created_at: string;
}

interface ThreadResponse {
  submission: {
    id: string;
    ref_id: string;
    subject: string | null;
    category: string;
    status: string;
    created_at: string;
    user_id: string | null;
  };
  replies: ThreadReply[];
  viewer_role: 'admin' | 'submitter';
  can_reply: boolean;
}

export interface FeedbackThreadProps {
  refId: string;
  apiBase?: string;
  translate?: (key: string, vars?: Record<string, string>) => string;
}

const DEFAULT_T = (k: string) => k;

function Bubble({ reply, t }: { reply: ThreadReply; t: (k: string, v?: Record<string, string>) => string }) {
  const isAdmin = reply.event_type === 'admin_reply';
  return (
    <div className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} mb-3`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isAdmin ? 'bg-blue-50' : 'bg-gray-100'}`}>
        <div className="text-[11px] uppercase tracking-wide mb-1 opacity-70">
          {isAdmin ? t('thread.author.admin') : t('thread.author.you')} · {new Date(reply.created_at).toLocaleString()}
        </div>
        {reply.body_html ? (
          <RawHtml html={reply.body_html} className="prose prose-sm max-w-none" />
        ) : (
          <div className="whitespace-pre-wrap">{reply.body_text}</div>
        )}
      </div>
    </div>
  );
}

export function FeedbackThread({ refId, apiBase = '/api/feedback', translate }: FeedbackThreadProps) {
  const t = translate ?? DEFAULT_T;
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/thread/${encodeURIComponent(refId)}`, { credentials: 'include' });
      if (res.status === 401) { setError(t('thread.error.unauthorized')); return; }
      if (res.status === 403) { setError(t('thread.error.forbidden')); return; }
      if (res.status === 404) { setError(t('thread.error.not_found')); return; }
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      setData(await res.json());
    } catch (err) {
      setError(String(err));
    }
  }, [apiBase, refId, t]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!bodyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/thread/${encodeURIComponent(refId)}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_html: `<p>${bodyText.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`,
          body_text: bodyText,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      setBodyText('');
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (!data)   return <div className="p-4 text-sm text-gray-500">{t('thread.loading')}</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <header className="border-b pb-3 mb-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">{data.submission.category} · {data.submission.ref_id}</div>
        <h1 className="text-lg font-semibold">{data.submission.subject ?? t('thread.no_subject')}</h1>
        <div className="text-xs text-gray-400 mt-1">{new Date(data.submission.created_at).toLocaleString()}</div>
      </header>

      <section className="mb-4">
        {data.replies.length === 0 ? (
          <p className="text-sm italic text-gray-400">{t('thread.empty')}</p>
        ) : (
          data.replies.map((r) => <Bubble key={r.id} reply={r} t={t} />)
        )}
      </section>

      {data.can_reply ? (
        <div className="border-t pt-3">
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder={t('thread.compose.placeholder')}
            className="w-full p-2 border rounded text-sm min-h-[80px]"
            disabled={submitting}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={submit}
              disabled={submitting || !bodyText.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded disabled:opacity-50 hover:bg-blue-700"
            >
              {submitting ? t('thread.compose.sending') : t('thread.compose.send')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs italic text-gray-400 border-t pt-3">{t('thread.cannot_reply')}</p>
      )}
    </div>
  );
}
