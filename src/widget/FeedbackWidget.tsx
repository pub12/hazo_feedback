'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MessageSquare } from 'lucide-react';
import { useFeedbackProvider } from '../hooks/useFeedbackProvider.js';
import { FeedbackDialog } from './FeedbackDialog.js';
import { FeedbackDrawer } from './FeedbackDrawer.js';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

const MOBILE_BREAKPOINT = '(max-width: 639px)';

function useIsMobile(): boolean {
  // Default to false during SSR — desktop dialog is the safer fallback (works on all sizes)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mql);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

interface FeedbackWidgetProps {
  className?: string;
}

export function FeedbackWidget({ className }: FeedbackWidgetProps) {
  const { isOpen, setIsOpen, translate } = useFeedbackProvider();
  const isMobile = useIsMobile();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors',
          className
        )}
        aria-label={translate('feedback.trigger.label')}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">{translate('feedback.trigger.label')}</span>
      </button>

      {isMobile ? (
        <FeedbackDrawer open={isOpen} onClose={() => setIsOpen(false)} />
      ) : (
        <FeedbackDialog open={isOpen} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
