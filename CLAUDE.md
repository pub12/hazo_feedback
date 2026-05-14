# hazo_feedback — Package Claude Instructions

Quick reference for AI assistants working on hazo_feedback. For comprehensive architecture, see `AGENTS.md`. For implementation plan, see `design/hazo_feedback_v1_plan.md`.

## Critical Gotchas

1. **`ensure_anon_id(request)`** — async, single arg, import from `hazo_auth/server-lib`
   ```typescript
   import { ensure_anon_id } from 'hazo_auth/server-lib';
   const anonId = await ensure_anon_id(request);
   ```

2. **`get_client_ip(request)`** — sync, single arg, import from `hazo_auth/server-lib` (NOT `hazo_auth/components/layouts/shared`, which exports a different client-side async version)
   ```typescript
   import { get_client_ip } from 'hazo_auth/server-lib';
   const ip = get_client_ip(request);
   ```

3. **`export const runtime = 'nodejs'`** — REQUIRED on the catch-all route file. Without it, Vercel edge runtime strips multipart bodies and file attachments fail silently.
   ```typescript
   // src/app/api/feedback/[...path]/route.ts
   import 'server-only';
   export const runtime = 'nodejs';  // CRITICAL
   ```

4. **Tailwind v4 `@source` directive** — REQUIRED in consumer's CSS entry file. Without it, Tailwind JIT won't find hazo_feedback classes.
   ```css
   @import "tailwindcss";
   @source "../node_modules/hazo_feedback/dist";
   ```

5. **Dialog/Drawer naming from hazo_ui:**
   - Desktop: `HazoUiDialogRoot`, `HazoUiDialogContent`, `HazoUiDialogHeader`, `HazoUiDialogTitle`
   - Mobile: `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`
   - NOT: `Dialog`, `DialogContent` (those are shadcn/ui primitives, not hazo_ui)

6. **`FeedbackBodyEditor` is custom** — NOT `HazoUiRte`. The latter is sealed for email-template use and doesn't expose `extensions` prop for Tiptap customization. Use the custom Tiptap wrapper in `src/widget/FeedbackBodyEditor.tsx`.

7. **`consumer_context_redacted` is TEXT NULL (JSON array)** — NOT Postgres `TEXT[]`. Stored as JSON-encoded string array for dual-DB compatibility:
   ```typescript
   const redactedKeys: string[] = JSON.parse(submission.consumer_context_redacted || '[]');
   ```

8. **`send_template_email()` from hazo_notify** — wraps the template manager, not a custom function. As of v2.0 the template name is `feedback_acknowledgement` (no `hazo_` prefix) and the variables key is `variables` (NOT `context_variables`):
   ```typescript
   import { send_template_email } from 'hazo_notify/template_manager';
   await send_template_email({
     to: userEmail,
     from: 'feedback@myapp.com',
     from_name: 'MyApp Feedback',
     scope_id: null,
     template_name: 'feedback_acknowledgement',
     variables: { ref_id, name, subject, category, submitted_at },
   }, hazoConnect);
   ```

9. **`SystemTemplateManifest` format** — inline `html`/`text` strings, not file paths. Note v2.0 field rename: `email_html`/`email_text` → `html`/`text`, `context_variables` → `variables`, plus required `template_label` and `category`:
   ```typescript
   const manifest: SystemTemplateManifest[] = [{
     template_name: 'feedback_acknowledgement',
     template_label: 'Feedback Acknowledgement',
     category: 'Feedback',
     html: '<html>...</html>',
     text: 'Plain text version...',
     variables: [{
       variable_name: 'ref_id',
       variable_description: 'Feedback reference ID',
     }],
   }];
   ```

10. **`TemplateVariableDefinition` fields** — `variable_name` and `variable_description` (NOT `name`, `label`, or `required`).

11. **hazo_notify is HARD peer** — not optional. Marked in `peerDependenciesMeta` as `{ "optional": false }`. Ack emails gracefully no-op if config disables them, but the package is required.

12. **Rate limiting is process-local** — in-memory token bucket, no Redis. Suitable for single-instance; scale to Redis in v1.1 if needed.

13. **Breadcrumb ring buffer is 50 entries, client-side only** — serialized fresh at submit, not persisted. Clears on page reload.

14. **PII redaction is KEY-BASED** — patterns match key names, not values. Redacted key names stored in `consumer_context_redacted` for transparency.

15. **Pattern X orphan cleanup** — uploaded files cleaned up on error via `Promise.allSettled(paths.map(deleteFile))` before re-throw. hazo_files has no transaction support.

## Build & Test

- **Build:** `npm run build` (TypeScript → dist/)
- **Dev:** `npm run dev` (watch mode)
- **Test:** `npm test` (Jest)
- **Test watch:** `npm run test:watch`

## Test-App

```bash
cd test-app
npm run dev
# Runs on port 3030
# Sidebar pages: Home, Authed Submit, Anon Submit, Admin, Settings
```

## Project Structure

- `src/index.ts` — server entry, `createFeedbackServer` factory
- `src/index.client.ts` — client entry, components, hooks
- `src/types.ts` — shared types (no Node.js imports)
- `src/widget/` — React components (Provider, Widget, Dialog, Drawer, Editor)
- `src/admin/` — admin page + detail components
- `src/server/` — API handlers (submit, list, detail, update, comment, export, attachment)
- `src/db/` — service layer (submission, attachment, event CRUD)
- `src/redact/` — PII redaction (key pattern matching)
- `src/ref/` — ref ID generation (Crockford base32)
- `src/sanitize/` — HTML sanitization (DOMPurify)
- `src/rate_limit/` — token bucket (in-memory)
- `src/hooks/` — React hooks (context register, copy, provider context)
- `migrations/` — database schema (dual Postgres + SQLite)
- `scripts/` — provision_feedback_admin.sql (one-shot per app_id)
- `config/` — hazo_feedback_config.ini.sample
- `design/` — architecture docs (v1_plan.md, grill-session-handoff.md)

