# hazo_feedback v1.0 — Implementation Plan

**Date:** 2026-05-13
**Status:** Implementation-ready
**Target version:** `hazo_feedback@1.0.0`
**Driving consumer:** `kinstripe` (friends-launch feedback collection)

---

## 1. Goals

1. **Drop-in feedback widget** that any hazo app mounts and gets contextual bug/feature/general/praise collection out of the box.
2. **Context-rich submissions** — auto-screenshot, page URL + route, viewport, console errors, breadcrumbs, consumer-registered state — enough for a developer to act without pinging the user back.
3. **Admin inbox** — list, filter, detail view with structured context display, status workflow, and a one-click AI prompt export optimised for the Claude Code paste-and-debug workflow.
4. **Acknowledgement email** — submitter gets a ref ID in-dialog plus an email (when known) via `hazo_notify@^3.1.0`; feedback never feels submitted-into-a-void.
5. **Anonymous + authenticated** — anon visitors submit via `ensure_anon_id` cookie; admin reads are gated by `hazo_auth` required-permissions.

This is a **new package**. No breaking changes to anything upstream.

---

## 2. Resolved blockers

Both upstream packages that hazo_feedback depends on are published:

| Package | Version | Key additions |
|---|---|---|
| `hazo_auth` | `5.3.1` | `ensure_anon_id(request): Promise<string>` (single-arg, async), `get_client_ip(request): string` — both exported from `hazo_auth/server-lib` |
| `hazo_notify` | `3.1.0` | `send_template_email`, `sync_system_templates`, `hazo_feedback_template_manifest` pattern; `scope_id`-based lookup |
| `hazo_ui` | `2.9.0` | `Drawer` component (vaul-backed, MIT) added for mobile sheet |

---

## 3. Design decisions confirmed in grilling

All 28 questions across branches §5–§11 are resolved. This table is the source of truth for the implementation — if it conflicts with the design doc (`hazo_feedback_v1.2_design.md`), the table wins.

