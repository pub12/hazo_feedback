import path from 'path';
import fs from 'fs';
import { HazoConfig } from 'hazo_config/server';
import type { FeedbackConfig } from '../types.js';

let cached_config: FeedbackConfig | null = null;

export function clear_config_cache(): void {
  cached_config = null;
}

// Stub config object that returns undefined for every key, used when the INI file is absent
const NULL_CFG = { get: (_section: string, _key: string): string | undefined => undefined };

export function get_feedback_config(): FeedbackConfig {
  if (cached_config !== null) {
    return cached_config;
  }

  const config_path =
    process.env.HAZO_FEEDBACK_CONFIG_PATH ??
    path.join(process.cwd(), 'config', 'hazo_feedback_config.ini');

  const cfg = fs.existsSync(config_path)
    ? new HazoConfig({ filePath: config_path, cache_ttl_ms: 0 })
    : NULL_CFG;

  const app_id = cfg.get('app', 'app_id') ?? 'default';
  const app_version = cfg.get('app', 'app_version');

  const admin_scope =
    cfg.get('admin', 'admin_scope') ?? 'hazo_feedback:default:admin';

  const per_anon_count = parseInt(cfg.get('rate_limit', 'per_anon_count') ?? '5', 10);
  const per_anon_window_ms = parseInt(cfg.get('rate_limit', 'per_anon_window_ms') ?? '3600000', 10);
  const per_user_count = parseInt(cfg.get('rate_limit', 'per_user_count') ?? '20', 10);
  const per_user_window_ms = parseInt(cfg.get('rate_limit', 'per_user_window_ms') ?? '3600000', 10);
  const per_ip_count = parseInt(cfg.get('rate_limit', 'per_ip_count') ?? '30', 10);
  const per_ip_window_ms = parseInt(cfg.get('rate_limit', 'per_ip_window_ms') ?? '3600000', 10);

  const max_count = parseInt(cfg.get('attachments', 'max_count') ?? '5', 10);
  const max_bytes_per_file = parseInt(cfg.get('attachments', 'max_bytes_per_file') ?? '5242880', 10);
  const total_max_bytes = parseInt(cfg.get('attachments', 'total_max_bytes') ?? '20971520', 10);

  const acknowledge_email_enabled_raw = cfg.get('notify', 'acknowledge_email_enabled') ?? 'false';
  const acknowledge_email_enabled =
    acknowledge_email_enabled_raw === 'true' || acknowledge_email_enabled_raw === '1';
  const acknowledge_email_from = cfg.get('notify', 'acknowledge_email_from') ?? '';
  const acknowledge_email_from_name = cfg.get('notify', 'acknowledge_email_from_name') ?? '';
  const acknowledge_email_subject =
    cfg.get('notify', 'acknowledge_email_subject') ?? 'We received your feedback';

  const reply_email_to_user_enabled_raw = cfg.get('notify', 'reply_email_to_user_enabled') ?? 'true';
  const reply_email_to_user_enabled =
    reply_email_to_user_enabled_raw === 'true' || reply_email_to_user_enabled_raw === '1';
  const reply_email_to_admin_enabled_raw = cfg.get('notify', 'reply_email_to_admin_enabled') ?? 'true';
  const reply_email_to_admin_enabled =
    reply_email_to_admin_enabled_raw === 'true' || reply_email_to_admin_enabled_raw === '1';

  cached_config = {
    appId: app_id,
    ...(app_version !== undefined ? { appVersion: app_version } : {}),
    adminScope: admin_scope,
    rateLimitConfig: {
      perAnonCount: per_anon_count,
      perAnonWindowMs: per_anon_window_ms,
      perUserCount: per_user_count,
      perUserWindowMs: per_user_window_ms,
      perIpCount: per_ip_count,
      perIpWindowMs: per_ip_window_ms,
    },
    attachmentConfig: {
      maxCount: max_count,
      maxBytesPerFile: max_bytes_per_file,
      totalMaxBytes: total_max_bytes,
    },
    notifyConfig: {
      acknowledgeEmailEnabled: acknowledge_email_enabled,
      acknowledgeEmailFrom: acknowledge_email_from,
      acknowledgeEmailFromName: acknowledge_email_from_name,
      acknowledgeEmailSubject: acknowledge_email_subject,
      replyEmailToUserEnabled: reply_email_to_user_enabled,
      replyEmailToAdminEnabled: reply_email_to_admin_enabled,
    },
  };

  return cached_config;
}
