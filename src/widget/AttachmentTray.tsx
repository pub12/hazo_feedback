'use client';
import { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Paperclip, X } from 'lucide-react';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

export interface AttachmentFile {
  id: string;
  file: File;
  kind: 'uploaded_file' | 'pasted_image' | 'screenshot';
  inlineId?: string;
}

interface AttachmentTrayProps {
  attachments: AttachmentFile[];
  onAdd: (file: File, kind: AttachmentFile['kind']) => void;
  onRemove: (id: string) => void;
  maxCount: number;
  maxBytesPerFile: number;
  translate: (key: string, vars?: Record<string, string>) => string;
}

function format_bytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function AttachmentTray({
  attachments,
  onAdd,
  onRemove,
  maxCount,
  maxBytesPerFile,
  translate,
}: AttachmentTrayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    for (const file of Array.from(files)) {
      if (attachments.length >= maxCount) {
        setError(
          translate('feedback.attachment.tooMany', { max: String(maxCount) })
        );
        return;
      }
      if (file.size > maxBytesPerFile) {
        setError(
          translate('feedback.attachment.tooLarge', {
            max: format_bytes(maxBytesPerFile),
          })
        );
        return;
      }
      onAdd(file, 'uploaded_file');
    }
  }

  const atMax = attachments.length >= maxCount;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => (
          <div
            key={att.id}
            className="flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-xs text-foreground"
          >
            <span className="max-w-[140px] truncate" title={att.file.name}>
              {att.file.name}
            </span>
            <span className="text-muted-foreground shrink-0">
              {format_bytes(att.file.size)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              aria-label={`Remove ${att.file.name}`}
              className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {!atMax && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors'
              )}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {translate('feedback.attachment.add')}
            </button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
