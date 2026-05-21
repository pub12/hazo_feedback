# hazo_feedback

Drop-in contextual feedback widget for hazo_* workspace apps. Collect bug reports, feature requests, praise, and general feedback with automatic screenshot, console errors, breadcrumbs, and consumer context — no setup required beyond a few config steps.

## Features

- **Floating feedback button** — always visible, opens dialog or mobile drawer
- **Auto-capture** — page URL, route, viewport, user agent, app version
- **Screenshot** — lazy-loaded `html2canvas`, user-editable (annotate on roadmap)
- **Context** — console errors (ring buffer), breadcrumbs (50-entry ring), consumer-registered state
- **Four categories** — bug, feature, general, praise
- **Rich text editor** — Tiptap-powered body with inline image paste support
- **Attachments** — upload files, paste images, auto-screenshot (client-side zip download)
- **Anonymous + authenticated** — anon users via `ensure_anon_id` cookie; auth users get snapshotted details
- **Rate limiting** — in-memory token bucket per anon/user/IP
- **Admin inbox** — list, filter, search (full-text), detail view with rich context display
- **Status workflow** — new → triaged → in_progress → resolved/wont_fix
- **Admin comments** — threaded conversation on each submission
- **AI prompt export** — one-click markdown export optimized for Claude Code paste-and-debug
- **Acknowledgement email** — ref ID sent in-dialog; email via `hazo_notify` (when configured)
- **Ref ID system** — Crockford base32, collision-safe, app-prefixed (e.g., `myapp-AB12345`)
- **Mobile-friendly** — responsive dialog on desktop, vaul-backed drawer on mobile

## Installation

```bash
npm install hazo_feedback@^2.0.0
```

### Peer Dependencies

Ensure your app has these installed (hazo_feedback declares them as peers):

| Package | Version | Notes |
|---------|---------|-------|
| `react` | `^18.0.0 \|\| ^19.0.0` | |
| `react-dom` | `^18.0.0 \|\| ^19.0.0` | |
| `next` | `^14.0.0 \|\| ^16.0.0` | |
| `hazo_connect` | `^2.4.0` | Database access |
| `hazo_auth` | `^5.3.1` | User auth, `ensure_anon_id`, `get_client_ip` |
| `hazo_ui` | `^2.9.0` | Dialog, Drawer, Form, Button primitives |
| `hazo_files` | `^1.0.0` | File upload, storage, retrieval |
| `hazo_notify` | `^5.0.0` | Acknowledgement + reply email templates (required, not optional) |
| `lucide-react` | `^0.553.0` | Icons |
| `@tiptap/react` | `^3.20.5` | Rich text editor |
| `@tiptap/starter-kit` | `^3.20.5` | Tiptap extensions (bold, italic, lists, etc.) |
| `@tiptap/extension-image` | `^3.20.5` | Tiptap image support |
| `@tiptap/extension-link` | `^3.20.5` | Tiptap link support |
| `@tiptap/extension-placeholder` | `^3.20.5` | Tiptap placeholder support |

## Quick Start

### 1. Server Setup

In your app's API route handler factory (or instrumentation file if using Next.js initialization):

```typescript
import { createFeedbackServer, hazo_feedback_template_manifest } from 'hazo_feedback';
import { sync_system_templates } from 'hazo_notify/template_manager';

// In instrumentation.ts or app bootstrap
export async function initFeedbackServer(
  hazoConnect: any,
  fileManager: any,
  notifyConnect: any
) {
  const feedbackServer = createFeedbackServer({
    getHazoConnect: () => hazoConnect,
    getFileManager: () => fileManager,
    notifyOptions: {
      getHazoConnect: () => notifyConnect,
      from: 'feedback@myapp.com',
      fromName: 'MyApp Feedback',
    },
  });

  // Register templates in hazo_notify
  await sync_system_templates(
    [
      ...hazo_auth_template_manifest,
      ...hazo_feedback_template_manifest,
    ],
    { getHazoConnect: () => notifyConnect }
  );

  return feedbackServer;
}
```

### 2. API Route

Create `src/app/api/feedback/[...path]/route.ts`:

