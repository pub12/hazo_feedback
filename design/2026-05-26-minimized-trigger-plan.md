# Minimized Trigger Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `minimized` prop (default `true`) to `FeedbackWidget` so the trigger button renders as an icon-only pill by default, expanding on hover to reveal the label text via CSS animation.

**Architecture:** Single-file change to `src/widget/FeedbackWidget.tsx`. When `minimized={true}`, the text `<span>` uses Tailwind `group-hover:max-w-xs` + `group-hover:opacity-100` transitions to animate from collapsed to expanded on hover — no JS state required. When `minimized={false}`, the existing always-expanded markup is preserved.

**Tech Stack:** React 18/19, Tailwind v4, Lucide icons, TypeScript 5.

---

### Task 1: Update `FeedbackWidget.tsx` — add `minimized` prop with animated expand-on-hover

**Files:**
- Modify: `src/widget/FeedbackWidget.tsx`

This project has no jsdom/React Testing Library setup (Jest runs in node environment). Correctness is verified by TypeScript compilation + visual check in Task 2.

- [ ] **Step 1: Open the file and confirm starting state**

  Verify `src/widget/FeedbackWidget.tsx` currently has:
  - `interface FeedbackWidgetProps { className?: string }` (no `minimized` prop)
  - Button uses `gap-2 px-4 py-2`
  - Text span is `hidden sm:inline` unconditionally

- [ ] **Step 2: Replace the file with the updated implementation**

  Replace the full contents of `src/widget/FeedbackWidget.tsx` with:

  ```tsx
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
  ```

  Key changes from original:
  - `interface FeedbackWidgetProps` gains `minimized?: boolean`
  - Button: `overflow-hidden group` added; `px-4 gap-2` → `px-3` (minimized) or `px-4 gap-2` (not minimized)
  - Icon: `shrink-0` added to prevent it squishing during animation
  - Text span: when `minimized`, uses `max-w-0 opacity-0 … group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2` transition; `hidden sm:block` (not `inline`) so `max-w-0` works correctly on block-level

- [ ] **Step 3: Run TypeScript build to verify no type errors**

  ```bash
  cd /Users/pubs/Local/01.code/00.lib/hazo_feedback
  npm run build
  ```

  Expected: build completes with no TypeScript errors. If you see errors, fix them before proceeding.

- [ ] **Step 4: Commit**

  ```bash
  git add src/widget/FeedbackWidget.tsx
  git commit -m "feat: minimized trigger button with hover-expand animation

  - Add minimized prop (default true) to FeedbackWidget
  - Icon-only pill at rest; expands on hover via CSS transition
  - Set minimized={false} to restore always-expanded style
  - No behaviour change on mobile (no hover interaction)

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 2: Visual verification in test-app

**Files:**
- Read: `test-app/app/page.tsx` (or whichever page renders `FeedbackWidget`)

- [ ] **Step 1: Locate where `FeedbackWidget` is rendered in the test-app**

  ```bash
  grep -r "FeedbackWidget" /Users/pubs/Local/01.code/00.lib/hazo_feedback/test-app --include="*.tsx" -l
  ```

- [ ] **Step 2: Confirm the default (minimized) renders correctly**

  Start the test-app:
  ```bash
  cd /Users/pubs/Local/01.code/00.lib/hazo_feedback/test-app
  npm run dev
  ```
  Open `http://localhost:3030` in a browser.

  Verify:
  - At rest: button shows only the icon (small round pill, bottom-right)
  - On hover (desktop): pill smoothly expands to reveal "Send feedback" text
  - Click: feedback dialog opens as before

- [ ] **Step 3: Verify `minimized={false}` shows always-expanded style**

  Temporarily change the `FeedbackWidget` render in the test-app to `<FeedbackWidget minimized={false} />`, reload, and confirm the full "Send feedback" label is always visible.

  Revert the temporary change after verifying.

---

### Task 3: Update CHANGE_LOG and bump version

**Files:**
- Modify: `CHANGE_LOG.md`
- Modify: `package.json`

- [ ] **Step 1: Add entry to CHANGE_LOG.md**

  Add a new entry at the top of `CHANGE_LOG.md`:

  ```markdown
  ## [2.1.2] — 2026-05-26

  ### Changed
  - `FeedbackWidget` trigger button now defaults to icon-only (minimized) mode with a smooth hover-expand animation that reveals the label text. Consumers who prefer the always-expanded style should pass `minimized={false}`.
  ```

- [ ] **Step 2: Bump patch version**

  ```bash
  cd /Users/pubs/Local/01.code/00.lib/hazo_feedback
  npm version patch
  ```

  Expected: `package.json` version bumped from `2.1.1` → `2.1.2`.

- [ ] **Step 3: Commit**

  ```bash
  git add CHANGE_LOG.md package.json
  git commit -m "chore: bump version to 2.1.2

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```
