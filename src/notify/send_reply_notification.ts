import 'server-only';
import { dispatch } from 'hazo_notify/dispatcher';

export type ReplyDirection = 'admin_to_user' | 'user_to_admin';

export interface SendReplyNotificationOptions {
  direction: ReplyDirection;
  recipientUserIds: string[];
  refId: string;
  submissionId: string;
  subject: string;
  category: string;
  replyBodyText: string;
  replierName: string;
  threadUrl: string;
  emailEnabled: boolean;
  from: string;
  fromName?: string;
  scopeId: string;
}

const PREVIEW_LIMIT = 500;

function preview(body: string): string {
  if (body.length <= PREVIEW_LIMIT) return body;
  return body.slice(0, PREVIEW_LIMIT) + '…';
}

export async function send_reply_notification(opts: SendReplyNotificationOptions): Promise<void> {
  const template_name =
    opts.direction === 'admin_to_user'
      ? 'feedback_admin_reply_to_user'
      : 'feedback_user_reply_to_admin';

  const reply_body_preview = preview(opts.replyBodyText);

  const variables = {
    ref_id: opts.refId,
    name: '',
    subject: opts.subject,
    category: opts.category,
    reply_body_preview,
    thread_url: opts.threadUrl,
    replier_name: opts.replierName,
  };

  const in_app_text =
    opts.direction === 'admin_to_user'
      ? `Reply on your feedback ${opts.refId}`
      : `${opts.replierName} replied on ${opts.refId}`;

  const channels: Record<string, boolean> = { in_app: true };
  const channel_payloads: Record<string, Record<string, unknown>> = {
    in_app: {
      title: in_app_text,
      body_preview: reply_body_preview,
      action_url: opts.threadUrl,
    },
  };

  if (opts.emailEnabled) {
    channels.email = true;
    channel_payloads.email = {
      template_name,
      from: opts.from,
      from_name: opts.fromName,
      variables,
    };
  }

  try {
    await dispatch({
      event_type: 'hazo_feedback.reply_received',
      subject_id: opts.submissionId,
      scope_id: opts.scopeId,
      recipient_user_ids: opts.recipientUserIds,
      in_app_text,
      deep_link: opts.threadUrl,
      surfaces: { in_app: true, banner: false },
      channels,
      channel_payloads,
      batch_window_ms: 0,
    });
  } catch (err) {
    console.warn('[hazo_feedback] send_reply_notification failed', {
      direction: opts.direction,
      ref_id: opts.refId,
      error: String(err),
    });
  }
}
