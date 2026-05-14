-- hazo_feedback database schema
-- Supports both PostgreSQL and SQLite
--
-- Tables:
--   hazo_feedback_submissions - Core feedback records
--   hazo_feedback_attachments - Files linked to submissions
--   hazo_feedback_events      - Audit trail / status history

-- ============================================================
-- PostgreSQL version (active)
-- ============================================================

CREATE TABLE IF NOT EXISTS hazo_feedback_submissions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id                     TEXT NOT NULL UNIQUE,
  app_id                     TEXT NOT NULL,
  source                     TEXT NULL,
  user_id                    UUID NULL REFERENCES hazo_users(id),
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
  marked_spam                BOOLEAN NOT NULL DEFAULT FALSE,
  url                        TEXT NOT NULL,
  route                      TEXT NULL,
  viewport_w                 INT NULL,
  viewport_h                 INT NULL,
  user_agent                 TEXT NULL,
  app_version                TEXT NULL,
  consumer_context           JSONB NULL,
  consumer_context_redacted  TEXT NULL,
  recent_errors              JSONB NULL,
  breadcrumbs                JSONB NULL,
  attachment_count           INT NOT NULL DEFAULT 0,
  acknowledge_email_sent_at  TIMESTAMPTZ NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at                TIMESTAMPTZ NULL
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
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  UUID NOT NULL REFERENCES hazo_feedback_submissions(id) ON DELETE CASCADE,
  inline_id      TEXT NULL,
  file_id        TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     BIGINT NOT NULL,
  kind           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hf_attachments_submission
  ON hazo_feedback_attachments (submission_id);

CREATE TABLE IF NOT EXISTS hazo_feedback_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  UUID NOT NULL REFERENCES hazo_feedback_submissions(id) ON DELETE CASCADE,
  actor_id       UUID NULL REFERENCES hazo_users(id),
  event_type     TEXT NOT NULL,
  from_value     TEXT NULL,
  to_value       TEXT NULL,
  comment        TEXT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hf_events_submission
  ON hazo_feedback_events (submission_id);

-- ============================================================
-- SQLite version (commented)
-- UUIDs are generated server-side before INSERT (no gen_random_uuid())
-- ============================================================
--
-- CREATE TABLE IF NOT EXISTS hazo_feedback_submissions (
--   id                         TEXT PRIMARY KEY,
--   ref_id                     TEXT NOT NULL UNIQUE,
--   app_id                     TEXT NOT NULL,
--   source                     TEXT NULL,
--   user_id                    TEXT NULL,
--   user_name_snapshot         TEXT NULL,
--   user_email_snapshot        TEXT NULL,
--   anon_session_id            TEXT NULL,
--   category                   TEXT NOT NULL DEFAULT 'general',
--   subject                    TEXT NULL,
--   problem                    TEXT NULL,
--   intent                     TEXT NULL,
--   expected_output            TEXT NULL,
--   reproducibility            TEXT NULL,
--   body_html                  TEXT NULL,
--   body_text                  TEXT NULL,
--   status                     TEXT NOT NULL DEFAULT 'new',
--   priority                   TEXT NULL,
--   marked_spam                INTEGER NOT NULL DEFAULT 0,
--   url                        TEXT NOT NULL,
--   route                      TEXT NULL,
--   viewport_w                 INTEGER NULL,
--   viewport_h                 INTEGER NULL,
--   user_agent                 TEXT NULL,
--   app_version                TEXT NULL,
--   consumer_context           TEXT NULL,
--   consumer_context_redacted  TEXT NULL,
--   recent_errors              TEXT NULL,
--   breadcrumbs                TEXT NULL,
--   attachment_count           INTEGER NOT NULL DEFAULT 0,
--   acknowledge_email_sent_at  TEXT NULL,
--   created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
--   updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
--   resolved_at                TEXT NULL
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_hf_submissions_app_created
--   ON hazo_feedback_submissions (app_id, created_at DESC);
--
-- CREATE INDEX IF NOT EXISTS idx_hf_submissions_app_status
--   ON hazo_feedback_submissions (app_id, status);
--
-- CREATE INDEX IF NOT EXISTS idx_hf_submissions_user
--   ON hazo_feedback_submissions (user_id);
--
-- CREATE INDEX IF NOT EXISTS idx_hf_submissions_anon
--   ON hazo_feedback_submissions (anon_session_id);
--
-- CREATE TABLE IF NOT EXISTS hazo_feedback_attachments (
--   id             TEXT PRIMARY KEY,
--   submission_id  TEXT NOT NULL,
--   inline_id      TEXT NULL,
--   file_id        TEXT NOT NULL,
--   mime_type      TEXT NOT NULL,
--   size_bytes     INTEGER NOT NULL,
--   kind           TEXT NOT NULL,
--   created_at     TEXT NOT NULL DEFAULT (datetime('now'))
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_hf_attachments_submission
--   ON hazo_feedback_attachments (submission_id);
--
-- CREATE TABLE IF NOT EXISTS hazo_feedback_events (
--   id             TEXT PRIMARY KEY,
--   submission_id  TEXT NOT NULL,
--   actor_id       TEXT NULL,
--   event_type     TEXT NOT NULL,
--   from_value     TEXT NULL,
--   to_value       TEXT NULL,
--   comment        TEXT NULL,
--   created_at     TEXT NOT NULL DEFAULT (datetime('now'))
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_hf_events_submission
--   ON hazo_feedback_events (submission_id);
