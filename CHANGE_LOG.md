# Changelog

All notable changes to `hazo_feedback` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.2] — 2026-05-26

### Changed
- `FeedbackWidget` trigger button now defaults to icon-only (minimized) mode with a smooth hover-expand animation that reveals the label text. Consumers who prefer the always-expanded style should pass `minimized={false}`.

---

## [2.1.1] - 2026-05-21

### Added
- **`ReplyComposer` component** — exported from `hazo_feedback/client`. Wraps `FeedbackBodyEditor` (Tiptap) + `AttachmentTray` into a self-resetting send form. Admin ConversationTab and user-facing `FeedbackThread` now share this composer, giving replies the same rich-text + screenshot-paste + file-upload experience as the main submission widget.
- **Thread attachment endpoint** — new `GET /thread/:refId/attachment/:attachmentId` route; accessible to both the submitter and admins. Verifies the attachment belongs to an event on the requested submission before serving the file. Inline images in `FeedbackThread` are now rewritten to this endpoint instead of the admin-only endpoint.

### Fixed
- **Admin attachment 403 on reply images** — `GET /admin/attachment/:id` now resolves the owning submission via `event_id` when `submission_id` is `null` (event-anchored reply attachments always have a null `submission_id`).
- **Category tab buttons trigger form submit** — added `type="button"` to all category tab buttons in the feedback widget to prevent inadvertent form submission.

---

## [2.1.0] - 2026-05-21

### Added
- **Reply threads (R5).** Two-way conversations between admins and submitters. New `<FeedbackThread />` user-facing component, new Conversation tab in admin, three new event types (`admin_reply`, `user_reply`, `visibility_changed`). Notifications via `hazo_notify` v5 `dispatch()` — in-app inbox always on, email per-direction config-gated.
- **Public voting (R2).** New `<PublicFeatureBoard />` component, `is_public` toggle on feature submissions, `hazo_feedback_votes` table, per-user toggle endpoint, admin Voters tab.
- New server options: `threadUrlBuilder(refId, submissionId)`, `listAdminsForBroadcast()`.
- New config keys (default `true`): `[notify] reply_email_to_user_enabled`, `[notify] reply_email_to_admin_enabled`.
- Email templates: `feedback_admin_reply_to_user`, `feedback_user_reply_to_admin`.

### Changed
- **Peer dep `hazo_notify` bumped to `^5.0.0`.** v3 `send_template_email` removed in favor of `dispatch()` channel-pluggable architecture. Consumers must run hazo_notify v5 migrations (`005`/`006`/`007`) and have a worker process flushing the inbox.
- `send_acknowledgement` is now asynchronous (queued via `dispatch()`); the consumer's hazo_notify worker flushes it.
- `hazo_feedback_attachments.submission_id` is now nullable; new `event_id` column lets attachments anchor to reply events. XOR `CHECK` constraint enforces exactly one owner.
- `hazo_feedback_events` gains `body_html` and `body_text` columns; existing rows have `NULL` values (no backfill required).

### Migration
- Run `migrations/002_voting_and_replies.sql` against the consumer's database.
- Re-call `sync_system_templates(hazo_feedback_template_manifest, ...)` at consumer boot so the two new templates land in `hazo_notify_templates`.
- Provide `threadUrlBuilder` (recommended) and `listAdminsForBroadcast` to `createFeedbackServer({ ... })`.

### Out of scope (deferred)
- Anon-submitter reply paths.
- `admin_comment` (internal-note) UI — the endpoint exists, no UI surface added.
- Integrations (Linear/GitHub/Jira/Slack/Discord).
- Search + bulk admin operations.

## [2.0.0] - 2026-05-14

### Breaking changes

- **`useCopyToClipboard` returns a tuple, not an object.** New shape is `const [state, copy] = useCopyToClipboard()` (was: `const { state, copy } = useCopyToClipboard()`). Update any destructuring at consumer call sites.
- **Acknowledgement email template renamed.** The `template_name` is now `feedback_acknowledgement` (was: `hazo_feedback_acknowledgement`). Consumers MUST re-sync `sync_system_templates([...hazo_feedback_template_manifest], options)` so the renamed template is registered in `hazo_notify`; the old template will not be sent.
- **`CopyPromptButton` removed from public API.** Replaced by the new `PromptAccordion`, which is rendered inline at the bottom of `SubmissionDetail`. No separate copy-prompt component is exported — admins now expand the AI prompt drawer from within the detail view.
- **`SystemTemplateManifest` entries use new field names** to match `hazo_notify@^3.1.0`:
  - `email_subject` → managed by `hazo_notify` template_label/category, no explicit `email_subject` on the manifest entry
  - `email_html` → `html`
  - `email_text` → `text`
  - `context_variables` → `variables`
  - New required `template_label` and `category` fields
  - Each variable definition has `variable_name` and `variable_description` (unchanged from 1.0)
  - `send_template_email` payload field `context_variables` → `variables`, plus new optional `from_name` and `scope_id` parameters
