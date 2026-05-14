'use client';
import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  HazoUiDialogRoot,
  HazoUiDialogContent,
  HazoUiDialogHeader,
  HazoUiDialogTitle,
  HazoUiDialogDescription,
} from 'hazo_ui';
import type { FeedbackCategory } from '../types.js';
import { CategorySelector } from './CategorySelector.js';
import { FeedbackBodyEditor } from './FeedbackBodyEditor.js';
import { AttachmentTray } from './AttachmentTray.js';
import type { AttachmentFile } from './AttachmentTray.js';
import { PrivacyDisclosure } from './PrivacyDisclosure.js';
import { SuccessPanel } from './SuccessPanel.js';
import { useFeedbackProvider } from '../hooks/useFeedbackProvider.js';
import { get_merged_context } from '../hooks/useRegisterFeedbackContext.js';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const {
    apiBase,
    appId,
    appVersion,
    source,
    capturedErrors,
    breadcrumbs,
    translate,
    maxAttachments,
    maxBytesPerFile,
    redactContext,
  } = useFeedbackProvider();

  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [problem, setProblem] = useState('');
  const [intent, setIntent] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [reproducibility, setReproducibility] = useState<'always' | 'sometimes' | 'once' | ''>('');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [inlineBlobs, setInlineBlobs] = useState<Map<string, Blob>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ refId: string } | null>(null);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setCategory('general');
      setSubject('');
      setBodyHtml('');
      setProblem('');
      setIntent('');
      setExpectedOutput('');
      setReproducibility('');
      setAttachments([]);
      setInlineBlobs(new Map());
      setSubmitting(false);
      setError(null);
      setSuccess(null);
    }
  }, [open]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append('app_id', appId);
      fd.append('category', category);
      if (source) fd.append('source', source);
      if (subject) fd.append('subject', subject);
      if (bodyHtml) fd.append('body_html', bodyHtml);
      if (category === 'bug') {
        if (problem) fd.append('problem', problem);
        if (expectedOutput) fd.append('expected_output', expectedOutput);
        if (reproducibility) fd.append('reproducibility', reproducibility);
      }
      if (category === 'feature' && intent) fd.append('intent', intent);

      // Consumer context — apply redactContext if provided
      let ctx = get_merged_context();
      if (redactContext) ctx = redactContext(ctx);
      fd.append('consumer_context', JSON.stringify(ctx));
      fd.append('url', window.location.href);
      fd.append('route', window.location.pathname);
      fd.append('viewport_w', String(window.innerWidth));
      fd.append('viewport_h', String(window.innerHeight));
      fd.append('user_agent', navigator.userAgent);
      if (appVersion) fd.append('app_version', appVersion);
      if (capturedErrors.length) fd.append('recent_errors', JSON.stringify(capturedErrors.slice(-20)));
      if (breadcrumbs.length) fd.append('breadcrumbs', JSON.stringify(breadcrumbs));

      // Attachments — serialize as blob + metadata
      attachments.forEach((att, i) => {
        fd.append(`attachment_${i}`, att.file, att.file.name);
        fd.append(`attachment_${i}_kind`, att.kind);
        if (att.inlineId) fd.append(`attachment_${i}_inline_id`, att.inlineId);
      });

      // Inline blobs from editor
      const inlineBlobEntries = Array.from(inlineBlobs.entries());
      inlineBlobEntries.forEach(([inlineId, blob], blobIdx) => {
        const file = new File([blob], `inline-${inlineId}`, { type: blob.type });
        const idx = attachments.length + blobIdx;
        fd.append(`attachment_${idx}`, file, file.name);
        fd.append(`attachment_${idx}_kind`, 'pasted_image');
        fd.append(`attachment_${idx}_inline_id`, inlineId);
      });

      const res = await fetch(`${apiBase}/submit`, { method: 'POST', body: fd });
      if (res.status === 429) {
        setError(translate('feedback.error.rateLimit'));
        return;
      }
      if (!res.ok) {
        setError(translate('feedback.error.submit'));
        return;
      }
      const { refId } = await res.json() as { refId: string };
      setSuccess({ refId });
    } catch {
      setError(translate('feedback.error.submit'));
    } finally {
      setSubmitting(false);
    }
  }

  const totalAttachmentCount = attachments.length + inlineBlobs.size;
  const remainingAttachments = Math.max(0, maxAttachments - totalAttachmentCount);

  return (
    <HazoUiDialogRoot open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <HazoUiDialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <HazoUiDialogHeader>
          <HazoUiDialogTitle>
            {translate('feedback.dialog.title')}
          </HazoUiDialogTitle>
          <HazoUiDialogDescription className="sr-only">
            {translate('feedback.dialog.description')}
          </HazoUiDialogDescription>
        </HazoUiDialogHeader>

        {success ? (
          <SuccessPanel
            refId={success.refId}
            onClose={onClose}
            translate={translate}
          />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <CategorySelector
              value={category}
              onChange={(cat) => { setCategory(cat); setError(null); }}
              translate={translate}
            />

            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={translate('feedback.field.subject.placeholder')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                {translate('feedback.field.body.label')}
              </label>
              <FeedbackBodyEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                onImageAdded={handleInlineBlob}
                placeholder={translate('feedback.field.body.placeholder')}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {translate('feedback.field.body.hint')}
              </p>
            </div>

            {category === 'bug' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    {translate('feedback.field.problem.label')}
                  </label>
                  <textarea
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    {translate('feedback.field.expected.label')}
                  </label>
                  <textarea
                    value={expectedOutput}
                    onChange={(e) => setExpectedOutput(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    {translate('feedback.field.reproducibility.label')}
                  </label>
                  <select
                    value={reproducibility}
                    onChange={(e) =>
                      setReproducibility(e.target.value as 'always' | 'sometimes' | 'once' | '')
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">—</option>
                    <option value="always">
                      {translate('feedback.field.reproducibility.always')}
                    </option>
                    <option value="sometimes">
                      {translate('feedback.field.reproducibility.sometimes')}
                    </option>
                    <option value="once">
                      {translate('feedback.field.reproducibility.once')}
                    </option>
                  </select>
                </div>
              </div>
            )}

            {category === 'feature' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {translate('feedback.field.intent.label')}
                </label>
                <textarea
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>
            )}

            <AttachmentTray
              attachments={attachments}
              onAdd={handleAddAttachment}
              onRemove={handleRemoveAttachment}
              maxCount={remainingAttachments + attachments.length}
              maxBytesPerFile={maxBytesPerFile}
              translate={translate}
            />

            <PrivacyDisclosure translate={translate} />

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                {translate('feedback.dialog.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors',
                  'disabled:pointer-events-none disabled:opacity-50'
                )}
              >
                {submitting
                  ? translate('feedback.dialog.submitting')
                  : translate('feedback.dialog.submit')}
              </button>
            </div>
          </form>
        )}
      </HazoUiDialogContent>
    </HazoUiDialogRoot>
  );
}
