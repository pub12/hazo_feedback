import 'server-only';

// Factory
export { createFeedbackServer } from './server/factory.js';

// Template manifest (for sync_system_templates in consuming app)
export { hazo_feedback_template_manifest } from './manifest.js';

// Types (re-exported for consumer use)
export type {
  FeedbackServerOptions,
  FeedbackServer,
  FeedbackSubmission,
  FeedbackAttachment,
  FeedbackEvent,
  FeedbackConfig,
  RateLimitConfig,
  AttachmentConfig,
  NotifyConfig,
  Logger,
} from './types.js';
