'use client';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CheckCircle2, Copy, Check } from 'lucide-react';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard.js';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

interface SuccessPanelProps {
  refId: string;
  onClose: () => void;
  translate: (key: string, vars?: Record<string, string>) => string;
}

export function SuccessPanel({ refId, onClose, translate }: SuccessPanelProps) {
  const [copyState, copy] = useCopyToClipboard();

  return (
    <div className="flex flex-col items-center gap-4 py-6 px-4 text-center">
      <CheckCircle2 className="h-12 w-12 text-green-500" aria-hidden="true" />

      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">
          {translate('feedback.success.title')}
        </p>
        <p className="text-sm text-muted-foreground">
          {translate('feedback.success.refId', { ref_id: refId })}
        </p>
      </div>

      {copyState === 'failed' ? (
        <div className="w-full space-y-2">
          <textarea
            readOnly
            value={refId}
            rows={2}
            className="w-full resize-none rounded-md border bg-muted px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Reference ID"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                const ta = (e.currentTarget.closest('.space-y-2') as HTMLElement | null)
                  ?.querySelector('textarea') as HTMLTextAreaElement | null;
                if (ta) {
                  ta.select();
                  ta.setSelectionRange(0, ta.value.length);
                }
              }}
              className="flex-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              Select all
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Copy failed — please select and copy the reference manually.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => copy(refId)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
            copyState === 'copied'
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-border bg-background hover:bg-muted text-foreground'
          )}
          aria-live="polite"
        >
          {copyState === 'copied' ? (
            <>
              <Check className="h-3.5 w-3.5" />
              {translate('feedback.success.copied')}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              {translate('feedback.success.copy')}
            </>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {translate('feedback.success.close')}
      </button>
    </div>
  );
}
