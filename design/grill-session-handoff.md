# hazo_feedback grilling — session handoff

This is the seed prompt for resuming the design grilling of `hazo_feedback` after a context clear. Paste this whole document into a fresh Claude Code session, then invoke `/grill-me` (or tell me to continue grilling).

---

## 1. What we're doing

We're building **`hazo_feedback@1.0.0`** — a drop-in feedback widget npm package for hazo apps. Friends-launch ready. Generic-isation passes later.

The full design spec lives at:

> `/Users/pubs/Local/01.code/00.lib/hazo_feedback/hazo_feedback_v1.2_design.md`

Read it end-to-end before continuing. It's ~60KB and dense; it's worth the time.

We are still in the **design grilling** phase, NOT yet writing implementation code. The grilling pattern is the `/grill-me` skill: walk down each branch of the design tree, resolve dependencies one decision at a time, recommend an answer for each, get user confirmation, move on. Don't bulk-ask; one branch at a time.

## 2. Where we are in the workspace

Working directory: `/Users/pubs/Local/01.code/00.lib/hazo_feedback/`. Currently it contains only the design doc and this handoff file. **No source code exists yet.** Don't start writing source until the grilling is done and the user explicitly asks for an implementation plan.

The package sits inside the hazo_* workspace at `/Users/pubs/Local/01.code/00.lib/`. Workspace conventions live in `/Users/pubs/Local/01.code/00.lib/CLAUDE.md` — read it. Critical bits:

- Package layout standard (§ Standard Package Structure).
- Cross-package convention: use existing hazo packages, don't reinvent.
- shadcn/ui via `hazo_ui` only.
- Canonical version table for shared deps.
- Dual-DB support (Postgres + SQLite) is a workspace standard for any package that ships migrations.
- Test-app must use sidebar layout (REQUIRED).

## 3. Status of blocker dependencies — both published

The grilling has already resolved the two existential blocker branches. Both upstream packages are now on npm:

### `hazo_auth@5.3.0` (published)

- Adds `ensure_anon_id` for anonymous visitor IDs.
  - Signature: `async function ensure_anon_id(request: NextRequest): Promise<string>` — Option A from the earlier grilling. Reads `request.cookies`, writes via `await cookies()` from `next/headers`. Idempotent per-request via a module-scope `WeakMap<NextRequest, string>`.
  - Cookie name: `hazo_auth_anon_id` (prefixed via `[hazo_auth__cookies] cookie_prefix`), httpOnly, sameSite=lax, secure in prod, 2-year maxAge.
  - Re-exported from `hazo_auth/server-lib` AND `hazo_auth/lib/auth/ensure_anon_id.server`.
- Migrates the inline-template email path onto hazo_notify@^3.0.0's `send_template_email`.
  - Exports `hazo_auth_template_manifest: SystemTemplateManifest[]` from `hazo_auth/server-lib` (three entries: email_verification, forgot_password, password_changed).
  - Template files ship in `dist/lib/services/email_templates/*.{html,txt}`.

### `hazo_notify@3.1.0` (published)

