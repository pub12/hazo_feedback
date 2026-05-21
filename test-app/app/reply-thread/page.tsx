'use client';

import { useState } from 'react';
import { FeedbackThread } from 'hazo_feedback/client';

export default function ReplyThreadPage() {
  const [refId, setRefId] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto bg-white rounded shadow p-4 mb-4">
        <p className="text-sm text-gray-600 mb-2">
          Paste a submission&#39;s <code>ref_id</code> (e.g. <code>PRO-1A2B3</code>) to open its thread.
          First submit feedback via <a href="/authed-submit" className="underline">/authed-submit</a>,
          then reply to it from <a href="/admin" className="underline">/admin</a> (Conversation tab) to enable user replies.
        </p>
        <div className="flex gap-2">
          <input
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
            placeholder="PRO-XXXXX"
            className="flex-1 p-2 border rounded text-sm"
          />
          <button
            onClick={() => setSubmitted(refId.trim() || null)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            Open thread
          </button>
        </div>
      </div>

      {submitted ? <FeedbackThread refId={submitted} apiBase="/api/feedback" /> : null}
    </main>
  );
}
