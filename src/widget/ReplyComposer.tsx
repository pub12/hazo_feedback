'use client';
import { useCallback, useState } from 'react';
import { FeedbackBodyEditor } from './FeedbackBodyEditor.js';
import { AttachmentTray, type AttachmentFile } from './AttachmentTray.js';

const DEFAULT_MAX_ATTACHMENTS = 10;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const FALLBACK_STRINGS: Record<string, string> = {
  'feedback.attachment.add': 'Attach file',
  'feedback.attachment.tooMany': 'Max {max} attachments',
  'feedback.attachment.tooLarge': 'File exceeds {max}',
};

function fallback_t(key: string, vars?: Record<string, string>): string {
  let s = FALLBACK_STRINGS[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  }
  return s;
}

function is_empty(html: string): boolean {
  return !html || (html.replace(/<[^>]*>/g, '').trim().length === 0 && !/<img/i.test(html));
}

export interface ReplyComposerProps {
  /** Called when Send is clicked. Throw to show an error; resolve to reset the form. */
  onSend: (bodyHtml: string, inlineBlobs: Map<string, Blob>, attachments: AttachmentFile[]) => Promise<void>;
  placeholder?: string;
  sendLabel?: string;
  sendingLabel?: string;
  maxAttachments?: number;
  maxBytesPerFile?: number;
  translate?: (key: string, vars?: Record<string, string>) => string;
}

export function ReplyComposer({
  onSend,
  placeholder = 'Write a reply…',
  sendLabel = 'Send reply',
  sendingLabel = 'Sending…',
  maxAttachments = DEFAULT_MAX_ATTACHMENTS,
  maxBytesPerFile = DEFAULT_MAX_BYTES,
  translate,
}: ReplyComposerProps) {
  const t = translate ?? fallback_t;
  const [bodyHtml, setBodyHtml] = useState('');
  const [inlineBlobs, setInlineBlobs] = useState<Map<string, Blob>>(new Map());
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddAttachment = useCallback((file: File, kind: AttachmentFile['kind']) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setAttachments((prev) => [...prev, { id, file, kind }]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleInlineBlob = useCallback((inlineId: string, blob: Blob) => {
    setInlineBlobs((prev) => new Map(prev).set(inlineId, blob));
  }, []);

  async function handleSend() {
    if (is_empty(bodyHtml)) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSend(bodyHtml, inlineBlobs, attachments);
      setBodyHtml('');
      setInlineBlobs(new Map());
      setAttachments([]);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <FeedbackBodyEditor
        value={bodyHtml}
        onChange={setBodyHtml}
        onImageAdded={handleInlineBlob}
        placeholder={placeholder}
      />
      <AttachmentTray
        attachments={attachments}
        onAdd={handleAddAttachment}
        onRemove={handleRemoveAttachment}
        maxCount={Math.max(0, maxAttachments - inlineBlobs.size)}
        maxBytesPerFile={maxBytesPerFile}
        translate={t}
      />
      {error && (
        <p role="alert" className="text-xs text-red-600">{error}</p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSend}
          disabled={submitting || is_empty(bodyHtml)}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {submitting ? sendingLabel : sendLabel}
        </button>
      </div>
    </div>
  );
}
