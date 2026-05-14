'use client';
import { useState } from 'react';
import type { FeedbackSubmission, BreadcrumbEntry } from '../../types.js';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

interface ContextTabProps {
  submission: FeedbackSubmission;
}

const COLLAPSED_LINE_THRESHOLD = 20;

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</p>
  );
}

function None() {
  return <p className="text-sm italic text-gray-400">(none)</p>;
}

function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const lines = text.split('\n');
  const needsCollapse = lines.length > COLLAPSED_LINE_THRESHOLD;
  const [expanded, setExpanded] = useState(!needsCollapse);

  const visible = expanded ? text : lines.slice(0, COLLAPSED_LINE_THRESHOLD).join('\n') + '\n...';

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
      <pre className="text-xs text-gray-800 p-3 overflow-x-auto whitespace-pre">{visible}</pre>
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full text-xs text-blue-600 hover:text-blue-800 py-1.5 border-t border-gray-200 bg-gray-50 text-center"
        >
          {expanded ? 'Collapse' : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

function BreadcrumbRow({ entry }: { entry: BreadcrumbEntry }) {
  const [open, setOpen] = useState(false);
  const hasData = entry.data && Object.keys(entry.data).length > 0;
  const ts = new Date(entry.timestamp).toISOString();

  return (
    <li className="border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 py-1.5 px-2">
        <span className="text-xs font-medium text-gray-500 w-20 shrink-0 truncate">{entry.type}</span>
        <span className="text-xs text-gray-700 flex-1 truncate">{entry.message}</span>
        <span className="text-xs text-gray-400 shrink-0">{ts}</span>
        {hasData && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-blue-600 hover:text-blue-800 shrink-0 ml-1"
            aria-expanded={open}
          >
            {open ? 'hide' : 'data'}
          </button>
        )}
      </div>
      {open && hasData && (
        <div className="px-2 pb-2">
          <JsonBlock value={entry.data} />
        </div>
      )}
    </li>
  );
}

export function ContextTab({ submission }: ContextTabProps) {
  const { consumer_context, consumer_context_redacted, recent_errors, breadcrumbs } = submission;

  const hasContext = consumer_context && Object.keys(consumer_context).length > 0;
  const hasRedacted = consumer_context_redacted && consumer_context_redacted.length > 0;
  const hasErrors = recent_errors && recent_errors.length > 0;
  const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;

  return (
    <div className="space-y-6 p-4">
      {/* Consumer context */}
      <div>
        <SectionHeader title="Consumer context" />
        {hasContext ? <JsonBlock value={consumer_context} /> : <None />}
        {hasRedacted && (
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">Redacted keys</p>
            <ul className="flex flex-wrap gap-1.5">
              {consumer_context_redacted.map((key) => (
                <li
                  key={key}
                  className="rounded-full bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5"
                >
                  {key}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Recent errors */}
      <div>
        <SectionHeader title="Recent errors" />
        {hasErrors ? <JsonBlock value={recent_errors} /> : <None />}
      </div>

      {/* Breadcrumbs */}
      <div>
        <SectionHeader title="Breadcrumbs" />
        {hasBreadcrumbs ? (
          <div
            className={cn(
              'rounded-md border border-gray-200 bg-white overflow-y-auto',
              breadcrumbs.length > 10 && 'max-h-80',
            )}
          >
            <ul>
              {breadcrumbs.map((entry, i) => (
                // breadcrumbs have no stable id — use index
                <BreadcrumbRow key={i} entry={entry} />
              ))}
            </ul>
          </div>
        ) : (
          <None />
        )}
      </div>
    </div>
  );
}
