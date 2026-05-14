'use client';

import { useEffect, useState } from 'react';
import { FeedbackProvider, FeedbackWidget } from 'hazo_feedback/client';

// Module-level guard so the bootstrap call only runs once per browser session
// even across hot-reloads and StrictMode double-mounts.
let bootstrapped = false;

async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    // 1. Apply migrations (creates hazo_feedback_* + hazo_auth tables)
    await fetch('/api/migrate', { method: 'POST' });
    // 2. Seed test admin user + permission, set auth cookies on the response
    await fetch('/api/bootstrap', { method: 'POST' });
  } catch (err) {
    // Surface failure so admin auth issues are visible in the console; otherwise
    // the admin page would silently 401 and feel broken.
    console.error('[test-app] bootstrap failed', err);
  }
}

export default function FeedbackWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bootstrap().finally(() => setReady(true));
  }, []);

  // Render children even before bootstrap finishes so the page isn't blank,
  // but `ready` can be wired into UI hints later if needed.
  void ready;

  return (
    <FeedbackProvider
      appId="test-app"
      apiBase="/api/feedback"
      user={{ id: 'test-user-1', name: 'Test User', email: 'test@example.com' }}
      appVersion="1.0.0-test"
    >
      {children}
      <FeedbackWidget />
    </FeedbackProvider>
  );
}
