# hazo_feedback v2.1.0 — Voting + Reply Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship hazo_feedback v2.1.0 with two new features: a two-way reply thread (R5) and a public voting / roadmap surface (R2), preceded by a hazo_notify v3 -> v5 peer-dep migration that the reply notifications depend on.

**Architecture:**
- **Reply threads** extend the existing `hazo_feedback_events` table with `body_html` / `body_text` columns and a nullable FK from `hazo_feedback_attachments`; new event types `admin_reply`, `user_reply`, `visibility_changed`; notifications go through `hazo_notify@^5` `dispatch()` (in-app inbox + optional email).
- **Voting** adds `is_public BOOLEAN` to submissions and a new `hazo_feedback_votes` join table; counts are computed on read via `COUNT(*)`; toggle endpoint + public board listing + admin voters tab.
- Single schema migration `migrations/002_voting_and_replies.sql` covers both. Minor version bump to 2.1.0.

**Tech Stack:** TypeScript (ESM), Next.js 14/16 route handlers (`server-only`), React 18/19 client components, Tailwind v4 + shadcn/ui via `hazo_ui`, Tiptap v3 for rich text, Jest + ts-jest (NODE_OPTIONS=--experimental-vm-modules) for tests, `hazo_connect` for DB CRUD, `hazo_notify@^5` for notifications, `hazo_auth/server-lib` for identity, `hazo_files` for attachments, `isomorphic-dompurify` (already in deps) for HTML sanitization.

**Security note on HTML rendering:** Reply bodies are stored as `body_html` (sanitized server-side via `sanitize_body_html` in `src/sanitize/body_html.ts`, which wraps `isomorphic-dompurify`) and `body_text`. Client components render `body_html` via React's raw-HTML escape hatch ONLY because the value is already sanitized in the request pipeline. This contract MUST be preserved — any client receiving HTML from a route handler that does not call `sanitize_body_html` first is a security regression. Where rich rendering isn't required for the use case, prefer rendering `body_text` with `whitespace-pre-wrap` instead.

**Decision sheet:** All design decisions referenced below were locked during the grilling session that produced this plan (Q1-Q21). When an ambiguity arises during execution, defer to the decision log at the end of this document.

**Out of scope (do not implement):** R1 (Linear/GitHub/Jira), R3 (Slack/Discord webhooks), R4 (search + bulk + CSV), anon-submitter reply paths, regex-based PII scrubbing of submission body, `admin_comment` UI (handler exists, no UI added in this release).

---

## Phase 0 — `hazo_notify` v3 -> v5 prerequisite (ships as its own PR/commit before R5 work)

### Task 0.1 — Bump `hazo_notify` peer-dep range

**Files:**
- Modify: `package.json`
- Modify: `test-app/package.json`

- [ ] **Step 1: Edit root `package.json` peer dep and devDependency to `^5.0.0`**

In `/Users/pubs/Local/01.code/00.lib/hazo_feedback/package.json`, change both occurrences of `hazo_notify` from `^3.1.0` to `^5.0.0`.

Result, in `peerDependencies`:
```json
"hazo_notify": "^5.0.0"
```
and in `devDependencies`:
```json
"hazo_notify": "^5.0.0"
```

- [ ] **Step 2: Edit `test-app/package.json` similarly**

Find any reference to `hazo_notify` in `test-app/package.json` and bump to `^5.0.0`.

- [ ] **Step 3: Reinstall**

Run from workspace root (`/Users/pubs/Local/01.code/00.lib`):
```bash
npm install
```
Expected: `up to date` or new resolution, exit code 0. If npm reports peer-dep conflicts from other hazo packages, stop and surface — do NOT use `--force` or `--legacy-peer-deps`.

- [ ] **Step 4: Verify the installed version**

```bash
node -e "console.log(require('hazo_feedback/package.json').name); console.log(require('hazo_notify/package.json').version)"
```
Expected: `hazo_feedback` printed first, then a version starting with `5.`.

- [ ] **Step 5: Commit**

```bash
git add package.json test-app/package.json package-lock.json test-app/package-lock.json
git commit -m "chore: bump hazo_notify peer dep to ^5.0.0"
```

---

### Task 0.2 — Rewrite `send_acknowledgement.ts` against v5 `dispatch()`

**Files:**
- Modify: `src/notify/send_acknowledgement.ts`
- Modify: `src/server/handlers/submit.ts`

**Why:** v5 removed top-level `send_template_email` in favor of `dispatch()` which queues an inbox row + email delivery. Behavioral change: ack email becomes asynchronous (worker-flushed on consumer side). Document this in CHANGELOG.

- [ ] **Step 1: Replace the file contents**

Overwrite `src/notify/send_acknowledgement.ts` with:

```typescript
import "server-only";

import { dispatch } from "hazo_notify";

export interface AckEmailOptions {
  to: string;
  from: string;
  fromName?: string;
  refId: string;
  name: string;
  subject: string;
  category: string;
  submittedAt: Date;
  recipientUserId: string;
  scopeId?: string;
  deepLink: string;
}

export async function send_acknowledgement(opts: AckEmailOptions): Promise<void> {
  try {
    await dispatch({
      event_type: "hazo_feedback.acknowledgement",
      subject_id: opts.refId,
      scope_id: opts.scopeId ?? "",
      recipient_user_ids: [opts.recipientUserId],
      in_app_text: `Thanks for your feedback (${opts.refId})`,
      deep_link: opts.deepLink,
      surfaces: { in_app: true, banner: false },
      channels: { email: true },
      channel_payloads: {
        email: {
          template_name: "feedback_acknowledgement",
          to: opts.to,
          from: opts.from,
          from_name: opts.fromName,
          variables: {
            ref_id: opts.refId,
            name: opts.name,
            subject: opts.subject,
            category: opts.category,
            submitted_at: opts.submittedAt.toISOString(),
          },
        },
      },
      batch_window_ms: 0,
    });
  } catch (err) {
    console.warn(
      "[hazo_feedback] send_acknowledgement: dispatch failed",
      { to: opts.to, ref_id: opts.refId, error: String(err) },
    );
  }
}
```

- [ ] **Step 2: Update the call site in `src/server/handlers/submit.ts`**

Locate the `send_acknowledgement({ ... })` invocation (currently around line 395). Replace with:

```typescript
send_acknowledgement({
  to: user_email_snapshot,
  from: notifyOptions.from,
  fromName: notifyOptions.fromName,
  refId: ref_id,
  name: user_name_snapshot ?? user_email_snapshot,
  subject: config.notifyConfig.acknowledgeEmailSubject,
  category: category_raw,
  submittedAt: new Date(),
  recipientUserId: user_id ?? "",
  scopeId: "",
  deepLink: `/feedback/thread/${ref_id}`,
}).catch((err: unknown) => {
  logger?.warn("handle_submit: acknowledgement email failed", { error: String(err) });
});
```

(The hard-coded `/feedback/thread/${ref_id}` is intentional for Phase 0 isolation. Task 2.11 Step 6 replaces it with `opts.threadUrlBuilder` once that option is wired through the factory.)

- [ ] **Step 3: Run typecheck**

```bash
npm run build
```
Expected: clean exit (0). If `dispatch` is not exported from `hazo_notify`, check `node_modules/hazo_notify/package.json` `exports` map and adjust import path.

- [ ] **Step 4: Commit**

```bash
git add src/notify/send_acknowledgement.ts src/server/handlers/submit.ts
git commit -m "refactor(notify): rewrite acknowledgement against hazo_notify v5 dispatch()"
```

---

### Task 0.3 — Smoke-test ack flow via test-app

**Files:** none — manual verification only.

- [ ] **Step 1: Boot test-app**

```bash
cd test-app && npm run dev
```
Expected: server starts on port 3030.

- [ ] **Step 2: Submit feedback as an authed user**

Open `http://localhost:3030/authed-submit`. Submit a Bug with subject "ack smoke test". Capture the returned `refId`.

- [ ] **Step 3: Verify the inbox row in test-app SQLite**

```bash
sqlite3 test-app/test-app.db "SELECT id, event_type, subject_id, in_app_text FROM hazo_notify_inbox WHERE event_type='hazo_feedback.acknowledgement' ORDER BY created_at DESC LIMIT 1;"
```
Expected: one row with `event_type='hazo_feedback.acknowledgement'`, `subject_id=<refId>`, `in_app_text` containing `Thanks for your feedback`.

If `hazo_notify_inbox` is missing, the test-app's `instrumentation.ts` hasn't run hazo_notify v5 migrations (`005`/`006`/`007`). Run them, then retry.

- [ ] **Step 4: Stop dev server. No commit (manual verification only).**

---

## Phase 1 — Schema + types foundation

### Task 1.1 — Write `migrations/002_voting_and_replies.sql`

**Files:**
- Create: `migrations/002_voting_and_replies.sql`

- [ ] **Step 1: Create the file with PG-active / SQLite-commented contents**

```sql
-- hazo_feedback v2.1.0 schema additions
-- Supports both PostgreSQL and SQLite
--
-- Changes:
--   R5 reply thread:
--     - hazo_feedback_events: add body_html, body_text
--     - hazo_feedback_attachments: allow event_id as alternative owner (XOR with submission_id)
--   R2 voting:
--     - hazo_feedback_submissions: add is_public
--     - new table hazo_feedback_votes
--
-- ============================================================
-- PostgreSQL version (active)
-- ============================================================

-- R5: reply content columns on events
ALTER TABLE hazo_feedback_events ADD COLUMN IF NOT EXISTS body_html TEXT NULL;
ALTER TABLE hazo_feedback_events ADD COLUMN IF NOT EXISTS body_text TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_hf_events_submission_type
  ON hazo_feedback_events (submission_id, event_type);

-- R5: attachments may belong to either a submission OR a reply event (XOR)
ALTER TABLE hazo_feedback_attachments ALTER COLUMN submission_id DROP NOT NULL;
ALTER TABLE hazo_feedback_attachments
  ADD COLUMN IF NOT EXISTS event_id UUID NULL
  REFERENCES hazo_feedback_events(id) ON DELETE CASCADE;

ALTER TABLE hazo_feedback_attachments
  ADD CONSTRAINT chk_hf_attachment_owner_xor
  CHECK (
    (submission_id IS NOT NULL AND event_id IS NULL)
    OR (submission_id IS NULL AND event_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_hf_attachments_event
  ON hazo_feedback_attachments (event_id);

-- R2: is_public on submissions
ALTER TABLE hazo_feedback_submissions
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_hf_submissions_public_feature
  ON hazo_feedback_submissions (is_public, category)
  WHERE is_public = TRUE;

-- R2: votes table
CREATE TABLE IF NOT EXISTS hazo_feedback_votes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  UUID NOT NULL REFERENCES hazo_feedback_submissions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hf_votes_submission
  ON hazo_feedback_votes (submission_id);

CREATE INDEX IF NOT EXISTS idx_hf_votes_user
  ON hazo_feedback_votes (user_id);

-- ============================================================
-- SQLite version (commented)
-- SQLite does not support ALTER COLUMN DROP NOT NULL or ADD CONSTRAINT,
-- so the attachments change is done via rename-and-recreate.
-- ============================================================
--
-- ALTER TABLE hazo_feedback_events ADD COLUMN body_html TEXT NULL;
-- ALTER TABLE hazo_feedback_events ADD COLUMN body_text TEXT NULL;
--
-- CREATE INDEX IF NOT EXISTS idx_hf_events_submission_type
--   ON hazo_feedback_events (submission_id, event_type);
--
-- CREATE TABLE hazo_feedback_attachments_new (
--   id             TEXT PRIMARY KEY,
--   submission_id  TEXT NULL,
--   event_id       TEXT NULL,
--   inline_id      TEXT NULL,
--   file_id        TEXT NOT NULL,
--   mime_type      TEXT NOT NULL,
--   size_bytes     INTEGER NOT NULL,
--   kind           TEXT NOT NULL,
--   created_at     TEXT NOT NULL DEFAULT (datetime('now')),
--   CHECK (
--     (submission_id IS NOT NULL AND event_id IS NULL)
--     OR (submission_id IS NULL AND event_id IS NOT NULL)
--   )
-- );
-- INSERT INTO hazo_feedback_attachments_new
--   (id, submission_id, event_id, inline_id, file_id, mime_type, size_bytes, kind, created_at)
-- SELECT id, submission_id, NULL, inline_id, file_id, mime_type, size_bytes, kind, created_at
-- FROM hazo_feedback_attachments;
-- DROP TABLE hazo_feedback_attachments;
-- ALTER TABLE hazo_feedback_attachments_new RENAME TO hazo_feedback_attachments;
-- CREATE INDEX IF NOT EXISTS idx_hf_attachments_submission
--   ON hazo_feedback_attachments (submission_id);
-- CREATE INDEX IF NOT EXISTS idx_hf_attachments_event
--   ON hazo_feedback_attachments (event_id);
--
-- ALTER TABLE hazo_feedback_submissions
--   ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
--
-- CREATE INDEX IF NOT EXISTS idx_hf_submissions_public_feature
--   ON hazo_feedback_submissions (is_public, category);
--
-- CREATE TABLE IF NOT EXISTS hazo_feedback_votes (
--   id             TEXT PRIMARY KEY,
--   submission_id  TEXT NOT NULL,
--   user_id        TEXT NOT NULL,
--   created_at     TEXT NOT NULL DEFAULT (datetime('now')),
--   UNIQUE (submission_id, user_id)
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_hf_votes_submission
--   ON hazo_feedback_votes (submission_id);
--
-- CREATE INDEX IF NOT EXISTS idx_hf_votes_user
--   ON hazo_feedback_votes (user_id);
```

