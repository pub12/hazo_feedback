import { Settings } from 'lucide-react';

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-gray-700">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-2 mb-2">
        <Settings size={22} className="text-gray-500" />
        <h1 className="text-xl font-bold text-gray-900">
          Configuration Reference
        </h1>
      </div>
      <p className="text-gray-500 text-sm mb-8">
        Setup requirements and configuration options for hazo_feedback.
      </p>

      {/* INI config */}
      <Section title="INI Config File">
        <p>
          Place a config file at{' '}
          <code className="bg-gray-100 px-1 rounded">
            config/hazo_feedback_config.ini
          </code>{' '}
          in your consuming app (or any path registered with hazo_config). All
          values have defaults — the file is optional.
        </p>
        <CodeBlock>{`[app]
; Identifier for this app instance — scopes feedback in the database
app_id = my-app

; Semver string attached to every submission for regression tracking
app_version = 1.0.0

; Scope string checked against the authenticated user's scopes for admin access
admin_scope = hazo_feedback:my-app:admin

[rate_limit]
; Max submissions per anonymous session within the window
per_anon_count = 5
; Window duration in milliseconds (default 1 hour)
per_anon_window_ms = 3600000

; Max submissions per authenticated user within the window
per_user_count = 20
per_user_window_ms = 3600000

; Max submissions per IP address within the window
per_ip_count = 50
per_ip_window_ms = 3600000

[attachments]
; Maximum number of attachments per submission
max_count = 5

; Maximum bytes per individual file (default 5 MB)
max_bytes_per_file = 5242880

; Maximum combined bytes across all attachments (default 20 MB)
total_max_bytes = 20971520

[notify]
; Send an acknowledgment email to the submitter (requires hazo_notify)
acknowledge_email_enabled = false
acknowledge_email_from = noreply@example.com
acknowledge_email_from_name = Feedback
acknowledge_email_subject = We received your feedback`}</CodeBlock>
      </Section>

      {/* Tailwind v4 @source */}
      <Section title="Tailwind v4 @source Directive (required)">
        <p>
          Tailwind v4 uses JIT scanning. Because hazo_feedback ships pre-built
          in <code className="bg-gray-100 px-1 rounded">node_modules/</code>,
          its classes will not be included in your bundle unless you explicitly
          add the <code className="bg-gray-100 px-1 rounded">@source</code>{' '}
          directive.
        </p>
        <p>
          In your consuming app's global CSS (e.g.{' '}
          <code className="bg-gray-100 px-1 rounded">app/globals.css</code>):
        </p>
        <CodeBlock>{`@import "tailwindcss";

/* Add @source for every hazo package that renders UI */
@source "../node_modules/hazo_feedback/dist";
@source "../node_modules/hazo_ui/dist";`}</CodeBlock>
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          Without this directive, the widget and admin page will render without
          styling (blank / unstyled). This is the most common setup issue.
        </p>
      </Section>

      {/* runtime = 'nodejs' */}
      <Section title="API Route: runtime = 'nodejs' (required)">
        <p>
          The API catch-all route{' '}
          <code className="bg-gray-100 px-1 rounded">
            app/api/feedback/[...path]/route.ts
          </code>{' '}
          MUST export <code className="bg-gray-100 px-1 rounded">runtime = &apos;nodejs&apos;</code>.
        </p>
        <p>
          hazo_connect uses{' '}
          <code className="bg-gray-100 px-1 rounded">better-sqlite3</code>{' '}
          (native Node.js module) for SQLite. The Edge runtime does not support
          native modules. Without this export, Next.js will attempt to run the
          route in the Edge runtime and throw a build or runtime error.
        </p>
        <CodeBlock>{`// app/api/feedback/[...path]/route.ts
import 'server-only';
export const runtime = 'nodejs'; // <-- required

import { createFeedbackServer } from 'hazo_feedback';
// ...`}</CodeBlock>
        <p>
          Additionally, add{' '}
          <code className="bg-gray-100 px-1 rounded">better-sqlite3</code> and{' '}
          <code className="bg-gray-100 px-1 rounded">sql.js</code> to{' '}
          <code className="bg-gray-100 px-1 rounded">
            serverComponentsExternalPackages
          </code>{' '}
          in <code className="bg-gray-100 px-1 rounded">next.config.js</code>:
        </p>
        <CodeBlock>{`experimental: {
  serverComponentsExternalPackages: ['better-sqlite3', 'sql.js'],
},
webpack: (config, { isServer }) => {
  if (isServer) {
    config.externals = config.externals || [];
    config.externals.push('sql.js');
  }
  return config;
},`}</CodeBlock>
      </Section>

      {/* instrumentation.ts */}
      <Section title="System Templates: instrumentation.ts">
        <p>
          hazo_feedback ships default email templates (acknowledgment email) as
          system templates. Call{' '}
          <code className="bg-gray-100 px-1 rounded">
            sync_system_templates
          </code>{' '}
          at server startup to ensure they exist in the database. The correct
          place is Next.js{' '}
          <code className="bg-gray-100 px-1 rounded">instrumentation.ts</code>
          (runs once on server start, not per request).
        </p>
        <CodeBlock>{`// instrumentation.ts (at project root, next to package.json)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { syncSystemTemplates } = await import('hazo_feedback');
    const { createHazoConnect } = await import('hazo_connect/server');

    const getHazoConnect = () =>
      createHazoConnect({
        type: 'sqlite',
        sqlite: { database_path: './my-app.db' },
      });

    await syncSystemTemplates({ getHazoConnect });
  }
}`}</CodeBlock>
        <p>
          If you skip this step, acknowledgment emails will fail silently (the
          template lookup will return null and no email will be sent).
        </p>
      </Section>

      {/* transpilePackages */}
      <Section title="next.config.js: transpilePackages">
        <p>
          All hazo packages must be listed in{' '}
          <code className="bg-gray-100 px-1 rounded">transpilePackages</code> so
          Next.js compiles their ESM source:
        </p>
        <CodeBlock>{`transpilePackages: [
  'hazo_feedback',
  'hazo_connect',
  'hazo_auth',
  'hazo_ui',
  'hazo_notify',
  'hazo_files',
],`}</CodeBlock>
      </Section>
    </div>
  );
}
