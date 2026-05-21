import "server-only";

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import type { SystemTemplateManifest } from "hazo_notify/template_manager";

const __dirname = dirname(fileURLToPath(import.meta.url));

const html = readFileSync(
  join(__dirname, "./email_templates/feedback_acknowledgement.html"),
  "utf-8",
);

const text = readFileSync(
  join(__dirname, "./email_templates/feedback_acknowledgement.txt"),
  "utf-8",
);

const admin_reply_html = readFileSync(
  join(__dirname, "./email_templates/feedback_admin_reply_to_user.html"),
  "utf-8",
);

const admin_reply_text = readFileSync(
  join(__dirname, "./email_templates/feedback_admin_reply_to_user.txt"),
  "utf-8",
);

const user_reply_html = readFileSync(
  join(__dirname, "./email_templates/feedback_user_reply_to_admin.html"),
  "utf-8",
);

const user_reply_text = readFileSync(
  join(__dirname, "./email_templates/feedback_user_reply_to_admin.txt"),
  "utf-8",
);

const REPLY_VARS = [
  { variable_name: "ref_id", variable_description: "Submission ref id" },
  { variable_name: "name", variable_description: "Recipient's display name" },
  { variable_name: "subject", variable_description: "Submission subject line" },
  { variable_name: "category", variable_description: "Submission category" },
  {
    variable_name: "reply_body_preview",
    variable_description: "Plain-text reply preview (<=500 chars)",
  },
  {
    variable_name: "thread_url",
    variable_description: "Absolute URL to the thread page",
  },
  {
    variable_name: "replier_name",
    variable_description: "Display name of the reply author",
  },
];

export const hazo_feedback_template_manifest: SystemTemplateManifest[] = [
  {
    template_name: "feedback_acknowledgement",
    template_label: "Feedback Acknowledgement",
    category: "Feedback",
    html,
    text,
    variables: [
      {
        variable_name: "ref_id",
        variable_description: "Reference ID for this submission",
      },
      {
        variable_name: "name",
        variable_description: "Submitter's name (defaults to 'there')",
      },
      {
        variable_name: "subject",
        variable_description: "Feedback subject line",
      },
      {
        variable_name: "category",
        variable_description: "Feedback category (bug/feature/general/praise)",
      },
      {
        variable_name: "submitted_at",
        variable_description: "Submission timestamp (ISO 8601)",
      },
    ],
  },
  {
    template_name: "feedback_admin_reply_to_user",
    template_label: "Feedback: Admin Reply",
    category: "Feedback",
    html: admin_reply_html,
    text: admin_reply_text,
    variables: REPLY_VARS,
  },
  {
    template_name: "feedback_user_reply_to_admin",
    template_label: "Feedback: User Reply",
    category: "Feedback",
    html: user_reply_html,
    text: user_reply_text,
    variables: REPLY_VARS,
  },
];
