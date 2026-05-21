'use client';

import { useState } from 'react';
import type { FeedbackEvent } from '../../types.js';
import { RawHtml } from '../../widget/RawHtml.js';

interface ConversationTabProps {
  submissionId: string;
  events: FeedbackEvent[];
  apiBase: string;
  onPosted: () => void;
}

function MessageBubble({ event }: { event: FeedbackEvent }) {
  const isAdmin = event.event_type === 'admin_reply';
  return (
    <div className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} mb-3`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isAdmin ? 'bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-900'}`}>
        <div className="text-[11px] font-medium uppercase tracking-wide mb-1 opacity-70">
          {isAdmin ? 'Admin' : 'User'} · {new Date(event.created_at).toLocaleString()}
        </div>
        {event.body_html ? (
          <RawHtml html={event.body_html} className="prose prose-sm max-w-none" />
        ) : (
          <div className="whitespace-pre-wrap">{event.body_text}</div>
        )}
      </div>
    </div>
  );
}

export function ConversationTab({ submissionId, events, apiBase, onPosted }: ConversationTabProps) {
  const replies = events.filter((e) => e.event_type === 'admin_reply' || e.event_type === 'user_reply');
  const [bodyText, setBodyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!bodyText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/admin/${submissionId}/reply`, {
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
      onPosted();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto mb-3">
        {replies.length === 0 ? (
          <p className="text-sm italic text-gray-400">(no conversation yet)</p>
        ) : (
          replies.map((e) => <MessageBubble key={e.id} event={e} />)
        )}
      </div>
      <div className="border-t pt-3">
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Reply to user…"
          className="w-full p-2 border rounded text-sm min-h-[80px]"
          disabled={submitting}
        />
        {error ? <p className="text-xs text-red-600 mt-1">{error}</p> : null}
        <div className="flex justify-end mt-2">
          <button
            onClick={submit}
            disabled={submitting || !bodyText.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded disabled:opacity-50 hover:bg-blue-700"
          >
            {submitting ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </div>
    </div>
  );
}
