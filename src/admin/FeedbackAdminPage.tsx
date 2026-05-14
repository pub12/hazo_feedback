'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { FeedbackSubmission } from '../types.js';
import { SubmissionList } from './SubmissionList.js';
import { SubmissionDetail } from './SubmissionDetail.js';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

interface FeedbackAdminPageProps {
  appId: string;
  apiBase: string;
  LightboxComponent?: React.ComponentType<LightboxProps>;
  className?: string;
}

const STATUSES = ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function FeedbackAdminPage({
  apiBase,
  LightboxComponent,
  className,
}: FeedbackAdminPageProps) {
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${apiBase}/admin/list?${params}`);
      const data: { submissions?: FeedbackSubmission[] } = await res.json();
      setSubmissions(data.submissions ?? []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when search or status filter change
  useEffect(() => {
    void fetchSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  return (
    <div className={cn('flex h-full min-h-screen', className)}>
      {/* ------------------------------------------------------------------ */}
      {/* Left pane — submission list                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-full md:w-2/5 border-r flex flex-col overflow-hidden">
        {/* List header */}
        <div className="p-4 border-b shrink-0">
          <h1 className="text-lg font-semibold">Feedback inbox</h1>

          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2 w-full rounded-md border px-3 py-1.5 text-sm bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Search submissions"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Submission list — scrollable */}
        <SubmissionList
          submissions={submissions}
          selectedId={selected}
          onSelect={setSelected}
          loading={loading}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right pane — submission detail                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">
        {selected ? (
          <SubmissionDetail
            submissionId={selected}
            apiBase={apiBase}
            LightboxComponent={LightboxComponent}
            onUpdate={fetchSubmissions}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a submission to view details
          </div>
        )}
      </div>
    </div>
  );
}
