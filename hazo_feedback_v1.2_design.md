# hazo_feedback v1.2 — Design

**Date:** 2026-05-10
**Status:** Implementation-ready
**Supersedes:** v1.1 (2026-05-10), v1 (2026-05-09)
**Scope:** Drop-in feedback widget npm package for hazo apps. Friends-launch ready. Generic-isation passes happen later.

---

## Changelog from v1.1

Additions from a competitive scan of Usersnap, Userback, Userpilot, Featurebase, Canny, Sleekplan, Gleap, Apple Feedback Assistant, Qt bug reporting, and the Uservoice "feedback on feedback tools" forum. Most additions are small; the substantial work is sizing the §29 ledger correctly so future-self knows what was *consciously* deferred vs. forgotten.

- **§2 non-goals:** explicit list of categories deliberately not in scope (voting, public roadmap, NPS/CSAT, heatmaps, sentiment analysis, changelog widget).
- **§3 decisions:** rows 26–31 added for the v1.2 changes.
- **§5 schema:** three new columns — `source TEXT NULL`, `reproducibility TEXT NULL`, `ref_id TEXT NOT NULL`.
- **§5:** `consumer_context_redacted` flag column added (TEXT[] of redacted top-level keys).
- **§6a:** `<FeedbackProvider>` gains optional `source` prop.
- **§6c / §9:** regex-based PII redaction safety net documented; runs after consumer's `redactContext` hook.
- **§7:** reproducibility tri-state in the "More detail" disclosure; "Thanks" flip shows ref ID for the user to copy.
- **§9:** acknowledgement email fired post-submit when an email address is known (authed user OR anon submitter who provided one); uses optional `hazo_notify` peer.
- **§11 §29 ledger:** three new rows for deferred features (duplicate-detection, session replay, status-change notifications).

---

## 1. Goals

- Drop-in widget that any hazo app mounts and gets contextual feedback collection out of the box.
- Capture enough context (page, screenshot, console errors, breadcrumbs, consumer-registered state) that a developer can act on a bug report without having to ping the user back.
- Admin can view submissions, change status, comment, and export a single-click "AI prompt" optimised for Claude Code.
- Anonymous and authenticated users can both submit; admin reads are gated by a hazo_auth scope.
- Submitters get an acknowledgement (in-dialog ref ID + email when known) so feedback never feels submitted-into-a-void.

## 2. Non-goals (explicit deferrals)

These are deliberately *not* part of hazo_feedback. Some are deferred (see §11 §29 ledger); others belong in entirely different packages.

**Deferred (§29 ledger entries exist):**
- Bulk admin actions (multi-select status updates).
- Real-time admin updates (no SSE / websocket; admin clicks refresh).
- Captcha / spam protection beyond rate-limit + manual `marked_spam` flag.
- Distributed (cross-process) rate limiting — in-memory only in v1.
- Screen-recording / network-request logging (rrweb-style replay).
- Submitter-side "view my past submissions" page (relies on signed URLs not yet built).
- Per-tree (Kinstripe-specific) admin scoping — per-app is the abstraction.
- Duplicate-detection in admin (embedding-based "this looks similar to #X").
- Email/web push notifications when admin updates a submission's status.

**Out of scope entirely (different product categories — would belong in `hazo_roadmap`, `hazo_surveys`, `hazo_changelog`, `hazo_analytics`, etc., not here):**
- **Voting / public roadmap / community feature-request boards** — that's Featurebase / Canny / Sleekplan territory.
- **NPS / CSAT / micro-surveys** — that's Survicate / Zonka / Delighted territory.
- **Heatmaps / behaviour analytics** — that's Hotjar territory.
- **AI-summarised triage / sentiment analysis** — the existing `category` pill captures 90% of the value at zero cost; the AI-export flow IS the AI integration story. No need for in-tool LLM analysis.
- **"What's new" / changelog widget** — companion product to feedback widgets (close-the-loop announcement system). Different package.

## 3. Decisions log

| #   | Decision                                                                                  | Reason                                                                                |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Real `hazo_feedback` package, full scope                                                  | Reusable across hazo apps from day one                                                |
| 2   | Per-app admin (`app_id` in schema)                                                        | Multi-tenant from day one without per-tree complexity                                 |
| 3   | Auto-capture: page + screenshot + console errors + breadcrumbs                            | Best signal-to-cost; network log deferred                                             |
| 4   | Single `<FeedbackWidget>` (all-in-one)                                                    | Simpler API surface for v1; primitives extraction later                               |
| 5   | hazo_auth is a hard peer                                                                  | Always available in hazo apps; widget still supports anonymous submission             |
| 6   | `html2canvas` lazy-imported and bundled                                                   | Single biggest dep; loads only when dialog opens                                      |
| 7   | Single `submissions` table for anon + authed                                              | One inbox; rate-limit + filter handle abuse                                           |
| 8   | Admin scope via hazo_auth roles (`hazo_feedback:{appId}:admin`)                           | Reuses existing role machinery                                                        |
| 9   | Atom-style internal store for `useRegisterFeedbackContext`                                | Write-only; doesn't re-render canvas on registration                                  |
| 10  | Errors captured silently, opt-out via prop                                                | Default-on with `captureErrors={false}` escape hatch                                  |
| 11  | Tiptap-pasted images inlined (uploaded on submit, src rewritten)                          | Keeps body HTML small but inline UX is preserved                                      |
| 12  | Screen annotation included in v1 (markerjs3 or similar, lazy-imported)                    | Significantly raises bug-report quality                                               |
| 13  | Multipart atomic submit (no draft-then-finalize)                                          | No orphan-file cleanup machinery; single transaction                                  |
| 14  | `marked_spam` column added                                                                | Manual lever before captcha is needed                                                 |
| 15  | Two providers (authenticated `(app)/` + public)                                           | Capture feedback from waitlist / sign-up too                                          |
| 16  | Admin scope provisioned via SQL insert in v1                                              | One-shot for self; UI provisioning later                                              |
| 17  | AI export: clipboard markdown + separate screenshot download                              | Lowest friction for paste-to-Claude-Code workflow                                     |
| 18  | `app_id` in `config/hazo_feedback_config.ini`, read server-side at boot                   | Matches established hazo_* convention; client gets it via provider prop from server   |
| 19  | Server stamps `app_id` authoritatively on every submission                                | Client-supplied app_id is decorative; prevents misconfigured-deploy data corruption   |
| 20  | Anon session ID via `hazo_auth.ensure_anon_id` (added in hazo_auth ≥ 5.2.0)               | Cross-cutting concern belongs in hazo_auth; cookie + machinery already there          |
| 21  | AI prompt is LLM-directive style with category-suffixed call to action                    | Prompt is read by Claude Code, not a human; directive language is more useful         |
| 22  | Zip-all-attachments button included in v1 admin                                           | Promoted out of deferred specifically because it serves the AI export flow            |
| 23  | Hook renamed `useFeedbackContext` → `useRegisterFeedbackContext`                          | Original name reads as consumer-of-context; rename makes producer semantics clear     |
| 24  | Submitter does NOT see rendered body post-submit; pre-submit attachment tray is the proof | Avoids signed-URL machinery in v1; pre-submit "✓ ready to send" tray builds confidence |
| 25  | External `https://` `<img>` blocked in body HTML                                          | Tracking-pixel / IP-leak vector to admins; only attachment-backed images allowed       |
| 26  | Acknowledgement email fired on successful submit when email is known                      | "Submitting into a void feels broken" — universal feedback-widget complaint            |
| 27  | Short ref ID (`{app_id}-{base32 of first 4 bytes of UUID}`) shown to user post-submit     | Lets user quote the ref later; cheap and high-signal                                  |
| 28  | Default regex-based PII redaction pass on `consumer_context` and breadcrumbs              | Safety net for consumer mistakes; key names like "password" / "token" auto-redacted   |
| 29  | Optional `source` column to track which provider instance a submission came from           | Future-proofing for one-app-multiple-providers; trivial cost now, useful later        |
| 30  | Optional reproducibility tri-state field (`always` / `sometimes` / `once`)                 | Apple/Qt bug-reporting docs both emphasise this is the single biggest triage signal    |
| 31  | Status-change notifications (email/push to submitter when status moves) deferred           | Close-the-loop matters but is significant scope; v1 has acknowledgement only           |