```typescript
import 'server-only';
export const runtime = 'nodejs'; // CRITICAL: see SETUP_CHECKLIST.md

import { NextRequest, NextResponse } from 'next/server';
import { getFeedbackServer } from '@/lib/feedback/server';

export async function GET(req: NextRequest, ctx: any) {
  return (await getFeedbackServer()).handlers.GET(req, ctx);
}

export async function POST(req: NextRequest, ctx: any) {
  return (await getFeedbackServer()).handlers.POST(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: any) {
  return (await getFeedbackServer()).handlers.PATCH(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: any) {
  return (await getFeedbackServer()).handlers.DELETE(req, ctx);
}
```

### 3. Client Setup

Wrap your app layout in `FeedbackProvider`:

```typescript
// app/layout.tsx
import { FeedbackProvider } from 'hazo_feedback/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <FeedbackProvider appId="myapp" apiBase="/api/feedback">
          {children}
        </FeedbackProvider>
      </body>
    </html>
  );
}
```

Add the widget to your layout (or a specific page):

```typescript
import { FeedbackWidget } from 'hazo_feedback/client';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FeedbackWidget />
    </>
  );
}
```

### 4. Tailwind CSS Setup (REQUIRED)

Without the `@source` directive, Tailwind v4 JIT won't find hazo_feedback classes.

In your CSS entry file (e.g., `app/globals.css`):

```css
@import "tailwindcss";

/* REQUIRED: tells Tailwind v4 to scan hazo_feedback dist for class names */
@source "../node_modules/hazo_feedback/dist";

/* Your other CSS imports */
```

### 5. Admin Page

Create a protected route (e.g., `src/app/admin/feedback/page.tsx`) with auth checks:

```typescript
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { FeedbackAdminPage } from 'hazo_feedback/client';

export default async function FeedbackAdminPage() {
  const auth = await hazo_get_auth(request, {
    required_permissions: ['hazo_feedback:myapp:admin'],
  });

  if (!auth.user) {
    return <div>Unauthorized</div>;
  }

  return <FeedbackAdminPage appId="myapp" apiBase="/api/feedback" />;
}
```

## Configuration

Copy `config/hazo_feedback_config.ini.sample` to `config/hazo_feedback_config.ini` and customize:

```ini
[app]
app_id = myapp

[admin]
admin_scope = hazo_feedback:myapp:admin

[rate_limit]
per_anon_count = 10
per_anon_window_ms = 60000
per_user_count = 50
per_user_window_ms = 3600000
per_ip_count = 100
per_ip_window_ms = 60000

[attachments]
max_count = 5
max_bytes_per_file = 10485760
total_max_bytes = 26214400

[notify]
acknowledge_email_enabled = true
acknowledge_email_from = feedback@myapp.com
acknowledge_email_from_name = MyApp
acknowledge_email_subject = We received your feedback ({{ref_id}})
```

**Key settings:**
- `app_id` — stamped into ref IDs and used for scoping admin permissions
- `admin_scope` — matches the permission provisioned via `scripts/provision_feedback_admin.sql`
- Rate limit settings — per-window count/duration for anon, authed, and IP-based limits
- Attachment limits — Note: Vercel's edge runtime has a 4.5 MB body limit; Node runtime (declared via `export const runtime = 'nodejs'`) removes this

## Consumer Context Registration

Register app state for inclusion in submissions:

```typescript
import { useRegisterFeedbackContext } from 'hazo_feedback/client';

export function MyFeature() {
  useRegisterFeedbackContext('my_feature', {
    featureVersion: '2.1.0',
    userTier: 'pro',
    selectedTool: 'magic-wand',
  });

  return <div>...</div>;
}
```

Multiple components can register context. At submit time, all registered data is merged, deduplicated, and sanitized for PII before storage.

## Imperative Breadcrumb API

Log navigation, UI interactions, and state changes:

```typescript
import { feedback } from 'hazo_feedback/client';

// In an event handler, route change, etc.
feedback.breadcrumb('user:clicked-button', {
  buttonId: 'save-doc',
  docId: selectedDoc.id,
});

feedback.breadcrumb('user:route-changed', {
  from: '/editor',
  to: '/workspace',
});

feedback.breadcrumb('app:error-caught', {
  error: err.message,
  stack: err.stack,
});
```

