import { build_prompt } from '../prompt/build_prompt.js';
import type { FeedbackSubmission, FeedbackAttachment, FeedbackEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseSub: FeedbackSubmission = {
  id: 'test-id',
  ref_id: 'TESTAPP-ABC1234',
  app_id: 'testapp',
  source: null,
  user_id: null,
  user_name_snapshot: null,
  user_email_snapshot: null,
  anon_session_id: null,
  category: 'general',
  subject: null,
  problem: null,
  intent: null,
  expected_output: null,
  reproducibility: null,
  body_html: null,
  body_text: null,
  status: 'new',
  priority: null,
  marked_spam: false,
  url: 'https://example.com/test',
  route: null,
  viewport_w: null,
  viewport_h: null,
  user_agent: null,
  app_version: null,
  consumer_context: null,
  consumer_context_redacted: null,
  recent_errors: null,
  breadcrumbs: null,
  attachment_count: 0,
  acknowledge_email_sent_at: null,
  created_at: '2026-05-14T10:00:00Z',
  updated_at: '2026-05-14T10:00:00Z',
  resolved_at: null,
};

function makeSub(overrides: Partial<FeedbackSubmission>): FeedbackSubmission {
  return { ...baseSub, ...overrides };
}

const noAttachments: FeedbackAttachment[] = [];
const noEvents: FeedbackEvent[] = [];

// ---------------------------------------------------------------------------
// Call-to-action per category
// ---------------------------------------------------------------------------

describe('build_prompt — call-to-action by category', () => {
  it('bug: output contains "investigate this bug report"', () => {
    const result = build_prompt(makeSub({ category: 'bug' }), noAttachments, noEvents);
    expect(result).toContain('investigate this bug report');
  });

  it('feature: output contains text about "feature request"', () => {
    const result = build_prompt(makeSub({ category: 'feature' }), noAttachments, noEvents);
    expect(result).toContain('feature request');
  });

  it('general: output contains "next action"', () => {
    const result = build_prompt(makeSub({ category: 'general' }), noAttachments, noEvents);
    expect(result).toContain('next action');
  });

  it('praise: output does NOT contain a call-to-action line', () => {
    const result = build_prompt(makeSub({ category: 'praise' }), noAttachments, noEvents);
    // None of the CTA phrases should appear
    expect(result).not.toContain('investigate this bug report');
    expect(result).not.toContain('feature request');
    expect(result).not.toContain('next action');
  });
});

// ---------------------------------------------------------------------------
// Header fields always present
// ---------------------------------------------------------------------------

describe('build_prompt — header', () => {
  it('output contains the ref_id', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    expect(result).toContain('TESTAPP-ABC1234');
  });

  it('output contains the submission URL', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    expect(result).toContain('https://example.com/test');
  });

  it('output contains the category', () => {
    const result = build_prompt(makeSub({ category: 'bug' }), noAttachments, noEvents);
    expect(result).toContain('bug');
  });

  it('output contains the status', () => {
    const result = build_prompt(makeSub({ status: 'triaged' }), noAttachments, noEvents);
    expect(result).toContain('triaged');
  });

  it('output contains the created_at timestamp', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    expect(result).toContain('2026-05-14T10:00:00Z');
  });

  it('includes route when present', () => {
    const result = build_prompt(
      makeSub({ route: '/dashboard/settings' }),
      noAttachments,
      noEvents
    );
    expect(result).toContain('/dashboard/settings');
  });

  it('omits route line when route is null', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    expect(result).not.toContain('**Route:**');
  });

  it('includes priority when present', () => {
    const result = build_prompt(makeSub({ priority: 'urgent' }), noAttachments, noEvents);
    expect(result).toContain('urgent');
  });

  it('omits priority line when priority is null', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    expect(result).not.toContain('**Priority:**');
  });
});

// ---------------------------------------------------------------------------
// Bug-specific structured fields
// ---------------------------------------------------------------------------

describe('build_prompt — bug details section', () => {
  it('includes "Bug Details" heading when at least one bug field is set', () => {
    const result = build_prompt(
      makeSub({ category: 'bug', problem: 'Login button does nothing' }),
      noAttachments,
      noEvents
    );
    expect(result).toContain('## Bug Details');
  });

  it('includes the problem text', () => {
    const result = build_prompt(
      makeSub({ category: 'bug', problem: 'Login button does nothing' }),
      noAttachments,
      noEvents
    );
    expect(result).toContain('Login button does nothing');
  });

  it('includes the expected_output text', () => {
    const result = build_prompt(
      makeSub({ category: 'bug', expected_output: 'Should redirect to dashboard' }),
      noAttachments,
      noEvents
    );
    expect(result).toContain('Should redirect to dashboard');
  });

  it('includes the reproducibility value', () => {
    const result = build_prompt(
      makeSub({ category: 'bug', reproducibility: 'always' }),
      noAttachments,
      noEvents
    );
    expect(result).toContain('always');
  });

  it('omits "Bug Details" heading when category is bug but all bug fields are null', () => {
    const result = build_prompt(makeSub({ category: 'bug' }), noAttachments, noEvents);
    expect(result).not.toContain('## Bug Details');
  });

  it('omits "Bug Details" heading for non-bug categories even when fields are set', () => {
    const result = build_prompt(
      makeSub({ category: 'feature', problem: 'irrelevant' }),
      noAttachments,
      noEvents
    );
    expect(result).not.toContain('## Bug Details');
  });
});

