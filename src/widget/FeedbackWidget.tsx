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
  // Default to false during SSR — desktop dialog is the safer fallback
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
  /**
   * When true (default), the trigger renders as an icon-only pill that
   * expands on hover to reveal the label. Set to false for the
   * always-expanded style.
   */
  minimized?: boolean;
}

export function FeedbackWidget({ className, minimized = true }: FeedbackWidgetProps) {
  const { isOpen, setIsOpen, translate } = useFeedbackProvider();
  const isMobile = useIsMobile();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-50 flex items-center rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors overflow-hidden group',
          minimized ? 'px-3' : 'px-4 gap-2',
          className
        )}
        aria-label={translate('feedback.trigger.label')}
      >
        <MessageSquare className="h-4 w-4 shrink-0" />
        {minimized ? (
          <span className="hidden sm:block max-w-0 opacity-0 whitespace-nowrap overflow-hidden transition-all duration-200 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
            {translate('feedback.trigger.label')}
          </span>
        ) : (
          <span className="hidden sm:inline">
            {translate('feedback.trigger.label')}
          </span>
        )}
      </button>

      {isMobile ? (
        <FeedbackDrawer open={isOpen} onClose={() => setIsOpen(false)} />
      ) : (
        <FeedbackDialog open={isOpen} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
