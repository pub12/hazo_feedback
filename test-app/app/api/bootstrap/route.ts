import 'server-only';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Test-mode auto-login for the hazo_feedback test-app.
//
// Idempotently seeds:
//   - hazo_users row for test-user-1 (status=ACTIVE)
//   - hazo_permissions row for 'hazo_feedback:test-app:admin'
//   - hazo_roles row 'feedback_admin_test_app'
//   - hazo_role_permissions link
//   - hazo_user_scopes assignment on the default System scope
//
// Then sets the hazo_auth cookies (USER_ID + USER_EMAIL) on the response so
// the next request to /api/feedback/admin/* is recognised as an authenticated
// admin. Cookie prefix must match config/hazo_auth_config.ini → cookie_prefix.

const TEST_USER_ID    = 'test-user-1';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_NAME  = 'Test User';
const ADMIN_PERMISSION = 'hazo_feedback:test-app:admin';
const ADMIN_ROLE       = 'feedback_admin_test_app';
const SYSTEM_SCOPE_ID  = '00000000-0000-0000-0000-000000000001';
const COOKIE_PREFIX    = 'hazo_feedback_test_';

export async function POST(): Promise<NextResponse> {
  const dbPath = join(process.cwd(), 'test-app.db');
  let db: Database.Database | null = null;

  try {
    db = new Database(dbPath);

    // Sanity check — tables must exist (created by /api/migrate)
    const tablesPresent = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name IN
           ('hazo_users','hazo_roles','hazo_permissions','hazo_role_permissions','hazo_scopes','hazo_user_scopes')`
      )
      .all() as Array<{ name: string }>;
    if (tablesPresent.length < 6) {
      return NextResponse.json(
        { ok: false, error: 'Auth tables missing — run /api/migrate first' },
        { status: 500 }
      );
    }

    const seed = db.transaction(() => {
      // 1. Ensure the user row
      db!.prepare(
        `INSERT INTO hazo_users (id, email_address, name, status)
         VALUES (?, ?, ?, 'ACTIVE')
         ON CONFLICT(id) DO UPDATE SET status='ACTIVE', email_address=excluded.email_address, name=excluded.name`
      ).run(TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_NAME);

      // 2. Ensure the permission row
      let permissionId = (
        db!.prepare(`SELECT id FROM hazo_permissions WHERE permission_name=?`)
          .get(ADMIN_PERMISSION) as { id: string } | undefined
      )?.id;
      if (!permissionId) {
        permissionId = randomUUID();
        db!.prepare(
          `INSERT INTO hazo_permissions (id, permission_name, description) VALUES (?, ?, ?)`
        ).run(permissionId, ADMIN_PERMISSION, 'Full admin access for hazo_feedback test-app');
      }

      // 3. Ensure the role row
      let roleId = (
        db!.prepare(`SELECT id FROM hazo_roles WHERE role_name=?`).get(ADMIN_ROLE) as
          | { id: string }
          | undefined
      )?.id;
      if (!roleId) {
        roleId = randomUUID();
        db!.prepare(`INSERT INTO hazo_roles (id, role_name) VALUES (?, ?)`).run(roleId, ADMIN_ROLE);
      }

      // 4. Link role → permission
      db!.prepare(
        `INSERT OR IGNORE INTO hazo_role_permissions (role_id, permission_id) VALUES (?, ?)`
      ).run(roleId, permissionId);

      // 5. Assign user → scope with role
      db!.prepare(
        `INSERT INTO hazo_user_scopes (user_id, scope_id, root_scope_id, role_id, status)
         VALUES (?, ?, ?, ?, 'ACTIVE')
         ON CONFLICT(user_id, scope_id) DO UPDATE SET role_id=excluded.role_id, status='ACTIVE'`
      ).run(TEST_USER_ID, SYSTEM_SCOPE_ID, SYSTEM_SCOPE_ID, roleId);
    });
    seed();

    const res = NextResponse.json({
      ok: true,
      user_id: TEST_USER_ID,
      permission: ADMIN_PERMISSION,
      message: 'Test admin seeded and auth cookies set',
    });

    // Set the simple cookies hazo_get_auth falls back to when no JWT is present.
    // Names must include the configured cookie_prefix.
    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    };
    res.cookies.set(`${COOKIE_PREFIX}hazo_auth_user_id`, TEST_USER_ID, cookieOpts);
    res.cookies.set(`${COOKIE_PREFIX}hazo_auth_user_email`, TEST_USER_EMAIL, cookieOpts);

    return res;
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
