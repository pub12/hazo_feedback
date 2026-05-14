# hazo_feedback — Architecture Guide for AI Agents

## Package Purpose

`hazo_feedback` is a drop-in contextual feedback widget for hazo apps. It captures bug reports, feature requests, and praise with automatic screenshot, console errors, breadcrumbs, and consumer-registered context. It provides an admin inbox with list, detail, status workflow, comments, and AI prompt export. It integrates with `hazo_notify` for acknowledgement emails and `hazo_auth` for both anonymous (cookie-based) and authenticated submission.

## Entry Points

### Server Entry (`src/index.ts`)

```typescript
import { createFeedbackServer } from 'hazo_feedback';
export const hazo_feedback_template_manifest: SystemTemplateManifest[];
```

**Factory:** `createFeedbackServer(options: FeedbackServerOptions): FeedbackServer`

Returns a `FeedbackServer` with four handlers: `GET`, `POST`, `PATCH`, `DELETE`. These handle:
- `POST /submit` — user submission with attachments (multipart/form-data)
- `GET /admin/list` — paginated list with filters and search (requires admin permission)
- `GET /admin/detail/{id}` — full submission detail (requires admin permission)
- `PATCH /admin/update` — status/priority updates (requires admin permission)
- `POST /admin/comment` — add comment to submission (requires admin permission)
- `POST /admin/export-prompt` — build AI prompt (requires admin permission)
- `GET /attachments/{id}` — download attachment file

### Client Entry (`src/index.client.ts`)

```typescript
export { FeedbackProvider } from './widget/FeedbackProvider';
export { FeedbackWidget } from './widget/FeedbackWidget';
export { FeedbackAdminPage } from './admin/FeedbackAdminPage';
export { useRegisterFeedbackContext } from './hooks/useRegisterFeedbackContext';
export { useCopyToClipboard } from './hooks/useCopyToClipboard';
export { feedback } from './feedback_api';
export { FEEDBACK_STRINGS } from './strings';
export type { FeedbackProviderProps, FeedbackUser, FeedbackContextEntry, CopyState };
```

## Key Architectural Decisions

### 1. Pattern X: Orphan File Cleanup on Error

**Why:** `hazo_files` has no transaction support. If submission fails after uploads begin, orphan files leak.

**Solution:** Track uploaded `virtualPath` strings in a local array. On any error after uploads:
```typescript
const uploadedPaths: string[] = [];
try {
  uploadedPaths.push(await fileManager.upload(...));
  // ... rest of submit logic
  await saveToDB(...);
} catch (err) {
  await Promise.allSettled(uploadedPaths.map(p => fileManager.delete(p)));
  throw err;
}
```

This is implemented in `src/server/handlers/submit.ts`.

### 2. Crockford Base32 Ref IDs

**Why:** User-visible ref IDs need to be short, unambiguous, collision-safe, and debuggable.

