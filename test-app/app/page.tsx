import Link from 'next/link';
import { MessageSquare, UserCheck, User, Inbox, Settings, MousePointerClick } from 'lucide-react';

const TEST_PAGES = [
  {
    href: '/trigger',
    label: 'Trigger',
    icon: MousePointerClick,
    description:
      'Demonstrates the minimized prop on FeedbackWidget. Shows the icon-only pill (minimized=true, default) with hover-expand animation side-by-side with the always-expanded style (minimized=false).',
  },
  {
    href: '/authed-submit',
    label: 'Authed Submit',
    icon: UserCheck,
    description:
      'Tests feedback submission from an authenticated user. Demonstrates FeedbackWidget, useFeedbackProvider to programmatically open the dialog, and useRegisterFeedbackContext to attach page-level context to submissions.',
  },
  {
    href: '/anon-submit',
    label: 'Anon Submit',
    icon: User,
    description:
      'Tests feedback submission from an unauthenticated user. Demonstrates the anonymous session ID flow (ensure_anon_id), how the widget behaves when no user is set on FeedbackProvider, and rate limiting per session.',
  },
  {
    href: '/admin',
    label: 'Admin',
    icon: Inbox,
    description:
      'Renders FeedbackAdminPage to list, triage, and manage all submitted feedback for app_id "test-app". Tests status transitions, priority changes, spam marking, comment events, and the LLM prompt export.',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    description:
      'Reference page documenting configuration: INI file options, the required @source Tailwind v4 directive, runtime="nodejs" for the API route, and the instrumentation.ts sync_system_templates call.',
  },
];

export default function HomePage() {
  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <MessageSquare size={28} className="text-violet-500" />
        <h1 className="text-2xl font-bold text-gray-900">hazo_feedback</h1>
        <span className="text-sm font-mono bg-violet-100 text-violet-700 px-2 py-0.5 rounded">
          v1.0.0
        </span>
      </div>
      <p className="text-gray-500 mb-8 text-sm">
        Drop-in contextual feedback widget for hazo apps. Captures bug reports,
        feature requests, general feedback, and praise — with screenshot
        attachments, rich text, per-user context, anonymous sessions, and a
        built-in admin inbox.
      </p>

      {/* What is mounted globally */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 text-sm text-blue-800">
        <strong>Global setup active:</strong> FeedbackProvider and FeedbackWidget
        are mounted in the root layout with a mock authenticated user (id:
        test-user-1). The floating widget button is visible on every page.
      </div>

      {/* Test pages */}
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Test pages</h2>
      <div className="space-y-3">
        {TEST_PAGES.map(({ href, label, icon: Icon, description }) => (
          <Link
            key={href}
            href={href}
            className="block border border-gray-200 rounded-lg p-4 hover:border-violet-300 hover:bg-violet-50/50 transition-colors group"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon
                size={16}
                className="text-gray-400 group-hover:text-violet-500 transition-colors"
              />
              <span className="font-medium text-gray-900 group-hover:text-violet-700 transition-colors">
                {label}
              </span>
              <span className="text-xs text-gray-400 font-mono">{href}</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
          </Link>
        ))}
      </div>

      {/* Architecture note */}
      <div className="mt-10 border-t border-gray-200 pt-6 text-xs text-gray-400 space-y-1">
        <p>
          <strong className="text-gray-500">API route:</strong>{' '}
          <code>/api/feedback/[...path]</code> — catch-all with{' '}
          <code>runtime=&apos;nodejs&apos;</code>, backed by SQLite at{' '}
          <code>./test-app.db</code>
        </p>
        <p>
          <strong className="text-gray-500">File uploads:</strong> stored at{' '}
          <code>./test-uploads/</code> via hazo_files local provider
        </p>
        <p>
          <strong className="text-gray-500">Admin scope:</strong>{' '}
          <code>hazo_feedback:test-app:admin</code>
        </p>
      </div>
    </div>
  );
}