Breadcrumbs are captured in a 50-entry ring buffer. At submit time, all entries are serialized and stored, and redacted for PII.

## Internationalization

Pass a `translate` function to customize strings:

```typescript
<FeedbackProvider
  appId="myapp"
  translate={(key, vars) => {
    const dict: Record<string, string> = {
      'button.open_feedback': 'Send feedback',
      'dialog.title': 'Help us improve',
      // ... etc
    };
    return dict[key] || key;
  }}
>
  {children}
</FeedbackProvider>
```

If no `translate` function is provided, `hazo_feedback` uses English defaults from `FEEDBACK_STRINGS`:

```typescript
import { FEEDBACK_STRINGS } from 'hazo_feedback/client';

console.log(FEEDBACK_STRINGS['button.open_feedback']); // "Send feedback"
```

## Admin Page Features

**List view:**
- Filter by status, priority, category
- Free-text search across ref_id, subject, body, user name, user email
- Sort by created date, updated date, status
- Pagination

**Detail view:**
- **Overview tab** — submission metadata (ref_id, user, category, status), action buttons (priority, status, export prompt, zip attachments)
- **Context tab** — consumer-registered state, breadcrumbs, console errors (all redacted, key names highlighted)
- **Attachments tab** — images, files, with copy/download options
- **Activity tab** — event log (status/priority changes, comments, prompt exports)

**AI Prompt export:**
- Markdown with submission details, context, errors, breadcrumbs
- Copy to clipboard with fallback dialog
- Optimized for Claude Code paste-and-debug workflow

**Comment thread:**
- Admin comments on submissions
- Timestamped, attributed to actor
- No external notification (comment is visible on next admin visit)

## Reply threads

After a feedback submission, the admin can reply via the Conversation tab in the admin dashboard. The submitter is notified via hazo_notify's in-app inbox (always) and email (configurable). The submitter can reply back from the standalone thread page: `<FeedbackThread refId="…" apiBase="/api/feedback" />`.

Both the admin ConversationTab and `FeedbackThread` use the shared `ReplyComposer` component — the same Tiptap rich-text editor with inline image paste and file attachments available in the main submission widget.

**Using `ReplyComposer` standalone:**

```typescript
import { ReplyComposer } from 'hazo_feedback/client';

<ReplyComposer
  onSend={async (bodyHtml, inlineBlobs, attachments) => {
    // post reply to your endpoint; throw on error to keep the form open
    await sendReply({ bodyHtml, inlineBlobs, attachments });
  }}
  placeholder="Write a reply…"
  sendLabel="Send reply"
  translate={t}
/>
```

The component resets automatically when `onSend` resolves. Throw from `onSend` to display an inline error and keep the form state intact.

Inline images in reply bubbles are served via the thread attachment endpoint (`GET /thread/:refId/attachment/:attachmentId`), which is accessible to both the submitter and admins — no separate auth token required beyond being logged in as the submitter.

