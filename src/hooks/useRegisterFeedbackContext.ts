'use client';
import { useRef, useEffect } from 'react';

// Module-scope registry — lives for the lifetime of the page
const registry = new Map<symbol, Record<string, unknown>>();
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) {
    fn();
  }
}

export function useRegisterFeedbackContext(ctx: Record<string, unknown>): void {
  // Stable per-instance key — created once on mount
  const keyRef = useRef<symbol | null>(null);
  if (keyRef.current === null) {
    keyRef.current = Symbol();
  }

  useEffect(() => {
    const key = keyRef.current!;
    registry.set(key, ctx);
    notify();

    if (process.env.NODE_ENV === 'development') {
      for (const [k, v] of Object.entries(ctx)) {
        try {
          const serialized = JSON.stringify(v);
          if (serialized && serialized.length > 1024) {
            console.warn(
              `[hazo_feedback] useRegisterFeedbackContext: value for key "${k}" is ${serialized.length} bytes (>1 KB). ` +
                'Consider trimming or redacting large context values before they are sent with feedback submissions.'
            );
          }
        } catch {
          // Non-serializable values — ignore silently in dev
        }
      }
    }

    return () => {
      registry.delete(key);
      notify();
    };
  }, [ctx]);
}

export function get_merged_context(): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const ctx of registry.values()) {
    Object.assign(merged, ctx);
  }
  return merged;
}