- [ ] **Step 2: Apply to test-app SQLite (manual verification)**

The test-app's instrumentation auto-runs migrations on boot. Restart:
```bash
cd test-app && rm -f test-app.db && npm run dev
```
Expected: server starts, sqlite db recreated, schema has new columns.

- [ ] **Step 3: Verify schema**

```bash
sqlite3 test-app/test-app.db ".schema hazo_feedback_events" | grep -E "body_html|body_text"
sqlite3 test-app/test-app.db ".schema hazo_feedback_votes"
sqlite3 test-app/test-app.db ".schema hazo_feedback_submissions" | grep is_public
```
Expected: each command prints the new column/table definitions.

- [ ] **Step 4: Stop dev server, commit**

```bash
git add migrations/002_voting_and_replies.sql
git commit -m "feat(db): add migration 002 for voting and reply threads"
```

---

### Task 1.2 — Update `src/types.ts` with new event kinds and shapes

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add new union members to `FeedbackEventType`**

Find the existing line:
```typescript
export type FeedbackEventType =
  | 'status_changed'
  | 'priority_changed'
  | 'comment_added'
  | 'exported_prompt';
```

Replace with:
```typescript
export type FeedbackEventType =
  | 'status_changed'
  | 'priority_changed'
  | 'comment_added'
  | 'exported_prompt'
  | 'admin_reply'
  | 'user_reply'
  | 'visibility_changed';
```

- [ ] **Step 2: Add `body_html` / `body_text` to `FeedbackEvent`**

Replace the existing `FeedbackEvent` interface with:
```typescript
export interface FeedbackEvent {
  id: string;
  submission_id: string;
  actor_id: string | null;
  event_type: FeedbackEventType;
  from_value: string | null;
  to_value: string | null;
  comment: string | null;
  body_html: string | null;
  body_text: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Loosen `FeedbackAttachment.submission_id` and add `event_id`**

Replace the existing `FeedbackAttachment` interface with:
```typescript
export interface FeedbackAttachment {
  id: string;
  submission_id: string | null;
  event_id: string | null;
  inline_id: string | null;
  file_id: string;
  mime_type: string;
  size_bytes: number;
  kind: AttachmentKind;
  created_at: string;
}
```

- [ ] **Step 4: Add `is_public` to `FeedbackSubmission`**

Insert immediately after the existing `marked_spam: boolean;` line:
```typescript
  is_public: boolean;
```

- [ ] **Step 5: Add a new `FeedbackVote` interface**

After `FeedbackEvent`, add:
```typescript
export interface FeedbackVote {
  id: string;
  submission_id: string;
  user_id: string;
  created_at: string;
}
```

- [ ] **Step 6: Add `threadUrlBuilder` and `listAdminsForBroadcast` to `FeedbackServerOptions`**

Insert inside `FeedbackServerOptions` (right before `logger?: Logger;`):
```typescript
  /**
   * Builds the absolute or relative URL for the user-facing thread page.
   * Used in notification deep_links. Receives the ref_id (Crockford
   * base32 ID). Defaults to `/feedback/thread/${refId}` when omitted.
   */
  threadUrlBuilder?: (refId: string, submissionId: string) => string;
  /**
   * Returns user_ids of all admins holding the admin scope. Used to
   * broadcast user_reply notifications. If omitted, user replies do
   * not trigger admin notifications (the reply still lands in the DB).
   */
  listAdminsForBroadcast?: () => Promise<string[]>;
```

- [ ] **Step 7: Extend `NotifyConfig` with reply-email flags**

Replace `NotifyConfig` with:
```typescript
export interface NotifyConfig {
  acknowledgeEmailEnabled: boolean;
  acknowledgeEmailFrom: string;
  acknowledgeEmailFromName: string;
  acknowledgeEmailSubject: string;
  replyEmailToUserEnabled: boolean;
  replyEmailToAdminEnabled: boolean;
}
```

- [ ] **Step 8: Typecheck**

```bash
npm run build
```
Expected: at this point several files (`event_service.ts`, `attachment_service.ts`, `submission_service.ts`, `load_config.ts`) will fail with missing-field errors. **That is expected** — those will be fixed in Phase 2 / Phase 6.

- [ ] **Step 9: Commit (broken build OK at this checkpoint)**

```bash
git add src/types.ts
git commit -m "feat(types): add reply + voting types (build broken until Phase 2)"
```

If your execution policy refuses broken-build commits, batch this with Tasks 2.1, 2.2, 2.3, and 6.1 into a single commit.

---

## Phase 2 — Reply thread server (R5)

### Task 2.1 — Extend `event_service.ts` with reply support

**Files:**
- Modify: `src/db/event_service.ts`

- [ ] **Step 1: Add `body_html` and `body_text` to `EventRow`**

In `EventRow`, add after the existing `comment` field:
```typescript
  body_html: string | null;
  body_text: string | null;
```

- [ ] **Step 2: Add `list_replies_for_submission` and `count_admin_replies`**

After `list_for_submission`, add:
```typescript
async function list_replies_for_submission(submissionId: string): Promise<FeedbackEvent[]> {
  const rows = await svc.list((qb) => {
    qb.where('submission_id', 'eq', submissionId);
    qb.where('event_type', 'in', ['admin_reply', 'user_reply']);
    qb.order('created_at', 'asc');
    return qb;
  });
  return rows.map(row_to_event);
}

async function count_admin_replies(submissionId: string): Promise<number> {
  const rows = await svc.list((qb) => {
    qb.where('submission_id', 'eq', submissionId);
    qb.where('event_type', 'eq', 'admin_reply');
    return qb;
  });
  return rows.length;
}
```

- [ ] **Step 3: Export the new methods**

```typescript
return { list_for_submission, list_replies_for_submission, count_admin_replies, log_event, raw: svc };
```

- [ ] **Step 4: Confirm `qb.where(col, 'in', array)` is supported**

```bash
grep -n "'in'" /Users/pubs/Local/01.code/00.lib/hazo_connect/src/server/query_builder.ts 2>/dev/null | head -3
```

If `'in'` is not supported, fall back to fetching all rows for the submission and filtering in JS:

```typescript
async function list_replies_for_submission(submissionId: string): Promise<FeedbackEvent[]> {
  const all = await svc.list((qb) => {
    qb.where('submission_id', 'eq', submissionId);
    qb.order('created_at', 'asc');
    return qb;
  });
  return all
    .filter((r) => r.event_type === 'admin_reply' || r.event_type === 'user_reply')
    .map(row_to_event);
}
```

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/db/event_service.ts
git commit -m "feat(db): event_service supports reply listing and admin-reply counts"
```

---

### Task 2.2 — Extend `attachment_service.ts` for event-anchored attachments

**Files:**
- Modify: `src/db/attachment_service.ts`

- [ ] **Step 1: Update `AttachmentRow`**

```typescript
interface AttachmentRow extends Record<string, unknown> {
  id: string;
  submission_id: string | null;
  event_id: string | null;
  inline_id: string | null;
  file_id: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  created_at: string;
}
```

- [ ] **Step 2: Update `row_to_attachment` mapping**

```typescript
function row_to_attachment(row: AttachmentRow): FeedbackAttachment {
  return {
    id: row.id,
    submission_id: row.submission_id,
    event_id: row.event_id,
    inline_id: row.inline_id,
    file_id: row.file_id,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    kind: row.kind as AttachmentKind,
    created_at: row.created_at,
  };
}
```

- [ ] **Step 3: Split `insert_attachment` into submission-anchored and event-anchored variants**

```typescript
async function list_for_event(eventId: string): Promise<FeedbackAttachment[]> {
  const rows = await svc.list((qb) => {
    qb.where('event_id', 'eq', eventId);
    qb.order('created_at', 'asc');
    return qb;
  });
  return rows.map(row_to_attachment);
}

async function insert_submission_attachment(data: {
  id: string;
  submission_id: string;
  inline_id: string | null;
  file_id: string;
  mime_type: string;
  size_bytes: number;
  kind: AttachmentKind;
  created_at: string;
}): Promise<FeedbackAttachment> {
  const rows = await svc.insert({ ...data, event_id: null });
  return row_to_attachment(rows[0]);
}

async function insert_event_attachment(data: {
  id: string;
  event_id: string;
  inline_id: string | null;
  file_id: string;
  mime_type: string;
  size_bytes: number;
  kind: AttachmentKind;
  created_at: string;
}): Promise<FeedbackAttachment> {
  const rows = await svc.insert({ ...data, submission_id: null });
  return row_to_attachment(rows[0]);
}
```

- [ ] **Step 4: Update exports**

```typescript
return {
  list_for_submission,
  list_for_event,
  insert_submission_attachment,
  insert_event_attachment,
  raw: svc,
};
```

- [ ] **Step 5: Update callers**

```bash
grep -rn "\.insert_attachment(" src/ --include='*.ts'
```
Replace each `service.insert_attachment(...)` with `service.insert_submission_attachment(...)`.

- [ ] **Step 6: Build, commit**

```bash
npm run build
git add src/db/attachment_service.ts src/server/handlers/submit.ts
git commit -m "feat(db): attachment_service supports event-anchored attachments"
```

---

### Task 2.3 — Extend `submission_service.ts` with `is_public` + `set_visibility`

**Files:**
- Modify: `src/db/submission_service.ts`

- [ ] **Step 1: Add `is_public` to `SubmissionRow`**

Add immediately after `marked_spam`:
```typescript
  is_public: boolean | number;
```

- [ ] **Step 2: Update `row_to_submission`**

Inside the mapper, add:
```typescript
    is_public: Boolean(row.is_public),
```

- [ ] **Step 3: Add `set_visibility` method**

After `update_submission`:
```typescript
async function set_visibility(id: string, isPublic: boolean): Promise<FeedbackSubmission> {
  const rows = await svc.updateById(id, {
    is_public: isPublic ? 1 : 0,
    updated_at: new Date().toISOString(),
  });
  return row_to_submission(rows[0]);
}
```

- [ ] **Step 4: Add `isPublic` filter to `list_submissions`**

In `ListSubmissionsOptions`:
```typescript
  isPublic?: boolean;
```

Inside the query callback:
```typescript
      if (opts.isPublic !== undefined) qb.where('is_public', 'eq', opts.isPublic ? 1 : 0);
```

- [ ] **Step 5: Export `set_visibility`**

```typescript
return {
  list_submissions,
  get_submission,
  get_submission_by_ref,
  insert_submission,
  update_submission,
  set_visibility,
  raw: svc,
};
```

- [ ] **Step 6: Build, commit**

```bash
npm run build
git add src/db/submission_service.ts
git commit -m "feat(db): submission_service handles is_public and set_visibility"
```

---

### Task 2.4 — Create `vote_service.ts` (TDD)