---

## 4. Architecture overview

### Package layout

```
~/Local/01.code/00.lib/hazo_feedback/
├── package.json                 # peer deps (see below)
├── config/
│   └── hazo_feedback_config.ini # consumer creates this in their app's config/ dir; package ships an example
├── src/
│   ├── index.ts                 # server entry — createFeedbackServer({ db, files, auth, … })
│   ├── client.ts                # client entry — Provider, Widget, AdminPage, useRegisterFeedbackContext, breadcrumb
│   ├── widget/                  # FeedbackWidget — trigger, dialog, screenshot, breadcrumb buffer, error trap, annotator
│   ├── admin/                   # FeedbackAdminPage — list, detail tabs, AI export
│   ├── server/                  # internal request router; submit + admin handlers
│   ├── db/schema.ts             # Drizzle table definitions
│   ├── prompt/                  # markdown prompt builder
│   ├── config/                  # ini reader, schema validation, boot-time singleton
│   ├── redact/                  # default PII redaction pass (regex-based)
│   ├── ref/                     # ref ID generator + decoder
│   └── types.ts
├── migrations/001_init.sql      # DDL + indexes + policies
├── test-app/                    # standalone Next.js demo (covers BOTH authed and anon flows)
└── README.md, CLAUDE.md, AGENTS.md, SETUP_CHECKLIST.md, CHANGE_LOG.md
```

### Two entry points

- `hazo_feedback` — server-only — factory + Drizzle schema
- `hazo_feedback/client` — client-safe — components + hooks + breadcrumb api

### Configuration: `hazo_feedback_config.ini`

Consumer ships `config/hazo_feedback_config.ini` in their app:

```ini
[app]
app_id = kinstripe
app_version = ${NEXT_PUBLIC_APP_VERSION}

[admin]
admin_scope = hazo_feedback:kinstripe:admin

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
acknowledge_email_from = feedback@kinstripe.app
acknowledge_email_subject = We received your feedback (%REF_ID%)
```

**Read mechanics:**

- File is read **once at server boot** by `src/config/load_config.ts`, cached in module-scope, returned as a typed object.
- Reader runs only on the server (Node FS access). Edge runtimes are unsupported for the factory; route handlers run on Node.
- Consumer's server-component layout reads the cached config and passes `appId` (and any other client-relevant fields) to `<FeedbackProvider>` via props. Client never touches the file.
- `createFeedbackServer()` factory pulls from the same cached config; explicit constructor arguments override the file (useful for test-app).
- File path: `<consumer-app>/config/hazo_feedback_config.ini`. Path is configurable via `HAZO_FEEDBACK_CONFIG_PATH` env var for non-standard layouts.

### Peer-dep posture

- **Hard peers:** `react ^19`, `next ^16`, `hazo_ui`, `hazo_connect`, `hazo_files`, `hazo_auth ^5.2.0`
- **Soft peer (`peerDependenciesMeta` optional):** `hazo_logs`, `hazo_notify`, `next-intl`
- **Bundled:** `html2canvas` (lazy-imported), screen-annotation lib (lazy-imported), `turndown` (HTML → markdown for prompt export), `jszip` (lazy-imported on the admin page for the zip-all-attachments button)

`hazo_notify` becomes optional-but-recommended in v1.2: when present, acknowledgement emails fire on submit. When absent, the email step is a no-op and a debug log line is emitted.

i18n: package ships English defaults; consumer passes `translate?: (key) => string` to hook in next-intl or any other i18n library.

### Runtime data flow

1. Consumer wraps app in `<FeedbackProvider appId="kinstripe" user={…} apiBase="/api/feedback" source="app">`.
2. Consumer mounts `<FeedbackWidget />` once (floating bottom-right by default).
3. Pages call `useRegisterFeedbackContext({ … })` — keys merge into a live map.
4. Code paths emit `feedback.breadcrumb('opened story X')` — ring buffer of last 50.
5. Click trigger → dialog mount → hide FAB + dialog → lazy-import `html2canvas` → capture → restore → blob.
6. User fills fields, optionally annotates screenshot, drops/pastes attachments, submits.
7. POST `/api/feedback/submit` (multipart) — handler resolves anon_session_id via `ensure_anon_id` if unauthenticated, runs PII redaction, stores submission + attachments, sanitizes body HTML, rewrites inline `<img>` src to attachment URLs, fires acknowledgement email if enabled and email is known.
8. Response includes `{ submissionId, refId }` — dialog "Thanks" flip shows the ref ID with a copy button.
9. `<FeedbackAdminPage />` queries `/api/feedback/admin/*`, scoped by `app_id` + admin scope.
10. Admin clicks **Copy prompt** → markdown copied; **Download screenshot** → PNG downloaded; **Download all attachments** → zip downloaded.