| Q | Branch | Decision |
|---|---|---|
| 1 | §5 Schema | `user_id` FK → `hazo_users.id` (UUID in Postgres, TEXT in SQLite; no hazo_ prefix — predates workspace convention) |
| 2 | §5 Schema | Full dual-DB: Postgres active section + SQLite commented section in same `.sql` file. Follows hazo_notify pattern exactly. |
| 3 | §5 Schema | `consumer_context_redacted TEXT NULL` (JSON-encoded string array, not Postgres `TEXT[]`) — works on both dialects, no cast needed |
| 4 | §5 Schema | **Pattern X** — hazo_files has no transaction support. Track uploaded virtualPaths in a local array; on any error after uploads begin, call `Promise.allSettled(paths.map(deleteFile))` before re-throwing. |
| 5 | §5 Schema | ref_id collision → two fresh-UUID retries using bytes 4–8, then bytes 8–12; three total attempts; fail loud (500) if all three collide. |
| 6 | §5 Schema | **Drop `screenshot_file_id` column.** Admin code uses `attachments.find(a => a.kind === 'screenshot')` — one line, no sync risk. |
| 7 | §5 Schema | HTML sanitizer: `isomorphic-dompurify` with `uponSanitizeElement` hook for `<img>` rewrite + external-src blocking. |
| 8 | §5 Schema | `anon_session_id` stored plaintext. DB read = full compromise anyway; hashing adds complexity with no meaningful security boundary. |
| 9 | §6 Context | `useRegisterFeedbackContext` storage: **hand-rolled registry** (~40 LOC module-scope `Map`). No Zustand/Jotai dep. |
| 10 | §6 Context | Breadcrumb ring buffer: stringify **on-submit** (single big serialize), not on-emit. Emitting is hot-path; submit is once. |
| 11 | §6 Context | PII redaction: top-level keys + one level deep on both `consumer_context` and breadcrumb `data` payloads. Regex list as in §6d of design doc. |
| 12 | §7 Dialog | `html2canvas`: bundled as regular dep, **lazy-imported** on dialog open (not CDN). Acceptable footprint. |
| 13 | §7 Dialog | **Annotation deferred to v1.1.** markerjs3 uses Linkware License (requires "Powered by marker.js" UI attribution) — rejected. No MIT alternative of comparable scope. |
| 14 | §7 Dialog | Mobile sheet: use `Drawer` from `hazo_ui@^2.9.0` (vaul-backed, MIT). |
| 15 | §7 Dialog | Tiptap: own lightweight **`FeedbackBodyEditor`** component with five Tiptap peer deps (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`). `HazoUiRte` is incompatible (sealed email-template editor, no `extensions` prop). |
| 16 | §7 Dialog | Tiptap inline images: `useRef<Map<string, Blob>>` keyed by UUID; `onImageAdded` callback stores blob at paste-time. |
| 17 | §8 Admin | Free-text search: five-column `ILIKE` — `ref_id`, `subject`, `body_text`, `user_name_snapshot`, `user_email_snapshot`. |
| 18 | §8 Admin | Clipboard: **`useCopyToClipboard` hook** — `try/catch` around `navigator.clipboard.writeText()`; state `'idle' | 'copied' | 'failed'`; `'failed'` shows a fallback dialog with "Select all" button. Shared between ref-ID copy and prompt copy. |
| 19 | §8 Admin | Zip: client-side `jszip` (lazy-imported), built in the browser. No server streaming needed. |
| 20 | §8 Admin | No cross-app super-admin in v1. Each app's admin is `hazo_feedback:{appId}:admin` only. |
| 21 | §9 Server | IP extraction: import `get_client_ip` from `hazo_auth/server-lib` (not copy the pattern). ⚠️ **Collision warning:** `hazo_auth/components/layouts/shared` also exports a CLIENT-SIDE `async get_client_ip()` with no args — always import from `hazo_auth/server-lib`. |
| 22 | §9 Server | Auth gate: **`required_permissions` path** — `hazo_get_auth(request, { required_permissions: ['hazo_feedback:{appId}:admin'] })`. HRBAC is off by default; `scope_id` option silently no-ops. Permission provisioned via `scripts/provision_feedback_admin.sql`. |
| 23 | §9 Server | HTML sanitizer: `isomorphic-dompurify` (confirmed in Q7 — same dep). |
| 24 | §9 Server | Multipart: `request.formData()` + **`export const runtime = 'nodejs'`** on the catch-all route file. Without `runtime = 'nodejs'`, Next.js edge runtime strips the body; Vercel's 4.5 MB body limit also applies to edge but not Node. Note in SETUP_CHECKLIST.md (warning: default 4.5 MB edge limit; Node runtime required for >4.5 MB attachment submissions). |
| 25 | §10 Consumer | Test-app sidebar: five pages — **Home / Authed Submit / Anon Submit / Admin / Settings**. |
| 26 | §10 Consumer | All four hazo_notify errata confirmed: (1) `ensure_anon_id` is async single-arg; (2) hazo_notify is hard peer; (3) `send_template_email` API (not invented API); (4) Handlebars `{{ref_id}}` in INI sample (not `%REF_ID%`). |
| 27 | §10 Consumer | i18n: `translate?: (key: string, vars?: Record<string, string>) => string` prop on `<FeedbackProvider>`. Package exports `FEEDBACK_STRINGS: Record<string, string>` (English defaults). |
| 28 | §11 §29 | All 13 §29 deferred rows confirmed deferred. See §12 for full ledger. |

---

## 4. Current state

The `hazo_feedback/` directory contains only:

```
hazo_feedback/
├── hazo_feedback_v1.2_design.md
└── design/
    ├── grill-session-handoff.md
    └── hazo_feedback_v1_plan.md   ← this file
```

No source code, no migrations, no package.json. This is a green-field build.

---

## 5. Target package structure

```
hazo_feedback/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── .npmignore
├── README.md
├── SETUP_CHECKLIST.md
├── CLAUDE.md
├── CHANGE_LOG.md
├── AGENTS.md
├── config/
│   └── hazo_feedback_config.ini.sample
├── design/
│   ├── grill-session-handoff.md
│   └── hazo_feedback_v1_plan.md
├── migrations/
│   └── 001_init.sql
├── scripts/
│   └── provision_feedback_admin.sql
├── src/
│   ├── index.ts                   # server entry — createFeedbackServer factory
│   ├── index.client.ts            # client entry — Provider, Widget, AdminPage, hooks
│   ├── types.ts                   # shared types (no Node imports)
│   ├── config/
│   │   ├── load_config.ts         # INI reader, module-scope singleton
│   │   └── types.ts               # FeedbackConfig interface
│   ├── db/
│   │   ├── submission_service.ts  # createCrudService wrapper + custom queries
│   │   ├── attachment_service.ts
│   │   └── event_service.ts
│   ├── server/
│   │   ├── factory.ts             # createFeedbackServer
│   │   ├── handlers/
│   │   │   ├── submit.ts
│   │   │   ├── admin_list.ts
│   │   │   ├── admin_detail.ts
│   │   │   ├── admin_update.ts
│   │   │   ├── admin_comment.ts
│   │   │   ├── admin_export_prompt.ts
│   │   │   └── admin_attachment.ts
│   │   └── router.ts              # internal dispatch (not Express — plain if/else on path)
│   ├── redact/
│   │   └── pii_redact.ts          # regex-based PII redaction pass (§6d)
│   ├── ref/
│   │   └── ref_id.ts              # Crockford base32 ref ID generator
│   ├── sanitize/
│   │   └── body_html.ts           # isomorphic-dompurify allowlist + img-rewrite hook
│   ├── rate_limit/
│   │   └── token_bucket.ts        # in-memory token bucket (process-local)
│   ├── prompt/
│   │   └── build_prompt.ts        # markdown prompt builder (server-side)
│   ├── notify/
│   │   └── send_acknowledgement.ts # wraps send_template_email; no-op if hazo_notify absent
│   ├── email_templates/
│   │   ├── feedback_acknowledgement.html
│   │   └── feedback_acknowledgement.txt
│   ├── manifest.ts                # hazo_feedback_template_manifest: SystemTemplateManifest[]
│   ├── widget/
│   │   ├── FeedbackProvider.tsx
│   │   ├── FeedbackWidget.tsx
│   │   ├── FeedbackDialog.tsx
│   │   ├── FeedbackDrawer.tsx     # mobile sheet (hazo_ui Drawer)
│   │   ├── FeedbackBodyEditor.tsx # lightweight Tiptap wrapper
│   │   ├── AttachmentTray.tsx
│   │   ├── PrivacyDisclosure.tsx
│   │   ├── SuccessPanel.tsx
│   │   └── CategorySelector.tsx
│   ├── admin/
│   │   ├── FeedbackAdminPage.tsx
│   │   ├── SubmissionList.tsx
│   │   ├── SubmissionDetail.tsx
│   │   ├── tabs/
│   │   │   ├── OverviewTab.tsx
│   │   │   ├── ContextTab.tsx
│   │   │   ├── AttachmentsTab.tsx
│   │   │   └── ActivityTab.tsx
│   │   └── CopyPromptButton.tsx
│   └── hooks/
│       ├── useRegisterFeedbackContext.ts
│       ├── useCopyToClipboard.ts
│       └── useFeedbackProvider.ts  # reads context
└── test-app/
    ├── package.json
    ├── next.config.js
    └── app/
        ├── layout.tsx
        ├── page.tsx               # Home / overview
        ├── authed-submit/
        │   └── page.tsx
        ├── anon-submit/
        │   └── page.tsx
        ├── admin/
        │   └── page.tsx
        ├── settings/
        │   └── page.tsx
        └── api/
            └── feedback/
                └── [...path]/
                    └── route.ts
```

---

## 6. Schema — `migrations/001_init.sql`

Three tables. Postgres version is the active section; SQLite version is commented below it in the same file, following the hazo_notify pattern.

### 6.1 `hazo_feedback_submissions`

| Column | Postgres type | SQLite type | Notes |
|---|---|---|---|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | `TEXT PK` | |
| `ref_id` | `TEXT NOT NULL UNIQUE` | `TEXT NOT NULL UNIQUE` | `{app_id}-{Crockford-base32(first 4 bytes)}` |
| `app_id` | `TEXT NOT NULL` | `TEXT NOT NULL` | server-stamped from config |
| `source` | `TEXT NULL` | `TEXT NULL` | optional provider-instance label, max 32 chars |
| `user_id` | `UUID NULL REFERENCES hazo_users(id)` | `TEXT NULL` | |
| `user_name_snapshot` | `TEXT NULL` | `TEXT NULL` | |
| `user_email_snapshot` | `TEXT NULL` | `TEXT NULL` | |
| `anon_session_id` | `TEXT NULL` | `TEXT NULL` | plaintext (Q8) |
| `category` | `TEXT NOT NULL DEFAULT 'general'` | same | bug/feature/general/praise |
| `subject` | `TEXT NULL` | same | max 200 chars |
| `problem` | `TEXT NULL` | same | |
| `intent` | `TEXT NULL` | same | |
| `expected_output` | `TEXT NULL` | same | |
| `reproducibility` | `TEXT NULL` | same | always/sometimes/once |
| `body_html` | `TEXT NULL` | same | sanitized; written in UPDATE step |
| `body_text` | `TEXT NULL` | same | extracted plain text |
| `status` | `TEXT NOT NULL DEFAULT 'new'` | same | new/triaged/in_progress/resolved/wont_fix |
| `priority` | `TEXT NULL` | same | low/medium/high/urgent |
| `marked_spam` | `BOOLEAN NOT NULL DEFAULT FALSE` | `INTEGER NOT NULL DEFAULT 0` | |
| `url` | `TEXT NOT NULL` | same | |
| `route` | `TEXT NULL` | same | Next.js route pattern |
| `viewport_w` | `INT NULL` | `INTEGER NULL` | |
| `viewport_h` | `INT NULL` | `INTEGER NULL` | |
| `user_agent` | `TEXT NULL` | same | |
| `app_version` | `TEXT NULL` | same | |
| `consumer_context` | `JSONB NULL` | `TEXT NULL` | server-capped at 64KB |
| `consumer_context_redacted` | `TEXT NULL` | `TEXT NULL` | JSON-encoded string array (Q3) |
| `recent_errors` | `JSONB NULL` | `TEXT NULL` | last ~20 errors |
| `breadcrumbs` | `JSONB NULL` | `TEXT NULL` | last ~50 breadcrumbs |
| `attachment_count` | `INT NOT NULL DEFAULT 0` | `INTEGER NOT NULL DEFAULT 0` | denormalized counter |
| `acknowledge_email_sent_at` | `TIMESTAMPTZ NULL` | `TEXT NULL` | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `TEXT NOT NULL DEFAULT (datetime('now'))` | |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `TEXT NOT NULL DEFAULT (datetime('now'))` | |
| `resolved_at` | `TIMESTAMPTZ NULL` | `TEXT NULL` | |

**Note:** `screenshot_file_id` column is **dropped** (Q6). Admin code uses `attachments.find(a => a.kind === 'screenshot')`.

**Indexes:**
- `(app_id, created_at DESC)` — primary list query
- `(app_id, status)` — status filter
- `(user_id)`
- `(anon_session_id)`
- `UNIQUE (ref_id)`

### 6.2 `hazo_feedback_attachments`

| Column | Postgres type | SQLite type | Notes |
|---|---|---|---|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | `TEXT PK` | |
| `submission_id` | `UUID NOT NULL REFERENCES hazo_feedback_submissions(id) ON DELETE CASCADE` | `TEXT NOT NULL` | |
| `inline_id` | `TEXT NULL` | same | matches `data-feedback-inline-id` in body_html |
| `file_id` | `TEXT NOT NULL` | same | hazo_files virtualPath |
| `mime_type` | `TEXT NOT NULL` | same | |
| `size_bytes` | `BIGINT NOT NULL` | `INTEGER NOT NULL` | |
| `kind` | `TEXT NOT NULL` | same | screenshot/pasted_image/uploaded_file |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `TEXT NOT NULL DEFAULT (datetime('now'))` | |

### 6.3 `hazo_feedback_events`

| Column | Postgres type | SQLite type | Notes |
|---|---|---|---|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | `TEXT PK` | |
| `submission_id` | `UUID NOT NULL REFERENCES hazo_feedback_submissions(id) ON DELETE CASCADE` | `TEXT NOT NULL` | |
| `actor_id` | `UUID NULL REFERENCES hazo_users(id)` | `TEXT NULL` | |
| `event_type` | `TEXT NOT NULL` | same | status_changed/priority_changed/comment_added/exported_prompt |
| `from_value` | `TEXT NULL` | same | |
| `to_value` | `TEXT NULL` | same | |
| `comment` | `TEXT NULL` | same | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `TEXT NOT NULL DEFAULT (datetime('now'))` | |

### 6.4 Admin scope provisioning

`scripts/provision_feedback_admin.sql` — one-shot SQL the consumer runs once per app_id:

```sql
-- 1. Ensure the permission exists
INSERT INTO hazo_permissions (name, description)
VALUES ('hazo_feedback:{APP_ID}:admin', 'Full admin access to hazo_feedback for app {APP_ID}')
ON CONFLICT (name) DO NOTHING;

-- 2. Ensure the role exists (create a feedback-admin role if needed)
INSERT INTO hazo_roles (name, description)
VALUES ('feedback_admin_{APP_ID}', 'Feedback admin for {APP_ID}')
ON CONFLICT (name) DO NOTHING;

-- 3. Assign permission to role
INSERT INTO hazo_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM hazo_roles r, hazo_permissions p
WHERE r.name = 'feedback_admin_{APP_ID}'
AND p.name = 'hazo_feedback:{APP_ID}:admin'
ON CONFLICT DO NOTHING;

-- 4. Assign role to user
INSERT INTO hazo_user_roles (user_id, role_id)
SELECT '{YOUR_USER_ID}', r.id
FROM hazo_roles r
WHERE r.name = 'feedback_admin_{APP_ID}'
ON CONFLICT DO NOTHING;
```

SETUP_CHECKLIST.md documents: substitute `{APP_ID}` and `{YOUR_USER_ID}` before running.

---

## 7. Public API

### 7.1 Server entry (`hazo_feedback`)

```ts
import "server-only";

// Factory
export function createFeedbackServer(options: FeedbackServerOptions): FeedbackServer;

// Template manifest (for init_template_manager in consuming app)
export const hazo_feedback_template_manifest: SystemTemplateManifest[];

// Types
export type {
  FeedbackServerOptions,
  FeedbackServer,
  FeedbackSubmission,
  FeedbackAttachment,
  FeedbackEvent,
  FeedbackConfig,
};
```

`FeedbackServerOptions`:
```ts
interface FeedbackServerOptions {
  getHazoConnect: () => Promise<any> | any;
  getFileManager: () => Promise<any> | any;
  appId?: string;          // overrides config file (useful for test-app)
  adminScope?: string;     // overrides config file
  notifyOptions?: {        // optional; if absent, ack email is no-op
    getHazoConnect: () => Promise<any> | any;
    from: string;
    fromName?: string;
  };
  logger?: Logger;         // hazo_logs interface
}
```

`FeedbackServer`:
```ts
interface FeedbackServer {
  handlers: {
    GET: (request: NextRequest, context: any) => Promise<NextResponse>;
    POST: (request: NextRequest, context: any) => Promise<NextResponse>;
    PATCH: (request: NextRequest, context: any) => Promise<NextResponse>;
    DELETE: (request: NextRequest, context: any) => Promise<NextResponse>;
  };
}
```

### 7.2 Client entry (`hazo_feedback/client`)

```ts
// Components
export { FeedbackProvider } from './widget/FeedbackProvider';
export { FeedbackWidget } from './widget/FeedbackWidget';
export { FeedbackTriggerButton } from './widget/FeedbackTriggerButton';
export { FeedbackAdminPage } from './admin/FeedbackAdminPage';

// Hooks
export { useRegisterFeedbackContext } from './hooks/useRegisterFeedbackContext';
export { useCopyToClipboard } from './hooks/useCopyToClipboard';

// Imperative breadcrumb API
export { feedback } from './feedback_api';
// usage: feedback.breadcrumb('opened-tree', { treeId })

// i18n defaults
export { FEEDBACK_STRINGS } from './strings';

// Types
export type {
  FeedbackProviderProps,
  FeedbackUser,
  FeedbackContextEntry,
  CopyState,
};
```

### 7.3 Route handler wiring in consumer

```ts
// src/app/api/feedback/[...path]/route.ts
import "server-only";
export const runtime = 'nodejs';  // REQUIRED — see Q24

import { getFeedbackServer } from '@/lib/feedback/server';

export async function GET(req: NextRequest, ctx: any) {
  return (await getFeedbackServer()).handlers.GET(req, ctx);
}
// ... POST, PATCH, DELETE same pattern
```

---

## 8. Code changes — layer by layer

### 8.1 `src/config/load_config.ts`

- Reads `config/hazo_feedback_config.ini` via `hazo_config`.
- Path configurable via `HAZO_FEEDBACK_CONFIG_PATH` env var.
- Module-scope singleton — read once at first call, cached.
- Returns typed `FeedbackConfig` (appId, adminScope, rateLimitConfig, attachmentConfig, notifyConfig).

### 8.2 `src/ref/ref_id.ts`

Crockford base32 encoder (hand-rolled ~30 lines, no dep):
- Take first 4 bytes of UUID (parsed from string, not Buffer).
- Encode with Crockford alphabet (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`).
- Prepend `{appId}-`.
- Collision retry: bytes 4–8 on attempt 2, bytes 8–12 on attempt 3. Three total attempts.
- Export: `generate_ref_id(uuid: string, appId: string, attempt: 1 | 2 | 3): string`.