**Files:**
- Create: `src/db/vote_service.ts`
- Create: `src/__tests__/vote_service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

interface FakeAdapter { rows: Array<Record<string, unknown>>; }

function makeAdapter(): FakeAdapter { return { rows: [] }; }

jest.mock('hazo_connect/server', () => ({
  createCrudService: (adapter: FakeAdapter) => ({
    async insert(data: Record<string, unknown>) {
      const row = { ...data };
      adapter.rows.push(row);
      return [row];
    },
    async list(buildQuery: (qb: unknown) => unknown) {
      const filters: Array<[string, string, unknown]> = [];
      const qb = {
        where: (col: string, op: string, val: unknown) => { filters.push([col, op, val]); return qb; },
        order: () => qb,
        limit: () => qb,
        offset: () => qb,
      };
      buildQuery(qb);
      return adapter.rows.filter((r) =>
        filters.every(([col, op, val]) =>
          op === 'eq' ? r[col] === val :
          op === 'in' ? Array.isArray(val) && (val as unknown[]).includes(r[col]) :
          true
        ),
      );
    },
    async findOneBy(criteria: Record<string, unknown>) {
      return adapter.rows.find((r) =>
        Object.entries(criteria).every(([k, v]) => r[k] === v),
      ) ?? null;
    },
    async deleteBy(criteria: Record<string, unknown>) {
      const before = adapter.rows.length;
      const filtered = adapter.rows.filter((r) =>
        !Object.entries(criteria).every(([k, v]) => r[k] === v),
      );
      const removed = before - filtered.length;
      adapter.rows.length = 0;
      adapter.rows.push(...filtered);
      return Array.from({ length: removed }, (_, i) => ({ removed_index: i }));
    },
  }),
}));

import { create_vote_service } from '../db/vote_service.js';

describe('vote_service', () => {
  let adapter: FakeAdapter;
  beforeEach(() => { adapter = makeAdapter(); });

  it('toggle_vote inserts a row when none exists', async () => {
    const svc = create_vote_service(adapter);
    const result = await svc.toggle_vote('sub-1', 'user-1');
    expect(result).toEqual({ voted: true, count: 1 });
    expect(adapter.rows).toHaveLength(1);
    expect(adapter.rows[0]).toMatchObject({ submission_id: 'sub-1', user_id: 'user-1' });
  });

  it('toggle_vote removes the row when one exists', async () => {
    const svc = create_vote_service(adapter);
    await svc.toggle_vote('sub-1', 'user-1');
    const result = await svc.toggle_vote('sub-1', 'user-1');
    expect(result).toEqual({ voted: false, count: 0 });
    expect(adapter.rows).toHaveLength(0);
  });

  it('count_votes returns the number of votes for a submission', async () => {
    const svc = create_vote_service(adapter);
    await svc.toggle_vote('sub-1', 'user-1');
    await svc.toggle_vote('sub-1', 'user-2');
    await svc.toggle_vote('sub-2', 'user-1');
    expect(await svc.count_votes('sub-1')).toBe(2);
    expect(await svc.count_votes('sub-2')).toBe(1);
  });

  it('has_voted reports whether a user has voted for a submission', async () => {
    const svc = create_vote_service(adapter);
    await svc.toggle_vote('sub-1', 'user-1');
    expect(await svc.has_voted('sub-1', 'user-1')).toBe(true);
    expect(await svc.has_voted('sub-1', 'user-2')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --testPathPattern=vote_service
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/db/vote_service.ts`**

```typescript
import 'server-only';
import { randomUUID } from 'crypto';
import { createCrudService } from 'hazo_connect/server';
import type { FeedbackVote } from '../types.js';

const TABLE = 'hazo_feedback_votes';

interface VoteRow extends Record<string, unknown> {
  id: string;
  submission_id: string;
  user_id: string;
  created_at: string;
}

function row_to_vote(row: VoteRow): FeedbackVote {
  return {
    id: row.id,
    submission_id: row.submission_id,
    user_id: row.user_id,
    created_at: row.created_at,
  };
}

export function create_vote_service(adapter: unknown) {
  const svc = createCrudService<VoteRow>(adapter as Parameters<typeof createCrudService>[0], TABLE, {
    autoId: false,
  });

  async function has_voted(submissionId: string, userId: string): Promise<boolean> {
    const existing = await svc.findOneBy({ submission_id: submissionId, user_id: userId });
    return existing !== null;
  }

  async function count_votes(submissionId: string): Promise<number> {
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'eq', submissionId);
      return qb;
    });
    return rows.length;
  }

  async function count_votes_for(submissionIds: string[]): Promise<Map<string, number>> {
    if (submissionIds.length === 0) return new Map();
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'in', submissionIds);
      return qb;
    });
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.submission_id, (out.get(r.submission_id) ?? 0) + 1);
    return out;
  }

  async function user_voted_for(submissionIds: string[], userId: string): Promise<Set<string>> {
    if (submissionIds.length === 0) return new Set();
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'in', submissionIds);
      qb.where('user_id', 'eq', userId);
      return qb;
    });
    return new Set(rows.map((r) => r.submission_id));
  }

  async function list_voters(submissionId: string, opts: { limit: number; offset: number }): Promise<FeedbackVote[]> {
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'eq', submissionId);
      qb.order('created_at', 'asc');
      qb.limit(opts.limit);
      qb.offset(opts.offset);
      return qb;
    });
    return rows.map(row_to_vote);
  }

  async function toggle_vote(submissionId: string, userId: string): Promise<{ voted: boolean; count: number }> {
    const existing = await svc.findOneBy({ submission_id: submissionId, user_id: userId });
    if (existing) {
      await svc.deleteBy({ submission_id: submissionId, user_id: userId });
      const count = await count_votes(submissionId);
      return { voted: false, count };
    } else {
      await svc.insert({
        id: randomUUID(),
        submission_id: submissionId,
        user_id: userId,
        created_at: new Date().toISOString(),
      });
      const count = await count_votes(submissionId);
      return { voted: true, count };
    }
  }

  return {
    has_voted,
    count_votes,
    count_votes_for,
    user_voted_for,
    list_voters,
    toggle_vote,
    raw: svc,
  };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- --testPathPattern=vote_service
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/vote_service.ts src/__tests__/vote_service.test.ts
git commit -m "feat(db): vote_service with toggle, count, and listing"
```

---

### Task 2.5 — Add reply email templates to manifest

**Files:**
- Create: `src/email_templates/feedback_admin_reply_to_user.html`
- Create: `src/email_templates/feedback_admin_reply_to_user.txt`
- Create: `src/email_templates/feedback_user_reply_to_admin.html`
- Create: `src/email_templates/feedback_user_reply_to_admin.txt`
- Modify: `src/manifest.ts`

- [ ] **Step 1: Create the four template files**

`src/email_templates/feedback_admin_reply_to_user.html`:
```html
<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <p>Hi {{name}},</p>
  <p>You have a new reply on your feedback (<code>{{ref_id}}</code> &mdash; {{subject}}):</p>
  <blockquote style="border-left: 3px solid #ddd; padding-left: 12px; color: #555;">
    {{reply_body_preview}}
  </blockquote>
  <p><a href="{{thread_url}}" style="display: inline-block; padding: 10px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px;">View full conversation</a></p>
  <p style="color: #888; font-size: 12px;">&mdash; {{replier_name}}</p>
</body></html>
```

`src/email_templates/feedback_admin_reply_to_user.txt`:
```text
Hi {{name}},

You have a new reply on your feedback ({{ref_id}} — {{subject}}):

{{reply_body_preview}}

View the full conversation: {{thread_url}}

— {{replier_name}}
```

`src/email_templates/feedback_user_reply_to_admin.html`:
```html
<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <p>{{replier_name}} replied on feedback <code>{{ref_id}}</code> &mdash; {{subject}} ({{category}}):</p>
  <blockquote style="border-left: 3px solid #ddd; padding-left: 12px; color: #555;">
    {{reply_body_preview}}
  </blockquote>
  <p><a href="{{thread_url}}" style="display: inline-block; padding: 10px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px;">Open in admin</a></p>
</body></html>
```

`src/email_templates/feedback_user_reply_to_admin.txt`:
```text
{{replier_name}} replied on feedback {{ref_id}} — {{subject}} ({{category}}):

{{reply_body_preview}}

Open in admin: {{thread_url}}
```

- [ ] **Step 2: Update `src/manifest.ts`**

Replace the body with:

```typescript
import "server-only";

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import type { SystemTemplateManifest } from "hazo_notify/template_manager";

const __dirname = dirname(fileURLToPath(import.meta.url));

function load(name: string): string {
  return readFileSync(join(__dirname, "./email_templates/", name), "utf-8");
}

const ack_html = load("feedback_acknowledgement.html");
const ack_text = load("feedback_acknowledgement.txt");
const admin_reply_html = load("feedback_admin_reply_to_user.html");
const admin_reply_text = load("feedback_admin_reply_to_user.txt");
const user_reply_html = load("feedback_user_reply_to_admin.html");
const user_reply_text = load("feedback_user_reply_to_admin.txt");

const REPLY_VARS = [
  { variable_name: "ref_id",             variable_description: "Submission ref id" },
  { variable_name: "name",               variable_description: "Recipient's display name" },
  { variable_name: "subject",            variable_description: "Submission subject line" },
  { variable_name: "category",           variable_description: "Submission category" },
  { variable_name: "reply_body_preview", variable_description: "Plain-text reply preview (<=500 chars)" },
  { variable_name: "thread_url",         variable_description: "Absolute URL to the thread page" },
  { variable_name: "replier_name",       variable_description: "Display name of the reply author" },
];

export const hazo_feedback_template_manifest: SystemTemplateManifest[] = [
  {
    template_name: "feedback_acknowledgement",
    template_label: "Feedback Acknowledgement",
    category: "Feedback",
    html: ack_html,
    text: ack_text,
    variables: [
      { variable_name: "ref_id",       variable_description: "Reference ID for this submission" },
      { variable_name: "name",         variable_description: "Submitter's name (defaults to 'there')" },
      { variable_name: "subject",      variable_description: "Feedback subject line" },
      { variable_name: "category",     variable_description: "Feedback category (bug/feature/general/praise)" },
      { variable_name: "submitted_at", variable_description: "Submission timestamp (ISO 8601)" },
    ],
  },
  {
    template_name: "feedback_admin_reply_to_user",
    template_label: "Feedback: Admin Reply",
    category: "Feedback",
    html: admin_reply_html,
    text: admin_reply_text,
    variables: REPLY_VARS,
  },
  {
    template_name: "feedback_user_reply_to_admin",
    template_label: "Feedback: User Reply",
    category: "Feedback",
    html: user_reply_html,
    text: user_reply_text,
    variables: REPLY_VARS,
  },
];
```

- [ ] **Step 3: Build + sanity-check**

```bash
npm run build && ls dist/email_templates
```
Expected: 6 files.

- [ ] **Step 4: Commit**

```bash
git add src/email_templates/feedback_admin_reply_to_user.html \
        src/email_templates/feedback_admin_reply_to_user.txt \
        src/email_templates/feedback_user_reply_to_admin.html \
        src/email_templates/feedback_user_reply_to_admin.txt \
        src/manifest.ts
git commit -m "feat(templates): add admin/user reply email templates to manifest"
```

---

### Task 2.6 — Write `send_reply_notification.ts` (TDD)

**Files:**
- Create: `src/notify/send_reply_notification.ts`
- Create: `src/__tests__/send_reply_notification.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const dispatchSpy = jest.fn(async () => ({
  inbox_rows_upserted: 1,
  inbox_rows_inserted: 1,
  inbox_rows_aggregated: 0,
  deliveries_created: 1,
  deliveries_refreshed: 0,
  channels_dispatched: ['email', 'in_app'],
}));

jest.mock('hazo_notify', () => ({ dispatch: dispatchSpy }));

import { send_reply_notification } from '../notify/send_reply_notification.js';

describe('send_reply_notification', () => {
  beforeEach(() => dispatchSpy.mockClear());

  it('dispatches both in_app and email when emailEnabled=true', async () => {
    await send_reply_notification({
      direction: 'admin_to_user',
      recipientUserIds: ['user-1'],
      refId: 'PRO-1A2B3',
      submissionId: 'sub-1',
      subject: 'Why is this broken',
      category: 'bug',
      replyBodyText: 'We pushed a fix in v2.1.4',
      replierName: 'Pat',
      threadUrl: 'https://example.com/feedback/thread/PRO-1A2B3',
      emailEnabled: true,
      from: 'feedback@example.com',
      fromName: 'Example Feedback',
      scopeId: '',
    });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const arg = dispatchSpy.mock.calls[0][0];
    expect(arg.event_type).toBe('hazo_feedback.reply_received');
    expect(arg.recipient_user_ids).toEqual(['user-1']);
    expect(arg.surfaces).toEqual({ in_app: true, banner: false });
    expect(arg.channels).toEqual({ in_app: true, email: true });
    expect(arg.channel_payloads.email.template_name).toBe('feedback_admin_reply_to_user');
    expect(arg.channel_payloads.email.variables.reply_body_preview).toBe('We pushed a fix in v2.1.4');
  });

  it('skips email channel when emailEnabled=false', async () => {
    await send_reply_notification({
      direction: 'user_to_admin',
      recipientUserIds: ['admin-1', 'admin-2'],
      refId: 'PRO-1A2B3',
      submissionId: 'sub-1',
      subject: 'Why is this broken',
      category: 'bug',
      replyBodyText: 'Thanks!',
      replierName: 'Alex',
      threadUrl: 'https://example.com/admin/feedback/sub-1',
      emailEnabled: false,
      from: '',
      fromName: '',
      scopeId: '',
    });
    const arg = dispatchSpy.mock.calls[0][0];
    expect(arg.channels).toEqual({ in_app: true });
    expect(arg.channel_payloads.email).toBeUndefined();
    expect(arg.channel_payloads.in_app).toBeDefined();
    expect(arg.recipient_user_ids).toEqual(['admin-1', 'admin-2']);
  });

  it('truncates reply_body_preview to 500 chars (+ ellipsis)', async () => {
    const long = 'x'.repeat(800);
    await send_reply_notification({
      direction: 'admin_to_user',
      recipientUserIds: ['user-1'],
      refId: 'PRO-X',
      submissionId: 'sub-x',
      subject: 'S',
      category: 'general',
      replyBodyText: long,
      replierName: 'A',
      threadUrl: '/x',
      emailEnabled: true,
      from: 'a@b.c',
      fromName: '',
      scopeId: '',
    });
    const arg = dispatchSpy.mock.calls[0][0];
    const preview: string = arg.channel_payloads.email.variables.reply_body_preview;
    expect(preview.length).toBeLessThanOrEqual(503);
    expect(preview.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --testPathPattern=send_reply_notification
```

