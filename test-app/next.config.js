/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    'hazo_feedback',
    'hazo_connect',
    'hazo_auth',
    'hazo_ui',
    'hazo_notify',
    'hazo_files',
  ],
  serverExternalPackages: ['better-sqlite3', 'sql.js'],
};

module.exports = nextConfig;