### 8.3 `src/redact/pii_redact.ts`

Two exported functions:
- `redact_context(ctx: Record<string, unknown>): { redacted: Record<string, unknown>; keys: string[] }` — top-level + one-level-deep key pattern match; returns modified context and list of redacted key names.
- `redact_breadcrumbs(entries: BreadcrumbEntry[]): BreadcrumbEntry[]` — same regex on each entry's `data` payload in place.

Regex patterns: as listed in §6d of design doc. No regex on free-text fields (body, subject, etc.).

### 8.4 `src/sanitize/body_html.ts`

Uses `isomorphic-dompurify`:
- Allowlist: `b/strong/i/em/u/a/p/br/ul/ol/li/code/pre/blockquote/h2/h3/img`.
- `uponSanitizeElement` hook:
  - For `<img>` elements: read `data-feedback-inline-id`, look up `inline_id` in provided `attachmentMap: Map<string, string>` (inline_id → attachment URL). If found, rewrite `src`. If not found or if src starts with `https://`, remove the element (return `false` equivalent — DOMPurify removes it from output).
- Export: `sanitize_body_html(html: string, attachmentMap: Map<string, string>): string`.

### 8.5 `src/rate_limit/token_bucket.ts`

In-memory token bucket. Module-scope `Map<string, Bucket>`.
- `check_rate_limit(key: string, config: RateLimitConfig): boolean` — returns `true` if allowed.
- Two calls per anon submit: `(appId:anon:${anon_session_id})` + `(appId:ip:${ip})`.
- One call per authed submit: `(appId:user:${userId})`.

