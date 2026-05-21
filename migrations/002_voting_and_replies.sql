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
