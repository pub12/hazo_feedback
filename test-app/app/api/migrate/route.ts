import 'server-only';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { join } from 'path';

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS hazo_feedback_submissions (
  id                         TEXT PRIMARY KEY,
  ref_id                     TEXT NOT NULL UNIQUE,
  app_id                     TEXT NOT NULL,
  source                     TEXT NULL,
  user_id                    TEXT NULL,
  user_name_snapshot         TEXT NULL,
  user_email_snapshot        TEXT NULL,
  anon_session_id            TEXT NULL,
  category                   TEXT NOT NULL DEFAULT 'general',
  subject                    TEXT NULL,
  problem                    TEXT NULL,
  intent                     TEXT NULL,
  expected_output            TEXT NULL,
  reproducibility            TEXT NULL,
  body_html                  TEXT NULL,
  body_text                  TEXT NULL,
  status                     TEXT NOT NULL DEFAULT 'new',
  priority                   TEXT NULL,
  marked_spam                INTEGER NOT NULL DEFAULT 0,
  url                        TEXT NOT NULL,
  route                      TEXT NULL,
  viewport_w                 INTEGER NULL,
  viewport_h                 INTEGER NULL,
  user_agent                 TEXT NULL,
  app_version                TEXT NULL,
  consumer_context           TEXT NULL,
  consumer_context_redacted  TEXT NULL,
  recent_errors              TEXT NULL,
  breadcrumbs                TEXT NULL,
  attachment_count           INTEGER NOT NULL DEFAULT 0,
  acknowledge_email_sent_at  TEXT NULL,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at                TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_hf_submissions_app_created
  ON hazo_feedback_submissions (app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hf_submissions_app_status
  ON hazo_feedback_submissions (app_id, status);

CREATE INDEX IF NOT EXISTS idx_hf_submissions_user
  ON hazo_feedback_submissions (user_id);

CREATE INDEX IF NOT EXISTS idx_hf_submissions_anon
  ON hazo_feedback_submissions (anon_session_id);

CREATE TABLE IF NOT EXISTS hazo_feedback_attachments (
  id             TEXT PRIMARY KEY,
  submission_id  TEXT NOT NULL,
  inline_id      TEXT NULL,
  file_id        TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  kind           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hf_attachments_submission
  ON hazo_feedback_attachments (submission_id);

CREATE TABLE IF NOT EXISTS hazo_feedback_events (
  id             TEXT PRIMARY KEY,
  submission_id  TEXT NOT NULL,
  actor_id       TEXT NULL,
  event_type     TEXT NOT NULL,
  from_value     TEXT NULL,
  to_value       TEXT NULL,
  comment        TEXT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hf_events_submission
  ON hazo_feedback_events (submission_id);

-- ─── hazo_feedback v2.1.0 additions (voting and reply threads) ─────────────

ALTER TABLE hazo_feedback_events ADD COLUMN IF NOT EXISTS body_html TEXT NULL;
ALTER TABLE hazo_feedback_events ADD COLUMN IF NOT EXISTS body_text TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_hf_events_submission_type
  ON hazo_feedback_events (submission_id, event_type);

-- SQLite: recreate attachments table to allow event_id and make submission_id nullable
CREATE TABLE IF NOT EXISTS hazo_feedback_attachments_temp (
  id             TEXT PRIMARY KEY,
  submission_id  TEXT NULL,
  event_id       TEXT NULL,
  inline_id      TEXT NULL,
  file_id        TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  kind           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (submission_id IS NOT NULL AND event_id IS NULL)
    OR (submission_id IS NULL AND event_id IS NOT NULL)
  )
);

INSERT INTO hazo_feedback_attachments_temp
  (id, submission_id, event_id, inline_id, file_id, mime_type, size_bytes, kind, created_at)
SELECT id, submission_id, NULL, inline_id, file_id, mime_type, size_bytes, kind, created_at
FROM hazo_feedback_attachments
WHERE 1=0 OR (SELECT COUNT(*) FROM hazo_feedback_attachments) = 0;

-- If table has existing data, do the actual migration
INSERT OR IGNORE INTO hazo_feedback_attachments_temp
  (id, submission_id, event_id, inline_id, file_id, mime_type, size_bytes, kind, created_at)
SELECT id, submission_id, NULL, inline_id, file_id, mime_type, size_bytes, kind, created_at
FROM hazo_feedback_attachments;

DROP TABLE IF EXISTS hazo_feedback_attachments;
ALTER TABLE hazo_feedback_attachments_temp RENAME TO hazo_feedback_attachments;

CREATE INDEX IF NOT EXISTS idx_hf_attachments_submission
  ON hazo_feedback_attachments (submission_id);

CREATE INDEX IF NOT EXISTS idx_hf_attachments_event
  ON hazo_feedback_attachments (event_id);

ALTER TABLE hazo_feedback_submissions ADD COLUMN IF NOT EXISTS is_public INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_hf_submissions_public_feature
  ON hazo_feedback_submissions (is_public, category);

CREATE TABLE IF NOT EXISTS hazo_feedback_votes (
  id             TEXT PRIMARY KEY,
  submission_id  TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (submission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hf_votes_submission
  ON hazo_feedback_votes (submission_id);

CREATE INDEX IF NOT EXISTS idx_hf_votes_user
  ON hazo_feedback_votes (user_id);

-- ─── hazo_notify v5 schema (inbox, channel_deliveries, templates) ────────────
-- Consolidated from migrations 001+002+005+006+007 (SQLite fresh-install).
-- Migration 004 is a Postgres-only RPC wrapper — skipped for SQLite.

CREATE TABLE IF NOT EXISTS hazo_notify_template_cat (
  id            TEXT PRIMARY KEY,
  scope_id      TEXT NULL,
  template_category_name TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  changed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_notify_template_cat_scope
  ON hazo_notify_template_cat (scope_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notify_template_cat_scoped
  ON hazo_notify_template_cat (template_category_name, scope_id)
  WHERE scope_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notify_template_cat_global
  ON hazo_notify_template_cat (template_category_name)
  WHERE scope_id IS NULL;

CREATE TABLE IF NOT EXISTS hazo_notify_templates (
  id                    TEXT PRIMARY KEY,
  scope_id              TEXT NULL,
  template_category_id  TEXT NOT NULL REFERENCES hazo_notify_template_cat(id),
  template_variables    TEXT DEFAULT '{}',
  template_name         TEXT NOT NULL,
  template_label        TEXT,
  category              TEXT,
  bodies                TEXT NOT NULL DEFAULT '{}',
  is_modified           INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT DEFAULT (datetime('now')),
  changed_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_notify_templates_scope
  ON hazo_notify_templates (scope_id);
CREATE INDEX IF NOT EXISTS idx_notify_templates_lookup
  ON hazo_notify_templates (template_name, scope_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notify_templates_scoped
  ON hazo_notify_templates (template_name, scope_id)
  WHERE scope_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notify_templates_global
  ON hazo_notify_templates (template_name)
  WHERE scope_id IS NULL;

CREATE TABLE IF NOT EXISTS hazo_notify_inbox (
  id               TEXT PRIMARY KEY,
  scope_id         TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  subject_id       TEXT,
  batch_key        TEXT NOT NULL,
  in_app_text      TEXT NOT NULL,
  deep_link        TEXT NOT NULL,
  payload          TEXT NOT NULL DEFAULT '{}',
  surfaces         TEXT NOT NULL,
  aggregate_count  INTEGER NOT NULL DEFAULT 1,
  batch_closed_at  TEXT,
  read_at          TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_inbox_open_batch
  ON hazo_notify_inbox (batch_key) WHERE batch_closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_user_unread
  ON hazo_notify_inbox (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS hazo_notify_channel_deliveries (
  id             TEXT PRIMARY KEY,
  inbox_id       TEXT NOT NULL REFERENCES hazo_notify_inbox(id) ON DELETE CASCADE,
  channel_id     TEXT NOT NULL,
  payload        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  flush_after    TEXT NOT NULL,
  attempt_count  INTEGER NOT NULL DEFAULT 0,
  message_id     TEXT,
  last_error     TEXT,
  finalized_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_inbox_channel
  ON hazo_notify_channel_deliveries (inbox_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_delivery_due
  ON hazo_notify_channel_deliveries (channel_id, flush_after) WHERE status = 'pending';

-- ─── hazo_auth canonical schema (subset needed for admin permission lookups) ──
-- See: hazo_auth/src/lib/schema/sqlite_schema.ts. Only the tables that
-- hazo_get_auth's fetch_user_data_from_db reads from are included here.

CREATE TABLE IF NOT EXISTS hazo_users (
  id TEXT PRIMARY KEY,
  email_address TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT,
  email_verified BOOLEAN DEFAULT false,
  login_attempts INTEGER DEFAULT 0,
  last_logon TEXT,
  profile_picture_url TEXT,
  profile_source TEXT CHECK(profile_source IN ('gravatar', 'custom', 'predefined')),
  mfa_secret TEXT,
  url_on_logon TEXT,
  google_id TEXT UNIQUE,
  auth_providers TEXT DEFAULT 'email',
  user_type TEXT,
  app_user_data TEXT,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('PENDING', 'ACTIVE', 'BLOCKED')),
  managed_by_user_id TEXT REFERENCES hazo_users(id) ON DELETE SET NULL,
  pin_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hazo_roles (
  id TEXT PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hazo_permissions (
  id TEXT PRIMARY KEY,
  permission_name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hazo_role_permissions (
  role_id TEXT NOT NULL REFERENCES hazo_roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES hazo_permissions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS hazo_scopes (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES hazo_scopes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  tagline TEXT,
  slug TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default system scope (matches hazo_auth's canonical seed)
INSERT OR IGNORE INTO hazo_scopes (id, parent_id, name, level)
VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'System', 'default');

CREATE TABLE IF NOT EXISTS hazo_user_scopes (
  user_id TEXT NOT NULL REFERENCES hazo_users(id) ON DELETE CASCADE,
  scope_id TEXT NOT NULL REFERENCES hazo_scopes(id) ON DELETE CASCADE,
  root_scope_id TEXT NOT NULL REFERENCES hazo_scopes(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES hazo_roles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEPARTED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, scope_id)
);
`;

export async function POST(): Promise<NextResponse> {
  try {
    const dbPath = join(process.cwd(), 'test-app.db');
    const db = new Database(dbPath);
    db.exec(SQLITE_SCHEMA);
    db.close();
    return NextResponse.json({ ok: true, message: 'Migrations applied to ' + dbPath });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
