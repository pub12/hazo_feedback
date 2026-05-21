'use client';

import { useEffect, useState } from 'react';

interface VoterRow {
  id: string;
  user_id: string;
  created_at: string;
}

interface VotersResponse {
  items: VoterRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface VotersTabProps {
  submissionId: string;
  apiBase: string;
}

export function VotersTab({ submissionId, apiBase }: VotersTabProps) {
  const [data, setData] = useState<VotersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/admin/${submissionId}/voters?page=${page}&pageSize=50`, { credentials: 'include' });
        if (!res.ok) { if (!cancelled) setError(`HTTP ${res.status}`); return; }
        const j = await res.json() as VotersResponse;
        if (!cancelled) setData(j);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [apiBase, submissionId, page]);

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (!data)   return <div className="p-4 text-sm text-gray-500">Loading…</div>;

  if (data.items.length === 0) {
    return <div className="p-4"><p className="text-sm italic text-gray-400">No votes yet.</p></div>;
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="p-4">
      <p className="text-sm text-gray-600 mb-2">{data.total} voter{data.total === 1 ? '' : 's'}</p>
      <ul className="space-y-1">
        {data.items.map((v) => (
          <li key={v.id} className="text-sm flex items-center justify-between border-b py-1">
            <span className="font-mono text-xs">{v.user_id}</span>
            <span className="text-gray-400 text-xs">{new Date(v.created_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between items-center mt-3 text-sm">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 disabled:opacity-50">‹</button>
        <span className="text-gray-500">Page {page} of {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 disabled:opacity-50">›</button>
      </div>
    </div>
  );
}
