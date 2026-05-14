'use client';
import { useState } from 'react';
import type { FeedbackAttachment } from '../../types.js';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Download, Loader2 } from 'lucide-react';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

interface AttachmentsTabProps {
  attachments: FeedbackAttachment[];
  apiBase: string;
  submissionId: string;
  LightboxComponent?: React.ComponentType<{ src: string; alt?: string; onClose: () => void }>;
  onZipDownload: () => void;
  zipping: boolean;
}

const KIND_STYLES: Record<string, string> = {
  screenshot: 'bg-blue-100 text-blue-800',
  pasted_image: 'bg-purple-100 text-purple-800',
  uploaded_file: 'bg-gray-100 text-gray-700',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function AttachmentRow({
  attachment,
  apiBase,
  LightboxComponent,
}: {
  attachment: FeedbackAttachment;
  apiBase: string;
  LightboxComponent?: AttachmentsTabProps['LightboxComponent'];
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = attachment.mime_type.startsWith('image/');
  const src = `${apiBase}/admin/attachment/${attachment.id}`;

  const kindStyle = KIND_STYLES[attachment.kind] ?? 'bg-gray-100 text-gray-700';

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
            kindStyle,
          )}
        >
          {attachment.kind.replace('_', ' ')}
        </span>
        <span className="text-xs text-gray-500">{attachment.mime_type}</span>
        <span className="ml-auto text-xs text-gray-400">{formatBytes(attachment.size_bytes)}</span>
      </div>

      {/* Thumbnail */}
      {isImage && (
        <div>
          <button
            type="button"
            className="block rounded overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
            onClick={() => {
              if (LightboxComponent) {
                setLightboxOpen(true);
              } else {
                window.open(src, '_blank', 'noopener,noreferrer');
              }
            }}
            aria-label="View attachment"
          >
            <img
              src={src}
              alt={`Attachment ${attachment.id}`}
              className="max-h-48 max-w-full object-contain"
              loading="lazy"
            />
          </button>

          {lightboxOpen && LightboxComponent && (
            <LightboxComponent
              src={src}
              alt={`Attachment ${attachment.id}`}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </div>
      )}

      {/* Download link for non-images */}
      {!isImage && (
        <a
          href={src}
          download
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Download file
        </a>
      )}
    </li>
  );
}

export function AttachmentsTab({
  attachments,
  apiBase,
  submissionId: _submissionId,
  LightboxComponent,
  onZipDownload,
  zipping,
}: AttachmentsTabProps) {
  if (attachments.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm italic text-gray-400">(no attachments)</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Download all */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onZipDownload}
          disabled={zipping}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium',
            'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {zipping ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {zipping ? 'Preparing zip...' : 'Download all as zip'}
        </button>
      </div>

      {/* Attachment list */}
      <ul className="space-y-3">
        {attachments.map((attachment) => (
          <AttachmentRow
            key={attachment.id}
            attachment={attachment}
            apiBase={apiBase}
            LightboxComponent={LightboxComponent}
          />
        ))}
      </ul>
    </div>
  );
}