### 8.6 `src/server/handlers/submit.ts`

Full submit flow following Q4 (Pattern X) for orphan file cleanup:

```
const uploaded_paths: string[] = [];
try {
  // 1. Resolve identity (getSession / ensureAnonId)
  // 2. Rate-limit check (429 if exceeded)
  // 3. Stamp app_id + source
  // 4. PII redaction (redact_context + redact_breadcrumbs)
  // 5. Generate ref_id (with retry loop, Q5)
  // 6. INSERT submission row (body_html = NULL, attachment_count = 0)
  // 7. For each file:
  //    - uploadFile(source, remotePath, opts)
  //    - uploaded_paths.push(virtualPath)
  //    - INSERT attachment row
  // 8. sanitize_body_html (DOMPurify + img rewrite, Q7)
  // 9. Cap consumer_context at 64KB
  // 10. UPDATE submission (body_html, body_text, attachment_count)
  // 11. Fire ack email (post-commit, async, fire-and-forget)
  // 12. Return { submissionId, refId }
} catch (err) {
  // Pattern X: compensating delete for any uploaded files
  await Promise.allSettled(uploaded_paths.map(path => deleteFile(path)));
  throw err;
}
```

`ensure_anon_id` is `await`ed (async, single-arg — Q26 errata).

IP for rate-limit: `get_client_ip(request)` imported from `hazo_auth/server-lib` — NOT from `hazo_auth/components/layouts/shared` (Q21).

### 8.7 `src/server/handlers/admin_*.ts`

Each handler:
1. Calls `hazo_get_auth(request, { required_permissions: [adminScope] })` — `required_permissions` path (Q22).
2. Returns 401/403 if check fails.
3. Executes DB query via submission/attachment/event service.

`admin_export_prompt.ts`: calls `build_prompt(submission, attachments, events)` from `src/prompt/`, logs `exported_prompt` event, returns markdown text.

`admin_attachment.ts`: streams file via hazo_files `getFileStream` or equivalent. Admin-only (same scope check).