- `org_id`/`root_org_id` columns are gone; schema uses single nullable `scope_id` column. Migration `002_scope_migration.sql` ships in the package.
- Lookup semantics: `scope_id IS NULL` = global system default (managed via package manifests); `scope_id IS NOT NULL` = scope-specific override (admin-editable). Lookup prefers scope row, falls back to global.
- New server APIs in `hazo_notify/template_manager`:
  - `init_template_manager(options)` — boots the manager and seeds manifests.
  - `sync_system_templates(conn, manifests)` — idempotent seeder; **updates rows on every boot if their html/text/variables drift from the manifest.**
  - `register_template_type(def)` — adds a template-type definition to the in-memory registry (used by the admin UI's variable picker).
  - `send_template_email(opts, hazo_connect, config?)` — scope-aware send. `opts.scope_id: string | null`.
  - `set_scope_resolver(fn)` + LRU cache (60s TTL) — multi-tenant hierarchy traversal.
- Mountable admin UI from `hazo_notify/template_manager_admin`: `<TemplateManagerAdmin>` (scoped) and `<TemplateGlobalsAdmin>` (super-admin / global).
- Route-handler factory from `hazo_notify/template_manager_handlers`: `create_template_manager_handlers({ hazo_connect_factory, auth })`. Convenience adapter for hazo_auth at `hazo_notify/template_manager_handlers/hazo_auth` (dynamic-imports `hazo_auth/server-lib`).
- Permissions: `notify_templates_admin` for scoped admin, `notify_templates_super_admin` for global system-row edits.
- ⚠️ Global system rows are owned by the manifest. Don't hand-edit them — consumers customise via "Override for this scope" in the admin UI, which creates a `scope_id != NULL` row.

## 4. Design-doc errata to apply DURING the grilling (not before)

The design doc was written BEFORE hazo_auth@5.2.0 and hazo_notify@3.0.0 shipped. Several decisions need updating to match reality. Do NOT preemptively rewrite the doc — instead, surface each errata at the appropriate grilling branch so the user explicitly confirms each correction. The user is the source of truth.

| Where in design doc | Currently says | Reality |
|---|---|---|
| §9 step 1 + §10g | `ensure_anon_id(request, response)` — sync, two-arg | `async ensure_anon_id(request: NextRequest): Promise<string>` — single-arg, async. Use `await` at the call site. |
| §3 decision #26, §4 peer-dep paragraph | `hazo_notify` is "soft peer (optional)" with `peerDependenciesMeta` optional | hazo_notify@3.x is now the canonical templating system used by hazo_auth too. It should be a **hard** peer of hazo_feedback. The "no-op if absent" fallback path is no longer needed — if you want the acknowledgement email, install hazo_notify. |
| §9 step 11 | `hazo_notify.send({ to, from, subject, template: 'feedback_acknowledgement', data: {...} })` | This invented API never existed. Use `send_template_email({ template_name: 'feedback_acknowledgement', to, variables, scope_id: null, from, from_name, subject? }, hazo_connect)` from `hazo_notify/template_manager`. The `scope_id: null` means "use global default"; per-scope overrides happen via the admin UI. |
| §4 INI sample `acknowledge_email_subject = ...(%REF_ID%)` | `%REF_ID%` placeholder syntax | Use Handlebars `{{ref_id}}` for workspace consistency (matches hazo_auth's template path). |
| §9 acknowledgement email template ("Lives in hazo_notify if it has a template registry, or inline in hazo_feedback otherwise") | Ambiguous fallback | The template **lives in hazo_feedback** as `email_templates/feedback_acknowledgement.{html,txt}` files, and is shipped via a `hazo_feedback_template_manifest: SystemTemplateManifest[]` export. The consuming app composes both `[...hazo_auth_template_manifest, ...hazo_feedback_template_manifest]` into `init_template_manager`. Mirrors the hazo_auth pattern exactly. |
| §6c `import { feedback } from "hazo_feedback/client"` | `client` subpath | Match workspace convention. Workspace standard is `index.ts` (server) and `index.client.ts` (client). Confirm subpath export name with user — could be `hazo_feedback/client` or just `hazo_feedback` with both entry points. |

## 5. Grilling — what's already resolved

Branches the previous session walked down and got user confirmation on:

- **Q1a** hazo_auth sequencing: **(i)** — publish first, then hazo_feedback. **DONE** — 5.2.0 + 5.3.0 published.
- **Q1b** `ensure_anon_id` signature: **async, Option A** (`request` only, returns `Promise<string>`). **DONE** — shipped.
- **Q2** Acknowledgement-email path: **Option A** — upgrade hazo_notify first, then build hazo_feedback against it. **DONE** — hazo_notify@3.0.0 + 3.1.0 published.

## 6. Grilling — what's still queued

Walk these in order. Each is a branch in the decision tree. For each, propose a recommended answer, surface tradeoffs, then ask. Don't bulk.

### Branch §5 — Schema & data model (NEXT — start here)

Open questions I've queued from reading the design doc plus the workspace conventions:

1. **FK target for `user_id`.** Design says `UUID NULL FK to hazo_users.id`. Verify the table name and column shape against the actual hazo_auth schema (see `hazo_auth/src/lib/schema/` or hazo_auth's migrations).
2. **Dual-DB support.** Workspace standard (CLAUDE.md § Database Conventions) is that every migration MUST document both Postgres AND SQLite. Design shows only Postgres. Confirm with user: Postgres-only-with-a-rationale, or full dual-DB? hazo_notify and hazo_auth both do dual-DB.
3. **`consumer_context_redacted TEXT[]`** column. Postgres has native arrays; SQLite doesn't. Two options if going dual-DB: (a) `TEXT` storing JSON-encoded array (works both ways, slightly heavier reads); (b) drop the column and infer redaction from `[redacted]` markers in `consumer_context`. Recommend (a) — keeps the explicit-redaction-list query-able.
4. **Orphan attachment tension.** §9 step 7 promises hazo_files-write-rolled-back-on-failure. §11 §29 ledger explicitly says "no orphan-attachment GC." These can both be true if hazo_files supports transactional writes — verify. If not, either accept transient orphans (and document that the §29 GC is a real follow-up) or wrap the file writes in an explicit cleanup-on-failure block.
5. **`ref_id` collision retry.** §5 says "two retries max; if still colliding, fail loud." Confirm: what does "fail loud" mean to the submitter? 500 to the dialog with a generic error? Or surface "we couldn't generate a reference, please retry" so the user knows it's transient?
6. **`screenshot_file_id` denormalized AND attachments row.** §5 says both. Two writes per screenshot. Confirm this is intentional (admin UI gets uniform attachment iteration) — small bytes, small cost, but worth confirming we're not introducing a synchronization bug source.
7. **External `<img>` blocking** (decision #25). §7.5 says "drop any external `https://` `<img>`". Implementation note for §9 step 8: are you using Cheerio/jsdom to walk the HTML, or DOMPurify? DOMPurify has an allowlist hook; Cheerio is more flexible. Confirm.
8. **`anon_session_id`** in plaintext in DB. The cookie is httpOnly so it doesn't leak to JS, but the DB column stores the raw value. If an attacker reads the DB they can impersonate the anon session forever (2-year cookie lifetime). Mitigation options: hash the cookie value before storing, OR accept that DB read = full compromise anyway. Recommend the latter; raise it for confirmation.

### Branch §6 — Context capture model

9. **`useRegisterFeedbackContext` storage.** Atom-style store (Zustand? Jotai? Hand-rolled?). Workspace doesn't appear to standardize on either. Recommend hand-rolled (~30 lines) to avoid a new dep.
10. **Breadcrumb buffer growth + serialization cost.** Ring of 50. Each entry up to 2KB after stringify. Total ~100KB. On submit, full buffer is JSON-stringified into the submission. That's fine, but the per-emit JSON.stringify cost during normal use could be hot if a breadcrumb fires inside an animation loop. Confirm: stringify on-emit (cheap calls, expensive submit) or on-submit (single big serialize)?
11. **PII redaction regex scope.** §6d redacts top-level keys + one level of nesting. Recommend: include common nested patterns like `user.token`, `auth.bearer`. The regex list itself is sensible.

### Branch §7 — Dialog UX

12. **html2canvas bundle.** Lazy-imported but still bundled. Gzipped ~50KB. Confirm acceptable in `hazo_feedback`'s dependency footprint, or fetch from CDN on demand?
13. **markerjs3 license.** Verify it's MIT or BSD before committing to the dep. If GPL, we cannot bundle.
14. **Mobile sheet.** "Full-screen sheet sliding up." `hazo_ui` includes shadcn's `Drawer` — use that vs hand-rolling.
15. **Tiptap version.** Workspace canonical is `^3.20.5`. Design says "Tiptap from hazo_ui". Confirm hazo_ui re-exports Tiptap or whether hazo_feedback declares its own peer.
16. **Tiptap-inline-image flow.** §7.5 says custom `extension-image` subclass with `data-feedback-inline-id` attribute. Workspace standard for storing blobs client-side before submit? Map<UUID, Blob> in dialog state is fine; just confirm.

### Branch §8 — Admin UX

17. **Free-text search target.** ILIKE across `ref_id + subject + body_text + user_name_snapshot + user_email_snapshot`. Confirm: anything else worth indexing? body_text could be huge — partial-match ILIKE on it gets expensive fast. Recommend pg_trgm GIN index in §29 long-term column (already there).
18. **AI prompt clipboard write.** Async clipboard API only works in secure contexts (HTTPS or localhost). Confirm what happens in non-secure dev: fallback to textarea+execCommand? Or just rely on dev being on localhost?
19. **Download-all-attachments zip in-browser.** `jszip` is the design's pick. Confirm: built in admin's browser, not server-side, to avoid streaming all attachment bytes through the server.
20. **Super-admin across apps.** §5 admin scope is per-app (`hazo_feedback:{appId}:admin`). Is there a "see all apps" super-admin? Probably no for v1, but confirm.

### Branch §9 — Server & route handlers

21. **Rate-limit IP source.** Reverse-proxy compat — use `x-forwarded-for` first, fallback to socket. The existing hazo_auth `get_client_ip` already does this; lift the pattern.
22. **Permission/scope check.** Design says `check_user_scope_access`. hazo_auth's actual API is `hazo_get_auth(request, { scope_id, strict: true })` for permission-checking. Confirm which entry point you're using and the scope ID convention.
23. **HTML sanitizer.** Allowlist defined in §9. Recommend `isomorphic-dompurify` (already used by hazo_notify). Confirm.
24. **Multipart parsing.** Next 16 app-router supports `request.formData()`. Confirm files come in via `formData.getAll('files[]')`, not custom busboy.

### Branch §10 — Consumer integration

25. **Test-app sidebar layout.** Workspace standard requires sidebar. Design only mentions test-app exists. Confirm sidebar groupings: home / authed-submit / anon-submit / admin / settings.
26. **Kinstripe wiring.** §10a–§10j is detailed. Already mostly correct, but errata above flow through here.
27. **i18n.** Design says ~55 strings. Confirm: namespace `Feedback.*` under next-intl or a flat object passed to `translate?: (key) => string` prop. Recommend the latter — package-agnostic.

### Branch §11 — §29 deferral ledger

28. **Confirm each deferred row is intentional.** The doc has nine §29 entries; walk each, get explicit "yes deferred" or "actually let's do it in v1." The two most likely candidates for promotion are:
    - Status-change notifications to submitter (templates exist now via hazo_notify v3 — could be cheap).
    - Distributed (Redis-backed) rate-limit interface — design says "interface defined" but no implementation. Confirm scope.

## 7. Mode of operation

- Ask **one question at a time**. Walk branches in the order in §6.
- For each question: surface the tradeoff in 2-3 lines, give a recommended answer, ASK.
- Ground every question in real file contents. Don't speculate. If verifying takes more than 1-2 file reads, use the Bash + Read tools, not an Explore agent — most checks are cheap.
- When the user picks an answer, note it briefly and move to the next branch.
- DO NOT write `hazo_feedback` source code without the user explicitly asking. The output of the grilling is a *confirmed* design doc + implementation plan; the implementation itself is its own session.
- At the end of grilling, offer to:
  - (a) Update the design doc with all the errata + new answers, OR
  - (b) Write a fresh implementation plan modelled on the `hazo_notify_v2_plan.md` style.

## 8. Repository conventions cheat-sheet

When the grilling resolves each branch, the answer needs to land in the design doc using the workspace conventions. Quick reminders:

- All migrations: Postgres + SQLite variants in same file.
- All table names: `hazo_<package>_<table>`.
- All hazo deps: peer-dependency with `peerDependenciesMeta.optional` only for genuine soft deps.
- Two entry points: `src/index.ts` (server, with `import "server-only"`) and `src/index.client.ts` (client-safe, no Node imports).
- AGENTS.md in major directories (per CLAUDE.md § AGENTS.md Files).
- README.md, CLAUDE.md, SETUP_CHECKLIST.md, CHANGE_LOG.md, design/ dir all required.
- shadcn/ui via hazo_ui only. Tailwind v4. `@source "../node_modules/hazo_feedback/dist";` for the consumer's Tailwind entry (document this loudly in SETUP_CHECKLIST).
- Tiptap v3 (`^3.20.5`).
- Test-app: sidebar layout required.

## 9. Outstanding gotchas worth front-loading

- **hazo_auth missing v5.3.0 git tag.** Previous session noted this; user may or may not have fixed. Recommend confirming with `git -C /Users/pubs/Local/01.code/00.lib/hazo_auth tag | grep 5.3` at session start.
- **`sync_system_templates` update-on-boot semantics.** Important context when discussing how hazo_feedback's template manifest will behave once consumers deploy it: any edits made to the global system row will get overwritten on next deploy if they differ from the manifest. The override path is admin-UI-only.

## 10. Kickoff for the session

Start the session like this:

> Read `/Users/pubs/Local/01.code/00.lib/hazo_feedback/hazo_feedback_v1.2_design.md` end-to-end. Then read this handoff document (`design/grill-session-handoff.md`) — it tells you what's already been decided, what's published, and what to grill next. After both reads, briefly summarize where we are and proceed with grilling branch §5 (Schema & data model), starting with question 1 (FK target for `user_id`). Ask one question at a time. Don't write any hazo_feedback source code.

That's it. The next session has everything it needs.