- [ ] **Step 3: Implement `src/notify/send_reply_notification.ts`**

```typescript
import 'server-only';
import { dispatch } from 'hazo_notify';

export type ReplyDirection = 'admin_to_user' | 'user_to_admin';

export interface SendReplyNotificationOptions {
  direction: ReplyDirection;
  recipientUserIds: string[];
  refId: string;
  submissionId: string;
  subject: string;
  category: string;
  replyBodyText: string;
  replierName: string;
  threadUrl: string;
  emailEnabled: boolean;
  from: string;
  fromName?: string;
  scopeId: string;
}

const PREVIEW_LIMIT = 500;

function preview(body: string): string {
  if (body.length <= PREVIEW_LIMIT) return body;
  return body.slice(0, PREVIEW_LIMIT) + '…';
}

export async function send_reply_notification(opts: SendReplyNotificationOptions): Promise<void> {
  const template_name =
    opts.direction === 'admin_to_user'
      ? 'feedback_admin_reply_to_user'
      : 'feedback_user_reply_to_admin';

  const reply_body_preview = preview(opts.replyBodyText);

  const variables = {
    ref_id: opts.refId,
    name: '',
    subject: opts.subject,
    category: opts.category,
    reply_body_preview,
    thread_url: opts.threadUrl,
    replier_name: opts.replierName,
  };

  const in_app_text =
    opts.direction === 'admin_to_user'
      ? `Reply on your feedback ${opts.refId}`
      : `${opts.replierName} replied on ${opts.refId}`;

  const channels: Partial<Record<string, boolean>> = { in_app: true };
  const channel_payloads: Record<string, Record<string, unknown>> = {
    in_app: {
      title: in_app_text,
      body_preview: reply_body_preview,
      action_url: opts.threadUrl,
    },
  };

  if (opts.emailEnabled) {
    channels.email = true;
    channel_payloads.email = {
      template_name,
      from: opts.from,
      from_name: opts.fromName,
      variables,
    };
  }

  try {
    await dispatch({
      event_type: 'hazo_feedback.reply_received',
      subject_id: opts.submissionId,
      scope_id: opts.scopeId,
      recipient_user_ids: opts.recipientUserIds,
      in_app_text,
      deep_link: opts.threadUrl,
      surfaces: { in_app: true, banner: false },
      channels,
      channel_payloads,
      batch_window_ms: 0,
    });
  } catch (err) {
    console.warn('[hazo_feedback] send_reply_notification failed', {
      direction: opts.direction,
      ref_id: opts.refId,
      error: String(err),
    });
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- --testPathPattern=send_reply_notification
```

- [ ] **Step 5: Commit**

```bash
git add src/notify/send_reply_notification.ts src/__tests__/send_reply_notification.test.ts
git commit -m "feat(notify): dispatch wrapper for admin/user reply notifications"
```

---

### Task 2.7 — Validators for reply payloads (TDD)

**Files:**
- Create: `src/server/validators/reply_payload.ts`
- Create: `src/__tests__/reply_payload.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from '@jest/globals';
import { validate_reply_payload } from '../server/validators/reply_payload.js';

describe('validate_reply_payload', () => {
  it('accepts a well-formed payload', () => {
    const r = validate_reply_payload({ body_html: '<p>Hello</p>', body_text: 'Hello' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body_html).toBe('<p>Hello</p>');
      expect(r.body_text).toBe('Hello');
    }
  });

  it('rejects missing body_text', () => {
    const r = validate_reply_payload({ body_html: '<p>x</p>', body_text: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/body_text/);
  });

  it('rejects body_text longer than 5000 chars', () => {
    const r = validate_reply_payload({ body_html: '<p>x</p>', body_text: 'x'.repeat(5001) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/5000/);
  });

  it('rejects non-string fields', () => {
    const r = validate_reply_payload({ body_html: 123, body_text: 'x' } as unknown as Record<string, unknown>);
    expect(r.ok).toBe(false);
  });

  it('rejects empty after trim', () => {
    const r = validate_reply_payload({ body_html: '<p>   </p>', body_text: '   ' });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --testPathPattern=reply_payload
```

- [ ] **Step 3: Implement `src/server/validators/reply_payload.ts`**

```typescript
export type ReplyPayloadResult =
  | { ok: true; body_html: string; body_text: string }
  | { ok: false; error: string };

const MAX_BODY_TEXT = 5000;

export function validate_reply_payload(input: unknown): ReplyPayloadResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const obj = input as Record<string, unknown>;
  const body_html = obj.body_html;
  const body_text = obj.body_text;
  if (typeof body_html !== 'string') return { ok: false, error: 'body_html must be a string' };
  if (typeof body_text !== 'string') return { ok: false, error: 'body_text must be a string' };
  if (body_text.trim().length === 0) return { ok: false, error: 'body_text must not be empty' };
  if (body_text.length > MAX_BODY_TEXT) {
    return { ok: false, error: `body_text exceeds 5000 chars (got ${body_text.length})` };
  }
  return { ok: true, body_html, body_text };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- --testPathPattern=reply_payload
```

- [ ] **Step 5: Commit**

```bash
git add src/server/validators/reply_payload.ts src/__tests__/reply_payload.test.ts
git commit -m "feat(server): reply payload validator"
```

---

### Task 2.8 — Handler: `POST /admin/:id/reply`

**Files:**
- Create: `src/server/handlers/admin_reply.ts`

- [ ] **Step 1: Create the handler**

```typescript
import 'server-only';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import { sanitize_body_html } from '../../sanitize/body_html.js';
import { send_reply_notification } from '../../notify/send_reply_notification.js';
import { validate_reply_payload } from '../validators/reply_payload.js';
import { get_feedback_config } from '../../config/load_config.js';
import type { Logger } from '../../types.js';

interface AdminReplyOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  threadUrlBuilder?: (refId: string, submissionId: string) => string;
  notifyOptions?: { from: string; fromName?: string };
  logger?: Logger;
}

export async function handle_admin_reply(
  request: NextRequest,
  params: Record<string, string>,
  opts: AdminReplyOptions,
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, threadUrlBuilder, notifyOptions, logger } = opts;
  const config = get_feedback_config();

  try {
    const auth = await hazo_get_auth(
      request as unknown as Parameters<typeof hazo_get_auth>[0],
      { required_permissions: [adminScope] },
    );
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.permission_ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const id = params.id;
    if (!id) return NextResponse.json({ error: 'Missing submission id' }, { status: 400 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const v = validate_reply_payload(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 });

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);

    const submission = await submission_service.get_submission(id);
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (submission.marked_spam) return NextResponse.json({ error: 'Forbidden (spam)' }, { status: 403 });

    const safe_html = sanitize_body_html(v.body_html, new Map());

    const event_id = randomUUID();
    const event = await event_service.log_event({
      id: event_id,
      submission_id: id,
      actor_id: (auth.user as { id: string })?.id ?? null,
      event_type: 'admin_reply',
      from_value: null,
      to_value: null,
      comment: null,
      body_html: safe_html,
      body_text: v.body_text,
    });

    if (submission.user_id) {
      const thread_url = (threadUrlBuilder ?? ((refId) => `/feedback/thread/${refId}`))(
        submission.ref_id,
        submission.id,
      );

      send_reply_notification({
        direction: 'admin_to_user',
        recipientUserIds: [submission.user_id],
        refId: submission.ref_id,
        submissionId: submission.id,
        subject: submission.subject ?? '(no subject)',
        category: submission.category,
        replyBodyText: v.body_text,
        replierName: (auth.user as { name?: string })?.name ?? 'Support',
        threadUrl: thread_url,
        emailEnabled: config.notifyConfig.replyEmailToUserEnabled,
        from: notifyOptions?.from ?? '',
        fromName: notifyOptions?.fromName,
        scopeId: '',
      }).catch((err: unknown) => {
        logger?.warn('handle_admin_reply: notification failed', { error: String(err) });
      });
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    logger?.error('handle_admin_reply: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/server/handlers/admin_reply.ts
git commit -m "feat(server): admin reply handler (POST /admin/:id/reply)"
```

---

### Task 2.9 — Handler: `POST /thread/:refId/reply` (user)

**Files:**
- Create: `src/server/handlers/user_reply.ts`

- [ ] **Step 1: Create the handler**

```typescript
import 'server-only';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import { sanitize_body_html } from '../../sanitize/body_html.js';
import { send_reply_notification } from '../../notify/send_reply_notification.js';
import { validate_reply_payload } from '../validators/reply_payload.js';
import { check_rate_limit } from '../../rate_limit/token_bucket.js';
import { get_feedback_config } from '../../config/load_config.js';
import type { Logger } from '../../types.js';

interface UserReplyOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  threadUrlBuilder?: (refId: string, submissionId: string) => string;
  notifyOptions?: { from: string; fromName?: string };
  listAdminsForBroadcast?: () => Promise<string[]>;
  logger?: Logger;
}

export async function handle_user_reply(
  request: NextRequest,
  params: Record<string, string>,
  opts: UserReplyOptions,
): Promise<NextResponse> {
  const { getHazoConnect, appId, threadUrlBuilder, notifyOptions, listAdminsForBroadcast, logger } = opts;
  const config = get_feedback_config();

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const refId = params.refId;
    if (!refId) return NextResponse.json({ error: 'Missing refId' }, { status: 400 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const v = validate_reply_payload(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 });

    const userId = auth.user.id;
    const rate_ok = check_rate_limit(`${appId}:user_reply:${userId}`, config.rateLimitConfig);
    if (!rate_ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);

    const submission = await submission_service.get_submission_by_ref(refId);
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (submission.marked_spam) return NextResponse.json({ error: 'Forbidden (spam)' }, { status: 403 });
    if (submission.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const admin_reply_count = await event_service.count_admin_replies(submission.id);
    if (admin_reply_count === 0) {
      return NextResponse.json(
        { error: 'Cannot reply before admin response' },
        { status: 409 },
      );
    }

    const safe_html = sanitize_body_html(v.body_html, new Map());
    const event = await event_service.log_event({
      id: randomUUID(),
      submission_id: submission.id,
      actor_id: userId,
      event_type: 'user_reply',
      from_value: null,
      to_value: null,
      comment: null,
      body_html: safe_html,
      body_text: v.body_text,
    });

    if (listAdminsForBroadcast) {
      const admin_ids = await listAdminsForBroadcast();
      if (admin_ids.length > 0) {
        const thread_url = (threadUrlBuilder ?? ((r) => `/feedback/thread/${r}`))(submission.ref_id, submission.id);
        send_reply_notification({
          direction: 'user_to_admin',
          recipientUserIds: admin_ids,
          refId: submission.ref_id,
          submissionId: submission.id,
          subject: submission.subject ?? '(no subject)',
          category: submission.category,
          replyBodyText: v.body_text,
          replierName: auth.user.name ?? auth.user.email_address ?? 'User',
          threadUrl: thread_url,
          emailEnabled: config.notifyConfig.replyEmailToAdminEnabled,
          from: notifyOptions?.from ?? '',
          fromName: notifyOptions?.fromName,
          scopeId: '',
        }).catch((err: unknown) => {
          logger?.warn('handle_user_reply: notification failed', { error: String(err) });
        });
      }
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    logger?.error('handle_user_reply: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/server/handlers/user_reply.ts
git commit -m "feat(server): user reply handler (POST /thread/:refId/reply)"
```

---

### Task 2.10 — Handler: `GET /thread/:refId`

**Files:**
- Create: `src/server/handlers/thread.ts`

- [ ] **Step 1: Create the handler**

