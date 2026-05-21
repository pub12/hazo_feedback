'use client';

import { PublicFeatureBoard } from 'hazo_feedback/client';

export default function VotingPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <PublicFeatureBoard apiBase="/api/feedback" />
      <aside className="max-w-3xl mx-auto p-4 mt-6 border-t text-xs text-gray-500">
        <p>
          Tip: visit <a href="/authed-submit" className="underline">/authed-submit</a> to submit
          a feature, then mark it public from <a href="/admin" className="underline">/admin</a>.
        </p>
      </aside>
    </main>
  );
}
