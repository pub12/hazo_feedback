'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RawHtml } from './RawHtml.js';
import { ReplyComposer } from './ReplyComposer.js';
import type { AttachmentFile } from './AttachmentTray.js';
import { FEEDBACK_STRINGS } from '../strings.js';

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

function DEFAULT_T(k: string, vars?: Record<string, string>): string {
  let s = FEEDBACK_STRINGS[k] ?? k;
  if (vars) {
    for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, val);
  }
  return s;
}

// Rewrite bare attachment-UUID img src to the thread attachment endpoint.
// `attachmentBase` = `${apiBase}/thread/${refId}` so the final URL is
// `${apiBase}/thread/:refId/attachment/:attachmentId`, which is accessible
// to both the submitter and admins.
function rewrite_img_src(html: string, attachmentBase: string): string {
  if (typeof window === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('img[data-feedback-inline-id]').forEach((img) => {
    const src = img.getAttribute('src');
    if (src && !/^https?:|^\//i.test(src)) {
      img.setAttribute('src', `${attachmentBase}/attachment/${src}`);
    }
  });
  return doc.body.innerHTML;
}

function Bubble({
  reply,
  attachmentBase,
  t,
}: {
  reply: ThreadReply;
  attachmentBase: string;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const isAdmin = reply.event_type === 'admin_reply';
  const html = useMemo(
    () => reply.body_html ? rewrite_img_src(reply.body_html, attachmentBase) : null,
    [reply.body_html, attachmentBase],
  );

  return (
    <div className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} mb-3`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isAdmin ? 'bg-blue-50' : 'bg-gray-100'}`}>
        <div className="text-[11px] uppercase tracking-wide mb-1 opacity-70">
          {isAdmin ? t('thread.author.admin') : t('thread.author.you')} · {new Date(reply.created_at).toLocaleString()}
        </div>
        {html ? (
          <RawHtml
            html={html}
            className="prose prose-sm max-w-none [&_img]:max-h-48 [&_img]:max-w-full [&_img]:rounded [&_img]:border"
          />
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

  async function handleSend(
    bodyHtml: string,
    inlineBlobs: Map<string, Blob>,
    attachments: AttachmentFile[],
  ): Promise<void> {
    const fd = new FormData();
    fd.append('body_html', bodyHtml);

    let idx = 0;
    for (const att of attachments) {
      fd.append(`attachment_${idx}`, att.file, att.file.name);
      fd.append(`attachment_${idx}_kind`, att.kind);
      if (att.inlineId) fd.append(`attachment_${idx}_inline_id`, att.inlineId);
      idx++;
    }
    for (const [inlineId, blob] of inlineBlobs.entries()) {
      const file = new File([blob], `inline-${inlineId}`, { type: blob.type });
      fd.append(`attachment_${idx}`, file, file.name);
      fd.append(`attachment_${idx}_kind`, 'pasted_image');
      fd.append(`attachment_${idx}_inline_id`, inlineId);
      idx++;
    }

    const res = await fetch(`${apiBase}/thread/${encodeURIComponent(refId)}/reply`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    await load();
  }

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (!data)  return <div className="p-4 text-sm text-gray-500">{t('thread.loading')}</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <header className="border-b pb-3 mb-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          {data.submission.category} · {data.submission.ref_id}
        </div>
        <h1 className="text-lg font-semibold">{data.submission.subject ?? t('thread.no_subject')}</h1>
        <div className="text-xs text-gray-400 mt-1">
          {new Date(data.submission.created_at).toLocaleString()}
        </div>
      </header>

      <section className="mb-4">
        {data.replies.length === 0 ? (
          <p className="text-sm italic text-gray-400">{t('thread.empty')}</p>
        ) : (
          data.replies.map((r) => (
            <Bubble key={r.id} reply={r} attachmentBase={`${apiBase}/thread/${refId}`} t={t} />
          ))
        )}
      </section>

      {data.can_reply ? (
        <div className="border-t pt-3">
          <ReplyComposer
            onSend={handleSend}
            placeholder={t('thread.compose.placeholder')}
            sendLabel={t('thread.compose.send')}
            sendingLabel={t('thread.compose.sending')}
            translate={translate}
          />
        </div>
      ) : (
        <p className="text-xs italic text-gray-400 border-t pt-3">{t('thread.cannot_reply')}</p>
      )}
    </div>
  );
}
