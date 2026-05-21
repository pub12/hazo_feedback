'use client';

import { useCallback, useEffect, useState } from 'react';

interface BoardItem {
  id: string;
  ref_id: string;
  subject: string | null;
  body_text_preview: string;
  category: string;
  status: string;
  created_at: string;
  vote_count: number;
  voted_by_me: boolean;
}

interface BoardResponse {
  items: BoardItem[];
  total: number;
  page: number;
  pageSize: number;
  sort: 'top' | 'new';
}

export interface PublicFeatureBoardProps {
  apiBase?: string;
  translate?: (key: string, vars?: Record<string, string>) => string;
  pageSize?: number;
  defaultSort?: 'top' | 'new';
  onSubmissionClick?: (item: BoardItem) => void;
}

const DEFAULT_T = (k: string) => k;

export function PublicFeatureBoard({
  apiBase = '/api/feedback',
  translate,
  pageSize = 20,
  defaultSort = 'top',
  onSubmissionClick,
}: PublicFeatureBoardProps) {
  const t = translate ?? DEFAULT_T;
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'top' | 'new'>(defaultSort);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBase}/public-board?page=${page}&pageSize=${pageSize}&sort=${sort}`,
        { credentials: 'include' },
      );
      if (res.status === 401) { setError(t('board.error.unauthorized')); return; }
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, [apiBase, page, pageSize, sort, t]);

  useEffect(() => { void load(); }, [load]);

  async function toggleVote(item: BoardItem) {
    setData((d) => d ? {
      ...d,
      items: d.items.map((i) =>
        i.id === item.id
          ? { ...i, voted_by_me: !i.voted_by_me, vote_count: i.vote_count + (i.voted_by_me ? -1 : 1) }
          : i,
      ),
    } : d);
    try {
      const res = await fetch(`${apiBase}/vote/${encodeURIComponent(item.id)}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setData((d) => d ? {
          ...d,
          items: d.items.map((i) =>
            i.id === item.id ? { ...i, voted_by_me: item.voted_by_me, vote_count: item.vote_count } : i,
          ),
        } : d);
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? `HTTP ${res.status}`);
      } else {
        const body = await res.json() as { voted: boolean; count: number };
        setData((d) => d ? {
          ...d,
          items: d.items.map((i) =>
            i.id === item.id ? { ...i, voted_by_me: body.voted, vote_count: body.count } : i,
          ),
        } : d);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (!data)   return <div className="p-4 text-sm text-gray-500">{t('board.loading')}</div>;

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="max-w-3xl mx-auto p-4">
      <header className="flex items-center justify-between border-b pb-3 mb-4">
        <h1 className="text-lg font-semibold">{t('board.title')}</h1>
        <div className="flex gap-1 text-sm">
          {(['top', 'new'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSort(s); setPage(1); }}
              className={`px-3 py-1 rounded ${sort === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {t(`board.sort.${s}`)}
            </button>
          ))}
        </div>
      </header>

      {data.items.length === 0 ? (
        <p className="text-sm italic text-gray-400 py-8 text-center">{t('board.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((item) => (
            <li key={item.id} className="flex gap-3 border rounded p-3 hover:bg-gray-50">
              <button
                onClick={() => toggleVote(item)}
                className={`flex flex-col items-center justify-center w-14 shrink-0 rounded ${item.voted_by_me ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
                aria-label={t('board.vote.toggle')}
              >
                <span className="text-lg leading-none">▲</span>
                <span className="text-sm font-medium">{item.vote_count}</span>
              </button>
              <div className="flex-1 min-w-0">
                <button className="text-left w-full" onClick={() => onSubmissionClick?.(item)}>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{item.ref_id} · {item.status}</div>
                  <div className="font-medium truncate">{item.subject ?? t('board.no_subject')}</div>
                  <div className="text-sm text-gray-600 line-clamp-2">{item.body_text_preview}</div>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between mt-4 text-sm">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 disabled:opacity-50">‹ {t('board.prev')}</button>
        <span className="text-gray-500">{t('board.page', { page: String(page), total: String(totalPages) })}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 disabled:opacity-50">{t('board.next')} ›</button>
      </footer>
    </div>
  );
}
