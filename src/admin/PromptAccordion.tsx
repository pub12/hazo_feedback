'use client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronUp, ClipboardList, Check, Loader2, X } from 'lucide-react';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard.js';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

interface PromptAccordionProps {
  submissionId: string;
  apiBase: string;
}

export function PromptAccordion({ submissionId, apiBase }: PromptAccordionProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copyState, copy] = useCopyToClipboard();

  async function fetchPrompt() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${apiBase}/admin/${submissionId}/export-prompt`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setPrompt(text);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && prompt === null && !loading) {
      void fetchPrompt();
    }
  }

  async function handleCopy() {
    if (!prompt) return;
    await copy(prompt);
  }

  const isCopied = copyState === 'copied';
  const isCopyFailed = copyState === 'failed';
  const charCount = prompt?.length ?? null;

  return (
    <div
      className={cn(
        'shrink-0 border-t border-gray-200 bg-white',
        open && 'shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.06)]'
      )}
    >
      {/* Header — always visible */}
      <div className="flex items-center gap-3 px-6 py-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="prompt-accordion-body"
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 rounded-md"
        >
          <ChevronUp
            size={16}
            className={cn('text-gray-400 transition-transform', !open && 'rotate-180')}
          />
          <ClipboardList size={14} className="text-violet-600" />
          AI prompt
        </button>

        {charCount !== null && (
          <span className="font-mono text-[11px] text-gray-400">
            {charCount.toLocaleString()} chars
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {open && prompt && (
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition',
                isCopied
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : isCopyFailed
                    ? 'bg-rose-50 text-rose-700 ring-rose-200'
                    : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
              )}
              aria-label="Copy prompt to clipboard"
            >
              {isCopied ? (
                <>
                  <Check size={12} />
                  Copied
                </>
              ) : isCopyFailed ? (
                <>
                  <X size={12} />
                  Copy failed
                </>
              ) : (
                <>
                  <ClipboardList size={12} />
                  Copy
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Body — collapsible */}
      {open && (
        <div
          id="prompt-accordion-body"
          className="px-6 pb-4 max-h-[40vh] overflow-y-auto"
        >
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
              <Loader2 size={14} className="animate-spin" />
              Generating prompt…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
              <span>Failed to load prompt.</span>
              <button
                type="button"
                onClick={fetchPrompt}
                className="text-xs font-medium text-rose-700 hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && prompt && (
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 ring-1 ring-gray-200 p-4 text-[12px] leading-relaxed font-mono text-gray-800 max-h-[36vh] overflow-y-auto">
              {prompt}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