Constraints:
- Authed users only (anon submitters don't get reply threads in v2.1).
- User can reply only after the first admin reply (server returns `409 Conflict` otherwise).
- Replies are immutable and rate-limited per user.
- See `SETUP_CHECKLIST.md` for mounting `<FeedbackThread />`.

## Public voting / feature board

Mount `<PublicFeatureBoard apiBase="/api/feedback" />` on a logged-in route. Admins toggle individual feature submissions to public via the "Make public" button on the submission detail page. Users vote with a single click (toggle); top-voted features bubble to the top.

Constraints:
- `category='feature'` only (server rejects other categories with `422`).
- Authed users only — anon users see a sign-in prompt.
- Self-voting allowed.
- Vote counts are computed on read (no denormalization in v2.1).

## TypeScript Types

```typescript
// From hazo_feedback
export type FeedbackCategory = 'bug' | 'feature' | 'general' | 'praise';
export type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix';
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'urgent';
export type AttachmentKind = 'screenshot' | 'pasted_image' | 'uploaded_file';

export interface FeedbackSubmission {
  id: string;
  ref_id: string;
  app_id: string;
  user_id: string | null;
  category: FeedbackCategory;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority | null;
  url: string;
  route: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  user_agent: string | null;
  app_version: string | null;
  consumer_context: Record<string, unknown> | null;
  consumer_context_redacted: string[] | null;
  recent_errors: unknown[] | null;
  breadcrumbs: BreadcrumbEntry[] | null;
  attachment_count: number;
  acknowledge_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface FeedbackAttachment {
  id: string;
  submission_id: string;
  inline_id: string | null;
  file_id: string;
  mime_type: string;
  size_bytes: number;
  kind: AttachmentKind;
  created_at: string;
}

export interface BreadcrumbEntry {
  type: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// From hazo_feedback/client hooks
export type CopyState = 'idle' | 'copied' | 'failed';
```

## API Reference

### Server Entry

```typescript
import { createFeedbackServer, hazo_feedback_template_manifest } from 'hazo_feedback';

export function createFeedbackServer(options: {
  getHazoConnect: () => Promise<any> | any;
  getFileManager: () => Promise<any> | any;
  appId?: string;               // Overrides config; useful for test-app
  adminScope?: string;          // Overrides config
  notifyOptions?: {
    getHazoConnect: () => Promise<any> | any;
    from: string;
    fromName?: string;
  };
  logger?: Logger;              // hazo_logs interface (optional)
}): FeedbackServer;
```

Returns:
```typescript
interface FeedbackServer {
  handlers: {
    GET(req: NextRequest, ctx: any): Promise<NextResponse>;
    POST(req: NextRequest, ctx: any): Promise<NextResponse>;
    PATCH(req: NextRequest, ctx: any): Promise<NextResponse>;
    DELETE(req: NextRequest, ctx: any): Promise<NextResponse>;
  };
}
```

### Client Entry

```typescript
// Components
export { FeedbackProvider } from 'hazo_feedback/client';
export { FeedbackWidget } from 'hazo_feedback/client';
export { FeedbackAdminPage } from 'hazo_feedback/client';
export { FeedbackThread } from 'hazo_feedback/client';
export { PublicFeatureBoard } from 'hazo_feedback/client';

// Hooks
export { useRegisterFeedbackContext } from 'hazo_feedback/client';
export { useCopyToClipboard } from 'hazo_feedback/client';

// Breadcrumb API
export { feedback } from 'hazo_feedback/client';
// Usage: feedback.breadcrumb(type, data)

// i18n defaults
export { FEEDBACK_STRINGS } from 'hazo_feedback/client';
```

#### Component Props

**`<FeedbackThread refId apiBase translate />`** — Standalone reply thread for the submitter.

**`<PublicFeatureBoard apiBase translate pageSize defaultSort onSubmissionClick />`** — Logged-in feature roadmap with voting.

## Deferral Ledger (v1.0)

The following features are planned for v1.1+ and are NOT included in v1.0:

1. **Annotation tool** — edit/mark up screenshots (blocked: markerjs3 Linkware License)
2. **Cross-app super-admin** — single admin view across all apps (deferred: HRBAC scope complexity)
3. **Webhook notifications** — POST webhook on new submission (deferred: delivery/retry complexity)
4. **Bulk actions** — select multiple submissions, change status/priority (deferred: UI/UX polish)
5. **Assignment/ownership** — assign feedback to team members (deferred: hazo_auth role-based assignment not yet built)
6. **Custom fields** — app-defined submission fields beyond standard set (deferred: schema migration complexity)
7. **AI-powered categorization** — auto-categorize/tag submissions (deferred: LLM cost/latency tradeoff)
8. **Survey mode** — structured form (not free-text dialog) (deferred: design pending)
9. **Sentiment analysis** — flag praise/complaints for quick triage (deferred: hazo_llm_api integration)
10. **Duplicate detection** — flag similar submissions (deferred: semantic search complexity)
11. **Rate limiting per consumer** — per-context limits (deferred: implementation pending)
12. **Privacy mode** — redact all context, PII, errors (deferred: UX confirmation flow)
13. **Dark mode** — theme switching (deferred: hazo_ui Dark mode support pending)

See `design/hazo_feedback_v1_plan.md` for full roadmap.

## Contributing

See `SETUP_CHECKLIST.md` for step-by-step setup for local development.

## License

MIT. See `package.json`.