### 8.8 `src/prompt/build_prompt.ts`

Server-side markdown builder. No external deps (just string template). Category-suffixed call to action as per design doc §8.

Export: `build_prompt(submission: FeedbackSubmission, attachments: FeedbackAttachment[], events: FeedbackEvent[]): string`.

### 8.9 `src/notify/send_acknowledgement.ts`

```ts
import "server-only";
import { send_template_email } from "hazo_notify/template_manager";

export async function send_acknowledgement(opts: AckEmailOptions): Promise<void> {
  await send_template_email({
    template_name: 'feedback_acknowledgement',
    to: opts.to,
    from: opts.from,
    from_name: opts.fromName,
    variables: {
      ref_id: opts.refId,
      name: opts.name ?? 'there',
      subject: opts.subject ?? '(no subject)',
      category: opts.category,
      submitted_at: opts.submittedAt.toISOString(),
    },
    scope_id: null,  // global default; per-scope overrides via hazo_notify admin UI
  }, opts.hazo_connect);
}
```

### 8.10 `src/manifest.ts`

```ts
import type { SystemTemplateManifest } from "hazo_notify/template_manager";
import path from "path";

export const hazo_feedback_template_manifest: SystemTemplateManifest[] = [
  {
    template_name: 'feedback_acknowledgement',
    template_label: 'Feedback Acknowledgement',
    category: 'Feedback',
    html_path: path.join(__dirname, './email_templates/feedback_acknowledgement.html'),
    text_path: path.join(__dirname, './email_templates/feedback_acknowledgement.txt'),
    variables: [
      { name: 'ref_id', label: 'Reference ID', required: true },
      { name: 'name', label: "Submitter's name", required: false },
      { name: 'subject', label: 'Feedback subject', required: false },
      { name: 'category', label: 'Feedback category', required: true },
      { name: 'submitted_at', label: 'Submitted at (ISO)', required: true },
    ],
  },
];
```

---

## 9. Client components

### 9.1 `src/hooks/useRegisterFeedbackContext.ts`

Hand-rolled registry (~40 LOC):

```ts
// module-scope — no React dependency
const registry = new Map<symbol, Record<string, unknown>>();
const subscribers = new Set<() => void>();

export function useRegisterFeedbackContext(ctx: Record<string, unknown>) {
  const keyRef = useRef(Symbol());  // stable per component instance
  useEffect(() => {
    registry.set(keyRef.current, ctx);
    subscribers.forEach(fn => fn());
    return () => {
      registry.delete(keyRef.current);
    };
  }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps — intentional dependency on entire object
}

export function get_merged_context(): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const entry of registry.values()) {
    Object.assign(merged, entry);
  }
  return merged;
}
```

No re-render on registration. `get_merged_context()` called at submit-time only (Q10).

Dev warning: if any value > 1KB after `JSON.stringify`, emit `console.warn`.

### 9.2 `src/hooks/useCopyToClipboard.ts`

```ts
type CopyState = 'idle' | 'copied' | 'failed';

export function useCopyToClipboard(): [CopyState, (text: string) => Promise<void>] {
  const [state, setState] = useState<CopyState>('idle');
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');  // triggers fallback dialog in consumer
    }
  };
  return [state, copy];
}
```

Used in: `SuccessPanel` (ref ID copy), `CopyPromptButton` (admin prompt copy).

When state is `'failed'`, the component renders a small dialog with a `<textarea>` containing the text and a "Select all" button, instructing the user to copy manually.

### 9.3 `src/widget/FeedbackBodyEditor.tsx`

Lightweight Tiptap wrapper, NOT `HazoUiRte`:

```tsx
// peer deps required: @tiptap/react, @tiptap/starter-kit, @tiptap/extension-image,
//                     @tiptap/extension-link, @tiptap/extension-placeholder

interface FeedbackBodyEditorProps {
  value: string;
  onChange: (html: string) => void;
  onImageAdded: (id: string, blob: Blob) => void;
  placeholder?: string;
}
```

Custom `FeedbackInlineImage` extension (subclasses `@tiptap/extension-image`):
- Adds `data-feedback-inline-id` attribute via `addAttributes()`.
- Paste handler: on `image/png` | `image/jpeg` | `image/gif` | `image/webp` paste: generate UUID, call `onImageAdded(uuid, blob)`, render `<img src="data:..." data-feedback-inline-id="{uuid}">`.
- Drag-into-editor: same flow.

Parent component (`FeedbackDialog.tsx`) maintains `useRef<Map<string, Blob>>` and passes a stable `onImageAdded` callback.

### 9.4 Mobile layout

`FeedbackDrawer.tsx` — renders on `< sm` breakpoint. Uses `Drawer` from `hazo_ui@^2.9.0` (vaul-backed). Same form content as `FeedbackDialog.tsx`; different shell.

Detection: `useMediaQuery('(max-width: 640px)')` or CSS-driven conditional render via Tailwind responsive classes. Recommend: render both, show/hide via Tailwind `sm:hidden` / `hidden sm:block` to avoid hook complexity.

### 9.5 `src/widget/FeedbackProvider.tsx`

React context provider. Stores:
- `appId`, `apiBase`, `source`, `user`, `appVersion`
- `attachmentConfig`, `triggerConfig`
- `translate` function (falls back to `FEEDBACK_STRINGS[key]`)
- `redactContext` callback (runs before default PII pass — on the server side; provider stores it in context for the submit handler to call before serializing)

Actually: `redactContext` is applied client-side before the payload is sent to the server, to keep PII off the wire entirely. Not server-side.

Installs `window.onerror` and `unhandledrejection` listeners if `captureErrors={true}` (default). Additive — calls any previous handler.

### 9.6 `src/admin/FeedbackAdminPage.tsx`

```tsx
interface FeedbackAdminPageProps {
  appId: string;
  apiBase: string;
  LightboxComponent?: React.ComponentType<LightboxProps>;  // consumer's existing lightbox
  className?: string;
}
```

Two-pane layout (list 40% / detail 60%). On `< md`: list only; detail as bottom sheet (`Drawer`).

Uses `useCopyToClipboard` for prompt copy.

Zip download: lazy-imports `jszip`, fetches each attachment via admin attachment route, assembles in browser, triggers `<a download>` (Q19).

---

## 10. Email templates

### `src/email_templates/feedback_acknowledgement.txt`

