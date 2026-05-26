# hazo_feedback Setup Checklist

Step-by-step guide to integrate hazo_feedback into your Next.js app.

## Upgrading from v2.1.x to v2.1.2

No schema migration required. One **default-behaviour change** to be aware of:

- `<FeedbackWidget />` now renders as an **icon-only pill** by default (`minimized={true}`). On desktop, hovering the button expands it to show the label. This is a visual-only change — all existing functionality is preserved.
- If you prefer the previous always-expanded style, pass `minimized={false}`:
  ```tsx
  <FeedbackWidget minimized={false} />
  ```

---

## Upgrading from v2.0.x to v2.1.0

### 1. Bump the peer dep

Update your app's `hazo_notify` dep to `^5.0.0`. v5 introduces breaking changes (top-level `send_email` / `send_template_email` removed in favor of `dispatch()`). Confirm a hazo_notify v5 worker is running in your consumer environment (e.g., a `hazo_jobs` handler calling `flushChannelOnce('email', ...)`) — required for ack and reply emails to actually deliver.

### 2. Run the schema migration

Apply `migrations/002_voting_and_replies.sql`:
- Postgres: `psql -d <db> -f node_modules/hazo_feedback/migrations/002_voting_and_replies.sql`
- SQLite: extract the SQLite block (commented in the file) and run with `sqlite3 <db>`.

### 3. Re-sync system templates

If your app calls `sync_system_templates(hazo_feedback_template_manifest, options)` (per v2.0.0 step 8), no code change is required — the manifest now exports three entries. Re-run the call (typically on next boot) so the two new templates land in `hazo_notify_templates`.

### 4. Update `createFeedbackServer` options

```ts
createFeedbackServer({
  // existing options unchanged…
  threadUrlBuilder: (refId) => `${process.env.NEXT_PUBLIC_BASE_URL}/feedback/thread/${refId}`,
  listAdminsForBroadcast: async () => {
    // Return the user_ids of users holding the adminScope permission.
    return [/* fetch from your auth system */];
  },
});
```

### 5. Mount new client routes

- `app/feedback/thread/[refId]/page.tsx`:
  ```tsx
  'use client';
  import { FeedbackThread } from 'hazo_feedback/client';

  export default function ThreadPage({ params }: { params: { refId: string } }) {
    return <FeedbackThread refId={params.refId} apiBase="/api/feedback" />;
  }
  ```

- (Optional) Mount `<PublicFeatureBoard />` on your roadmap route, e.g. `app/roadmap/page.tsx`.

### 6. Optional: tune reply email flags

In `config/hazo_feedback_config.ini`, add to `[notify]`:
```ini
reply_email_to_user_enabled = true
reply_email_to_admin_enabled = true
```
Set either to `false` to suppress that direction.

## Prerequisites

- Node.js 18+ with npm
- Existing Next.js app (v14+) with:
  - `hazo_auth` already configured
  - `hazo_connect` connected to your database (PostgreSQL or SQLite)
  - `hazo_files` configured for file uploads
  - `hazo_notify` configured for email

## Installation

### 1. Install hazo_feedback package

```bash
npm install hazo_feedback@^1.0.0
```

### 2. Verify peer dependencies

Confirm all peer dependencies are installed:

```bash
npm list hazo_connect hazo_auth hazo_ui hazo_files hazo_notify
npm list @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder
npm list lucide-react
```

If any are missing, install them:

```bash
npm install hazo_connect@^2.4.0 hazo_auth@^5.3.1 hazo_ui@^2.9.0 hazo_files@^1.0.0 hazo_notify@^3.1.0
npm install @tiptap/react@^3.20.5 @tiptap/starter-kit@^3.20.5 @tiptap/extension-image@^3.20.5 @tiptap/extension-link@^3.20.5 @tiptap/extension-placeholder@^3.20.5
npm install lucide-react@^0.553.0
```

## Database Migration

### 3. Copy migration file

Copy the hazo_feedback migration to your app's migrations directory:

```bash
cp node_modules/hazo_feedback/migrations/001_init.sql \
  src/db/migrations/
```

### 4. Run the migration

Execute the migration against your database:

```bash
# PostgreSQL
psql -U postgres -d your_db -f src/db/migrations/001_init.sql

# SQLite (if using better-sqlite3)
sqlite3 your_database.db < src/db/migrations/001_init.sql
```

Verify the migration created three tables:
- `hazo_feedback_submissions`
- `hazo_feedback_attachments`
- `hazo_feedback_events`

## Admin Permissions Setup

### 5. Prepare the admin provisioning script

Copy and customize the admin provisioning script:

```bash
cp node_modules/hazo_feedback/scripts/provision_feedback_admin.sql \
  scripts/provision_feedback_admin.sql
```

