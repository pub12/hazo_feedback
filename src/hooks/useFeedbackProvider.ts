'use client';
import { createContext, useContext } from 'react';
import type { FeedbackUser } from '../types.js';
import type { BreadcrumbEntry } from '../types.js';

export interface FeedbackContextValue {
  appId: string;
  apiBase: string;
  source: string | undefined;
  user: FeedbackUser | null | undefined;
  appVersion: string | undefined;
  captureErrors: boolean;
  maxAttachments: number;
  maxBytesPerFile: number;
  totalMaxBytes: number;
  translate: (key: string, vars?: Record<string, string>) => string;
  redactContext?: (ctx: Record<string, unknown>) => Record<string, unknown>;
  // Imperative state
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  // Error capture ring buffer (max 20)
  capturedErrors: unknown[];
  // Breadcrumb ring buffer (max 50)
  breadcrumbs: BreadcrumbEntry[];
  addBreadcrumb: (type: string, message: string, data?: Record<string, unknown>) => void;
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedbackProvider(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedbackProvider must be used inside FeedbackProvider');
  return ctx;
}