```
Subject: We received your feedback ({{ref_id}})

Hi {{name}},

Thanks for sending feedback. We've logged it as reference {{ref_id}}.

Subject: {{subject}}
Category: {{category}}
Submitted: {{submitted_at}}

There's no action needed from you. If you want to follow up later,
just quote the reference {{ref_id}}.
```

### `src/email_templates/feedback_acknowledgement.html`

Equivalent HTML version. Simple layout — no external fonts, no tracking pixels, inline styles only for maximum email-client compatibility.

Variables use Handlebars `{{var}}` syntax (not `%VAR%` — Q26 errata).

---

## 11. Configuration (`config/hazo_feedback_config.ini.sample`)

```ini
[app]
app_id = kinstripe
app_version = ${NEXT_PUBLIC_APP_VERSION}

[admin]
; Permission string used to gate admin routes.
; Must match what you provisioned via scripts/provision_feedback_admin.sql.
admin_scope = hazo_feedback:kinstripe:admin

[rate_limit]
per_anon_count = 10
per_anon_window_ms = 60000
per_user_count = 50
per_user_window_ms = 3600000
per_ip_count = 100
per_ip_window_ms = 60000

[attachments]
; Maximum attachments per submission. Default: 5.
max_count = 5
; Per-file size limit in bytes. Default: 10 MB.
max_bytes_per_file = 10485760
; Total per-submission size limit in bytes. Default: 25 MB.
; NOTE: if using Vercel, the catch-all route MUST use `export const runtime = 'nodejs'`
; (see SETUP_CHECKLIST.md). Vercel's edge runtime has a 4.5 MB body limit.
total_max_bytes = 26214400

[notify]
; Set to false to skip acknowledgement emails even if hazo_notify is installed.
acknowledge_email_enabled = true
acknowledge_email_from = feedback@kinstripe.app
acknowledge_email_from_name = Kinstripe
; Subject uses Handlebars syntax. Available: {{ref_id}}
acknowledge_email_subject = We received your feedback ({{ref_id}})
```

---

## 12. Package.json

```jsonc
{
  "name": "hazo_feedback",
  "version": "1.0.0",
  "description": "Drop-in contextual feedback widget for hazo apps",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./client": {
      "types": "./dist/index.client.d.ts",
      "default": "./dist/index.client.js"
    }
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0",
    "next": "^14.0.0 || ^16.0.0",
    "hazo_connect": "^2.4.0",
    "hazo_auth": "^5.3.1",
    "hazo_ui": "^2.9.0",
    "hazo_files": "^1.0.0",
    "hazo_notify": "^3.1.0",
    "lucide-react": "^0.553.0",
    "@tiptap/react": "^3.20.5",
    "@tiptap/starter-kit": "^3.20.5",
    "@tiptap/extension-image": "^3.20.5",
    "@tiptap/extension-link": "^3.20.5",
    "@tiptap/extension-placeholder": "^3.20.5"
  },
  "peerDependenciesMeta": {
    "hazo_notify": { "optional": false },
    "hazo_logs": { "optional": true }
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.5.0",
    "isomorphic-dompurify": "^2.9.0",
    "turndown": "^7.1.3",
    "html2canvas": "^1.4.1"
  },
  "devDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "next": "^16.0.10",
    "typescript": "^5.7.2",
    "@types/node": "^22.10.0",
    "tailwindcss": "^4.2.4",
    "@tailwindcss/postcss": "^4.2.4",
    "postcss": "^8.4.49",
    "eslint": "^8.57.0",
    "eslint-config-next": "^16.0.10",
    "jest": "^30.2.0",
    "ts-jest": "^29.4.5",
    "@types/jest": "^30.0.0",
    "jest-environment-node": "^30.2.0",
    "@types/turndown": "^5.0.5",
    "hazo_auth": "^5.3.1",
    "hazo_connect": "^2.4.0",
    "hazo_ui": "^2.9.0",
    "hazo_notify": "^3.1.0",
    "@tiptap/react": "^3.20.5",
    "@tiptap/starter-kit": "^3.20.5",
    "@tiptap/extension-image": "^3.20.5",
    "@tiptap/extension-link": "^3.20.5",
    "@tiptap/extension-placeholder": "^3.20.5"
  }
}
```

