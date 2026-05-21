'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown } from 'lucide-react';
import type {
  FeedbackSubmission,
  FeedbackAttachment,
  FeedbackEvent,
  FeedbackStatus,
  FeedbackPriority,
} from '../types.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { ContextTab } from './tabs/ContextTab.js';
import { AttachmentsTab } from './tabs/AttachmentsTab.js';
import { ActivityTab } from './tabs/ActivityTab.js';
import { ConversationTab } from './tabs/ConversationTab.js';
import { PromptAccordion } from './PromptAccordion.js';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DetailData {
  submission: FeedbackSubmission;
  attachments: FeedbackAttachment[];
  events: FeedbackEvent[];
}

interface SubmissionDetailProps {
  submissionId: string;
  apiBase: string;
  LightboxComponent?: React.ComponentType<{
    src: string;
    alt?: string;
    onClose: () => void;
  }>;
  onUpdate?: () => void;
}

type TabKey = 'overview' | 'conversation' | 'activity' | 'context' | 'attachments';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'conversation', label: 'Conversation' },
  { key: 'context', label: 'Context' },
  { key: 'attachments', label: 'Attachments' },
  { key: 'activity', label: 'Activity' },
];

const VALID_STATUSES: FeedbackStatus[] = [
  'new',
  'triaged',
  'in_progress',
  'resolved',
  'wont_fix',
];

const VALID_PRIORITIES: FeedbackPriority[] = ['low', 'medium', 'high', 'urgent'];

const STATUS_DOT: Record<string, string> = {
  new:         'bg-amber-500',
  triaged:     'bg-sky-500',
  in_progress: 'bg-indigo-500',
  resolved:    'bg-emerald-500',
  wont_fix:    'bg-zinc-400',
};

const PRIORITY_DOT: Record<string, string> = {
  low:    'bg-slate-400',
  medium: 'bg-yellow-500',
  high:   'bg-orange-500',
  urgent: 'bg-rose-500',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SubmissionDetail({
  submissionId,
  apiBase,
  LightboxComponent,
  onUpdate,
}: SubmissionDetailProps) {
  const [data, setData] = useState<DetailData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [zipping, setZipping] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Fetch detail whenever submissionId changes
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setActiveTab('overview');

    fetch(`${apiBase}/admin/${submissionId}`)
      .then((r) => r.json())
      .then((d: DetailData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        // Data stays null — we'll show an error state
      });

    return () => { cancelled = true; };
  }, [submissionId, apiBase]);

  const refresh = () => {
    fetch(`${apiBase}/admin/${submissionId}`)
      .then((r) => r.json())
      .then((d: DetailData) => {
        setData(d);
        onUpdate?.();
      })
      .catch(() => {});
  };

  const handleStatusChange = async (status: FeedbackStatus) => {
    if (!data) return;
    setUpdating(true);
    try {
      await fetch(`${apiBase}/admin/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      refresh();
    } finally {
      setUpdating(false);
    }
  };

  const handlePriorityChange = async (priority: FeedbackPriority | '') => {
    if (!data) return;
    setUpdating(true);
    try {
      await fetch(`${apiBase}/admin/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: priority || null }),
      });
      refresh();
    } finally {
      setUpdating(false);
    }
  };

  const handleZipDownload = async () => {
    if (!data?.attachments.length) return;
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      await Promise.all(
        data.attachments.map(async (att) => {
          const res = await fetch(`${apiBase}/admin/attachment/${att.id}`);
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          const ext = att.mime_type.split('/')[1] ?? 'bin';
          zip.file(`${att.kind}-${att.id}.${ext}`, buf);
        })
      );
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.submission.ref_id}-attachments.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — zip is best-effort
    } finally {
      setZipping(false);
    }
  };

  // Loading state
  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
        Loading submission…
      </div>
    );
  }

  const { submission, attachments, events } = data;
  const refId = submission.ref_id;

  const statusDot = STATUS_DOT[submission.status] ?? 'bg-slate-400';
  const priorityDot = submission.priority ? PRIORITY_DOT[submission.priority] : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-gray-600">
              {refId}
            </span>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-gray-900 leading-snug">
              {submission.subject ?? <span className="italic text-gray-400">(no subject)</span>}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Submitted {new Date(submission.created_at).toLocaleString()}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* Status chip-select */}
            <div
              className={cn(
                'relative inline-flex items-center gap-2 rounded-lg bg-white pl-2.5 pr-7 py-1.5 text-sm font-medium text-gray-800 ring-1 ring-inset ring-gray-200 shadow-sm transition hover:bg-gray-50',
                updating && 'opacity-60 pointer-events-none'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', statusDot)} />
              <span className="capitalize">{submission.status.replace('_', ' ')}</span>
              <ChevronDown
                size={14}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <select
                value={submission.status}
                onChange={(e) => handleStatusChange(e.target.value as FeedbackStatus)}
                disabled={updating}
                aria-label="Set status"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority chip-select */}
            <div
              className={cn(
                'relative inline-flex items-center gap-2 rounded-lg bg-white pl-2.5 pr-7 py-1.5 text-sm font-medium text-gray-800 ring-1 ring-inset ring-gray-200 shadow-sm transition hover:bg-gray-50',
                updating && 'opacity-60 pointer-events-none'
              )}
            >
              {priorityDot ? (
                <span className={cn('h-2 w-2 rounded-full', priorityDot)} />
              ) : (
                <span className="h-2 w-2 rounded-full ring-1 ring-gray-300" />
              )}
              <span className="capitalize">
                {submission.priority ?? <span className="text-gray-500">No priority</span>}
              </span>
              <ChevronDown
                size={14}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <select
                value={submission.priority ?? ''}
                onChange={(e) => handlePriorityChange(e.target.value as FeedbackPriority | '')}
                disabled={updating}
                aria-label="Set priority"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              >
                <option value="">No priority</option>
                {VALID_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-gray-100 shrink-0 px-6 gap-1"
        role="tablist"
        aria-label="Submission details"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const badge =
            tab.key === 'attachments' && attachments.length > 0
              ? attachments.length
              : tab.key === 'activity' && events.length > 0
                ? events.length
                : null;

          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors -mb-px',
                isActive
                  ? 'text-violet-700 border-b-2 border-violet-600'
                  : 'text-gray-500 hover:text-gray-900 border-b-2 border-transparent'
              )}
            >
              {tab.label}
              {badge !== null && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10px] font-semibold',
                    isActive
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-gray-100 text-gray-600'
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panel — fills remaining space, scrolls internally */}
      <div className="flex-1 overflow-y-auto min-h-0" role="tabpanel">
        {activeTab === 'overview' && (
          <OverviewTab submission={submission} apiBase={apiBase} />
        )}
        {activeTab === 'conversation' && (
          <ConversationTab
            submissionId={submissionId}
            events={events}
            apiBase={apiBase}
            onPosted={refresh}
          />
        )}
        {activeTab === 'context' && (
          <ContextTab submission={submission} />
        )}
        {activeTab === 'attachments' && (
          <AttachmentsTab
            attachments={attachments}
            apiBase={apiBase}
            submissionId={submissionId}
            LightboxComponent={LightboxComponent}
            onZipDownload={handleZipDownload}
            zipping={zipping}
          />
        )}
        {activeTab === 'activity' && <ActivityTab events={events} />}
      </div>

      {/* Prompt accordion — collapsible drawer at the bottom */}
      <PromptAccordion submissionId={submissionId} apiBase={apiBase} />
    </div>
  );
}
