'use client';

import { useMemo } from 'react';
import type { FeedbackEvent } from '../../types.js';
import { RawHtml } from '../../widget/RawHtml.js';
import { ReplyComposer } from '../../widget/ReplyComposer.js';
import type { AttachmentFile } from '../../widget/AttachmentTray.js';

interface ConversationTabProps {
  submissionId: string;
  events: FeedbackEvent[];
  apiBase: string;
  onPosted: () => void;
  translate?: (key: string, vars?: Record<string, string>) => string;
}

function rewrite_img_src(html: string, apiBase: string): string {
  if (typeof window === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('img[data-feedback-inline-id]').forEach((img) => {
    const src = img.getAttribute('src');
    if (src && !/^https?:|^\//i.test(src)) {
      img.setAttribute('src', `${apiBase}/admin/attachment/${src}`);
    }
  });
  return doc.body.innerHTML;
}

function MessageBubble({ event, apiBase }: { event: FeedbackEvent; apiBase: string }) {
  const isAdmin = event.event_type === 'admin_reply';
  const html = useMemo(
    () => event.body_html ? rewrite_img_src(event.body_html, apiBase) : null,
    [event.body_html, apiBase],
  );

  return (
    <div className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} mb-3`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isAdmin ? 'bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-900'}`}>
        <div className="text-[11px] font-medium uppercase tracking-wide mb-1 opacity-70">
          {isAdmin ? 'Admin' : 'User'} · {new Date(event.created_at).toLocaleString()}
        </div>
        {html ? (
          <RawHtml html={html} className="prose prose-sm max-w-none [&_img]:max-h-48 [&_img]:max-w-full [&_img]:rounded [&_img]:border" />
        ) : (
          <div className="whitespace-pre-wrap">{event.body_text}</div>
        )}
      </div>
    </div>
  );
}

export function ConversationTab({ submissionId, events, apiBase, onPosted, translate }: ConversationTabProps) {
  const replies = events.filter((e) => e.event_type === 'admin_reply' || e.event_type === 'user_reply');

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

    const res = await fetch(`${apiBase}/admin/${submissionId}/reply`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    onPosted();
  }

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto mb-3">
        {replies.length === 0 ? (
          <p className="text-sm italic text-gray-400">(no conversation yet)</p>
        ) : (
          replies.map((e) => <MessageBubble key={e.id} event={e} apiBase={apiBase} />)
        )}
      </div>
      <div className="border-t pt-3">
        <ReplyComposer
          onSend={handleSend}
          placeholder="Reply to user…"
          sendLabel="Send reply"
          sendingLabel="Sending…"
          translate={translate}
        />
      </div>
    </div>
  );
}
