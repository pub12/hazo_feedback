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
