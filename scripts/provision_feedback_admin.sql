-- Provision hazo_feedback admin permission for a specific app and user.
-- Run this once per app_id. Substitute {APP_ID} and {YOUR_USER_ID} before running.
--
-- Example:
--   Replace {APP_ID}       → kinstripe
--   Replace {YOUR_USER_ID} → 550e8400-e29b-41d4-a716-446655440000

-- 1. Ensure the permission exists
INSERT INTO hazo_permissions (name, description)
VALUES (
  'hazo_feedback:{APP_ID}:admin',
  'Full admin access to hazo_feedback for app {APP_ID}'
)
ON CONFLICT (name) DO NOTHING;

-- 2. Ensure a feedback-admin role exists for this app
INSERT INTO hazo_roles (name, description)
VALUES (
  'feedback_admin_{APP_ID}',
  'Feedback admin for {APP_ID}'
)
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