// ---------------------------------------------------------------------------
// Consumer Context section
// ---------------------------------------------------------------------------

describe('build_prompt — Consumer Context section', () => {
  it('includes the section when consumer_context is a non-empty object', () => {
    const result = build_prompt(
      makeSub({ consumer_context: { plan: 'pro', tenant: 'acme' } }),
      noAttachments,
      noEvents
    );
    expect(result).toContain('## Consumer Context');
    expect(result).toContain('"plan"');
    expect(result).toContain('"pro"');
  });

  it('omits the section when consumer_context is null', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    expect(result).not.toContain('## Consumer Context');
  });

  it('omits the section when consumer_context is an empty object', () => {
    const result = build_prompt(makeSub({ consumer_context: {} }), noAttachments, noEvents);
    expect(result).not.toContain('## Consumer Context');
  });
});

// ---------------------------------------------------------------------------
// Recent Errors section
// ---------------------------------------------------------------------------

describe('build_prompt — Recent Errors section', () => {
  it('includes the section when recent_errors is a non-empty array', () => {
    const errors = [{ message: 'TypeError: Cannot read property x of undefined' }];
    const result = build_prompt(makeSub({ recent_errors: errors }), noAttachments, noEvents);
    expect(result).toContain('## Recent Errors');
    expect(result).toContain('TypeError');
  });

  it('omits the section when recent_errors is null', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    expect(result).not.toContain('## Recent Errors');
  });

  it('omits the section when recent_errors is an empty array', () => {
    const result = build_prompt(makeSub({ recent_errors: [] }), noAttachments, noEvents);
    expect(result).not.toContain('## Recent Errors');
  });
});

// ---------------------------------------------------------------------------
// Breadcrumbs section
// ---------------------------------------------------------------------------

describe('build_prompt — Breadcrumbs section', () => {
  it('includes the section when breadcrumbs is a non-empty array', () => {
    const crumbs = [{ type: 'navigation', message: 'Navigated to /settings', timestamp: 1000 }];
    const result = build_prompt(makeSub({ breadcrumbs: crumbs }), noAttachments, noEvents);
    expect(result).toContain('## Breadcrumbs');
    expect(result).toContain('navigation');
  });

  it('omits the section when breadcrumbs is null', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    expect(result).not.toContain('## Breadcrumbs');
  });

  it('omits the section when breadcrumbs is an empty array', () => {
    const result = build_prompt(makeSub({ breadcrumbs: [] }), noAttachments, noEvents);
    expect(result).not.toContain('## Breadcrumbs');
  });
});

// ---------------------------------------------------------------------------
// Attachments section
// ---------------------------------------------------------------------------

describe('build_prompt — Attachments section', () => {
  const attachment: FeedbackAttachment = {
    id: 'att-1',
    submission_id: 'test-id',
    inline_id: null,
    file_id: 'file-abc',
    mime_type: 'image/png',
    size_bytes: 4096,
    kind: 'screenshot',
    created_at: '2026-05-14T10:00:00Z',
  };

  it('includes the section when attachments array is non-empty', () => {
    const result = build_prompt(baseSub, [attachment], noEvents);
    expect(result).toContain('## Attachments');
  });

  it('lists kind, mime_type, and size_bytes for each attachment', () => {
    const result = build_prompt(baseSub, [attachment], noEvents);
    expect(result).toContain('screenshot');
    expect(result).toContain('image/png');
    expect(result).toContain('4096');
  });

  it('omits the section when attachments array is empty', () => {
    const result = build_prompt(baseSub, [], noEvents);
    expect(result).not.toContain('## Attachments');
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

describe('build_prompt — footer', () => {
  it('contains the ref_id again in the footer line', () => {
    const result = build_prompt(baseSub, noAttachments, noEvents);
    const footer_line = result
      .split('\n')
      .find((line) => line.startsWith('*Exported from hazo_feedback'));
    expect(footer_line).toBeDefined();
    expect(footer_line).toContain('TESTAPP-ABC1234');
  });
});

// ---------------------------------------------------------------------------
// Activity section
// ---------------------------------------------------------------------------

describe('build_prompt — Activity section', () => {
  const event: FeedbackEvent = {
    id: 'ev-1',
    submission_id: 'test-id',
    actor_id: 'u-1',
    event_type: 'status_changed',
    from_value: 'new',
    to_value: 'triaged',
    comment: null,
    created_at: '2026-05-14T10:05:00Z',
  };

  it('includes the section when events are present', () => {
    const result = build_prompt(baseSub, noAttachments, [event]);
    expect(result).toContain('## Activity');
    expect(result).toContain('status_changed');
  });

  it('omits the section when events array is empty', () => {
    const result = build_prompt(baseSub, noAttachments, []);
    expect(result).not.toContain('## Activity');
  });

  it('includes the from/to transition in the activity line', () => {
    const result = build_prompt(baseSub, noAttachments, [event]);
    expect(result).toContain('new → triaged');
  });

  it('includes the comment when present', () => {
    const commented_event: FeedbackEvent = { ...event, comment: 'Needs more info' };
    const result = build_prompt(baseSub, noAttachments, [commented_event]);
    expect(result).toContain('Needs more info');
  });
});