### 6. Edit the script with your app ID and user ID

Open `scripts/provision_feedback_admin.sql` and replace:
- `{APP_ID}` → your app's unique identifier (e.g., `myapp`, `kinstripe`)
- `{YOUR_USER_ID}` → your hazo_auth user UUID (find this in `hazo_users.id`)

Example:
```sql
-- Before
INSERT INTO hazo_permissions (name, description)
VALUES ('hazo_feedback:{APP_ID}:admin', 'Full admin access to hazo_feedback for app {APP_ID}')

-- After
INSERT INTO hazo_permissions (name, description)
VALUES ('hazo_feedback:myapp:admin', 'Full admin access to hazo_feedback for app myapp')
```

### 7. Run the admin provisioning script

```bash
# PostgreSQL
psql -U postgres -d your_db -f scripts/provision_feedback_admin.sql

# SQLite
sqlite3 your_database.db < scripts/provision_feedback_admin.sql
```

Verify it created:
- A permission: `hazo_feedback:{APP_ID}:admin`
- A role: `feedback_admin_{APP_ID}`
- A role → permission assignment
- A user → role assignment for your user

## Configuration File

### 8. Copy the config sample

```bash
mkdir -p config
cp node_modules/hazo_feedback/config/hazo_feedback_config.ini.sample \
  config/hazo_feedback_config.ini
```

### 9. Edit configuration

Open `config/hazo_feedback_config.ini` and customize:

```ini
[app]
; Must match the APP_ID from step 6
app_id = myapp
; Optional: expose your app version
; app_version = ${NEXT_PUBLIC_APP_VERSION}

[admin]
; Must match the permission from step 6
admin_scope = hazo_feedback:myapp:admin

[rate_limit]
; Adjust these limits for your use case
per_anon_count = 10
per_anon_window_ms = 60000
per_user_count = 50
per_user_window_ms = 3600000
per_ip_count = 100
per_ip_window_ms = 60000

[attachments]
; Limits for file uploads
max_count = 5
max_bytes_per_file = 10485760
total_max_bytes = 26214400

[notify]
; Email acknowledgement settings
acknowledge_email_enabled = true
acknowledge_email_from = feedback@myapp.com
acknowledge_email_from_name = MyApp
acknowledge_email_subject = We received your feedback ({{ref_id}})
```

**Key notes:**
- `app_id` must be in lowercase, alphanumeric + underscores only
- Rate limit `window_ms` is the time window in milliseconds
- `max_bytes_per_file` in bytes (10MB = 10485760)
- `total_max_bytes` across all attachments per submission (25MB = 26214400)
- Handlebars variable `{{ref_id}}` available in email subject/template

## Tailwind CSS Configuration

### 10. Add @source directive (REQUIRED for Tailwind v4)

Open your main CSS file (typically `app/globals.css`):

```css
@import "tailwindcss";

/* CRITICAL: tells Tailwind v4 to scan hazo_feedback classes */
@source "../node_modules/hazo_feedback/dist";

/* Your other CSS imports below */
```

**Why this is required:** Tailwind v4 uses Just-In-Time (JIT) compilation and only scans source files listed in `@source` directives. Without this, hazo_feedback component styles won't be compiled.

## API Route Setup

### 11. Create the feedback API route file

Create `src/app/api/feedback/[...path]/route.ts`:

```typescript
import 'server-only';
export const runtime = 'nodejs';  // CRITICAL: see note below

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

### 12. Create the server factory (`lib/feedback/server.ts`)

```typescript
import 'server-only';
import { createFeedbackServer } from 'hazo_feedback';
import { getHazoConnect } from '@/lib/db';
import { getFileManager } from '@/lib/files';
import { getNotifyConnect } from '@/lib/notify';

let feedbackServerInstance: any = null;

export async function getFeedbackServer() {
  if (!feedbackServerInstance) {
    feedbackServerInstance = createFeedbackServer({
      getHazoConnect: getHazoConnect,
      getFileManager: getFileManager,
      notifyOptions: {
        getHazoConnect: getNotifyConnect,
        from: 'feedback@myapp.com',
        fromName: 'MyApp',
      },
    });
  }
  return feedbackServerInstance;
}
```

**CRITICAL NOTE:** The `export const runtime = 'nodejs'` line is required on Vercel.

Why?
- **Default (edge runtime):** Vercel's edge runtime strips multipart/form-data bodies to optimize cold starts
- **Node runtime:** Full body support, no 4.5 MB limit
- **Effect:** Without `runtime = 'nodejs'`, file attachments over a few KB will fail silently

If your app is deployed elsewhere (Heroku, AWS, etc.), this has no effect; include it anyway for safety.

## Client Setup

### 13. Wrap your layout in FeedbackProvider

Open `src/app/layout.tsx`:

```typescript
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

