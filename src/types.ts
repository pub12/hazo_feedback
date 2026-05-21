// Shared types for hazo_feedback — no Node.js imports

export type FeedbackCategory = 'bug' | 'feature' | 'general' | 'praise';

export type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix';

export type FeedbackPriority = 'low' | 'medium' | 'high' | 'urgent';

export type AttachmentKind = 'screenshot' | 'pasted_image' | 'uploaded_file';

export type FeedbackEventType =
  | 'status_changed'
  | 'priority_changed'
  | 'comment_added'
  | 'exported_prompt'
  | 'admin_reply'
  | 'user_reply'
  | 'visibility_changed';

export interface FeedbackSubmission {
  id: string;
  ref_id: string;
  app_id: string;
  source: string | null;
  user_id: string | null;
  user_name_snapshot: string | null;
  user_email_snapshot: string | null;
  anon_session_id: string | null;
  category: FeedbackCategory;
  subject: string | null;
  problem: string | null;
  intent: string | null;
  expected_output: string | null;
  reproducibility: 'always' | 'sometimes' | 'once' | null;
  body_html: string | null;
  body_text: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority | null;
  marked_spam: boolean;
  is_public: boolean;
  url: string;
  route: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  user_agent: string | null;
  app_version: string | null;
  consumer_context: Record<string, unknown> | null;
  consumer_context_redacted: string[] | null;
  recent_errors: unknown[] | null;
  breadcrumbs: BreadcrumbEntry[] | null;
  attachment_count: number;
  acknowledge_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface FeedbackAttachment {
  id: string;
  submission_id: string | null;
  event_id: string | null;
  inline_id: string | null;
  file_id: string;
  mime_type: string;
  size_bytes: number;
  kind: AttachmentKind;
  created_at: string;
}

export interface FeedbackEvent {
  id: string;
  submission_id: string;
  actor_id: string | null;
  event_type: FeedbackEventType;
  from_value: string | null;
  to_value: string | null;
  comment: string | null;
  body_html: string | null;
  body_text: string | null;
  created_at: string;
}

export interface FeedbackVote {
  id: string;
  submission_id: string;
  user_id: string;
  created_at: string;
}

export interface BreadcrumbEntry {
  type: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface FeedbackUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface FeedbackContextEntry {
  key: symbol;
  data: Record<string, unknown>;
}

export type CopyState = 'idle' | 'copied' | 'failed';

export interface FeedbackProviderProps {
  children: React.ReactNode;
  appId: string;
  apiBase?: string;
  source?: string;
  user?: FeedbackUser | null;
  appVersion?: string;
  captureErrors?: boolean;
  maxAttachments?: number;
  maxBytesPerFile?: number;
  totalMaxBytes?: number;
  translate?: (key: string, vars?: Record<string, string>) => string;
  redactContext?: (ctx: Record<string, unknown>) => Record<string, unknown>;
}

export interface FeedbackServerOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  getFileManager: () => Promise<unknown> | unknown;
  appId?: string;
  adminScope?: string;
  notifyOptions?: {
    getHazoConnect: () => Promise<unknown> | unknown;
    from: string;
    fromName?: string;
  };
  threadUrlBuilder?: (refId: string, submissionId: string) => string;
  listAdminsForBroadcast?: () => Promise<string[]>;
  logger?: Logger;
}

export interface FeedbackServer {
  handlers: {
    GET: (request: unknown, context: unknown) => Promise<unknown>;
    POST: (request: unknown, context: unknown) => Promise<unknown>;
    PATCH: (request: unknown, context: unknown) => Promise<unknown>;
    DELETE: (request: unknown, context: unknown) => Promise<unknown>;
  };
}

export interface FeedbackConfig {
  appId: string;
  appVersion?: string;
  adminScope: string;
  rateLimitConfig: RateLimitConfig;
  attachmentConfig: AttachmentConfig;
  notifyConfig: NotifyConfig;
}

export interface RateLimitConfig {
  perAnonCount: number;
  perAnonWindowMs: number;
  perUserCount: number;
  perUserWindowMs: number;
  perIpCount: number;
  perIpWindowMs: number;
}

export interface AttachmentConfig {
  maxCount: number;
  maxBytesPerFile: number;
  totalMaxBytes: number;
}

export interface NotifyConfig {
  acknowledgeEmailEnabled: boolean;
  acknowledgeEmailFrom: string;
  acknowledgeEmailFromName: string;
  acknowledgeEmailSubject: string;
  replyEmailToUserEnabled: boolean;
  replyEmailToAdminEnabled: boolean;
}

export interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}