---

## 5. Data model

Three tables, all prefixed `hazo_feedback_*`.

### `hazo_feedback_submissions`

| Column                        | Type                               | Notes                                                                                                |
| ----------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                          | UUID PK                            | gen_random_uuid()                                                                                    |
| `ref_id`                      | TEXT NOT NULL UNIQUE               | Format: `{app_id}-{base32 of first 4 bytes of id}` (e.g. `kinstripe-A47B`); generated server-side    |
| `app_id`                      | TEXT NOT NULL                      | tenant key — server stamps from config; ignores client claim                                         |
| `source`                      | TEXT NULL                          | optional provider-instance label (e.g. `'app'`, `'public'`, `'admin'`); set by `<FeedbackProvider>`  |
| `user_id`                     | UUID NULL                          | FK to `hazo_users.id`; NULL when anonymous                                                           |
| `user_name_snapshot`          | TEXT NULL                          | captured at submit                                                                                   |
| `user_email_snapshot`         | TEXT NULL                          | captured at submit                                                                                   |
| `anon_session_id`             | TEXT NULL                          | from `hazo_auth.ensure_anon_id`; UUID v4 in `hazo_auth_anon_id` cookie                               |
| `category`                    | TEXT NOT NULL DEFAULT `'general'`  | bug \| feature \| general \| praise                                                                  |
| `subject`                     | TEXT NULL                          | max 200 chars                                                                                        |
| `problem`                     | TEXT NULL                          | optional structured field                                                                            |
| `intent`                      | TEXT NULL                          | optional structured field                                                                            |
| `expected_output`             | TEXT NULL                          | optional structured field                                                                            |
| `reproducibility`             | TEXT NULL                          | optional: `always` \| `sometimes` \| `once`                                                          |
| `body_html`                   | TEXT NULL                          | sanitized Tiptap output                                                                              |
| `body_text`                   | TEXT NULL                          | extracted plain text (search)                                                                        |
| `status`                      | TEXT NOT NULL DEFAULT `'new'`      | new \| triaged \| in_progress \| resolved \| wont_fix                                                |
| `priority`                    | TEXT NULL                          | low \| medium \| high \| urgent                                                                      |
| `marked_spam`                 | BOOLEAN NOT NULL DEFAULT FALSE     | manual abuse lever                                                                                   |
| `url`                         | TEXT NOT NULL                      | full URL at submit                                                                                   |
| `route`                       | TEXT NULL                          | Next.js route pattern                                                                                |
| `viewport_w`                  | INT NULL                           |                                                                                                      |
| `viewport_h`                  | INT NULL                           |                                                                                                      |
| `user_agent`                  | TEXT NULL                          |                                                                                                      |
| `app_version`                 | TEXT NULL                          | from provider prop                                                                                   |
| `consumer_context`            | JSONB NULL                         | merged map from `useRegisterFeedbackContext`; server-capped at 64KB; PII-redacted                    |
| `consumer_context_redacted`   | TEXT[] NULL                        | top-level keys whose values were stripped by the default PII redaction pass                          |
| `recent_errors`               | JSONB NULL                         | last ~20 caught errors                                                                               |
| `breadcrumbs`                 | JSONB NULL                         | last ~50 breadcrumb entries; per-entry payload PII-redacted                                          |
| `screenshot_file_id`          | TEXT NULL                          | hazo_files virtualPath of the auto/annotated screenshot                                              |
| `attachment_count`            | INT NOT NULL DEFAULT 0             | denormalized counter                                                                                 |
| `acknowledge_email_sent_at`   | TIMESTAMPTZ NULL                   | when the acknowledgement email was successfully dispatched (NULL if no email known or hazo_notify absent) |
| `created_at`                  | TIMESTAMPTZ NOT NULL DEFAULT now() |                                                                                                      |
| `updated_at`                  | TIMESTAMPTZ NOT NULL DEFAULT now() |                                                                                                      |
| `resolved_at`                 | TIMESTAMPTZ NULL                   | set when status moves to `resolved` OR `wont_fix`; cleared on transition back                        |

**Indexes:** `(app_id, created_at DESC)`, `(app_id, status)`, `(user_id)`, `(anon_session_id)`, `(ref_id)` UNIQUE.

### `hazo_feedback_attachments`

| Column          | Type                               | Notes                                                                   |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `id`            | UUID PK                            |                                                                         |
| `submission_id` | UUID NOT NULL FK ON DELETE CASCADE |                                                                         |
| `inline_id`     | TEXT NULL                          | matches `data-feedback-inline-id` in body_html for pasted Tiptap images |
| `file_id`       | TEXT NOT NULL                      | hazo_files virtualPath                                                  |
| `mime_type`     | TEXT NOT NULL                      |                                                                         |
| `size_bytes`    | BIGINT NOT NULL                    |                                                                         |
| `kind`          | TEXT NOT NULL                      | screenshot \| pasted_image \| uploaded_file                             |
| `created_at`    | TIMESTAMPTZ NOT NULL DEFAULT now() |                                                                         |

The auto-screenshot is denormalized to `submissions.screenshot_file_id` AND a row here with `kind='screenshot'` (uniform attachment iteration on the admin side).

### `hazo_feedback_events`

| Column          | Type                               | Notes                                                                  |
| --------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `id`            | UUID PK                            |                                                                        |
| `submission_id` | UUID NOT NULL FK ON DELETE CASCADE |                                                                        |
| `actor_id`      | UUID NULL FK to hazo_users.id      |                                                                        |
| `event_type`    | TEXT NOT NULL                      | status_changed \| priority_changed \| comment_added \| exported_prompt |
| `from_value`    | TEXT NULL                          |                                                                        |
| `to_value`      | TEXT NULL                          |                                                                        |
| `comment`       | TEXT NULL                          |                                                                        |
| `created_at`    | TIMESTAMPTZ NOT NULL DEFAULT now() |                                                                        |

Comments and status changes share one timeline — single linear "what happened to this submission" view.

### Ref ID generation