- **Admin search narrowed to `ref_id` only.** The list endpoint and admin UI now match `ref_id` via ILIKE; previous full-text matching across `subject`, `body_text`, `user_name_snapshot`, and `user_email_snapshot` is removed. The narrower scope keeps the index hot and avoids surprises on large tables.
- **Admin UI filter set reduced to status + search.** Priority and category filter pickers were removed from the admin list page; the underlying `list_submissions` service still accepts `priority` and `category` query params for programmatic callers.

### Added

- **`PromptAccordion`** — bottom-anchored collapsible drawer on the admin detail view. Lazy-fetches the AI prompt on first expand, displays character count, shows copy state (`idle`/`copied`/`failed`) inline, and supports retry on fetch error. Replaces the previous modal-fallback Copy button.
- **`ImageLightbox`** — fullscreen preview of inline-pasted images on the admin Overview tab. Closes on Esc, backdrop click, or X button; locks body scroll while open.
- **`SafeBodyHtml` rewriter** — admin Overview tab rewrites inline `<img data-feedback-inline-id="…">` elements to authenticated admin attachment URLs, capped at 360×240 thumbnails for in-line display. Clicking a thumbnail opens the `ImageLightbox`.
- **Chip-styled status/priority dropdowns** — the SubmissionDetail header now uses inline `<select>` controls overlaid on color-coded chips, replacing the prior row of separate action buttons. Status and priority changes are persisted immediately and write to the events audit log.
- **Extended acknowledgement template variables** — the `feedback_acknowledgement` template manifest now exposes `name`, `subject`, `category`, and `submitted_at` in addition to `ref_id`, allowing richer copy in consuming apps' email designs.

### Fixed

- Admin search no longer scans `body_text` and `subject`, eliminating accidental full-table scans on large inboxes.
- Inline image attachments uploaded via Tiptap paste now render correctly in the admin view (previously the `data-feedback-inline-id` mapping was not wired up on the admin side).

### Internal

- `dist/` is rebuilt from the current `src/` (the 1.0.0 dist was built before the prompt-accordion, lightbox, and chip-select work landed).
- The package is now versioned under `git` at `https://github.com/pub12/hazo_feedback.git`.

### Migration guide

To upgrade from 1.0.0:

1. **Update destructuring** for `useCopyToClipboard`:
   ```typescript
   // before
   const { state, copy } = useCopyToClipboard();
   // after
   const [state, copy] = useCopyToClipboard();
   ```
2. **Re-sync templates** in your bootstrap/instrumentation file so the renamed `feedback_acknowledgement` template is registered:
   ```typescript
   await sync_system_templates(
     [...hazo_auth_template_manifest, ...hazo_feedback_template_manifest],
     { getHazoConnect: () => notifyConnect },
   );
   ```
3. **Remove any imports of `CopyPromptButton`** — the prompt UI is now part of `<SubmissionDetail>` via `<PromptAccordion>`. Nothing else to wire up.
4. **Drop any reliance on multi-field admin search** — if your tooling expected ILIKE on `subject`/`body_text`/user fields, query by exact `ref_id` instead (or fetch and filter client-side).
5. **Drop priority/category filter UI assumptions** — those filters now live in the URL/query API only. If you need UI pickers, add them in your consuming app or wait for the v2.1 enhancement.

## [1.0.0] - 2026-05-14

### Added

- **Drop-in feedback widget** (`FeedbackProvider` + `FeedbackWidget`) — floating button on desktop, mobile drawer on smaller screens
- **Four feedback categories** — bug, feature, general, praise (configurable, extensible in v1.1)
- **Auto-screenshot** — `html2canvas` lazy-loaded on dialog open, editable via draw/annotate (annotation deferred to v1.1 pending markerjs3 license resolution)
- **Context capture**:
  - Page URL and Next.js route pattern extraction
  - Viewport dimensions (width, height)
  - User agent and app version
  - Consumer-registered context via `useRegisterFeedbackContext` hook (module-scope registry, no Zustand dep)
  - Console error ring buffer (last ~20 errors, typed capture)
  - Breadcrumb ring buffer (last ~50 entries, serialized at submit time not emit time)