**Implementation:**
- Encode first 4 bytes of UUID in Crockford base32 (alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ`)
- Prepend `{app_id}-` (e.g., `myapp-AB12345`)
- On collision (rare), retry with bytes 4–8, then 8–12
- Three total attempts; fail loud with HTTP 500 if all collide
- Unique constraint in DB

Code: `src/ref/ref_id.ts` (~30 lines, no dep).

### 3. In-Memory Token Bucket Rate Limiting

**Why:** Redis adds complexity; process-local is sufficient for single-instance deployments.

**Implementation:**
- Module-scope `Map<string, Bucket>` — no persistence across restarts
- Keys: `appId:anon:{session_id}`, `appId:user:{userId}`, `appId:ip:{ip}`
- Check once per submit; return `boolean`
- HTTP 429 with `Retry-After` header on limit exceeded

Code: `src/rate_limit/token_bucket.ts`.

**Scaling note:** Suitable for single-instance apps. If scaled to multiple processes, add Redis-backed rate limiter in v1.1.

### 4. Consumer Context Registry

**Why:** Components register context without needing Redux/Zustand.

**Implementation:**
- Module-scope `Map<symbol, Record<string, unknown>>`
- `useRegisterFeedbackContext(key: string, data: Record)` adds/updates an entry
- At submit time, iterate map, merge, deduplicate, redact for PII
- Stored in `consumer_context` (full) and `consumer_context_redacted` (key names of redacted fields)

Code: `src/hooks/useRegisterFeedbackContext.ts` and `src/feedback_api.ts`.

### 5. Breadcrumbs: Serialize at Submit Time, Not Emit Time

**Why:** Ring buffer emit is a hot path; serialization is expensive.

**Implementation:**
- Ring buffer (50-entry max) lives in `FeedbackProvider` context
- `feedback.breadcrumb(type, data)` pushes to ring, does NOT serialize
- At submit time, single `JSON.stringify(breadcrumbs)` call before save
- Stored in `breadcrumbs` column as JSONB (Postgres) or TEXT (SQLite)

Code: `src/widget/FeedbackProvider.tsx` (breadcrumb ring), `src/server/handlers/submit.ts` (serialization).

### 6. PII Redaction: Top-Level + One-Level-Deep Keys

**Why:** Prevents accidental storage of passwords, tokens, emails in context.

**Implementation:**
- Regex patterns on key names (case-insensitive):
  - Email: `/(email|mail|address|e-mail)$/i`
  - Password: `/(password|passwd|pwd|secret)$/i`
  - Token: `/(token|api_key|apikey|auth|bearer)$/i`
  - Phone: `/(phone|tel|mobile|cellular)$/i`
  - Credit card: `/(card|credit|debit|cc|cvv|cvc|pin)$/i`
  - SSN: `/(ssn|social.*security|tax.*id)$/i`
  - Plus generic `/(secret|private|key)$/i`
- Pattern applied to top-level keys of `consumer_context` and breadcrumb `data` payloads
- Patterns applied one-level-deep (e.g., `data.user.email` is redacted, but not `data.user.address.street`)
- Key names stored in `consumer_context_redacted` array for admin transparency

Code: `src/redact/pii_redact.ts`.

### 7. HTML Sanitization with Image Rewriting

**Why:** Prevent XSS; handle inline images from pasted blobs.

**Implementation:**
- `isomorphic-dompurify` with allowlist: `b/strong/i/em/u/a/p/br/ul/ol/li/code/pre/blockquote/h2/h3/img`
- `uponSanitizeElement` hook:
  - On `<img>` tag: read `data-feedback-inline-id` attribute
  - Look up inline_id in `attachmentMap: Map<string, string>` (inline_id → attachment URL)
  - If found: rewrite `src` to attachment URL
  - If not found OR if src starts with `https://`: remove element (return `false` equivalent)
- External images (uncontrolled https://) are blocked

Code: `src/sanitize/body_html.ts`.

### 8. consumer_context_redacted Storage as TEXT NULL (JSON Array)

**Why:** Dual-DB compatibility (Postgres and SQLite).

**Implementation:**
- Column type: `TEXT NULL` (not Postgres `TEXT[]`)
- Content: JSON-encoded string array, e.g., `["email", "api_token"]`
- No Postgres-specific array cast needed
- Parsed on read: `JSON.parse(consumer_context_redacted || '[]')`

Code: `src/server/handlers/submit.ts` and schema.

### 9. HazoUiDialogRoot/DrawerContent Primitives

**Why:** Consistency with hazo design system.

**Implementation:**
- Desktop: `HazoUiDialogRoot`, `HazoUiDialogContent`, `HazoUiDialogHeader`, `HazoUiDialogTitle` (from `hazo_ui`)
- Mobile: `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle` (from `hazo_ui`, vaul-backed)
- Breakpoint: media query `min-width: 768px` for desktop vs. mobile

Code: `src/widget/FeedbackDialog.tsx` and `src/widget/FeedbackDrawer.tsx`.

### 10. Custom FeedbackBodyEditor (Not HazoUiRte)

**Why:** `HazoUiRte` is sealed for email-template use; doesn't expose `extensions` prop for customization.

**Implementation:**
- Lightweight wrapper around `@tiptap/react`
- Includes: bold, italic, link, list, code, blockquote, image, placeholder extensions
- Tiptap inline images: `useRef<Map<string, Blob>>` keyed by UUID
- `onImageAdded` callback stores blob; client embeds as data URI initially, rewrites to attachment URL post-upload
- No dep on `HazoUiRte`; builds directly on Tiptap

Code: `src/widget/FeedbackBodyEditor.tsx`.

### 11. ensure_anon_id and get_client_ip From hazo_auth/server-lib

**Why:** Clarity on server-side utilities; avoid client-side confusion.

**Implementation:**
- `ensure_anon_id(request): Promise<string>` — single arg, async. Creates or returns existing anon ID cookie.
- `get_client_ip(request): string` — single arg, sync. Extracts client IP from headers.
- Both imported from `hazo_auth/server-lib` (NOT `hazo_auth/components/layouts/shared`, which exports client-side async version)

Code: `src/server/handlers/submit.ts`.

**Gotcha:** `hazo_auth/components/layouts/shared` also exports `async get_client_ip()` with no args (client-side). Always use server-lib version.

### 12. runtime = 'nodejs' REQUIRED on Catch-All Route

**Why:** Vercel edge runtime strips multipart/form-data bodies.

**Implementation:**
- Route file MUST include: `export const runtime = 'nodejs'`
- Effect: Next.js routes to Node.js runtime instead of edge; full body support
- Without this: multipart bodies are stripped; file attachments fail silently

Code: `src/app/api/feedback/[...path]/route.ts` (in consuming app).

Documentation: `SETUP_CHECKLIST.md` step 11.

## Database Tables

### hazo_feedback_submissions

Main feedback records. Dual-DB schema (Postgres active + SQLite commented).

**Key columns:**
- `id: UUID PK`
- `ref_id: TEXT NOT NULL UNIQUE` — Crockford base32, app-prefixed
- `app_id: TEXT NOT NULL` — server-stamped from config
- `user_id: UUID NULL REFERENCES hazo_users(id)` — authenticated user
- `anon_session_id: TEXT NULL` — plaintext anonymous session (from ensure_anon_id)
- `category: TEXT DEFAULT 'general'` — bug/feature/general/praise
- `status: TEXT DEFAULT 'new'` — new/triaged/in_progress/resolved/wont_fix
- `priority: TEXT NULL` — low/medium/high/urgent
- `body_html: TEXT NULL` — sanitized HTML (written in UPDATE after attachment upload)
- `body_text: TEXT NULL` — extracted plain text (from turndown)
- `consumer_context: JSONB NULL` — full consumer state (max 64KB server-capped)
- `consumer_context_redacted: TEXT NULL` — JSON array of redacted key names
- `recent_errors: JSONB NULL` — last ~20 console errors
- `breadcrumbs: JSONB NULL` — last ~50 user interactions/state changes
- `attachment_count: INT DEFAULT 0` — denormalized counter

**Indexes:**
- `(app_id, created_at DESC)` — primary list query
- `(app_id, status)` — status filter
- `(user_id)`, `(anon_session_id)` — user lookups
- `UNIQUE (ref_id)` — collision prevention

### hazo_feedback_attachments

File metadata for screenshots, pasted images, uploaded files.

**Key columns:**
- `id: UUID PK`
- `submission_id: UUID NOT NULL REFERENCES hazo_feedback_submissions(id) ON DELETE CASCADE`
- `inline_id: TEXT NULL` — matches `data-feedback-inline-id` in sanitized HTML (for inline images)
- `file_id: TEXT NOT NULL` — hazo_files virtualPath
- `kind: TEXT` — screenshot/pasted_image/uploaded_file

### hazo_feedback_events

Audit trail for admin actions.

**Key columns:**
- `event_type: TEXT` — status_changed/priority_changed/comment_added/exported_prompt
- `actor_id: UUID NULL` — admin user who triggered event
- `comment: TEXT NULL` — for comment_added events

## What NOT to Add in v1

See `CHANGE_LOG.md` Deferral Ledger for full list. Key deferred features:

1. **Annotation tool** — blocked on markerjs3 Linkware License
2. **Cross-app super-admin** — HRBAC scope complexity
3. **Webhook notifications** — delivery/retry complexity
4. **Bulk actions** — UI polish pending
5. **Assignment/ownership** — hazo_auth role API not ready
6. **Custom fields** — schema versioning complexity
7. **AI categorization** — LLM cost/latency tradeoff
8. **Sentiment analysis** — hazo_llm_api integration pending

## Code Organization

```
src/
├── index.ts                 # Server entry, createFeedbackServer factory
├── index.client.ts          # Client entry, components, hooks
├── types.ts                 # Shared types (no Node.js imports)
├── config/
│   ├── load_config.ts       # INI reader, singleton
│   └── types.ts             # FeedbackConfig interface
├── db/
│   ├── submission_service.ts    # CRUD + custom queries
│   ├── attachment_service.ts
│   └── event_service.ts
├── server/
│   ├── factory.ts           # createFeedbackServer
│   ├── handlers/            # submit, admin_list, admin_detail, etc.
│   └── router.ts            # path dispatch
├── redact/
│   └── pii_redact.ts        # Regex-based key pattern matching
├── ref/
│   └── ref_id.ts            # Crockford base32 generator
├── sanitize/
│   └── body_html.ts         # DOMPurify allowlist + image rewrite
├── rate_limit/
│   └── token_bucket.ts      # In-memory bucket
├── prompt/
│   └── build_prompt.ts      # Markdown prompt builder
├── notify/
│   └── send_acknowledgement.ts  # hazo_notify integration
├── email_templates/
│   ├── feedback_acknowledgement.html
│   └── feedback_acknowledgement.txt
├── manifest.ts              # hazo_feedback_template_manifest
├── widget/
│   ├── FeedbackProvider.tsx      # Context + breadcrumb ring
│   ├── FeedbackWidget.tsx        # Floating button
│   ├── FeedbackDialog.tsx        # Desktop dialog
│   ├── FeedbackDrawer.tsx        # Mobile drawer
│   ├── FeedbackBodyEditor.tsx    # Custom Tiptap wrapper
│   ├── AttachmentTray.tsx
│   ├── PrivacyDisclosure.tsx
│   ├── SuccessPanel.tsx
│   └── CategorySelector.tsx
├── admin/
│   ├── FeedbackAdminPage.tsx
│   ├── SubmissionList.tsx
│   ├── SubmissionDetail.tsx
│   ├── tabs/
│   │   ├── OverviewTab.tsx
│   │   ├── ContextTab.tsx
│   │   ├── AttachmentsTab.tsx
│   │   └── ActivityTab.tsx
│   └── CopyPromptButton.tsx
├── hooks/
│   ├── useRegisterFeedbackContext.ts
│   ├── useCopyToClipboard.ts
│   └── useFeedbackProvider.ts
└── strings.ts               # FEEDBACK_STRINGS i18n defaults
```

## Testing Strategy

- **Unit tests:** Ref ID generation, PII redaction, token bucket, sanitization
- **Integration tests:** Submit flow with attachments, admin list/detail, rate limiting
- **Test-app:** Five-page sidebar (Home, Authed, Anon, Admin, Settings) for manual verification

## Known Gotchas

1. **Vercel edge runtime:** Requires `export const runtime = 'nodejs'` on route. Without it, multipart bodies silently fail.
2. **Tailwind v4 JIT:** Requires `@source "../node_modules/hazo_feedback/dist"` in CSS. Without it, styles don't compile.
3. **hazo_notify hard peer:** Not optional (vs. other packages where it's optional).
4. **IP extraction collision:** `hazo_auth/components/layouts/shared` exports a DIFFERENT, client-side `async get_client_ip()` with no args. Always use `hazo_auth/server-lib`.
5. **Anon ID async:** `ensure_anon_id(request)` is async single-arg. Don't confuse with other packages' patterns.
6. **SQLite TEXT columns for JSON:** Use TEXT not JSONB; no casting needed on read.
7. **Breadcrumb ring is client-side only:** Serialized fresh at each submit. No persistence across page reloads.
8. **Consumer context dedupe:** Multiple registrations with same key overwrite; later registrations win.
9. **Tiptap image pasting:** Images stored as blobs in-memory; not sent to server until form submit. If submission fails, blobs are lost.

## See Also

- `design/hazo_feedback_v1_plan.md` — comprehensive implementation plan with 28 grilled decisions
- `SETUP_CHECKLIST.md` — step-by-step setup for consuming apps
- `README.md` — public API and feature docs
