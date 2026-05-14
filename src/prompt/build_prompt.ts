import type { FeedbackSubmission, FeedbackAttachment, FeedbackEvent } from '../types.js';

export function build_prompt(
  submission: FeedbackSubmission,
  attachments: FeedbackAttachment[],
  events: FeedbackEvent[]
): string {
  const lines: string[] = [];

  // --- Header ---
  lines.push(`# Feedback: ${submission.ref_id}`);
  lines.push('');
  lines.push(`**Category:** ${submission.category}  `);
  lines.push(`**Status:** ${submission.status}  `);
  lines.push(`**Submitted:** ${submission.created_at}  `);
  lines.push(`**URL:** ${submission.url}  `);
  if (submission.route) {
    lines.push(`**Route:** ${submission.route}  `);
  }
  if (submission.priority) {
    lines.push(`**Priority:** ${submission.priority}  `);
  }

  // --- Description ---
  lines.push('');
  lines.push('## Description');
  if (submission.subject) {
    lines.push('');
    lines.push(submission.subject);
  }
  if (submission.body_text) {
    lines.push('');
    lines.push(submission.body_text);
  }

  // --- Bug Details ---
  if (submission.category === 'bug') {
    const has_bug_fields =
      submission.problem !== null ||
      submission.expected_output !== null ||
      submission.reproducibility !== null;

    if (has_bug_fields) {
      lines.push('');
      lines.push('## Bug Details');
      if (submission.problem) {
        lines.push(`**Problem:** ${submission.problem}`);
      }
      if (submission.expected_output) {
        lines.push(`**Expected:** ${submission.expected_output}`);
      }
      if (submission.reproducibility) {
        lines.push(`**Reproducibility:** ${submission.reproducibility}`);
      }
    }
  }

  // --- Feature Request ---
  if (submission.category === 'feature') {
    if (submission.intent !== null) {
      lines.push('');
      lines.push('## Feature Request');
      if (submission.intent) {
        lines.push(`**Intent:** ${submission.intent}`);
      }
    }
  }

  // --- Context ---
  lines.push('');
  lines.push('## Context');
  lines.push(`- **Viewport:** ${submission.viewport_w ?? '?'}×${submission.viewport_h ?? '?'}`);
  lines.push(`- **User agent:** ${submission.user_agent ?? 'unknown'}`);
  if (submission.app_version) {
    lines.push(`- **App version:** ${submission.app_version}`);
  }

  // --- Consumer Context ---
  if (
    submission.consumer_context !== null &&
    typeof submission.consumer_context === 'object' &&
    Object.keys(submission.consumer_context).length > 0
  ) {
    lines.push('');
    lines.push('## Consumer Context');
    lines.push('```json');
    lines.push(JSON.stringify(submission.consumer_context, null, 2));
    lines.push('```');
  }

  // --- Recent Errors ---
  if (Array.isArray(submission.recent_errors) && submission.recent_errors.length > 0) {
    lines.push('');
    lines.push('## Recent Errors');
    lines.push('```json');
    lines.push(JSON.stringify(submission.recent_errors, null, 2));
    lines.push('```');
  }

  // --- Breadcrumbs ---
  if (Array.isArray(submission.breadcrumbs) && submission.breadcrumbs.length > 0) {
    lines.push('');
    lines.push('## Breadcrumbs');
    lines.push('```json');
    lines.push(JSON.stringify(submission.breadcrumbs, null, 2));
    lines.push('```');
  }

  // --- Attachments ---
  if (attachments.length > 0) {
    lines.push('');
    lines.push('## Attachments');
    for (const att of attachments) {
      lines.push(`- ${att.kind} | ${att.mime_type} | ${att.size_bytes} bytes`);
    }
  }

  // --- Activity ---
  if (events.length > 0) {
    lines.push('');
    lines.push('## Activity');
    for (const ev of events) {
      const transition =
        ev.from_value && ev.to_value
          ? `${ev.from_value} → ${ev.to_value}`
          : ev.to_value ?? ev.from_value ?? '';
      const comment = ev.comment ? ` | ${ev.comment}` : '';
      lines.push(`- ${ev.event_type}${transition ? ` | ${transition}` : ''}${comment}`);
    }
  }

  // --- Footer ---
  lines.push('');
  lines.push('---');
  lines.push(`*Exported from hazo_feedback admin. Ref: ${submission.ref_id}*`);

  // --- Call to action ---
  const cta: Record<string, string> = {
    bug: '> Please investigate this bug report. Check the context, errors, and breadcrumbs above to reproduce and identify the root cause.',
    feature:
      '> Please review this feature request. Consider the user intent and evaluate feasibility against the current architecture.',
    general: '> Please review this feedback and determine the appropriate next action.',
  };

  const call_to_action = cta[submission.category];
  if (call_to_action) {
    lines.push('');
    lines.push('');
    lines.push(call_to_action);
  }

  return lines.join('\n');
}