```typescript
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import { create_attachment_service } from '../../db/attachment_service.js';
import type { Logger } from '../../types.js';

interface ThreadOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

export async function handle_thread(
  request: NextRequest,
  params: Record<string, string>,
  opts: ThreadOptions,
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, logger } = opts;
  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const refId = params.refId;
    if (!refId) return NextResponse.json({ error: 'Missing refId' }, { status: 400 });

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);
    const attachment_service = create_attachment_service(adapter);

    const submission = await submission_service.get_submission_by_ref(refId);
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const is_admin = (auth.permissions ?? []).includes(adminScope);
    const is_submitter = submission.user_id === auth.user.id;
    if (!is_admin && !is_submitter) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const replies = await event_service.list_replies_for_submission(submission.id);
    const reply_ids = replies.map((r) => r.id);
    const attachment_lists = await Promise.all(reply_ids.map((rid) => attachment_service.list_for_event(rid)));
    const reply_attachments_by_event = new Map<string, unknown[]>();
    reply_ids.forEach((rid, i) => reply_attachments_by_event.set(rid, attachment_lists[i]));

    return NextResponse.json({
      submission: {
        id: submission.id,
        ref_id: submission.ref_id,
        subject: submission.subject,
        category: submission.category,
        status: submission.status,
        created_at: submission.created_at,
        user_id: submission.user_id,
      },
      replies: replies.map((r) => ({
        id: r.id,
        actor_id: r.actor_id,
        event_type: r.event_type,
        body_html: r.body_html,
        body_text: r.body_text,
        attachments: reply_attachments_by_event.get(r.id) ?? [],
        created_at: r.created_at,
      })),
      viewer_role: is_admin ? 'admin' : 'submitter',
      can_reply: is_submitter && replies.some((r) => r.event_type === 'admin_reply'),
    });
  } catch (err) {
    logger?.error('handle_thread: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/server/handlers/thread.ts
git commit -m "feat(server): thread GET handler with viewer_role + can_reply"
```

---

### Task 2.11 — Wire R5 routes into router + factory

**Files:**
- Modify: `src/server/factory.ts`
- Modify: `src/server/handlers/submit.ts`

- [ ] **Step 1: Confirm `match_route` handles `:placeholder` segments**

```bash
grep -n "match_route\|extract_feedback_path" src/server/router.ts | head -10
```
The existing routes use `:id` (e.g. `['admin', ':id', 'comment']`), so `:refId` and `:submissionId` work the same way — no router changes required.

- [ ] **Step 2: Extend `resolve_options` return type**

In `src/server/factory.ts`, update `resolve_options` to thread the new options:

```typescript
function resolve_options(options: FeedbackServerOptions): {
  appId: string;
  adminScope: string;
  getHazoConnect: () => Promise<unknown> | unknown;
  getFileManager: () => Promise<unknown> | unknown;
  notifyOptions: FeedbackServerOptions['notifyOptions'];
  threadUrlBuilder: FeedbackServerOptions['threadUrlBuilder'];
  listAdminsForBroadcast: FeedbackServerOptions['listAdminsForBroadcast'];
  logger: FeedbackServerOptions['logger'];
} {
  const config = get_feedback_config();
  return {
    appId:                  options.appId        ?? config.appId,
    adminScope:             options.adminScope   ?? config.adminScope,
    getHazoConnect:         options.getHazoConnect,
    getFileManager:         options.getFileManager,
    notifyOptions:          options.notifyOptions,
    threadUrlBuilder:       options.threadUrlBuilder,
    listAdminsForBroadcast: options.listAdminsForBroadcast,
    logger:                 options.logger,
  };
}
```

- [ ] **Step 3: Add new imports + route entries**

At the top of `factory.ts`:
```typescript
import { handle_admin_reply } from './handlers/admin_reply.js';
import { handle_user_reply } from './handlers/user_reply.js';
import { handle_thread } from './handlers/thread.js';
```

Inside the POST block in `dispatch`, after the existing `'admin', ':id', 'comment'` match:
```typescript
const admin_reply_params = match_route(segments, ['admin', ':id', 'reply']);
if (admin_reply_params !== null) {
  return handle_admin_reply(request, admin_reply_params, {
    getHazoConnect:   resolved.getHazoConnect,
    appId:            resolved.appId,
    adminScope:       resolved.adminScope,
    threadUrlBuilder: resolved.threadUrlBuilder,
    notifyOptions:    resolved.notifyOptions
      ? { from: resolved.notifyOptions.from, fromName: resolved.notifyOptions.fromName }
      : undefined,
    logger:           resolved.logger,
  });
}

const user_reply_params = match_route(segments, ['thread', ':refId', 'reply']);
if (user_reply_params !== null) {
  return handle_user_reply(request, user_reply_params, {
    getHazoConnect:         resolved.getHazoConnect,
    appId:                  resolved.appId,
    adminScope:             resolved.adminScope,
    threadUrlBuilder:       resolved.threadUrlBuilder,
    notifyOptions:          resolved.notifyOptions
      ? { from: resolved.notifyOptions.from, fromName: resolved.notifyOptions.fromName }
      : undefined,
    listAdminsForBroadcast: resolved.listAdminsForBroadcast,
    logger:                 resolved.logger,
  });
}
```

Inside the GET block, before the existing `'admin', ':id'` match:
```typescript
const thread_params = match_route(segments, ['thread', ':refId']);
if (thread_params !== null) {
  return handle_thread(request, thread_params, {
    getHazoConnect: resolved.getHazoConnect,
    appId:          resolved.appId,
    adminScope:     resolved.adminScope,
    logger:         resolved.logger,
  });
}
```

- [ ] **Step 4: Extend `SubmitHandlerOptions` and `wrap_submit` to pass `threadUrlBuilder`**

In `src/server/handlers/submit.ts`, the `SubmitHandlerOptions` interface adds:
```typescript
  threadUrlBuilder?: (refId: string, submissionId: string) => string;
```

Add `threadUrlBuilder` to the destructure at the top of `handle_submit`:
```typescript
const { getHazoConnect, getFileManager, appId, notifyOptions, threadUrlBuilder, logger } = opts;
```

Replace the existing `deepLink: \`/feedback/thread/${ref_id}\`` in the `send_acknowledgement` call with:
```typescript
deepLink: (threadUrlBuilder ?? ((r) => `/feedback/thread/${r}`))(ref_id, submission_id),
```

In `factory.ts`, update `wrap_submit`:
```typescript
function wrap_submit(opts: ResolvedOpts) {
  return (request: NextRequest, _params: Record<string, string>): Promise<NextResponse> =>
    handle_submit(request, {
      getHazoConnect:   opts.getHazoConnect,
      getFileManager:   opts.getFileManager,
      appId:            opts.appId,
      adminScope:       opts.adminScope,
      notifyOptions:    opts.notifyOptions,
      threadUrlBuilder: opts.threadUrlBuilder,
      logger:           opts.logger,
    });
}
```

- [ ] **Step 5: Build + commit**

```bash
npm run build
git add src/server/factory.ts src/server/handlers/submit.ts
git commit -m "feat(server): wire R5 routes + threadUrlBuilder through factory"
```

---

## Phase 3 — Reply thread UI (R5)

### Task 3.1 — `RawHtml.tsx` helper (centralizes sanitized-HTML rendering)

**Files:**
- Create: `src/widget/RawHtml.tsx`

**Why a helper:** The reply UI needs to render server-sanitized `body_html`. React's standard escape hatch for raw HTML must be paired with a clearly-stated sanitization contract; this helper centralizes that contract in one file. **Do not** call React's raw-HTML attribute directly in any other client file in this package — always go through `<RawHtml />`.

- [ ] **Step 1: Create the helper**

```tsx
'use client';

/**
 * Renders pre-sanitized HTML.
 *
 * SECURITY CONTRACT:
 *   The `html` prop MUST already be sanitized server-side via
 *   `sanitize_body_html` (which wraps `isomorphic-dompurify`).
 *   This component is the ONLY place in hazo_feedback's client
 *   bundle that uses React's raw-HTML escape hatch. Any consumer
 *   of <RawHtml /> implicitly asserts that contract.
 *
 *   If the caller has untrusted HTML, they MUST sanitize it
 *   before passing it here — there is no defense-in-depth in
 *   this component (intentional: a sanitizer would have to be
 *   bundled into the client, blowing up the size).
 */
export function RawHtml({ html, className }: { html: string; className?: string }) {
  // eslint-disable-next-line react/no-danger
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/widget/RawHtml.tsx
git commit -m "feat(client): RawHtml helper with documented sanitization contract"
```

---

### Task 3.2 — `ConversationTab.tsx` (admin)

**Files:**
- Create: `src/admin/tabs/ConversationTab.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState } from 'react';
import type { FeedbackEvent } from '../../types.js';
import { RawHtml } from '../../widget/RawHtml.js';

interface ConversationTabProps {
  submissionId: string;
  events: FeedbackEvent[];
  apiBase: string;
  onPosted: () => void;
}

function MessageBubble({ event }: { event: FeedbackEvent }) {
  const isAdmin = event.event_type === 'admin_reply';
  return (
    <div className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} mb-3`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isAdmin ? 'bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-900'}`}>
        <div className="text-[11px] font-medium uppercase tracking-wide mb-1 opacity-70">
          {isAdmin ? 'Admin' : 'User'} · {new Date(event.created_at).toLocaleString()}
        </div>
        {event.body_html ? (
          <RawHtml html={event.body_html} className="prose prose-sm max-w-none" />
        ) : (
          <div className="whitespace-pre-wrap">{event.body_text}</div>
        )}
      </div>
    </div>
  );
}

export function ConversationTab({ submissionId, events, apiBase, onPosted }: ConversationTabProps) {
  const replies = events.filter((e) => e.event_type === 'admin_reply' || e.event_type === 'user_reply');
  const [bodyText, setBodyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!bodyText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/admin/${submissionId}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_html: `<p>${bodyText.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`,
          body_text: bodyText,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      setBodyText('');
      onPosted();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto mb-3">
        {replies.length === 0 ? (
          <p className="text-sm italic text-gray-400">(no conversation yet)</p>
        ) : (
          replies.map((e) => <MessageBubble key={e.id} event={e} />)
        )}
      </div>
      <div className="border-t pt-3">
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Reply to user…"
          className="w-full p-2 border rounded text-sm min-h-[80px]"
          disabled={submitting}
        />
        {error ? <p className="text-xs text-red-600 mt-1">{error}</p> : null}
        <div className="flex justify-end mt-2">
          <button
            onClick={submit}
            disabled={submitting || !bodyText.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded disabled:opacity-50 hover:bg-blue-700"
          >
            {submitting ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

> **On the textarea + body_html shape:** v2.1.0 keeps the admin composer as a plain textarea (no Tiptap) to avoid bundling a second editor instance into the admin chunk. The client wraps user input as a minimal `<p>` for body_html (escaping `<` to prevent injection at the source); the server still calls `sanitize_body_html` on receipt. A future task may swap the textarea for `FeedbackBodyEditor` (Tiptap) — the wire format already supports rich HTML.

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/admin/tabs/ConversationTab.tsx
git commit -m "feat(admin): Conversation tab with plain-text reply composer"
```

---

### Task 3.3 — Integrate `ConversationTab` into `SubmissionDetail`

**Files:**
- Modify: `src/admin/SubmissionDetail.tsx`

- [ ] **Step 1: Locate the tab switcher**

```bash
grep -n "activeTab\|TabKey\|'overview'" src/admin/SubmissionDetail.tsx | head -20
```

- [ ] **Step 2: Add `'conversation'` to the tab union, import, button, and content slot**

Inside the file:

```tsx
// at top:
import { ConversationTab } from './tabs/ConversationTab.js';

// Update the TabKey union:
type TabKey = 'overview' | 'conversation' | 'activity' | 'context' | 'attachments';

// In the tab bar, after the Overview button and before Activity:
<button
  onClick={() => setActiveTab('conversation')}
  className={activeTab === 'conversation' ? 'tab-active' : 'tab'}
>
  Conversation
</button>

// In the content area:
{activeTab === 'conversation' && (
  <ConversationTab
    submissionId={submission.id}
    events={events}
    apiBase={apiBase}
    onPosted={refetch}
  />
)}
```

Match the surrounding className conventions for tab buttons (copy from OverviewTab/ActivityTab buttons). If `refetch` doesn't exist with that name, use whatever the file calls for re-fetching detail (look for the function that loads `events`).

- [ ] **Step 3: Build, commit**

```bash
npm run build
git add src/admin/SubmissionDetail.tsx
git commit -m "feat(admin): wire Conversation tab into SubmissionDetail"
```

---

### Task 3.4 — `FeedbackThread.tsx` (user-facing component)

**Files:**
- Create: `src/widget/FeedbackThread.tsx`
- Modify: `src/index.client.ts`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { RawHtml } from './RawHtml.js';

interface ThreadReply {
  id: string;
  actor_id: string | null;
  event_type: 'admin_reply' | 'user_reply';
  body_html: string | null;
  body_text: string | null;
  created_at: string;
}

interface ThreadResponse {
  submission: {
    id: string;
    ref_id: string;
    subject: string | null;
    category: string;
    status: string;
    created_at: string;
    user_id: string | null;
  };
  replies: ThreadReply[];
  viewer_role: 'admin' | 'submitter';
  can_reply: boolean;
}

export interface FeedbackThreadProps {
  refId: string;
  apiBase?: string;
  translate?: (key: string, vars?: Record<string, string>) => string;
}

const DEFAULT_T = (k: string) => k;

function Bubble({ reply, t }: { reply: ThreadReply; t: (k: string, v?: Record<string, string>) => string }) {
  const isAdmin = reply.event_type === 'admin_reply';
  return (
    <div className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} mb-3`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isAdmin ? 'bg-blue-50' : 'bg-gray-100'}`}>
        <div className="text-[11px] uppercase tracking-wide mb-1 opacity-70">
          {isAdmin ? t('thread.author.admin') : t('thread.author.you')} · {new Date(reply.created_at).toLocaleString()}
        </div>
        {reply.body_html ? (
          <RawHtml html={reply.body_html} className="prose prose-sm max-w-none" />
        ) : (
          <div className="whitespace-pre-wrap">{reply.body_text}</div>
        )}
      </div>
    </div>
  );
}

