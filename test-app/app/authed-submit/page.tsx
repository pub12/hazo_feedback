'use client';

import { useFeedbackProvider, useRegisterFeedbackContext } from 'hazo_feedback/client';
import { MessageSquare, UserCheck } from 'lucide-react';

// Register a page-level context key (module-scoped so it's stable across renders)
const PAGE_CONTEXT_KEY = Symbol('authed-submit-page');

function AuthedSubmitInner() {
  const { setIsOpen, user, appId } = useFeedbackProvider();

  // Register context that will be attached to any feedback submitted from this page
  useRegisterFeedbackContext(PAGE_CONTEXT_KEY, {
    page: 'authed-submit',
    testScenario: 'authenticated user flow',
    mockData: {
      currentUserId: user?.id ?? null,
      featureFlags: ['new_editor', 'dark_mode'],
      recentAction: 'viewed authed-submit test page',
    },
  });

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-2 mb-2">
        <UserCheck size={22} className="text-violet-500" />
        <h1 className="text-xl font-bold text-gray-900">Authed Submit</h1>
      </div>
      <p className="text-gray-500 text-sm mb-8">
        Tests the feedback flow for an authenticated user. The global
        FeedbackProvider in the root layout provides user context (id:{' '}
        <code className="bg-gray-100 px-1 rounded text-xs">{user?.id}</code>,
        name:{' '}
        <code className="bg-gray-100 px-1 rounded text-xs">{user?.name}</code>
        ). User info is snapshot into the submission at creation time.
      </p>

      {/* Open button */}
      <section className="mb-8">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
          Trigger widget
        </h2>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            <MessageSquare size={15} />
            Open feedback dialog
          </button>
          <p className="text-xs text-gray-400 self-center">
            Calls <code>setIsOpen(true)</code> from <code>useFeedbackProvider()</code>
          </p>
        </div>
      </section>

      {/* Context registration explanation */}
      <section className="mb-8">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
          Registered context
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          This page calls <code className="bg-gray-100 px-1 rounded text-xs">useRegisterFeedbackContext</code>{' '}
          with a stable Symbol key. When feedback is submitted from this page,
          the following context is merged into the submission's{' '}
          <code className="bg-gray-100 px-1 rounded text-xs">consumer_context</code> field:
        </p>
        <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto">
{`useRegisterFeedbackContext(PAGE_CONTEXT_KEY, {
  page: 'authed-submit',
  testScenario: 'authenticated user flow',
  mockData: {
    currentUserId: '${user?.id ?? 'null'}',
    featureFlags: ['new_editor', 'dark_mode'],
    recentAction: 'viewed authed-submit test page',
  },
});`}
        </pre>
      </section>

      {/* What to verify */}
      <section>
        <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
          What to verify
        </h2>
        <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
          <li>Submission is stored with <code>user_id = &apos;test-user-1&apos;</code></li>
          <li>
            <code>user_name_snapshot</code> and <code>user_email_snapshot</code>{' '}
            are captured from the provider user object
          </li>
          <li>
            <code>consumer_context</code> includes the page context registered
            by this component
          </li>
          <li>
            <code>app_id</code> is{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">{appId}</code>
          </li>
          <li>Attachments (screenshot / file) upload and associate correctly</li>
          <li>Submission appears in the Admin page inbox after submit</li>
        </ul>
      </section>
    </div>
  );
}

export default function AuthedSubmitPage() {
  return <AuthedSubmitInner />;
}
