import "server-only";

import { send_template_email } from "hazo_notify/template_manager";

export interface AckEmailOptions {
  to: string;
  from: string;
  fromName?: string;
  refId: string;
  name: string;
  subject: string;
  category: string;
  submittedAt: Date;
  hazo_connect: unknown;
}

export async function send_acknowledgement(opts: AckEmailOptions): Promise<void> {
  const result = await send_template_email(
    {
      template_name: "feedback_acknowledgement",
      to: opts.to,
      from: opts.from,
      from_name: opts.fromName,
      scope_id: null,
      variables: {
        ref_id: opts.refId,
        name: opts.name,
        subject: opts.subject,
        category: opts.category,
        submitted_at: opts.submittedAt.toISOString(),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opts.hazo_connect as any,
  );

  if (!result.success) {
    console.warn(
      "[hazo_feedback] send_acknowledgement: failed to send acknowledgement email",
      { to: opts.to, ref_id: opts.refId, error: result.error, message: result.message },
    );
  }
}