export function FeedbackThread({ refId, apiBase = '/api/feedback', translate }: FeedbackThreadProps) {
  const t = translate ?? DEFAULT_T;
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/thread/${encodeURIComponent(refId)}`, { credentials: 'include' });
      if (res.status === 401) { setError(t('thread.error.unauthorized')); return; }
      if (res.status === 403) { setError(t('thread.error.forbidden')); return; }
      if (res.status === 404) { setError(t('thread.error.not_found')); return; }
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      setData(await res.json());
    } catch (err) {
      setError(String(err));
    }
  }, [apiBase, refId, t]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!bodyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/thread/${encodeURIComponent(refId)}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_html: `<p>${bodyText.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`,
          body_text: bodyText,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      setBodyText('');
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (!data)   return <div className="p-4 text-sm text-gray-500">{t('thread.loading')}</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <header className="border-b pb-3 mb-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">{data.submission.category} · {data.submission.ref_id}</div>
        <h1 className="text-lg font-semibold">{data.submission.subject ?? t('thread.no_subject')}</h1>
        <div className="text-xs text-gray-400 mt-1">{new Date(data.submission.created_at).toLocaleString()}</div>
      </header>

      <section className="mb-4">
        {data.replies.length === 0 ? (
          <p className="text-sm italic text-gray-400">{t('thread.empty')}</p>
        ) : (
          data.replies.map((r) => <Bubble key={r.id} reply={r} t={t} />)
        )}
      </section>

      {data.can_reply ? (
        <div className="border-t pt-3">
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder={t('thread.compose.placeholder')}
            className="w-full p-2 border rounded text-sm min-h-[80px]"
            disabled={submitting}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={submit}
              disabled={submitting || !bodyText.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded disabled:opacity-50 hover:bg-blue-700"
            >
              {submitting ? t('thread.compose.sending') : t('thread.compose.send')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs italic text-gray-400 border-t pt-3">{t('thread.cannot_reply')}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Export from `src/index.client.ts`**

Append:
```typescript
export { FeedbackThread } from './widget/FeedbackThread.js';
export type { FeedbackThreadProps } from './widget/FeedbackThread.js';
```

- [ ] **Step 3: Build, commit**

```bash
npm run build
git add src/widget/FeedbackThread.tsx src/index.client.ts
git commit -m "feat(client): standalone FeedbackThread component"
```

---

## Phase 4 — Voting server (R2)

### Task 4.1 — Vote handler `POST /vote/:submissionId`

**Files:**
- Create: `src/server/handlers/vote.ts`

- [ ] **Step 1: Create the handler**

```typescript
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_vote_service } from '../../db/vote_service.js';
import { check_rate_limit } from '../../rate_limit/token_bucket.js';
import { get_feedback_config } from '../../config/load_config.js';
import type { Logger } from '../../types.js';

interface VoteOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  logger?: Logger;
}

