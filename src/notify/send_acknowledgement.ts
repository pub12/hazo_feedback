import "server-only";

import { dispatch } from "hazo_notify/dispatcher";

export interface AckEmailOptions {
  to: string;
  from: string;
  fromName?: string;
  refId: string;
  name: string;
  subject: string;
  category: string;
  submittedAt: Date;
  recipientUserId: string;
  scopeId?: string;
  deepLink: string;
}

export async function send_acknowledgement(opts: AckEmailOptions): Promise<void> {
  try {
    await dispatch({
      event_type: "hazo_feedback.acknowledgement",
      subject_id: opts.refId,
      scope_id: opts.scopeId ?? "",
      recipient_user_ids: [opts.recipientUserId],
      in_app_text: `Thanks for your feedback (${opts.refId})`,
      deep_link: opts.deepLink,
      surfaces: { in_app: true, banner: false },
      channels: { email: true },
      channel_payloads: {
        email: {
          template_name: "feedback_acknowledgement",
          to: opts.to,
          from: opts.from,
          from_name: opts.fromName,
          variables: {
            ref_id: opts.refId,
            name: opts.name,
            subject: opts.subject,
            category: opts.category,
            submitted_at: opts.submittedAt.toISOString(),
          },
        },
      },
      batch_window_ms: 0,
    });
  } catch (err) {
    console.warn(
      "[hazo_feedback] send_acknowledgement: dispatch failed",
      { to: opts.to, ref_id: opts.refId, error: String(err) },
    );
  }
}
