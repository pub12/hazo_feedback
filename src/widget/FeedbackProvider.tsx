'use client';
import { useState, useEffect, useCallback } from 'react';
import type { FeedbackProviderProps, BreadcrumbEntry } from '../types.js';
import { FeedbackContext } from '../hooks/useFeedbackProvider.js';
import { _register_breadcrumb_handler } from '../feedback_api.js';
import { FEEDBACK_STRINGS } from '../strings.js';

export function FeedbackProvider(props: FeedbackProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [capturedErrors, setCapturedErrors] = useState<unknown[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);

  useEffect(() => {
    if (props.captureErrors === false) return;
    const prevError = window.onerror;
    const prevUnhandled = window.onunhandledrejection;
    window.onerror = (msg, src, line, col, err) => {
      setCapturedErrors(prev => [...prev.slice(-19), { msg, src, line, col, err }]);
      prevError?.(msg, src, line, col, err);
      return false;
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      setCapturedErrors(prev => [...prev.slice(-19), { reason: event.reason }]);
      prevUnhandled?.call(window, event);
    };
    window.addEventListener('unhandledrejection', rejectionHandler);
    return () => {
      window.onerror = prevError ?? null;
      window.removeEventListener('unhandledrejection', rejectionHandler);
      if (prevUnhandled) window.onunhandledrejection = prevUnhandled;
    };
  }, [props.captureErrors]);

  const addBreadcrumb = useCallback((type: string, message: string, data?: Record<string, unknown>) => {
    const entry: BreadcrumbEntry = { type, message, timestamp: Date.now(), data };
    setBreadcrumbs(prev => [...prev.slice(-49), entry]);
  }, []);

  useEffect(() => {
    _register_breadcrumb_handler(addBreadcrumb);
  }, [addBreadcrumb]);

  const translate = props.translate ?? ((key: string, vars?: Record<string, string>) => {
    let str = FEEDBACK_STRINGS[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{{${k}}}`, v); });
    }
    return str;
  });

  const contextValue = {
    appId: props.appId,
    apiBase: props.apiBase ?? '/api/feedback',
    source: props.source,
    user: props.user,
    appVersion: props.appVersion,
    captureErrors: props.captureErrors ?? true,
    maxAttachments: props.maxAttachments ?? 5,
    maxBytesPerFile: props.maxBytesPerFile ?? 10485760,
    totalMaxBytes: props.totalMaxBytes ?? 26214400,
    translate,
    redactContext: props.redactContext,
    isOpen,
    setIsOpen,
    capturedErrors,
    breadcrumbs,
    addBreadcrumb,
  };

  return (
    <FeedbackContext.Provider value={contextValue}>
      {props.children}
    </FeedbackContext.Provider>
  );
}
