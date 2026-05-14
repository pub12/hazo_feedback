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
];