- **Anonymous submit** — via `ensure_anon_id` cookie from `hazo_auth/server-lib`, session tracking
- **Authenticated submit** — user ID, name, and email snapshotted at time of submission
- **Rich text editor** — custom lightweight `FeedbackBodyEditor` component using Tiptap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`)
- **Inline image paste** — Tiptap-powered image pasting with UUID-keyed blob storage, embedded in HTML via `data-feedback-inline-id` attribute
- **Attachments**:
  - Auto-screenshot capture (disabled by default, opt-in via dialog checkbox)
  - Manual file upload (drag-drop + click to select)
  - Image paste from clipboard
  - Client-side ZIP download of all attachments (jszip, lazy-loaded)
  - Pattern X orphan cleanup — uploaded files cleaned up on submission failure via `Promise.allSettled(deleteFile())` calls
- **Rate limiting** — in-memory token bucket (process-local, no Redis):
  - Per-anonymous-session limit (configurable: 10 per 1min default)
  - Per-authenticated-user limit (configurable: 50 per 1hr default)
  - Per-IP limit (configurable: 100 per 1min default)
  - Returned as HTTP 429 with `Retry-After` header
- **PII redaction**:
  - Regex patterns on top-level keys + one-level-deep keys in consumer context
  - Same patterns applied to breadcrumb `data` payloads
  - Key names (not values) stored in `consumer_context_redacted` array for admin transparency
  - Patterns include: email, password, token, key, secret, ssn, credit, card, phone, etc.
- **HTML sanitization** — `isomorphic-dompurify` with:
  - Allowlist: `b/strong/i/em/u/a/p/br/ul/ol/li/code/pre/blockquote/h2/h3/img`
  - `uponSanitizeElement` hook rewrites `<img src>` via `inline_id` lookup; removes inline images not found in attachments
  - External image blocking (no uncontrolled https:// images)
- **Ref ID system**:
  - Crockford base32 encoding of UUID bytes
  - Format: `{app_id}-{base32(first-4-bytes)}` e.g., `myapp-AB12345`
  - Three-attempt collision retry (bytes 4–8, then 8–12)
  - Unique constraint in database
  - User-visible in success dialog and email acknowledgement
- **Admin inbox**:
  - List view with pagination, filters (status, priority, category), search (ILIKE across ref_id, subject, body_text, user name/email)
  - Detail view with tabs: Overview, Context, Attachments, Activity
  - **Overview tab** — metadata display, action buttons for priority/status/export/zip-download
  - **Context tab** — consumer context (redacted, key names highlighted), breadcrumbs (serialized), console errors
  - **Attachments tab** — images with preview, files with download, copy/delete actions
  - **Activity tab** — event log (status changes, priority changes, comment adds, prompt exports)
- **Status workflow** — new → triaged → in_progress → resolved/wont_fix (free-form multi-select, no forced linear progression)
- **Priority levels** — low/medium/high/urgent (admin-settable, persisted in `hazo_feedback_events` as audit trail)
- **Admin comments** — threaded conversation on each submission (timestamps, actor attribution, no external notification)
- **AI prompt export** — one-click Markdown markdown optimized for Claude Code:
  - Includes ref_id, category, priority, submission details
  - Full context (consumer state, breadcrumbs, errors)
  - Attachments listed with file info
  - Copy to clipboard with fallback dialog (built-in `useCopyToClipboard` hook)
- **Acknowledgement email** — via `hazo_notify@^3.1.0`:
  - Template manifest (`hazo_feedback_template_manifest: SystemTemplateManifest[]`)
  - Handlebars template with `{{ref_id}}` variable
  - Sent immediately after submission (async, doesn't block response)
  - Email address sourced from:
    - Authenticated user's `user_email_snapshot`
    - OR form submission email field for anon users
  - Configurable subject, from address, sender name
  - Graceful no-op if `hazo_notify` not configured
- **Template manifest registration** — `sync_system_templates([...hazo_auth_template_manifest, ...hazo_feedback_template_manifest], options)`
- **Database schema** — three tables with dual-database support (Postgres active + SQLite commented):
  - `hazo_feedback_submissions` — main feedback records, ref_id unique, app_id indexed
  - `hazo_feedback_attachments` — file metadata, CASCADE delete with submissions
  - `hazo_feedback_events` — audit trail (status/priority changes, comments, exports)
- **Admin permission provisioning** — `scripts/provision_feedback_admin.sql` template (one-shot per app_id):
  - Creates `hazo_feedback:{appId}:admin` permission
  - Creates `feedback_admin_{appId}` role
  - Assigns permission to role, role to user
- **Mobile responsive** — Dialog on desktop (≥768px), Drawer on mobile (<768px), uses `hazo_ui` primitives
- **Internationalization** — `translate` prop on `FeedbackProvider` for custom string localization; exports `FEEDBACK_STRINGS` with English defaults
- **Imperative breadcrumb API** — `feedback.breadcrumb(type, data)` exported from `hazo_feedback/client`
- **Consumer context registration** — `useRegisterFeedbackContext(key, data)` hook for registering app state; merged, deduplicated, and redacted at submit time
- **Clipboard utility** — `useCopyToClipboard` hook for ref-ID and prompt copying with fallback dialog
- **Privacy disclosure** — inline privacy notice about data collection, redaction, and retention
- **Success panel** — post-submit confirmation with ref_id, acknowledgement email notice, close button
- **Test-app** — five-page sidebar layout (Home, Authed Submit, Anon Submit, Admin, Settings) for local development and verification
- **Configuration** — INI file format via `hazo_config`:
  - `[app]` section: `app_id`, optional `app_version`
  - `[admin]` section: `admin_scope`
  - `[rate_limit]` section: per-anon, per-user, per-ip settings
  - `[attachments]` section: max count, per-file bytes, total bytes
  - `[notify]` section: email enable/disable, from address, subject template
- **TypeScript** — complete type exports for server and client integration

### Technical Notes

- **Critical Vercel requirement:** `export const runtime = 'nodejs'` on the catch-all route (step 11, SETUP_CHECKLIST.md). Without it, edge runtime strips multipart bodies.
- **Tailwind v4 requirement:** `@source "../node_modules/hazo_feedback/dist"` in CSS entry (step 10, SETUP_CHECKLIST.md). Without it, JIT won't compile hazo_feedback classes.
- **Pattern X (orphan cleanup):** Uploaded files cleaned up on error via `Promise.allSettled(deleteFile())` before re-throw, following hazo_files lack of transaction support.
- **Three-attempt ref collision retry:** First attempt uses bytes 0–4; second uses bytes 4–8; third uses bytes 8–12. Collision failure is HTTP 500 (fail loud).
- **Server-side breadcrumb serialization:** Ring buffer emits on-demand; serialization happens at submit time (not per-emit) for performance.
- **Anon session ID:** Stored plaintext in DB (hashing adds complexity with no security boundary gain; DB read = full compromise anyway).
- **consumer_context_redacted storage:** TEXT NULL column storing JSON-encoded string array (not Postgres TEXT[] type) for dual-DB compatibility.
- **Tiptap wrapper:** Custom lightweight `FeedbackBodyEditor` component (not `HazoUiRte`) because the latter is sealed for email-template use and doesn't expose `extensions` prop.
- **Permission gate:** Uses `required_permissions: ['hazo_feedback:{appId}:admin']` path (HRBAC scope_id doesn't apply in v1; super-admin deferred).
- **hazo_notify hard peer:** Not optional. Marked as required in `peerDependenciesMeta`.
- **IP extraction:** Uses `get_client_ip(request)` from `hazo_auth/server-lib` (not client-side async version from `hazo_auth/components/layouts/shared`).
- **Anon ID:** Uses `ensure_anon_id(request)` from `hazo_auth/server-lib` (single arg, async).

---

## Deferral Ledger

Features intentionally NOT included in v1.0 (planned for v1.1+):

1. **Annotation tool** — markerjs3 uses Linkware License (requires attribution UI); no MIT alternative found of comparable scope. Deferred pending license resolution or alternative tool evaluation.
2. **Cross-app super-admin** — single admin view across all apps. Deferred: HRBAC scope-based filtering complexity.
3. **Webhook notifications** — POST webhook on new submission. Deferred: delivery/retry/auth complexity.
4. **Bulk actions** — select multiple submissions, change status/priority. Deferred: checkbox UI polish.
5. **Assignment/ownership** — assign feedback to team members. Deferred: hazo_auth role-based assignment API not yet built.
6. **Custom fields** — app-defined submission fields beyond standard set. Deferred: schema migration/versioning complexity.
7. **AI-powered categorization** — auto-categorize/tag submissions. Deferred: LLM cost/latency tradeoff; hazo_llm_api integration pending.
8. **Survey mode** — structured form (not free-text dialog). Deferred: UX/design pending.
9. **Sentiment analysis** — flag praise/complaints for quick triage. Deferred: hazo_llm_api sentiment endpoint not yet available.
10. **Duplicate detection** — flag similar submissions. Deferred: semantic search/embedding complexity.
11. **Rate limiting per consumer** — per-registered-context limits. Deferred: implementation approach pending.
12. **Privacy mode** — redact all context, PII, errors with confirmation. Deferred: UX confirmation flow design.
13. **Dark mode** — theme switching. Deferred: hazo_ui Dark mode support TBD.

See `design/hazo_feedback_v1_plan.md` §12 for full rationale.

---

## Version Summary

**v1.0.0** is a complete, production-ready feedback collection system suitable for embedded use in any hazo app. It provides user-to-admin workflow covering submission, context capture, admin triage, and acknowledgement. The deferral ledger above outlines features being planned for future minors; no known issues or regressions are expected in live use.
