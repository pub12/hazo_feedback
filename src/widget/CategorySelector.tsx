'use client';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { FeedbackCategory } from '../types.js';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

const CATEGORIES: FeedbackCategory[] = ['bug', 'feature', 'general', 'praise'];

interface CategorySelectorProps {
  value: FeedbackCategory;
  onChange: (cat: FeedbackCategory) => void;
  translate: (key: string) => string;
}

export function CategorySelector({ value, onChange, translate }: CategorySelectorProps) {
  return (
    <div role="tablist" className="flex rounded-lg border bg-muted p-1 gap-1">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          role="tab"
          aria-selected={value === cat}
          onClick={() => onChange(cat)}
          className={cn(
            'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            value === cat
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {translate(`feedback.category.${cat}`)}
        </button>
      ))}
    </div>
  );
}