**`jszip`** and **`html2canvas`**: bundled as regular `dependencies` (lazy-imported, tree-shaken in consumers that don't use them). jszip is also lazy-imported — worth checking if a separate dep entry is needed; if not, list as devDep in package.json and document that consumers need to install it (unlikely — just bundle it).

---

## 13. Build config (`tsconfig.build.json`)

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx", "test-app/**"]
}
```

---

## 14. Test-app

Sidebar layout (workspace-required). Five pages:

| Page | Route | What it tests |
|---|---|---|
| Home | `/` | Package version, config summary, link to all pages |
| Authed Submit | `/authed-submit` | `<FeedbackProvider>` with mock user + `<FeedbackWidget>` mounted; trigger fires, dialog opens, submits, shows ref ID |
| Anon Submit | `/anon-submit` | Same but `user={null}`; shows name/email inputs; submit flow with `ensure_anon_id` |
| Admin | `/admin` | `<FeedbackAdminPage>` wired to test DB; list, detail, status update, prompt copy, zip download |
| Settings | `/settings` | Config display, rate-limit counters, template manifest preview |

Test-app `package.json` uses npm version ranges (NOT `file:` links).

`next.config.js` includes `transpilePackages: ['hazo_feedback', 'hazo_connect', 'hazo_auth', 'hazo_ui', 'hazo_notify', 'hazo_files']`.

`export const runtime = 'nodejs'` on `test-app/app/api/feedback/[...path]/route.ts`.

---

## 15. Consumer integration (Kinstripe)

### Sequence

1. hazo_auth@5.3.1 ✅ published
2. hazo_notify@3.1.0 ✅ published
3. hazo_ui@2.9.0 ✅ published
4. **hazo_feedback@1.0.0** ← this work
5. kinstripe PR consumes hazo_feedback@1.0.0

### Kinstripe steps

**`src/lib/feedback/server.ts`** — lazy-init singleton:
```ts
let _server: FeedbackServer | null = null;
export async function getFeedbackServer(): Promise<FeedbackServer> {
  if (_server) return _server;
  _server = createFeedbackServer({ getHazoConnect, getFileManager, ... });
  return _server;
}
```

**`src/app/api/feedback/[...path]/route.ts`** — catch-all with `runtime = 'nodejs'`.

**`instrumentation.ts`** — init template manager on boot:
```ts
import { init_template_manager, sync_system_templates } from 'hazo_notify/template_manager';
import { hazo_auth_template_manifest } from 'hazo_auth/server-lib';
import { hazo_feedback_template_manifest } from 'hazo_feedback';

export async function register() {
  await init_template_manager({ hazo_connect: getHazoConnect() });
  await sync_system_templates(getHazoConnect(), [
    ...hazo_auth_template_manifest,
    ...hazo_feedback_template_manifest,
  ]);
}
```

**Two providers:**
- `src/app/(app)/layout.tsx` — `<FeedbackProvider source="app" user={session?.user} ...>`
- `src/app/(public)/layout.tsx` — same with `user={null}` and `source="public"`

**Admin page:** `src/app/(app)/admin/feedback/page.tsx` — server component; reads session, checks `hazo_feedback:kinstripe:admin` via `hazo_get_auth(..., { required_permissions: ['hazo_feedback:kinstripe:admin'] })`, renders `<FeedbackAdminPage>`.

**Database migration:** copy `hazo_feedback/migrations/001_init.sql` → `docs/db_setup/060_hazo_feedback.sql`.

**Admin provisioning:** run `scripts/provision_feedback_admin.sql` once (substituting `kinstripe` + your user ID).

**i18n:** add `Feedback.*` namespace to `src/i18n/messages/en.json`. Wire `translate={(k, vars) => t(k, vars)}` to `<FeedbackProvider>`.

**Breadcrumbs** — five high-signal drops as per design doc §10c (view-switch, detail open/close, Connection Studio commit, Timeline drop, Story save/publish).

**Per-page context** — `useRegisterFeedbackContext` in TreeCanvas, DetailPanel, TimelineView as per design doc §10b.

**`@source` in Tailwind entry:** `@source "../node_modules/hazo_feedback/dist";` (document in SETUP_CHECKLIST.md; without this, Tailwind v4 JIT won't compile hazo_feedback classes).

---

## 16. Testing strategy

### Unit tests (`src/__tests__/`)

- `ref_id.ts`: Crockford encoding, collision retry sequencing, fail-loud on attempt 3.
- `pii_redact.ts`: top-level redaction, one-level-deep, breadcrumb redaction, non-matching keys untouched, free-text keys not redacted.
- `body_html.ts`: inline-id rewrite, external-https img dropped, unknown-inline-id img dropped, safe tags preserved, script/style stripped.
- `token_bucket.ts`: allow up to limit, reject at limit, window reset after expiry.
- `build_prompt.ts`: bug suffix, feature suffix, general suffix, praise (no suffix), structured fields omitted when blank.
- `useRegisterFeedbackContext`: merged context from multiple components, unmount clears keys, latest-wins.
- `useCopyToClipboard`: copied state transitions, failed state on API reject.

### Integration tests

- Submit flow: authed user, anon user, rate-limit 429, attachment upload + Pattern X rollback on failure, body_html sanitize + rewrite, ref_id stored correctly.
- Admin list: pagination, status filter, source filter, ILIKE search.
- Admin detail: returns submission + events + attachments.
- Admin update: status transition writes event row, sets resolved_at correctly.
- Admin export-prompt: logs exported_prompt event, returns markdown.
- Admin attachment: streams file, 403 without scope.
- Auth gate: 401 without session, 403 without required permission.

### Test-app (manual)

Walk the golden path in each of the five test-app pages before release. No Playwright in v1 (added in v1.1).

---

## 17. §29 deferral ledger (13 rows confirmed)

| Compromise | Interim | Long-term | Triggered when |
|---|---|---|---|
| In-memory rate limit | Process-local token bucket (anon_session_id primary + IP secondary) | Redis-backed store | Multi-process / multi-region deploy |
| ILIKE search | 5-column ILIKE | pg_trgm GIN index | Admin search >1s on >5k rows |
| No real-time admin updates | Manual refresh button | SSE / websocket | Friends-launch becomes wider beta |
| No status-change notifications to submitter | Ack email at submit only | Email/push per status transition via hazo_notify templates | Users report "I never heard back" |
| No orphan-attachment GC | Pattern X cleans up on submit failure only | Cron sweeping hazo_files paths with no attachment row | Storage costs become measurable |
| RLS gate at API layer only | Route-handler `required_permissions` check | SQL-level RLS reading hazo_auth grants | Direct PostgREST / ORM access needed |
| No submitter-side read endpoint | Pre-submit tray shows "✓ ready to send" | Signed URLs + "view my submissions" page | Consumer asks for it |
| No duplicate detection | ILIKE over title/body manually | pgvector + "similar submissions" panel | >100 submissions, admin reports noticing dupes |
| No session replay | Breadcrumbs (50) + screenshot + console errors | rrweb-record last 30s | Bug reports stop reproducing from breadcrumbs |
| PII redaction is heuristic | Regex on key names | Configurable rules per app; pluggable detector | HIPAA / PCI consumer |
| Screen annotation deferred | Auto-screenshot only | markerjs3 deferred — Linkware license rejected. MIT alternative needed for v1.1. | v1.1 |
| Distributed rate-limit interface | In-memory only; "interface defined" removed from docs — no interface, just implementation | Redis-backed implementation | Multi-process deploy |
| No cross-app super-admin | Per-app scope only | `hazo_feedback:*:admin` wildcard scope or separate admin panel | Second app adds feedback |

---

## 18. Pre-publish checklist

1. `npm run build` — confirm `dist/index.js`, `dist/index.d.ts`, `dist/index.client.js`, `dist/index.client.d.ts` all exist.
2. Verify no `import "server-only"` leaks into `dist/index.client.js` (would crash in browser).
3. Verify no Node.js imports (`fs`, `path`, `crypto`) in `dist/index.client.js`.
4. Export spot-check:
   ```bash
   node -e "import('./dist/index.js').then(m => console.log(typeof m.createFeedbackServer, typeof m.hazo_feedback_template_manifest))"
   ```
5. No path aliases in dist: `grep -r "@/\|@tiptap" dist/` returns nothing for `@/` aliases.
6. `npm test` — all unit + integration tests pass.
7. Test-app golden path: authed submit → admin inbox → status update → prompt copy → zip download.
8. `@source` directive documented in SETUP_CHECKLIST.md.
9. `runtime = 'nodejs'` warning in SETUP_CHECKLIST.md.
10. CHANGE_LOG.md entry: `## [1.0.0] - 2026-05-XX` with `### Added` sections for widget, admin UI, submit flow, ack email, ref ID system.
11. Confirm with user before `npm publish`.
12. After publish: `git tag v1.0.0 && git push --tags`.

---

## 19. Boundaries — what NOT to do in v1

- **No screen annotation.** markerjs3 is Linkware (attribution required in UI); no MIT alternative found. Defer to v1.1.
- **No status-change notifications.** Ack email only. Defer to v1.1.
- **No submitter-side "view my submissions."** Relies on signed URLs not yet built.
- **No HRBAC / `scope_id` path in auth.** `required_permissions` only. HRBAC is off by default in hazo_auth.
- **No Redis rate-limiter interface.** In-memory only; no half-finished interface stub.
- **No real-time admin.** Manual refresh.
- **No cross-app super-admin.** Per-app scope only.
- **No duplicate detection.** ILIKE only.
- **No bulk admin actions.**
- **No captcha.**
- **No draft-then-finalize.** Single atomic submit.
- **No per-submission versioning / history.**

---

## 20. Estimated size

- `src/server/` (factory + 7 handlers + router): ~2 days
- `src/widget/` (Provider, Widget, Dialog/Drawer, BodyEditor, AttachmentTray, PrivacyDisclosure, SuccessPanel): ~2 days
- `src/admin/` (AdminPage, List, Detail, 4 tabs, CopyPromptButton): ~1.5 days
- `src/` support modules (config, ref, redact, sanitize, rate_limit, prompt, notify, manifest): ~1 day
- Migrations + scripts: ~0.5 day
- Test-app: ~1 day
- Tests (unit + integration): ~1 day
- Kinstripe consumer wiring: ~0.5 day
- Docs (README, SETUP_CHECKLIST, AGENTS.md, CHANGE_LOG): ~0.5 day

**Total: ~10 days of focused work.**

---

## 21. Open questions for the implementing agent

Confirm these before writing the affected code:

1. **`hazo_files` API shape.** Verify `uploadFile(source, remotePath, opts)` and `deleteFile(path)` signatures against `hazo_files/src/services/file-manager.ts`. Specifically: does `deleteFile` accept a virtualPath string, or a file ID? The compensating-delete loop in Pattern X must use whatever the upload returns.

2. **`hazo_files` stream API.** Verify the method for streaming a file to the admin attachment route. If it's `getFileStream(virtualPath)`, confirm the return type (Node `Readable` or Web `ReadableStream`). Next.js app-router route handlers need Web `ReadableStream` or a `Response` with a body.

3. **`hazo_notify.sync_system_templates` update-on-boot semantics.** Confirmed from handoff: any edits to a global system row will be overwritten on next deploy if they drift from the manifest. Document this clearly in SETUP_CHECKLIST.md. The override path is the admin UI (creates a `scope_id != NULL` row that takes precedence).

4. **`hazo_connect` array query support.** The `consumer_context_redacted` column is `TEXT NULL` storing a JSON array. No Postgres `TEXT[]` operations. No casting needed. Just `JSON.stringify(keys)` on write, `JSON.parse(value ?? '[]')` on read.

5. **Kinstripe `(public)/layout.tsx` existence.** Verify the route-group structure before wiring. If it doesn't exist as a single file, may need per-route wrappers for the public pages.

6. **`html2canvas` `visibility: hidden` skip behavior.** The hide-and-capture trick in §7 relies on this. Verify with current html2canvas version (`^1.4.1`). If it captures the hidden dialog, use the fallback: render dialog into a sibling `<div>` that is itself `visibility: hidden` during capture.

7. **Tiptap v3 `setContent` signature.** Per workspace Tiptap notes: `setContent(content, false)` → `setContent(content, { emitUpdate: false })` in v3. Verify and use correct signature if resetting editor content.

8. **`hazo_auth` `required_permissions` exact string.** Verify against `HazoAuthOptions` in `hazo_auth/src/lib/auth/auth_types.ts` that the field is `required_permissions: string[]` (not `permissions` or `required_scopes`).

9. **SQLite UUID generation.** SQLite has no `gen_random_uuid()`. The migration's SQLite section should use `TEXT PRIMARY KEY` with UUIDs generated server-side (the service layer generates the ID before INSERT). Verify this matches how hazo_notify handles it.

10. **jszip lazy-import in Next.js app router.** Dynamic `import('jszip')` inside an event handler should work. Confirm no SSR issue; the zip button only exists in the admin page which is client-rendered.

---

## 22. Briefing prompt for the implementing agent

> You're working in `~/Local/01.code/00.lib/hazo_feedback`. Read `design/hazo_feedback_v1_plan.md` end-to-end before writing any code. The plan is the final word on all design decisions — it overrides anything in `hazo_feedback_v1.2_design.md` where they conflict.
>
> Resolve the §21 open questions with the user before starting the affected sections. Then work in this order:
>
> 1. **`package.json`, `tsconfig.json`, `tsconfig.build.json`** — scaffolding first so the build works.
> 2. **`migrations/001_init.sql`** and **`scripts/provision_feedback_admin.sql`** — schema is the foundation; confirm dual-DB variants with user.
> 3. **`src/` support modules** (`config/`, `ref/`, `redact/`, `sanitize/`, `rate_limit/`, `prompt/`, `notify/`, `manifest.ts`, `types.ts`) — no React, no Next.js, testable in isolation.
> 4. **`src/server/`** (factory + handlers + router) — depends on support modules.
> 5. **`src/hooks/`** — client hooks, no Next.js dep.
> 6. **`src/widget/`** (Provider, Widget, Dialog, Drawer, BodyEditor, AttachmentTray, PrivacyDisclosure, SuccessPanel) — depends on hooks.
> 7. **`src/admin/`** — depends on hooks and widget patterns.
> 8. **`src/email_templates/`** — HTML + text files for the ack email.
> 9. **`test-app/`** — sidebar layout, five pages, wired to a local SQLite DB.
> 10. **Unit + integration tests.**
> 11. **Docs** (README, SETUP_CHECKLIST, AGENTS.md, CHANGE_LOG).
> 12. Pre-publish checklist (§18) and publish.
>
> Do not write Kinstripe consumer code in this PR — that's a separate PR after hazo_feedback@1.0.0 is published.

---

End of plan.
