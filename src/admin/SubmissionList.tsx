'use client';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { FeedbackSubmission } from '../types.js';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Chip palette — softer surface with dot accent, semantic colours
const CATEGORY_CHIP: Record<string, { dot: string; text: string }> = {
  bug:     { dot: 'bg-rose-500',    text: 'text-rose-700' },
  feature: { dot: 'bg-violet-500',  text: 'text-violet-700' },
  general: { dot: 'bg-slate-400',   text: 'text-slate-600' },
  praise:  { dot: 'bg-emerald-500', text: 'text-emerald-700' },
};

const STATUS_CHIP: Record<string, { dot: string; text: string }> = {
  new:         { dot: 'bg-amber-500',   text: 'text-amber-700' },
  triaged:     { dot: 'bg-sky-500',     text: 'text-sky-700' },
  in_progress: { dot: 'bg-indigo-500',  text: 'text-indigo-700' },
  resolved:    { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  wont_fix:    { dot: 'bg-zinc-400',    text: 'text-zinc-500' },
};

interface SubmissionListProps {
  submissions: FeedbackSubmission[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

function Chip({
  label,
  variant,
}: {
  label: string;
  variant: { dot: string; text: string };
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-gray-200',
        variant.text
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', variant.dot)} />
      {label}
    </span>
  );
}

export function SubmissionList({
  submissions,
  selectedId,
  onSelect,
  loading,
}: SubmissionListProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
        Loading…
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16 gap-2">
        <p className="text-sm font-medium text-foreground">No submissions yet</p>
        <p className="text-xs text-muted-foreground max-w-[28ch]">
          Submitted feedback will show up here. Try sending a test from the Authed
          or Anon page.
        </p>
      </div>
    );
  }

  return (
    <ol
      className="flex-1 overflow-y-auto p-2 space-y-1"
      aria-label="Feedback submissions"
    >
      {submissions.map((sub) => {
        const isSelected = sub.id === selectedId;
        const catChip = CATEGORY_CHIP[sub.category] ?? CATEGORY_CHIP.general;
        const statusChip = STATUS_CHIP[sub.status] ?? STATUS_CHIP.new;

        return (
          <li key={sub.id}>
            <button
              type="button"
              onClick={() => onSelect(sub.id)}
              className={cn(
                'group relative w-full text-left rounded-lg px-3 py-2.5 transition-all',
                'hover:bg-gray-50',
                isSelected
                  ? 'bg-violet-50/60 ring-1 ring-inset ring-violet-200'
                  : 'ring-1 ring-inset ring-transparent'
              )}
              aria-current={isSelected ? 'true' : undefined}
            >
              {/* Selection accent bar */}
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full transition-opacity',
                  isSelected ? 'bg-violet-500 opacity-100' : 'opacity-0'
                )}
              />

              {/* Top row: ref_id + time */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/80 shrink-0">
                  {sub.ref_id}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {relativeTime(sub.created_at)}
                </span>
              </div>

              {/* Subject */}
              <p
                className={cn(
                  'text-sm leading-snug truncate',
                  isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
                )}
              >
                {sub.subject ?? <span className="italic text-muted-foreground">(no subject)</span>}
              </p>

              {/* Bottom row: chips */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Chip label={sub.category} variant={catChip} />
                <Chip label={sub.status.replace('_', ' ')} variant={statusChip} />
                {sub.marked_spam && (
                  <Chip
                    label="spam"
                    variant={{ dot: 'bg-rose-500', text: 'text-rose-700' }}
                  />
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