Props:
- `appId` (string, required) — matches your config file's `[app] app_id`
- `apiBase` (string, optional, default: `/api/feedback`) — where your feedback routes live
- `translate` (function, optional) — custom i18n function for strings
- `source` (string, optional) — label for this integration instance (e.g., `"mobile-app"`)

### 14. Add the widget component

In the same layout or a component that wraps your main content:

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

The widget renders a floating button in the bottom-right corner. By default (`minimized={true}`) it shows as an icon-only pill; hover on desktop to expand the label. It opens a dialog on desktop and a mobile drawer on smaller screens. Pass `minimized={false}` for the always-expanded style.

## Template Manifest Registration

### 15. Register hazo_feedback templates in hazo_notify

In your app's `instrumentation.ts` or app bootstrap file:

```typescript
import { sync_system_templates } from 'hazo_notify/template_manager';
import { hazo_feedback_template_manifest } from 'hazo_feedback';
import { hazo_auth_template_manifest } from 'hazo_auth';

export async function initializeTemplates() {
  const connect = await getHazoConnect();

  await sync_system_templates(
    [
      ...hazo_auth_template_manifest,
      ...hazo_feedback_template_manifest,  // Add this
    ],
    { getHazoConnect: () => connect }
  );
}

// Call this during app startup
await initializeTemplates();
```

This ensures the acknowledgement email template is available when a user submits feedback.

## Admin Page Setup

### 16. Create the admin route

Create `src/app/admin/feedback/page.tsx` (or your preferred path):

```typescript
import 'server-only';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { FeedbackAdminPage } from 'hazo_feedback/client';
import { headers } from 'next/headers';

export default async function FeedbackAdminPage() {
  const headersList = headers();
  const request = {
    headers: headersList,
  } as any;

  const auth = await hazo_get_auth(request, {
    required_permissions: ['hazo_feedback:myapp:admin'],
  });

  if (!auth.user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">Unauthorized</h1>
        <p>You do not have permission to access the feedback admin.</p>
      </div>
    );
  }

  return <FeedbackAdminPage appId="myapp" apiBase="/api/feedback" />;
}
```

### 17. Add admin link to navigation

Add a link to your admin feedback page in your main navigation:

```typescript
// In your sidebar/navbar component
import Link from 'next/link';

<Link href="/admin/feedback" className="...">
  Feedback
</Link>
```

## Verification

### 18. Start your app and test

```bash
npm run dev
```

Visit your app and:

1. **Verify the widget appears:** Look for a small icon-only pill in the bottom-right corner. Hover it on desktop — the "Send feedback" label should slide in. (Pass `minimized={false}` if you want the label always visible.)
2. **Test submit:** Click the button, fill out a feedback form, and submit
3. **Check database:** Verify a record appears in `hazo_feedback_submissions`
4. **Check email:** If configured, verify an acknowledgement email was sent with the ref_id
5. **Visit admin page:** Navigate to `/admin/feedback` and verify you can see your submission

## Troubleshooting

### Widget doesn't appear

- Check browser console for errors (Cmd+Option+I on Mac, F12 on Windows)
- Verify `FeedbackProvider` wraps your entire app
- Verify `FeedbackWidget` is rendered in your layout
- Check that `appId` matches your config file

### Attachments fail to upload

- If using Vercel, verify `export const runtime = 'nodejs'` is on the route file
- Check file size against `config/hazo_feedback_config.ini` limits
- Check that `hazo_files` is configured and working

### Email not sent

- Verify `hazo_notify` is installed and configured
- Check that `acknowledge_email_enabled = true` in config
- Verify the permission scope matches your config

### Admin page shows "Unauthorized"

- Verify you ran `scripts/provision_feedback_admin.sql` with your user ID
- Check that your user ID in the database matches what's in the script
- Verify your hazo_auth session is active and you're logged in

### Tailwind styles not working

- Verify `@source "../node_modules/hazo_feedback/dist"` is in your CSS file
- Rebuild your CSS: `npm run build`
- If using dev mode, restart the dev server

## Next Steps

- **Register consumer context:** Use `useRegisterFeedbackContext` in your app components to include feature state in submissions (see README.md)
- **Add breadcrumbs:** Use `feedback.breadcrumb(type, data)` to log user interactions for debugging (see README.md)
- **Customize strings:** Pass a `translate` function to `FeedbackProvider` for custom i18n (see README.md)
- **Configure rate limits:** Adjust `[rate_limit]` settings in config based on your expected submission volume

## Support

For issues, see:
- `design/hazo_feedback_v1_plan.md` — technical design decisions
- `CLAUDE.md` — package-specific development notes
- `hazo_feedback_v1.2_design.md` — comprehensive feature spec
