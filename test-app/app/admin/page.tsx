'use client';

import { FeedbackAdminPage } from 'hazo_feedback/client';
import { Inbox } from 'lucide-react';

export default function AdminPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Page header */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <Inbox size={18} className="text-violet-500" />
        <h1 className="text-base font-semibold text-gray-900">
          Feedback Admin
        </h1>
        <span className="ml-auto text-xs text-gray-400 font-mono">
          app_id: test-app
        </span>
      </div>

      {/* Admin page component */}
      <div className="flex-1 overflow-y-auto">
        <FeedbackAdminPage appId="test-app" apiBase="/api/feedback" />
      </div>
    </div>
  );
}