export async function handle_vote(
  request: NextRequest,
  params: Record<string, string>,
  opts: VoteOptions,
): Promise<NextResponse> {
  const { getHazoConnect, appId, logger } = opts;
  const config = get_feedback_config();

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const submissionId = params.submissionId;
    if (!submissionId) return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });

    const rate_ok = check_rate_limit(`${appId}:vote:${userId}`, config.rateLimitConfig);
    if (!rate_ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const vote_service = create_vote_service(adapter);

    const submission = await submission_service.get_submission(submissionId);
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (submission.marked_spam) return NextResponse.json({ error: 'Forbidden (spam)' }, { status: 403 });
    if (submission.category !== 'feature') {
      return NextResponse.json({ error: 'Only feature requests are votable' }, { status: 422 });
    }
    if (!submission.is_public) {
      return NextResponse.json({ error: 'Submission is not public' }, { status: 403 });
    }

    const result = await vote_service.toggle_vote(submissionId, userId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logger?.error('handle_vote: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/server/handlers/vote.ts
git commit -m "feat(server): vote toggle handler"
```

---

### Task 4.2 — Public board handler `GET /public-board`

**Files:**
- Create: `src/server/handlers/public_board.ts`

- [ ] **Step 1: Create the handler**

```typescript
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_vote_service } from '../../db/vote_service.js';
import type { Logger } from '../../types.js';

interface BoardOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  logger?: Logger;
}

const PREVIEW_CHARS = 500;

export async function handle_public_board(
  request: NextRequest,
  _params: Record<string, string>,
  opts: BoardOptions,
): Promise<NextResponse> {
  const { getHazoConnect, appId, logger } = opts;
  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const url = new URL(request.url);
    const sp = url.searchParams;
    const rawPage = parseInt(sp.get('page') ?? '1', 10);
    const page = isNaN(rawPage) ? 1 : Math.max(rawPage, 1);
    const rawSize = parseInt(sp.get('pageSize') ?? '20', 10);
    const pageSize = isNaN(rawSize) ? 20 : Math.min(Math.max(rawSize, 1), 100);
    const sort: 'top' | 'new' = sp.get('sort') === 'new' ? 'new' : 'top';

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const vote_service = create_vote_service(adapter);

    const all = await submission_service.list_submissions({
      appId,
      category: 'feature',
      isPublic: true,
      limit: 1000,
    });

    const ids = all.map((s) => s.id);
    const counts = await vote_service.count_votes_for(ids);
    const voted_set = await vote_service.user_voted_for(ids, userId);

    const enriched = all.map((s) => ({
      ...s,
      vote_count: counts.get(s.id) ?? 0,
      voted_by_me: voted_set.has(s.id),
    }));

    enriched.sort((a, b) => {
      if (sort === 'top' && b.vote_count !== a.vote_count) {
        return b.vote_count - a.vote_count;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const total = enriched.length;
    const start = (page - 1) * pageSize;
    const items = enriched.slice(start, start + pageSize).map((s) => ({
      id: s.id,
      ref_id: s.ref_id,
      subject: s.subject,
      body_text_preview: (s.body_text ?? '').slice(0, PREVIEW_CHARS),
      category: s.category,
      status: s.status,
      created_at: s.created_at,
      vote_count: s.vote_count,
      voted_by_me: s.voted_by_me,
    }));

    return NextResponse.json({ items, total, page, pageSize, sort });
  } catch (err) {
    logger?.error('handle_public_board: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/server/handlers/public_board.ts
git commit -m "feat(server): public board listing with vote counts + voted_by_me"
```

---

### Task 4.3 — Voters list handler `GET /admin/:id/voters`

**Files:**
- Create: `src/server/handlers/admin_voters.ts`

- [ ] **Step 1: Create the handler**

```typescript
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_vote_service } from '../../db/vote_service.js';
import type { Logger } from '../../types.js';

interface VotersOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  adminScope: string;
  logger?: Logger;
}

export async function handle_admin_voters(
  request: NextRequest,
  params: Record<string, string>,
  opts: VotersOptions,
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, logger } = opts;
  try {
    const auth = await hazo_get_auth(
      request as unknown as Parameters<typeof hazo_get_auth>[0],
      { required_permissions: [adminScope] },
    );
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.permission_ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const id = params.id;
    if (!id) return NextResponse.json({ error: 'Missing submission id' }, { status: 400 });

    const url = new URL(request.url);
    const sp = url.searchParams;
    const rawPage = parseInt(sp.get('page') ?? '1', 10);
    const page = isNaN(rawPage) ? 1 : Math.max(rawPage, 1);
    const rawSize = parseInt(sp.get('pageSize') ?? '50', 10);
    const pageSize = isNaN(rawSize) ? 50 : Math.min(Math.max(rawSize, 1), 100);

    const adapter = await getHazoConnect();
    const vote_service = create_vote_service(adapter);

    const total = await vote_service.count_votes(id);
    const voters = await vote_service.list_voters(id, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return NextResponse.json({ items: voters, total, page, pageSize });
  } catch (err) {
    logger?.error('handle_admin_voters: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/server/handlers/admin_voters.ts
git commit -m "feat(server): admin voters list endpoint"
```

---

### Task 4.4 — Extend `handle_admin_update` for `is_public` + visibility audit

**Files:**
- Modify: `src/server/handlers/admin_update.ts`

- [ ] **Step 1: Inspect the existing structure**

```bash
grep -n "status\|priority\|pending_event\|patch\." src/server/handlers/admin_update.ts | head -40
```

- [ ] **Step 2: Add `is_public` to the allow-list + audit logging**

Inside the patch-building section, alongside the existing `status` / `priority` handling, add:

```typescript
if (typeof body.is_public === 'boolean') {
  if (submission.category !== 'feature' && body.is_public) {
    return NextResponse.json(
      { error: 'Only feature requests can be made public' },
      { status: 422 },
    );
  }
  if (submission.marked_spam && body.is_public) {
    return NextResponse.json({ error: 'Forbidden (spam)' }, { status: 403 });
  }
  if (Boolean(submission.is_public) !== body.is_public) {
    patch.is_public = body.is_public ? 1 : 0;
    pending_events.push({
      event_type: 'visibility_changed' as const,
      from_value: submission.is_public ? 'public' : 'private',
      to_value:   body.is_public      ? 'public' : 'private',
    });
  }
}
```

If the existing file uses different variable names for `patch` / `pending_events`, adapt accordingly — match the surrounding style.

- [ ] **Step 3: Build, commit**

```bash
npm run build
git add src/server/handlers/admin_update.ts
git commit -m "feat(server): admin update accepts is_public + logs visibility_changed"
```

---

### Task 4.5 — Wire R2 routes into factory

**Files:**
- Modify: `src/server/factory.ts`

- [ ] **Step 1: Add imports**

```typescript
import { handle_vote } from './handlers/vote.js';
import { handle_public_board } from './handlers/public_board.js';
import { handle_admin_voters } from './handlers/admin_voters.js';
```

- [ ] **Step 2: Add POST route for `/vote/:submissionId`**

Inside the POST block, after the existing `submit` match:
```typescript
const vote_params = match_route(segments, ['vote', ':submissionId']);
if (vote_params !== null) {
  return handle_vote(request, vote_params, {
    getHazoConnect: resolved.getHazoConnect,
    appId:          resolved.appId,
    logger:         resolved.logger,
  });
}
```

- [ ] **Step 3: Add GET routes**

Inside the GET block, before the generic `'admin', ':id'` match (so `voters` is matched first):
```typescript
const board_params = match_route(segments, ['public-board']);
if (board_params !== null) {
  return handle_public_board(request, board_params, {
    getHazoConnect: resolved.getHazoConnect,
    appId:          resolved.appId,
    logger:         resolved.logger,
  });
}

const voters_params = match_route(segments, ['admin', ':id', 'voters']);
if (voters_params !== null) {
  return handle_admin_voters(request, voters_params, {
    getHazoConnect: resolved.getHazoConnect,
    adminScope:     resolved.adminScope,
    logger:         resolved.logger,
  });
}
```

- [ ] **Step 4: Build, commit**

```bash
npm run build
git add src/server/factory.ts
git commit -m "feat(server): wire R2 routes (vote, public-board, voters)"
```

---

## Phase 5 — Voting UI (R2)

### Task 5.1 — `PublicFeatureBoard.tsx`

**Files:**
- Create: `src/widget/PublicFeatureBoard.tsx`
- Modify: `src/index.client.ts`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

interface BoardItem {
  id: string;
  ref_id: string;
  subject: string | null;
  body_text_preview: string;
  category: string;
  status: string;
  created_at: string;
  vote_count: number;
  voted_by_me: boolean;
}

interface BoardResponse {
  items: BoardItem[];
  total: number;
  page: number;
  pageSize: number;
  sort: 'top' | 'new';
}

export interface PublicFeatureBoardProps {
  apiBase?: string;
  translate?: (key: string, vars?: Record<string, string>) => string;
  pageSize?: number;
  defaultSort?: 'top' | 'new';
  onSubmissionClick?: (item: BoardItem) => void;
}

const DEFAULT_T = (k: string) => k;

export function PublicFeatureBoard({
  apiBase = '/api/feedback',
  translate,
  pageSize = 20,
  defaultSort = 'top',
  onSubmissionClick,
}: PublicFeatureBoardProps) {
  const t = translate ?? DEFAULT_T;
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'top' | 'new'>(defaultSort);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBase}/public-board?page=${page}&pageSize=${pageSize}&sort=${sort}`,
        { credentials: 'include' },
      );
      if (res.status === 401) { setError(t('board.error.unauthorized')); return; }
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, [apiBase, page, pageSize, sort, t]);

  useEffect(() => { void load(); }, [load]);

  async function toggleVote(item: BoardItem) {
    setData((d) => d ? {
      ...d,
      items: d.items.map((i) =>
        i.id === item.id
          ? { ...i, voted_by_me: !i.voted_by_me, vote_count: i.vote_count + (i.voted_by_me ? -1 : 1) }
          : i,
      ),
    } : d);
    try {
      const res = await fetch(`${apiBase}/vote/${encodeURIComponent(item.id)}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setData((d) => d ? {
          ...d,
          items: d.items.map((i) =>
            i.id === item.id ? { ...i, voted_by_me: item.voted_by_me, vote_count: item.vote_count } : i,
          ),
        } : d);
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? `HTTP ${res.status}`);
      } else {
        const body = await res.json() as { voted: boolean; count: number };
        setData((d) => d ? {
          ...d,
          items: d.items.map((i) =>
            i.id === item.id ? { ...i, voted_by_me: body.voted, vote_count: body.count } : i,
          ),
        } : d);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (!data)   return <div className="p-4 text-sm text-gray-500">{t('board.loading')}</div>;

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="max-w-3xl mx-auto p-4">
      <header className="flex items-center justify-between border-b pb-3 mb-4">
        <h1 className="text-lg font-semibold">{t('board.title')}</h1>
        <div className="flex gap-1 text-sm">
          {(['top', 'new'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSort(s); setPage(1); }}
              className={`px-3 py-1 rounded ${sort === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {t(`board.sort.${s}`)}
            </button>
          ))}
        </div>
      </header>

      {data.items.length === 0 ? (
        <p className="text-sm italic text-gray-400 py-8 text-center">{t('board.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((item) => (
            <li key={item.id} className="flex gap-3 border rounded p-3 hover:bg-gray-50">
              <button
                onClick={() => toggleVote(item)}
                className={`flex flex-col items-center justify-center w-14 shrink-0 rounded ${item.voted_by_me ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
                aria-label={t('board.vote.toggle')}
              >
                <span className="text-lg leading-none">▲</span>
                <span className="text-sm font-medium">{item.vote_count}</span>
              </button>
              <div className="flex-1 min-w-0">
                <button className="text-left w-full" onClick={() => onSubmissionClick?.(item)}>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{item.ref_id} · {item.status}</div>
                  <div className="font-medium truncate">{item.subject ?? t('board.no_subject')}</div>
                  <div className="text-sm text-gray-600 line-clamp-2">{item.body_text_preview}</div>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between mt-4 text-sm">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 disabled:opacity-50">‹ {t('board.prev')}</button>
        <span className="text-gray-500">{t('board.page', { page: String(page), total: String(totalPages) })}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 disabled:opacity-50">{t('board.next')} ›</button>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Export from `src/index.client.ts`**

```typescript
export { PublicFeatureBoard } from './widget/PublicFeatureBoard.js';
export type { PublicFeatureBoardProps } from './widget/PublicFeatureBoard.js';
```

- [ ] **Step 3: Build, commit**

```bash
npm run build
git add src/widget/PublicFeatureBoard.tsx src/index.client.ts
git commit -m "feat(client): PublicFeatureBoard with optimistic voting"
```

---

### Task 5.2 — `VotersTab.tsx`

**Files:**
- Create: `src/admin/tabs/VotersTab.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useEffect, useState } from 'react';

interface VoterRow {
  id: string;
  user_id: string;
  created_at: string;
}

interface VotersResponse {
  items: VoterRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface VotersTabProps {
  submissionId: string;
  apiBase: string;
}

export function VotersTab({ submissionId, apiBase }: VotersTabProps) {
  const [data, setData] = useState<VotersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/admin/${submissionId}/voters?page=${page}&pageSize=50`, { credentials: 'include' });
        if (!res.ok) { if (!cancelled) setError(`HTTP ${res.status}`); return; }
        const j = await res.json() as VotersResponse;
        if (!cancelled) setData(j);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [apiBase, submissionId, page]);

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (!data)   return <div className="p-4 text-sm text-gray-500">Loading…</div>;

  if (data.items.length === 0) {
    return <div className="p-4"><p className="text-sm italic text-gray-400">No votes yet.</p></div>;
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="p-4">
      <p className="text-sm text-gray-600 mb-2">{data.total} voter{data.total === 1 ? '' : 's'}</p>
      <ul className="space-y-1">
        {data.items.map((v) => (
          <li key={v.id} className="text-sm flex items-center justify-between border-b py-1">
            <span className="font-mono text-xs">{v.user_id}</span>
            <span className="text-gray-400 text-xs">{new Date(v.created_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between items-center mt-3 text-sm">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 disabled:opacity-50">‹</button>
        <span className="text-gray-500">Page {page} of {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 disabled:opacity-50">›</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build, commit**

```bash
npm run build
git add src/admin/tabs/VotersTab.tsx
git commit -m "feat(admin): VotersTab paginated voter list"
```

---

### Task 5.3 — `SubmissionList` columns + `admin_list` payload extension

**Files:**
- Modify: `src/server/handlers/admin_list.ts`
- Modify: `src/admin/SubmissionList.tsx`

- [ ] **Step 1: Extend `admin_list.ts` to include `vote_count`**

In `handle_admin_list`, after the existing `const submissions = await service.list_submissions(...)`:

```typescript
import { create_vote_service } from '../../db/vote_service.js';

// inside the handler body, after fetching submissions:
const vote_service = create_vote_service(adapter);
const ids = submissions.map((s) => s.id);
const counts = await vote_service.count_votes_for(ids);
const augmented = submissions.map((s) => ({ ...s, vote_count: counts.get(s.id) ?? 0 }));

return NextResponse.json({ submissions: augmented });
```

- [ ] **Step 2: Add Public + Votes columns to `SubmissionList.tsx`**

For each row's render:
```tsx
<td className="text-xs">{sub.category === 'feature' ? (sub.is_public ? '✓' : '—') : '—'}</td>
<td className="text-xs text-right">{sub.category === 'feature' ? (sub.vote_count ?? 0) : '—'}</td>
```

Add matching `<th>` cells in the header row.

- [ ] **Step 3: Build, commit**

```bash
npm run build
git add src/server/handlers/admin_list.ts src/admin/SubmissionList.tsx
git commit -m "feat(admin): SubmissionList Public + Votes columns, admin_list returns vote_count"
```

---

### Task 5.4 — Add Make-public toggle + Voters tab to `SubmissionDetail`

**Files:**
- Modify: `src/admin/SubmissionDetail.tsx`

- [ ] **Step 1: Import `VotersTab`, extend `TabKey`, add tab button, content slot**

```tsx
import { VotersTab } from './tabs/VotersTab.js';

// TabKey union extension:
type TabKey = 'overview' | 'conversation' | 'activity' | 'context' | 'attachments' | 'voters';

// Tab button (only meaningful for feature category — render conditionally if you want):
<button
  onClick={() => setActiveTab('voters')}
  className={activeTab === 'voters' ? 'tab-active' : 'tab'}
>
  Voters
</button>

// Content slot:
{activeTab === 'voters' && <VotersTab submissionId={submission.id} apiBase={apiBase} />}
```

- [ ] **Step 2: Add the Make-public toggle (only for feature, not spam)**

Place this button alongside the existing status select (match its container styling):

```tsx
{submission.category === 'feature' && !submission.marked_spam && (
  <button
    onClick={async () => {
      const res = await fetch(`${apiBase}/admin/${submission.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !submission.is_public }),
      });
      if (res.ok) refetch();
    }}
    className={`px-3 py-1 text-sm rounded ${submission.is_public ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}
  >
    {submission.is_public ? 'Public' : 'Make public'}
  </button>
)}
```

- [ ] **Step 3: Build, commit**

```bash
npm run build
git add src/admin/SubmissionDetail.tsx
git commit -m "feat(admin): Make-public toggle + Voters tab in SubmissionDetail"
```

---

## Phase 6 — Config + i18n strings

### Task 6.1 — Extend config with reply email flags

**Files:**
- Modify: `src/config/load_config.ts`
- Modify: `config/hazo_feedback_config.ini.sample`

- [ ] **Step 1: Locate the notify-section parser**

```bash
grep -n "notifyConfig\|acknowledgeEmailEnabled" src/config/load_config.ts
```

- [ ] **Step 2: Add new keys**

In the notify-section build, append (after `acknowledgeEmailSubject`):
```typescript
replyEmailToUserEnabled:  (get('notify', 'reply_email_to_user_enabled') ?? 'true').trim().toLowerCase() === 'true',
replyEmailToAdminEnabled: (get('notify', 'reply_email_to_admin_enabled') ?? 'true').trim().toLowerCase() === 'true',
```

Use the same string-to-boolean conversion the existing code uses for `acknowledgeEmailEnabled`. If it has a helper (`parseBool`, `coerceBool`, etc.), prefer that.

- [ ] **Step 3: Update INI sample**

Append to `config/hazo_feedback_config.ini.sample`:
```ini
; --- Reply notifications (v2.1.0) ---
; Send email to user when admin replies on their submission
reply_email_to_user_enabled = true
; Send email to admins when user replies back
reply_email_to_admin_enabled = true
```

Put it inside the existing `[notify]` section.

- [ ] **Step 4: Build, commit**

```bash
npm run build
git add src/config/load_config.ts config/hazo_feedback_config.ini.sample
git commit -m "feat(config): add reply email flags (both default ON)"
```

---

### Task 6.2 — Add i18n keys to `strings.ts`

**Files:**
- Modify: `src/strings.ts`

- [ ] **Step 1: Inspect existing shape**

```bash
head -50 src/strings.ts
```

- [ ] **Step 2: Add the following keys (merge into the existing fallback object)**

```typescript
// R5 — thread
'thread.loading':              'Loading…',
'thread.empty':                'No replies yet.',
'thread.no_subject':           '(no subject)',
'thread.author.admin':         'Admin',
'thread.author.you':           'You',
'thread.cannot_reply':         'Replies open after an admin responds.',
'thread.compose.placeholder':  'Reply…',
'thread.compose.send':         'Send reply',
'thread.compose.sending':      'Sending…',
'thread.error.unauthorized':   'Please sign in to view this thread.',
'thread.error.forbidden':      'You do not have access to this thread.',
'thread.error.not_found':      'Thread not found.',

// R2 — public board
'board.title':                 'Feature requests',
'board.loading':               'Loading…',
'board.empty':                 'No public feature requests yet.',
'board.no_subject':            '(no subject)',
'board.vote.toggle':           'Toggle vote',
'board.sort.top':              'Top',
'board.sort.new':              'New',
'board.prev':                  'Previous',
'board.next':                  'Next',
'board.page':                  'Page {page} of {total}',
'board.error.unauthorized':    'Please sign in to view feature requests.',
```

- [ ] **Step 3: Build, commit**

```bash
npm run build
git add src/strings.ts
git commit -m "feat(i18n): add string keys for thread and board"
```

---

## Phase 7 — Test-app pages

### Task 7.1 — Sidebar update

**Files:**
- Modify: the file that defines the test-app sidebar nav (likely `test-app/src/components/app_sidebar.tsx`)

- [ ] **Step 1: Locate**

```bash
find test-app/src -name '*.tsx' | xargs grep -ln 'authed-submit\|anon-submit' 2>/dev/null | head -3
```

- [ ] **Step 2: Add two nav entries**

In the navigation array, add:
```tsx
{ href: '/voting',       label: 'Voting',       icon: ThumbsUp },
{ href: '/reply-thread', label: 'Reply thread', icon: MessageSquare },
```

Add imports if not already present:
```tsx
import { ThumbsUp, MessageSquare } from 'lucide-react';
```

- [ ] **Step 3: Commit**

```bash
git add test-app/src/components/app_sidebar.tsx
git commit -m "feat(test-app): sidebar nav entries for voting + reply-thread"
```

---

### Task 7.2 — `test-app/app/voting/page.tsx`

**Files:**
- Create: `test-app/app/voting/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client';

import { PublicFeatureBoard } from 'hazo_feedback/client';

export default function VotingPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <PublicFeatureBoard apiBase="/api/feedback" />
      <aside className="max-w-3xl mx-auto p-4 mt-6 border-t text-xs text-gray-500">
        <p>
          Tip: visit <a href="/authed-submit" className="underline">/authed-submit</a> to submit
          a feature, then mark it public from <a href="/admin" className="underline">/admin</a>.
        </p>
      </aside>
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

```bash
cd test-app && npm run dev
```
Open `http://localhost:3030/voting`. Empty board renders. Submit a feature → admin → mark public → refresh — feature appears and the vote toggle works.

- [ ] **Step 3: Commit**

```bash
git add test-app/app/voting/page.tsx
git commit -m "feat(test-app): voting page mounts PublicFeatureBoard"
```

---

### Task 7.3 — `test-app/app/reply-thread/page.tsx`

**Files:**
- Create: `test-app/app/reply-thread/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client';

import { useState } from 'react';
import { FeedbackThread } from 'hazo_feedback/client';

export default function ReplyThreadPage() {
  const [refId, setRefId] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto bg-white rounded shadow p-4 mb-4">
        <p className="text-sm text-gray-600 mb-2">
          Paste a submission's <code>ref_id</code> (e.g. <code>PRO-1A2B3</code>) to open its thread.
          First submit feedback via <a href="/authed-submit" className="underline">/authed-submit</a>,
          then reply to it from <a href="/admin" className="underline">/admin</a> (Conversation tab) to enable user replies.
        </p>
        <div className="flex gap-2">
          <input
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
            placeholder="PRO-XXXXX"
            className="flex-1 p-2 border rounded text-sm"
          />
          <button
            onClick={() => setSubmitted(refId.trim() || null)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            Open thread
          </button>
        </div>
      </div>

      {submitted ? <FeedbackThread refId={submitted} apiBase="/api/feedback" /> : null}
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

```bash
cd test-app && npm run dev
```
Submit feedback → admin reply → open `/reply-thread` → paste refId → see thread.

- [ ] **Step 3: Commit**

```bash
git add test-app/app/reply-thread/page.tsx
git commit -m "feat(test-app): reply-thread page mounts FeedbackThread"
```

---

## Phase 8 — Docs + release

### Task 8.1 — Update `CHANGE_LOG.md`

**Files:**
- Modify: `CHANGE_LOG.md`

- [ ] **Step 1: Prepend a new 2.1.0 entry** (after any header)

```markdown
## 2.1.0 — 2026-MM-DD

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
```

(Replace `2026-MM-DD` with the actual publish date.)

- [ ] **Step 2: Commit**

```bash
git add CHANGE_LOG.md
git commit -m "docs: changelog entry for 2.1.0"
```

---

### Task 8.2 — Update `SETUP_CHECKLIST.md`

**Files:**
- Modify: `SETUP_CHECKLIST.md`

- [ ] **Step 1: Add v2.1.0 upgrade section near the top (before any older sections)**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add SETUP_CHECKLIST.md
git commit -m "docs: setup checklist for v2.1.0 upgrade"
```

---

### Task 8.3 — Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add two new feature sections before the existing "Public API" section**

```markdown
## Reply threads

After a feedback submission, the admin can reply via the Conversation tab in the admin dashboard. The submitter is notified via hazo_notify's in-app inbox (always) and email (configurable). The submitter can reply back from the standalone thread page: `<FeedbackThread refId="…" apiBase="/api/feedback" />`.

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
```

- [ ] **Step 2: Add to the existing "Client exports" list**

```markdown
- `<FeedbackThread refId apiBase translate />` — Standalone reply thread for the submitter.
- `<PublicFeatureBoard apiBase translate pageSize defaultSort onSubmissionClick />` — Logged-in feature roadmap with voting.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README sections for reply threads and voting"
```

---

### Task 8.4 — Version bump + pre-publish checks

**Files:**
- Modify: `package.json`
- Modify: `test-app/package.json` (only if `hazo_feedback` is range-pinned)

- [ ] **Step 1: Bump version**

In `package.json`:
```json
"version": "2.1.0"
```

- [ ] **Step 2: Update test-app dep range if pinned**

```bash
grep -n '"hazo_feedback"' test-app/package.json
```
If matched and the range excludes 2.1.0, bump it to `^2.1.0`.

- [ ] **Step 3: Full build + test**

```bash
npm run build && npm test
```
Expected: clean build (0), all tests pass. New test files: `vote_service.test.ts` (4), `send_reply_notification.test.ts` (3), `reply_payload.test.ts` (5). Existing files unchanged.

- [ ] **Step 4: Pre-publish checks**

```bash
grep -rn "@/components\|@/lib" dist/ && echo "FAIL: alias found" || echo "OK"

node -e "const p=require('./package.json'); const fs=require('fs'); for (const e of Object.values(p.exports)) { for (const f of Object.values(e)) fs.accessSync(f.replace(/^\.\//, './')); } console.log('OK');"

ls dist/email_templates | wc -l
```
Expected:
- `OK` (no aliases)
- `OK` (exports resolve)
- `6` (6 template files in dist)

- [ ] **Step 5: Commit**

```bash
git add package.json test-app/package.json
git commit -m "chore: bump version to 2.1.0"
```

---

### Task 8.5 — Publish (manual gate — DO NOT auto-execute)

**Files:** none.

- [ ] **Step 1: Confirm git is clean**

```bash
git status
```
Expected: clean.

- [ ] **Step 2: Tag**

```bash
git tag v2.1.0
```

- [ ] **Step 3: Publish (REQUIRES USER AUTHORIZATION)**

```bash
npm publish
```

**Stop here and confirm with the user before running `npm publish`.** This step requires their npm login + 2FA in the session.

- [ ] **Step 4: Push tag**

```bash
git push origin v2.1.0
git push
```

- [ ] **Step 5: Verify on npm registry**

```bash
npm view hazo_feedback@2.1.0 version
```
Expected: `2.1.0`.

---

## Self-Review checklist

- **Spec coverage:** R2 (Phases 1, 4, 5) ✓; R5 (Phases 1, 2, 3) ✓; test-app pages (Phase 7) ✓; hazo_notify migration (Phase 0) ✓; CHANGELOG/README/SETUP (Phase 8) ✓. Out-of-scope items (R1, R3, R4, anon replies, admin_comment UI, value-based PII regex) are documented as deferred — not silently dropped.
- **Placeholder scan:** No "TODO", "TBD", "implement later" left in. Task 0.2 Step 2 hard-codes `/feedback/thread/${ref_id}` for Phase-0 isolation; this is intentionally swapped to `threadUrlBuilder` in Task 2.11 Step 4, with both tasks referencing the swap.
- **Type consistency:** `FeedbackEventType` adds `admin_reply` / `user_reply` / `visibility_changed` in Task 1.2; all later code uses them. `event_id` is added to `FeedbackAttachment` (Task 1.2), services in Tasks 2.1/2.2, handlers in Task 2.10. `threadUrlBuilder` signature `(refId, submissionId) => string` matches across types.ts (Task 1.2), factory.ts (Task 2.11), submit.ts (Task 2.11), admin_reply.ts (Task 2.8), user_reply.ts (Task 2.9).
- **Test parity with spec:** Spec called for `voting` (5 tests) and `reply_thread` (4 tests). The plan ships unit-test coverage of the core logic via three new Jest suites: `vote_service.test.ts` (4 tests for toggle/count/has_voted), `send_reply_notification.test.ts` (3 tests for dispatch shape + truncation), `reply_payload.test.ts` (5 tests for validation). The remaining handler-level integration coverage is exercised manually via the test-app pages in Phase 7 — consistent with the existing unit-test-only convention in this package. A full handler integration test harness is a separate ticket; flagged in the decision log.
- **Decision adherence:** Decisions Q1–Q21 are referenced in every meaningful design choice. The decision log at the bottom of this document is the canonical reference for ambiguities encountered during execution.

---

## Decision log

For any ambiguity during execution, defer to these decisions:

- **Q1:** Reality is source of truth (not spec language).
- **Q2:** Scope = R2 + R5 only.
- **Q3 / Q7:** Extend `hazo_feedback_events` with `body_html`/`body_text`; `hazo_feedback_attachments` gets nullable `event_id` and an XOR CHECK against `submission_id`.
- **Q4:** Authed-only replies. Anon submitters get no reply thread.
- **Q5:** Keep `comment_added` (internal note) AND new `admin_reply` as distinct event types; user-facing thread filters to `admin_reply` + `user_reply` only.
- **Q6:** Rich text + attachments on the wire (body_html sanitized server-side; attachments via event_id); v2.1.0 admin composer is a textarea, upgrade to Tiptap is a future task.
- **Q8:** Broadcast user→admin notification to **all** holders of `adminScope` (via consumer-supplied `listAdminsForBroadcast`).
- **Q9:** hazo_notify v4+ `dispatch()` + inbox/bell. Peer dep bumped to `^5.0.0`.
- **Q10:** Consumer-hosted standalone route at `/feedback/thread/[refId]` (or wherever they wire it); URL provided to dispatch via `threadUrlBuilder(refId, submissionId)`.
- **Q11:** Submitter-only POST; submitter + admins GET; user can reply only after first `admin_reply` (409 Conflict otherwise); per-user rate-limit in separate bucket `${appId}:user_reply:${userId}`.
- **Q12:** Two reply templates (`feedback_admin_reply_to_user`, `feedback_user_reply_to_admin`); two email config flags (default ON each); inbox always on.
- **Q13:** New "Conversation" admin tab; strict-standalone `<FeedbackThread />`; `admin_comment` UI deferred.
- **Q14:** hazo_notify v3→v5 migration is a prerequisite PR (Phase 0); edge cases: immutable replies, no status lock, spam-locked, no read receipts, reuse `attachmentConfig`, body_text ≤ 5000 chars.
- **Q15:** `is_public BOOLEAN DEFAULT FALSE`; vote counts computed on read.
- **Q16:** `adminScope` for `is_public` toggle; feature-only voting/publishing; per-vote events NOT logged to audit; visibility changes DO log.
- **Q17:** `POST /vote/:submissionId` (single toggle); `GET /public-board` (auth-required); admin list adds `is_public` + `vote_count`; new `GET /admin/:id/voters` paginated.
- **Q18:** Card-list `<PublicFeatureBoard />` with optimistic voting; admin list columns + voters tab; full i18n via `translate`.
- **Q19:** Self-voting allowed; unmark-public preserves votes; status doesn't lock votability; spam-locked; FK CASCADE; tiebreak `created_at DESC`; bounded pagination (1–100, defaults 20 board / 50 voters).
- **Q20:** Two new test-app pages in kebab-case (`voting`, `reply-thread`); Jest backend coverage + manual UI exploration (B4); redaction tests stay reality-based (existing `pii_redact.test.ts` is the canonical coverage; not duplicated here).
- **Q21:** Single migration `002_voting_and_replies.sql`; minor version bump 2.1.0.

---

## Out-of-scope (do not implement in this plan)

- **R1** (Linear / GitHub / Jira integrations) — separate release.
- **R3** (Slack / Discord webhooks) — separate release.
- **R4** (admin search + bulk operations + CSV export) — separate release.
- **Anon-submitter reply paths** (magic-link, opt-in email at submit time, signed tokens) — v2.2 candidate.
- **Value-based PII regex scrubbing** of submission body — out of scope; current key-based redaction of `consumer_context` remains the canonical model.
- **`admin_comment` (internal-note) UI** — handler exists; no UI in v2.1.0.
- **Rich-text Tiptap editor in the admin reply composer** — textarea now; Tiptap is a future enhancement that does not require any schema change.
- **Denormalized `vote_count` column** — compute-on-read for v2.1.0; revisit if perf data warrants.
- **Handler-level integration test harness** (in-memory Postgres / SQLite drivers calling the route handlers end-to-end) — ticketed separately; v2.1.0 stays at unit-test-only convention.
