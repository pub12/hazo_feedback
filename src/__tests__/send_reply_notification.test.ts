// hazo_notify/dispatcher is mapped to src/__tests__/__mocks__/hazo_notify_dispatcher.ts
// via moduleNameMapper in jest.config.cjs — inline jest.mock() factory hoisting is not
// supported with ts-jest ESM + --experimental-vm-modules.

import { describe, it, expect, beforeEach } from '@jest/globals';
import { dispatch } from 'hazo_notify/dispatcher';
import { send_reply_notification } from '../notify/send_reply_notification.js';

const dispatchSpy = dispatch as jest.MockedFunction<typeof dispatch>;

describe('send_reply_notification', () => {
  beforeEach(() => dispatchSpy.mockClear());

  it('dispatches both in_app and email when emailEnabled=true', async () => {
    await send_reply_notification({
      direction: 'admin_to_user',
      recipientUserIds: ['user-1'],
      refId: 'PRO-1A2B3',
      submissionId: 'sub-1',
      subject: 'Why is this broken',
      category: 'bug',
      replyBodyText: 'We pushed a fix in v2.1.4',
      replierName: 'Pat',
      threadUrl: 'https://example.com/feedback/thread/PRO-1A2B3',
      emailEnabled: true,
      from: 'feedback@example.com',
      fromName: 'Example Feedback',
      scopeId: '',
    });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const arg = dispatchSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.event_type).toBe('hazo_feedback.reply_received');
    expect(arg.recipient_user_ids).toEqual(['user-1']);
    expect(arg.surfaces).toEqual({ in_app: true, banner: false });
    expect(arg.channels).toEqual({ in_app: true, email: true });
    const payloads = arg.channel_payloads as Record<string, Record<string, unknown>>;
    expect(payloads.email.template_name).toBe('feedback_admin_reply_to_user');
    const variables = payloads.email.variables as Record<string, unknown>;
    expect(variables.reply_body_preview).toBe('We pushed a fix in v2.1.4');
  });

  it('skips email channel when emailEnabled=false', async () => {
    await send_reply_notification({
      direction: 'user_to_admin',
      recipientUserIds: ['admin-1', 'admin-2'],
      refId: 'PRO-1A2B3',
      submissionId: 'sub-1',
      subject: 'Why is this broken',
      category: 'bug',
      replyBodyText: 'Thanks!',
      replierName: 'Alex',
      threadUrl: 'https://example.com/admin/feedback/sub-1',
      emailEnabled: false,
      from: '',
      fromName: '',
      scopeId: '',
    });
    const arg = dispatchSpy.mock.calls[0][0] as Record<string, unknown>;
    const channels = arg.channels as Record<string, unknown>;
    expect(channels).toEqual({ in_app: true });
    const payloads = arg.channel_payloads as Record<string, unknown>;
    expect(payloads.email).toBeUndefined();
    expect(payloads.in_app).toBeDefined();
    expect(arg.recipient_user_ids).toEqual(['admin-1', 'admin-2']);
  });

  it('truncates reply_body_preview to 500 chars (+ ellipsis)', async () => {
    const long = 'x'.repeat(800);
    await send_reply_notification({
      direction: 'admin_to_user',
      recipientUserIds: ['user-1'],
      refId: 'PRO-X',
      submissionId: 'sub-x',
      subject: 'S',
      category: 'general',
      replyBodyText: long,
      replierName: 'A',
      threadUrl: '/x',
      emailEnabled: true,
      from: 'a@b.c',
      fromName: '',
      scopeId: '',
    });
    const arg = dispatchSpy.mock.calls[0][0] as Record<string, unknown>;
    const payloads = arg.channel_payloads as Record<string, Record<string, unknown>>;
    const variables = payloads.email.variables as Record<string, unknown>;
    const preview = variables.reply_body_preview as string;
    expect(preview.length).toBeLessThanOrEqual(503);
    expect(preview.endsWith('…')).toBe(true);
  });
});