- Server-side, at INSERT time.
- Take first 4 bytes of `id` (UUID), base32-encode (Crockford's alphabet — no `I`, `L`, `O`, `U`), uppercase, no padding → 7 chars.
- Prefix with `{app_id}-`. Example for `app_id=kinstripe`: `kinstripe-A47B5R3`.
- UNIQUE constraint guards against the rare collision; on conflict, retry by taking bytes 4–8 of UUID. Two retries max; if still colliding, fail the insert (cosmically improbable but fail-loud beats silently-broken).
- Stored explicitly in `ref_id` column rather than computed-on-read so the admin search index covers it directly.

### Access control

**v1 (primary gate):** route handlers enforce auth via `check_user_scope_access` (TS) before issuing any DB query. The package's DB connection runs as a privileged role that can read/write all rows. This is how Kinstripe's existing routes (e.g. `/api/files/[...path]`) already work — same pattern.

**v1 (defense-in-depth):** migration ships RLS policies, but they're permissive for the package's role and deny direct `anon`/`authenticated` access entirely. No SQL-level scope-check helper in v1 — the admin scope is checked exclusively at the route layer.

**Future (deferred):** when consumers want to query the tables directly via PostgREST or another ORM bypassing the package, replace the permissive policy with a SQL helper that reads hazo_auth scope grants. Out of scope for v1.

For Kinstripe v1, only your account gets `hazo_feedback:kinstripe:admin`.

### Schema location

Package ships `migrations/001_init.sql`. Kinstripe copies it into `docs/db_setup/060_hazo_feedback.sql` (next free number) so its bootstrap is idempotent and inspectable. File ends with `NOTIFY pgrst, 'reload schema';`.

---

## 6. Context capture model

Three independent layers.

### 6a. Provider-level (set once)

```tsx
<FeedbackProvider
  appId="kinstripe"             // sourced server-side from config/hazo_feedback_config.ini
  apiBase="/api/feedback"
  source="app"                  // optional; tags submissions with provider-instance label
  user={user /* { id, name, email } | null */}
  appVersion={process.env.NEXT_PUBLIC_APP_VERSION}
  translate={(k) => t(k)}
  trigger={{ placement: "bottom-right", offsetPx: { x: 24, y: 24 }, zIndex: 40 }}
  attachments={{
    accept: ["image/*", "application/pdf", ".txt", ".log"],
    maxBytesPerFile: 10 * 1024 * 1024,
    maxCount: 5,
  }}
  redactContext={(ctx) => sanitizeForPrivacy(ctx)} // optional; runs BEFORE the default PII pass
  captureErrors={true} // default
>
  {children}
  <FeedbackWidget />
</FeedbackProvider>
```

Anonymous: `user={null}`; widget renders name/email inputs in the dialog.

`source` is conventionally `'app'` for authenticated layouts, `'public'` for marketing/waitlist layouts, `'admin'` for admin-only views. Free-form string up to 32 chars.

### 6b. Per-page (call anywhere)

```tsx
useRegisterFeedbackContext({
  treeId,
  treeName,
  activeView,
  selectedPersonId,
});
```

- Internal: atom-style write-only store; component re-renders are NOT triggered by other registrations.
- Latest call wins per key. `undefined` clears a key.
- Unmounting clears the keys _that component contributed_.
- Values must be JSON-serialisable; dev warning on functions / DOM nodes.
- **Size guardrails:** in dev mode, a single registered value > 1KB after JSON.stringify emits `console.warn`. The merged map is server-capped at 64KB; oversize is truncated and a `consumer_context_truncated: true` flag is added.
- The merged map snapshots into the submission at click-submit time.

### 6c. Imperative breadcrumbs + auto-captured errors

```ts
import { feedback } from "hazo_feedback/client";
feedback.breadcrumb("opened-tree", { treeId });
```

- Ring buffer of 50.
- Per-breadcrumb payload capped at 2KB after JSON.stringify (truncated with `..."[truncated]"` suffix); dev warning on truncate.
- Errors: `window.onerror` and `unhandledrejection` listeners installed by `<FeedbackProvider>`; additive (calls previous handler if any).
- Last 20 errors retained: message, stack snippet (max 4KB), source URL, line/col, timestamp.
- Both attached to the submission as JSONB.
- `captureErrors={false}` opts out of error capture.

### 6d. PII redaction safety net (server-side)

Runs in `src/redact/` on every submission, **after** the consumer's optional `redactContext` hook. Two phases:

**Phase 1 — `consumer_context` redaction:**

For each top-level key in the merged context map, if the key name (case-insensitive) matches any of these regex patterns, the *value* is replaced with `"[redacted]"` and the key name is appended to `consumer_context_redacted`:

```
/password/i
/secret/i
/(api[-_]?)?token/i
/api[-_]?key/i
/credit[-_]?card/i
/\bccn\b/i
/\bcvv\b/i
/\bssn\b/i
/auth(orization)?/i
/bearer/i
/private[-_]?key/i
/session[-_]?id/i      # not the anon_session_id which is in its own column
```

Nested object keys are also walked one level deep with the same pattern; deeper nesting is left alone (consumer is expected to handle their own deep-nested structures via `redactContext`).

**Phase 2 — breadcrumb payload redaction:**

Same regex set applied to each breadcrumb entry's `data` payload. Redacted fields are replaced in-place; no separate flag column for breadcrumbs (the `[redacted]` value is its own marker).

**Override:** consumer's `redactContext` runs first and can short-circuit by returning `null` for a top-level key (which removes it entirely). The default pass is additive — it never un-redacts something the consumer redacted.

**No regex on free-text fields:** the `body_html`, `subject`, `problem`, `intent`, `expected_output` fields are NOT regex-redacted. If a user types their own SSN into the body, that's their choice. Default redaction is for *programmatic* leakage from consumer-registered context, which is the actual failure mode.

---

## 7. Dialog UX

### Trigger

- Floating action button, default bottom-right, 48px circular, brand primary.
- Configurable `trigger.placement`: `bottom-right | bottom-left | top-right | top-left | inline`.
- `inline` returns no FAB; consumer drops `<FeedbackTriggerButton />` wherever they want.
- `position: fixed`; `z-index: 40` (under Kinstripe's ViewsBar pill at 50).

### Open sequence (screenshot capture)

1. Click trigger → handler begins.
2. **Hide FAB + dialog**: FAB sets `visibility: hidden`; dialog is mounted with `visibility: hidden` (occupies no visual space; `html2canvas` skips it because of the visibility CSS property — no rendered content).
3. Lazy-import `html2canvas` and run on `document.body` → blob.
4. **Restore**: dialog → `visibility: visible`; FAB stays hidden while dialog is open (returns to visible on close).
5. While step 3 is running, attachment slot 1 in the now-visible dialog shows "📷 Capturing screenshot…".
6. On capture error, slot becomes a "Couldn't auto-capture — drop one yourself" hint. Submission still works.

The hide-and-capture trick relies on `html2canvas`'s default behaviour of skipping `visibility: hidden` elements. Verified during implementation — fallback if it captures the dialog anyway: render dialog into a portal mounted in a sibling `<div>` that is itself `visibility: hidden` during capture.

### Layout

```
┌─ Send feedback ─────────────────────── × ┐
│  [Bug] [Feature] [General] [Praise]     │
│  ── if anonymous ──                      │
│  Your name      [────────────────]      │
│  Your email     [────────────────]      │
│  Subject        [────────────────]      │
│  Tell us more                            │
│  ┌──────────────── Tiptap ─────────┐    │
│  │  bold/italic/link/list/code     │    │
│  └─────────────────────────────────┘    │
│  ▾ More detail (optional)               │
│      What's the problem?                 │
│      What did you intend?                │
│      What did you expect?                │
│      Can you reproduce it?               │
│        ( ) Always  ( ) Sometimes  ( ) Once │
│  Attachments                             │
│  ┌────┐ ┌────┐  + Drop, paste, or pick │
│  ▾ What we're sending (privacy)         │
│      route, treeId, errors: 2, …         │
│  [Cancel]            [Send feedback ↵] │
└──────────────────────────────────────────┘
```

### Field rules

| Field                       | Required?                              | Notes                                                         |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Category                    | Always one selected; default `general` | Pill selector                                                 |
| Subject                     | Optional                               | `<input>`, max 200 chars                                      |
| Body                        | Optional                               | Tiptap from hazo_ui; bold/italic/link/list/code               |
| Problem / Intent / Expected | Optional                               | Hidden in `<details>` disclosure; expand to textarea on focus |
| Reproducibility             | Optional                               | Inside the same `<details>` disclosure; tri-state radio        |
| Anon name + email           | Optional, only if anonymous            | `type="email"` + email regex check on submit                  |

**Submit gate:** subject OR body must have non-whitespace content. Anon name/email don't unlock submission alone. Anon email, if provided, must pass the email regex; otherwise inline error.

### Attachments

- Auto-screenshot in slot 1 (`kind='screenshot'`). Click to enlarge; × to remove.
- Click-to-pick: `<input type="file" multiple>` with configurable mime allowlist.
- Drag-and-drop zone (same allowlist).
- Paste from clipboard: image → `kind='pasted_image'` attachment.
- Tiptap-pasted images: stored client-side as data URI inside body HTML; rewritten to attachment URL by the server on submit (see §7.5).
- Per-submission cap: 25 MB total (matches Kinstripe `/api/files` limit). Server-enforced.
- Tray shows a clear "✓ ready to send" state per attachment so submitter has confidence the image is queued before clicking submit. (Submitter does not see attachments rendered post-submit — see decision #24.)

### 7.5. Tiptap inline-image flow (locked-in design)

The widget uses a custom Tiptap Image extension that subclasses `@tiptap/extension-image`:

- **Custom attribute:** `data-feedback-inline-id` added via `addAttributes()` — a UUID v4 generated client-side at paste-time.
- **Paste handler:** intercepts image paste events. For each pasted image: generate UUID, store the blob in a per-dialog `Map<string, Blob>` keyed by UUID, render `<img src="data:..." data-feedback-inline-id="UUID">` in the editor.
- **Drag-and-drop into editor:** same flow as paste.
- **On submit:** the form serializer iterates the blob Map and appends each to the multipart payload as `files[]` with `kind='pasted_image'` and the corresponding `inline_id` field. The body HTML carries the `data-feedback-inline-id` attributes through unchanged.
- **Server step 5 (in §9):** scans body HTML for `<img data-feedback-inline-id="X">`, looks up the matching attachment by `inline_id`, rewrites `src` to `/api/feedback/admin/{submissionId}/attachment/{attId}`, drops any `<img>` that is unresolved or carries an external `https://` src.

Library locked: `@tiptap/extension-image` subclass, ~80 lines of code total. No third-party Tiptap extension needed.

### Screen annotation

- Annotate button on the screenshot thumbnail opens a fullscreen overlay.
- Tools: arrow, rectangle, ellipse, freehand, text, undo/redo, clear.
- On confirm, the annotated PNG replaces the original screenshot blob — original isn't kept.
- Library: `markerjs3` (or comparable, to be finalised in implementation), lazy-imported (~50KB gz).
- Touch input verified during implementation — many failure modes for mobile annotation in this category.

### Privacy disclosure

`<details>` block "What we're sending" — lists every field + actual current values. Renders the consumer-context map (with `[redacted]` markers visible), the route, the user agent, breadcrumbs/errors counts. User-visible privacy story; debugging aid.

### Success state ("Thanks" flip)

After successful submit, the form swaps to a confirmation panel (2-second auto-close, but stays visible until user dismisses):

```
┌─ Thanks! ──────────────────────────────── × ┐
│                                              │
│  ✓ We've received your feedback.            │
│                                              │
│  Your reference: kinstripe-A47B5R3 [Copy]   │
│                                              │
│  We'll email you at pubs@example.com when   │
│  there's an update. (Or just quote the ref. │
│  Either way, you're not shouting into a     │
│  void.)                                      │
│                                              │
│                              [Close]         │
└──────────────────────────────────────────────┘
```

- Ref ID has a copy-to-clipboard button.
- Email confirmation line shown only when email is known (authed user OR anon with email provided). Otherwise: "Quote the reference if you want to follow up."
- Auto-closes after 5 seconds (longer than the original 2s — user needs time to read and copy the ref).
- Submission goes background-async after success; failure shows inline error with retry, form stays populated.

### Interaction

- Cmd/Ctrl+Enter submits.
- Esc closes (with discard-confirm if any field is dirty).
- Focus trap; first input gets focus on open; focus returns to trigger on close.
- Mobile (`< sm`): full-screen sheet sliding up.

---

## 8. Admin UI

```tsx
<FeedbackAdminPage appId="kinstripe" apiBase="/api/feedback" />
```

### List view

Two-pane layout (list 40% / detail 60%); list-only with detail-as-sheet on `< md`.

Filters: status, category, source, date range, free-text search across `ref_id + subject + body_text + user_name_snapshot + user_email_snapshot` via Postgres `ILIKE` (v1; pg_trgm GIN later if slow). Search does NOT hit `consumer_context` JSONB in v1. Pagination: 25 / page server-side.

Default filter excludes `marked_spam=true`, with a "show spam" toggle.

Each list row shows: ref ID, subject (or first 80 chars of body if no subject), category pill, status pill, submitter, source tag (if present), age. Reproducibility badge if set.

### Detail tabs

- **Overview** — ref ID with copy button, subject, category pill, reproducibility badge, status dropdown, priority dropdown, body (sanitized HTML), structured fields, submitter info, **Copy prompt** + **Download screenshot** + **Download all attachments (zip)** primary buttons.
- **Context** — URL/route, viewport, user agent, app version, source label, consumer-context (JSON tree with `[redacted]` markers visible), breadcrumbs (timeline list), recent errors (with stack snippets).
- **Attachments** — thumbnail grid; click opens existing `KsPhotoLightbox` (or consumer-supplied `LightboxComponent` prop). Each attachment has its own download button.
- **Activity** — events timeline + comment composer.

### Status workflow

Transitions: `new → triaged → in_progress → resolved` (or `wont_fix`). Free-form (any → any) in v1.

`resolved_at` semantics:
- Set to `now()` when status transitions TO `resolved` or `wont_fix`.
- Cleared (set to NULL) when status transitions FROM `resolved` or `wont_fix` back to anything else.
- Each transition writes a `status_changed` event row.

Status changes do NOT notify the submitter in v1 (deferred — see §11). The acknowledgement email at submit-time is the only outbound message.

### Copy AI prompt (LLM-directive style)

Markdown built server-side. Format:

````markdown
# Feedback report — kinstripe — bug

Submitted 2026-05-09 by Pubs (hazoservices@gmail.com)
Reference: kinstripe-A47B5R3
Reproducibility: always

## Subject

Drag-drop crashes the lightbox

## Problem | Intent | Expected

[as filled, omitted if blank]

## What the user wrote

[Tiptap body → markdown via turndown]

## Where it happened

- URL: …
- Route: /app/tree/[id]
- Viewport: 1440×900
- User agent: …
- App version: 0.4.7
- Source: app

## App state at submission

```json
{ "treeId": "abc-123", "activeView": "timeline", "userPassword": "[redacted]" }
```

## Recent user actions (breadcrumbs)

- 12:03:14 switched-view { from: tree, to: timeline }
- …

## Captured browser errors (last N)

- TypeError: …
  at bboxIoU (bbox-iou.ts:14:12)

## Attachments

The user attached the following files. They've been downloaded alongside this prompt:

- screenshot-annotated.png — annotated screenshot of the bug
- console-trace.txt — browser console output

Please review the screenshot first to understand the visual context.

---

Please analyze this bug and propose a fix. Repo conventions live in CLAUDE.md / AGENTS.md.
````

**Category-suffixed call to action** (the final paragraph, chosen by submission category):

| Category  | Suffix                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `bug`     | "Please analyze this bug and propose a fix. Repo conventions live in CLAUDE.md / AGENTS.md."                                            |
| `feature` | "Please draft a plan for this feature in the masterplan format used in docs/masterplan.md. Surface any open questions before implementation." |
| `general` | "Please review and respond as appropriate."                                                                                             |
| `praise` | _(no suffix — the prompt ends after the attachments section)_                                                                            |

Logs an `exported_prompt` event when invoked.

### Download all attachments (zip)

Admin-only. Builds a zip in the browser using `jszip` (lazy-imported) from the per-attachment streamed URLs. Filename: `feedback-{refId}-{timestamp}.zip`. Includes all `kind` types. Suggested workflow: Copy prompt → Download zip → unzip alongside the prompt → paste prompt into Claude Code → drag-drop unzipped files.

### Realtime

Skipped in v1. Manual refresh button.

---

## 9. Server entry & route handlers

### Factory

```ts
import { createFeedbackServer } from 'hazo_feedback';

export const feedback = createFeedbackServer({
  // app_id and admin_scope come from config/hazo_feedback_config.ini by default;
  // explicit args here override the file (used by test-app)
  db: getDb(),
  files: await createInitializedFileManager(),
  auth: {
    getSession: hazo_get_auth,
    ensureAnonId: ensure_anon_id,         // from hazo_auth ≥ 5.2.0
    checkScope: check_user_scope_access,
  },
  notify: hazo_notify,                    // optional; if absent, ack-email is a no-op
  sanitizer: undefined,                   // optional override; defaults to package allowlist
  redactor: undefined,                    // optional override; defaults to package PII regex pass
});
```

### Route wiring

Single catch-all per HTTP method:

```ts
// src/app/api/feedback/[...path]/route.ts
export const { GET, POST, PATCH, DELETE } = feedback.handlers;
```

Internal dispatch:

| Method  | Path                           | Auth        | Purpose                                |
| ------- | ------------------------------ | ----------- | -------------------------------------- |
| `POST`  | `/submit`                      | optional    | New submission (multipart)             |
| `GET`   | `/admin/list`                  | admin scope | Paginated list with filters            |
| `GET`   | `/admin/:id`                   | admin scope | Detail + events                        |
| `PATCH` | `/admin/:id`                   | admin scope | Status / priority update               |
| `POST`  | `/admin/:id/comment`           | admin scope | Add comment event                      |
| `POST`  | `/admin/:id/export-prompt`     | admin scope | Build markdown, log event, return text |
| `GET`   | `/admin/:id/attachment/:attId` | admin scope | Stream file via hazo_files             |

### Submit flow

Multipart/form-data:

```
fields:
  payload : JSON   { category, subject, problem, intent, expected_output, reproducibility,
                     body_html, anonymous_name, anonymous_email,
                     consumer_context, breadcrumbs, recent_errors,
                     url, route, viewport_w, viewport_h, user_agent, app_version,
                     source }
  files[]:         { kind, inline_id?: string }
```

Server steps (DB transaction; hazo_files writes outside the txn but rolled-back on failure):

1. **Resolve identity:**
   - Call `getSession(request)`. If `authenticated: true`, use `user.id` as `user_id`, capture name/email snapshots.
   - If `authenticated: false`, call `ensureAnonId(request, response)` — returns the existing or freshly-issued `hazo_auth_anon_id` cookie value. Use as `anon_session_id`. Use submitted `anonymous_name`/`anonymous_email` as the snapshots (validate email format if present; reject with 400 on invalid).
2. **Apply rate-limit:**
   - Authed submitter: `(appId, userId)` bucket.
   - Anon submitter: primary `(appId, anon_session_id)` bucket; secondary `(appId, ip)` bucket as a coarser net for botnets that drop cookies.
   - 429 if either exceeded.
3. **Stamp app_id and source:** server's loaded config provides `app_id`. Client-supplied app_id is ignored if present. `source` is taken from client payload (free-form, max 32 chars, NULL if absent).
4. **PII redaction pass:**
   - Run consumer's `redactContext(consumer_context)` if provided.
   - Apply default regex redaction (§6d). Track redacted top-level keys in `consumer_context_redacted` array.
   - Apply default regex redaction to each breadcrumb's `data` payload.
5. **Generate ref_id** (§5).
6. INSERT submission row (without `body_html`, `attachment_count`).
7. For each file: hazo_files write to `feedback/{appId}/{submissionId}/{ts}-{slug(name)}.{ext}` → INSERT attachment row.
8. **Sanitize `body_html`:** HTML allowlist; for each `<img data-feedback-inline-id="X">`, look up matching attachment by `inline_id` and rewrite `src` to `/api/feedback/admin/{submissionId}/attachment/{attId}`. **Drop:** any `<img>` without `data-feedback-inline-id`, any `<img>` whose `inline_id` doesn't match a stored attachment, any external `https://` `<img>` (decision #25 — tracking-pixel vector).
9. **Cap consumer_context:** if JSON-serialised payload > 64KB, truncate the largest key first, repeat until under cap, set `consumer_context_truncated: true`.
10. UPDATE submission with `body_html`, `body_text`, `attachment_count`, `screenshot_file_id`.
11. **Fire acknowledgement email (post-commit, async, fire-and-forget):**
    - Skip if `notify` peer is absent or `acknowledge_email_enabled = false` in config.
    - Skip if no email known (no authed user AND no anon email).
    - Else, call `hazo_notify.send({ to, from, subject (with %REF_ID% interpolated), template: 'feedback_acknowledgement', data: { refId, subject, category, submittedAt } })`.
    - On success, UPDATE `acknowledge_email_sent_at = now()`. On failure, log error but do not retry; do not fail the submit response.
12. Return `{ submissionId, refId }`.

Failure in step 7 rolls back the submission row. Failure in step 11 does not roll back — the submission is already committed and the user is told it succeeded.

### Acknowledgement email template (`feedback_acknowledgement`)

Lives in hazo_notify if it has a template registry, or inline in hazo_feedback otherwise. Plain-text version (HTML version optional, same content):

```
Subject: We received your feedback (kinstripe-A47B5R3)

Hi {name or 'there'},

Thanks for sending feedback to Kinstripe. We've logged it as
reference {refId}.

Subject: {subject or '(no subject)'}
Category: {category}
Submitted: {submittedAt, ISO}

There's no action needed from you. If you want to follow up
later, just quote the reference {refId}.

— The Kinstripe team
```

Strings are i18n-routed through the `translate` prop on the provider.

### HTML sanitizer

Allowlist: `b/strong/i/em/u/a/p/br/ul/ol/li/code/pre/blockquote/h2/h3/img`. `<img>` only with `src` rewritten in step 8 (i.e. attachment-backed only). External `https://` images are dropped. No `<script>`, no inline event handlers, no `style` attribute.

Consumer override via `sanitizer` option.

### Rate limiting

In-memory token bucket. Keys:
- Authed: `(appId, userId)`.
- Anon primary: `(appId, anon_session_id)`.
- Anon secondary: `(appId, ip)` — coarser, defends against cookie-rotating botnets.

Process-local. Documented as a §29 compromise; Redis-backed store is a planned upgrade — interface defined in v1, not implemented.

### Anonymity & abuse

- Same `submissions` table as authenticated rows.
- Anon submitters are stably identified by the `hazo_auth_anon_id` cookie (httpOnly, 2-year maxAge); rate-limit and grouping work even across days/weeks.
- Cookie can be cleared by the user; new visit issues a fresh ID. Treated as a new visitor.
- No captcha in v1.
- `marked_spam` boolean for manual moderation; default-hidden from admin list.

### Logging

Uses `hazo_logs` (peer-optional). Route-handler errors at error level. Submission attempts at info; successful submissions log the submissionId + refId. Email send failures at warn level (non-fatal).

---

## 10. Kinstripe integration

### Sequencing

This integration depends on **`hazo_auth ≥ 5.2.0`** (the version that adds `ensure_anon_id`). Order of operations:

1. **PR 1 (hazo_auth):** add `ensure_anon_id`, bump to 5.2.0, publish to npm. (See §10g.)
2. **PR 2 (hazo_feedback):** declare `hazo_auth: ^5.2.0` peer, build against it.
3. **PR 3 (kinstripe):** consume hazo_feedback, run §10a–§10j below.

### 10a. Two providers

**Authenticated** — `src/app/(app)/layout.tsx`:

```tsx
<FeedbackProvider
  appId={feedbackConfig.appId}    // server-component reads config/hazo_feedback_config.ini
  apiBase="/api/feedback"
  source="app"
  user={session?.user ? { id, name, email } : null}
  appVersion={process.env.NEXT_PUBLIC_APP_VERSION}
  translate={(k) => t(k)}
  trigger={{ placement: "bottom-right", zIndex: 40 }}
>
  {children}
  <FeedbackWidget />
</FeedbackProvider>
```

**Public** — `src/app/(public)/layout.tsx` — same wrapper with `user={null}` and `source="public"`. Captures waitlist / sign-up / invite-page feedback.

Auth callback / OAuth redirect routes get `trigger={{ placement: 'inline' }}` with no rendered button.

### 10b. Per-page context registration

```tsx
// TreeCanvas.tsx
useRegisterFeedbackContext({ treeId, treeName, activeView, collaboratorCount });

// DetailPanel.tsx (when open)
useRegisterFeedbackContext({ selectedPersonId, selectedPersonName, detailTab });

// TimelineView.tsx
useRegisterFeedbackContext({ timelineYearRange, timelineFilter });
```

### 10c. Breadcrumbs

Drop in five high-signal places:

1. View-switch handler in TreeCanvas.
2. Detail panel open / close.
3. Connection Studio drag-to-connect commit.
4. Timeline drag-to-date drop.
5. Story save / publish.

### 10d. Server wiring

`src/lib/feedback/server.ts` — lazy-init singleton calling `createFeedbackServer`.
`src/app/api/feedback/[...path]/route.ts` — catch-all that delegates to the singleton's handlers.

### 10e. Admin page

`src/app/(app)/admin/feedback/page.tsx` — server component that:

1. Reads session via `hazo_get_auth`.
2. Checks `hazo_feedback:kinstripe:admin` via `check_user_scope_access`.
3. Renders `<FeedbackAdminPage>`.

### 10f. Migration

Copy `hazo_feedback/migrations/001_init.sql` → `docs/db_setup/060_hazo_feedback.sql` (next free number). Includes tables, indexes, policies, grants, `NOTIFY pgrst, 'reload schema';`.

### 10g. hazo_auth `ensure_anon_id` change (PR 1)

Smallest change to add the helper; no breaking changes to existing exports.

1. **`src/lib/cookies_config.server.ts`** — add `ANON_ID: "hazo_auth_anon_id"` to `BASE_COOKIE_NAMES`.
2. **`src/lib/auth/ensure_anon_id.server.ts`** (new file) — exports `ensure_anon_id(request, response)`:
   - Reads `request.cookies.get(get_cookie_name(BASE_COOKIE_NAMES.ANON_ID))?.value`.
   - If present, returns it.
   - If absent, generates `crypto.randomUUID()`, writes the cookie on `response` via `get_cookie_options()` with `httpOnly: true, sameSite: "lax", path: "/", maxAge: 60*60*24*365*2` (2 years), returns the new id.
3. **`src/index.ts`** — re-export `ensure_anon_id`.
4. **`package.json` exports** — add `./lib/auth/ensure_anon_id.server` subpath following the `hazo_get_auth.server` pattern.
5. **CHANGELOG** — `5.2.0` — feat: add `ensure_anon_id` for anon visitor session IDs.

`hazo_get_auth` is unchanged. Callers who want anon IDs call `ensure_anon_id` directly when they need it.

### 10h. Provisioning admin scope

One-shot SQL once the migration is applied:

```sql
INSERT INTO hazo_user_scope_grants (user_id, scope_id)
VALUES ('<your-user-id>', 'hazo_feedback:kinstripe:admin');
```

(Exact table name to verify against current hazo_auth schema.)

### 10i. i18n

New `Feedback.*` namespace in `src/i18n/messages/en.json`. Package ships English defaults; Kinstripe routes them through next-intl via the `translate` prop. ~50 strings expected (was ~50 in v1.1; v1.2 adds ~5 for the success state and ack email subject — roughly ~55 total).

### 10j. Masterplan checklist

`docs/masterplan.md` §3.8 — mark these `[x]` on completion of v1:

- FeedbackWidget component
- Category selector
- Auto-capture metadata
- Feedback table in Postgres
- FeedbackAdmin dashboard component

Plus appendix-log entry dated 2026-05-10 capturing the decisions in §3 of this spec, plus §29 ledger rows for the in-memory rate-limiter and the deferred items in §11.

---

## 11. Performance compromises (for masterplan §29)

| Compromise                                | Goal                                  | Interim                                                                        | Long-term                                                            | Triggered when                                                  |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| In-memory rate limit                      | Don't accept abusive submissions      | Process-local token bucket keyed by `anon_session_id` (primary) + IP (secondary) | Redis-backed store (interface defined)                               | Multi-process / multi-region deploy                             |
| ILIKE search in admin list                | Find submissions by free-text         | `ref_id + subject + body_text + user_name + user_email ILIKE`                  | pg_trgm GIN index                                                    | Admin search > 1s on > 5k rows                                  |
| No notify-on-new-for-admin                | Admin sees feedback timely            | Manual refresh                                                                 | Email/web push to admin via hazo_notify                              | Friends-launch becomes wider beta                               |
| No status-change notifications to submitter | Close-the-loop for submitter        | Acknowledgement email at submit time only; submitter quotes ref to follow up   | Email/push to submitter when status changes (templates per status transition) | Friends-launch retention drops; users say "I never heard back"   |
| No orphan-attachment GC                   | Files match DB rows                   | hazo_files writes inside route txn boundary; failure rolls back submission row | Cron job sweeping `hazo_files` paths with no matching attachment row | Storage costs become measurable, or known orphan sources appear |
| RLS gate at API only (no SQL scope-check) | Enforce admin reads                   | Route-handler check via `check_user_scope_access`                              | SQL-level RLS function reading hazo_auth grants                      | Direct PostgREST / ORM access required by another consumer      |
| No submitter-side read endpoint           | Submitter sees own attachments        | Pre-submit attachment tray with "✓ ready to send" UX                            | Signed URLs in submit response + "view my submissions" page          | A consumer asks for it; until then YAGNI                        |
| No duplicate detection in admin           | Admin spots dupes manually            | ILIKE search over title/body                                                   | pgvector + embeddings, "similar submissions" panel in admin detail  | Admin has > 100 submissions and reports noticing dupes by hand   |
| No session replay (rrweb)                 | Reproduce bug from breadcrumbs alone  | Breadcrumbs (50) + auto-screenshot + console errors                            | rrweb-record last 30s, attached as compressed JSON, replayer in admin | Bug reports stop being reproducible from breadcrumbs alone      |
| Default PII regex is heuristic            | Don't leak passwords/tokens to admins | Regex on key names (case-insensitive); consumer can override with `redactContext` | Configurable redaction rules per app; pluggable detector             | A consumer needs domain-specific PII patterns (HIPAA, PCI, etc.) |

---

## 12. Open questions / verify in implementation

- Annotation library final pick (`markerjs3` vs custom canvas vs other) and touch-input verification.
- Exact hazo_auth scope-grant table name (`hazo_user_scope_grants`?) — verified during package migration authoring.
- Whether the Kinstripe `(public)/layout.tsx` exists as a single file (route-group) or needs a per-route wrapper.
- Whether `html2canvas`'s `visibility: hidden` skip behaviour is reliable in current versions; portal-into-hidden-div fallback documented in §7.
- Confirm `hazo_notify` API shape against current published version when implementing step 11 of submit flow; if `hazo_notify` doesn't have a template registry, the email body lives inline in `src/server/notify_acknowledgement.ts`.
- Crockford base32 library choice (small dep) vs hand-rolled (~30 lines) for ref ID generation.
