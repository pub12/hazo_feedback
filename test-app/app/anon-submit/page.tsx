'use client';

import { useFeedbackProvider } from 'hazo_feedback/client';
import { MessageSquare, User } from 'lucide-react';

function AnonSubmitInner() {
  const { setIsOpen, user } = useFeedbackProvider();

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-2 mb-2">
        <User size={22} className="text-orange-500" />
        <h1 className="text-xl font-bold text-gray-900">Anon Submit</h1>
      </div>
      <p className="text-gray-500 text-sm mb-8">
        Demonstrates the anonymous feedback flow. In a real app you would pass{' '}
        <code className="bg-gray-100 px-1 rounded text-xs">user={'{null}'}</code>{' '}
        (or omit the <code>user</code> prop) on FeedbackProvider when the visitor
        is not authenticated. This test-app currently uses a mock authed user in
        the layout — read the explanation below to understand what would differ.
      </p>

      {/* Trigger */}
      <section className="mb-8">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
          Trigger widget
        </h2>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            <MessageSquare size={15} />
            Submit as anonymous
          </button>
          <p className="text-xs text-gray-400 self-center">
            Same call — <code>setIsOpen(true)</code> — but with no user on the
            provider, the widget captures an anon session ID instead
          </p>
        </div>
      </section>

      {/* Current user status */}
      <section className="mb-8">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
          Current provider user
        </h2>
        <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto">
          {JSON.stringify(user ?? null, null, 2)}
        </pre>
        <p className="text-xs text-gray-400 mt-2">
          To test true anonymous flow: change FeedbackWrapper in{' '}
          <code>src/components/feedback_wrapper.tsx</code> to pass{' '}
          <code>user={'{null}'}</code> or remove the user prop entirely.
        </p>
      </section>

      {/* How ensure_anon_id works */}
      <section className="mb-8">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
          How anonymous sessions work (<code>ensure_anon_id</code>)
        </h2>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 space-y-2">
          <p>
            When <code>user</code> is null or undefined on FeedbackProvider, the
            widget calls <code>ensure_anon_id()</code> before submitting.
          </p>
          <p>
            <code>ensure_anon_id</code> reads or creates a UUID stored in{' '}
            <code>localStorage</code> under the key{' '}
            <code>hazo_feedback_anon_id</code>. This ID persists across page
            reloads for the same browser, giving rate limiting a stable identity
            to work against without requiring sign-in.
          </p>
          <p>
            The resulting UUID is sent as{' '}
            <code>anon_session_id</code> in the submission payload. On the server
            side, rate limiting applies the per-anon window (configurable via
            INI) against this session ID.
          </p>
        </div>
      </section>

      {/* What to verify */}
      <section>
        <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
          What to verify (anonymous flow)
        </h2>
        <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
          <li>
            <code>user_id</code>, <code>user_name_snapshot</code>, and{' '}
            <code>user_email_snapshot</code> are <code>null</code> in the
            submission
          </li>
          <li>
            <code>anon_session_id</code> is populated with a stable UUID from
            localStorage
          </li>
          <li>
            Submitting multiple times from the same browser re-uses the same
            <code>anon_session_id</code>
          </li>
          <li>
            Rate limiting triggers after exceeding{' '}
            <code>per_anon_count</code> submissions within the window
          </li>
          <li>
            Submission still appears in the Admin inbox (anonymous submissions
            are not filtered out by default)
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function AnonSubmitPage() {
  return <AnonSubmitInner />;
}