## Key Type Signatures

```typescript
// Server factory
export function createFeedbackServer(options: {
  getHazoConnect: () => any;
  getFileManager: () => any;
  appId?: string;
  adminScope?: string;
  notifyOptions?: {
    getHazoConnect: () => any;
    from: string;
    fromName?: string;
  };
  logger?: Logger;
}): { handlers: { GET, POST, PATCH, DELETE } };

// Client Provider
<FeedbackProvider
  appId="myapp"
  apiBase="/api/feedback"
  translate={(key, vars) => string}
  source="optional-label"
>
  {children}
</FeedbackProvider>

// Context register
useRegisterFeedbackContext(key: string, data: Record<string, unknown>): void;

// Breadcrumb API
feedback.breadcrumb(type: string, data: Record<string, unknown>): void;

// Copy hook (tuple return as of v2.0)
const [state, copy] = useCopyToClipboard();
// state: 'idle' | 'copied' | 'failed'
```

## Common Tasks

### Adding a new admin action

1. Add handler in `src/server/handlers/`
2. Register in `src/server/router.ts` (path dispatch)
3. Create DB service method in `src/db/` if needed
4. Add corresponding admin UI in `src/admin/`

### Adding a new breadcrumb type

1. Emit via `feedback.breadcrumb('type', data)` in any client code
2. Ring buffer captures automatically
3. Serialized at submit time
4. Admin sees in Context tab

### Customizing the config

1. Edit `config/hazo_feedback_config.ini.sample`
2. Also update `SETUP_CHECKLIST.md` step 9 if adding new sections
3. Update `src/config/types.ts` if adding new config fields

### Adding a new email template

1. Add to `src/email_templates/` (HTML + TXT)
2. Add entry to `hazo_feedback_template_manifest` in `src/manifest.ts`
3. Consumer app calls `sync_system_templates([...manifest], options)` in instrumentation
4. Use `send_template_email(opts, hazoConnect)` to send

## Command Reference

```bash
# Development
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm test               # Run Jest tests
npm test:watch         # Test watch mode
npm run lint           # ESLint

# Test app
cd test-app && npm run dev  # Start test app on port 3030

# Publishing
npm version patch      # Bump patch version
npm publish            # Publish to npm
git push --tags        # Push tags to repo
```

## Pre-Publish Checklist

Before publishing v1.0.0 or any release:

1. All tests pass: `npm test`
2. No TypeScript errors: `npm run build`
3. No path aliases in dist: `grep -r "@/" dist/` returns nothing
4. Exports resolve: each entry in `package.json` exports exists
5. No secrets: no .env, API keys, or credentials in published files
6. README.md is current
7. CHANGE_LOG.md is updated with new version + changes
8. SETUP_CHECKLIST.md reflects any new setup steps
9. Files array in package.json includes: dist/, migrations/, scripts/, config/, README.md, SETUP_CHECKLIST.md, CHANGE_LOG.md

## Common Patterns

### Dual-DB Schema (Postgres + SQLite)

```sql
-- Postgres (active)
CREATE TABLE hazo_feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);

-- SQLite (commented)
-- CREATE TABLE hazo_feedback_submissions (
--   id TEXT PRIMARY KEY,
--   ...
-- );
```

### Service Layer CRUD

```typescript
import { createCrudService } from 'hazo_connect';

const service = createCrudService(adapter, 'hazo_feedback_submissions');
const submission = await service.read(id);
await service.update(id, { status: 'triaged' });
```

### PII Redaction

```typescript
import { redact_context, redact_breadcrumbs } from '@/redact/pii_redact';

const { redacted, keys } = redact_context(consumer_context);
const clearedBreadcrumbs = redact_breadcrumbs(breadcrumbs);
// keys contains names like ['user_email', 'api_token']
```

### Rate Limiting

```typescript
import { check_rate_limit } from '@/rate_limit/token_bucket';

const allowed = check_rate_limit(`${appId}:anon:${anonId}`, {
  count: 10,
  window_ms: 60000,
});
if (!allowed) return 429_response();
```

## Debugging Tips

- **Multipart upload fails:** Check `export const runtime = 'nodejs'` on route, and `@source` directive in CSS
- **Styles don't appear:** Verify `@source` directive in consuming app's CSS entry file
- **Admin shows "Unauthorized":** Check `scripts/provision_feedback_admin.sql` was run with correct APP_ID and YOUR_USER_ID
- **Ack email doesn't send:** Verify hazo_notify is configured, `acknowledge_email_enabled = true` in config, and template manifest is registered
- **Rate limit always fails:** Check token bucket keys match your appId, anonId/userId, and IP extraction

## See Also

- `AGENTS.md` — comprehensive architecture guide for agents
- `SETUP_CHECKLIST.md` — step-by-step setup for consumers
- `README.md` — public API and feature docs
- `design/hazo_feedback_v1_plan.md` — design decisions (§3 table is source of truth)
- `design/grill-session-handoff.md` — grilling session notes
