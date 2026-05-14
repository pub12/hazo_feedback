'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedbackSubmission } from '../../types.js';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Globe,
  Monitor,
  User as UserIcon,
  Bug,
  Sparkles,
  CircleHelp,
  X,
} from 'lucide-react';

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(...inputs));

interface OverviewTabProps {
  submission: FeedbackSubmission;
  apiBase: string;
}

const CATEGORY_CHIP: Record<string, { dot: string; text: string }> = {
  bug:     { dot: 'bg-rose-500',    text: 'text-rose-700' },
  feature: { dot: 'bg-violet-500',  text: 'text-violet-700' },
  general: { dot: 'bg-slate-400',   text: 'text-slate-600' },
  praise:  { dot: 'bg-emerald-500', text: 'text-emerald-700' },
};

const STATUS_CHIP: Record<string, { dot: string; text: string }> = {
  new:         { dot: 'bg-amber-500',   text: 'text-amber-700' },
  triaged:     { dot: 'bg-sky-500',     text: 'text-sky-700' },
  in_progress: { dot: 'bg-indigo-500',  text: 'text-indigo-700' },
  resolved:    { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  wont_fix:    { dot: 'bg-zinc-400',    text: 'text-zinc-500' },
};

const PRIORITY_CHIP: Record<string, { dot: string; text: string }> = {
  low:    { dot: 'bg-slate-400',  text: 'text-slate-600' },
  medium: { dot: 'bg-yellow-500', text: 'text-yellow-700' },
  high:   { dot: 'bg-orange-500', text: 'text-orange-700' },
  urgent: { dot: 'bg-rose-500',   text: 'text-rose-700' },
};

function Chip({
  label,
  variant,
}: {
  label: string;
  variant: { dot: string; text: string };
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ring-gray-200',
        variant.text
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', variant.dot)} />
      {label.replace('_', ' ')}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-gray-50/60 ring-1 ring-gray-200/70 p-5">
      <header className="flex items-center gap-2 mb-4">
        <Icon size={14} className="text-gray-400" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {title}
        </h3>
      </header>
      {children}
    </section>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-1 py-1.5">
      <dt className="text-xs font-medium text-gray-500 pt-0.5">{label}</dt>
      <dd
        className={cn(
          'text-sm text-gray-900 break-words min-w-0',
          mono && 'font-mono text-xs'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function FieldBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
        {value}
      </p>
    </div>
  );
}

/**
 * Renders pre-sanitized HTML from the server.
 * body_html is sanitized server-side via sanitize/body_html.ts before storage.
 * This component must only ever receive values from FeedbackSubmission.body_html.
 */
/**
 * Renders pre-sanitized HTML from the server. body_html is sanitized server-side
 * via sanitize/body_html.ts before storage, so dangerouslySetInnerHTML is safe.
 *
 * Inline `<img>` tags are stored with src=<attachment-uuid> (a bare ID, not a
 * URL — see submit handler). At display time we rewrite those to the admin
 * attachment endpoint and render them as thumbnails that open a zoom overlay
 * on click.
 */
function SafeBodyHtml({
  html,
  apiBase,
  onImageClick,
}: {
  html: string;
  apiBase: string;
  onImageClick: (src: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const rewritten = useMemo(() => {
    if (typeof window === 'undefined') return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((node) => {
      const img = node as HTMLImageElement;

      // Rewrite bare attachment-UUID src to a real URL
      const src = img.getAttribute('src');
      if (
        img.hasAttribute('data-feedback-inline-id') &&
        src &&
        !/^https?:|^\//i.test(src)
      ) {
        img.setAttribute('src', `${apiBase}/admin/attachment/${src}`);
      }

      // Thumbnail sizing — pasted screenshots can be 1920px+ wide, so we
      // cap them and let users click to zoom. Inline styles bypass any
      // CSS-loading uncertainty around the typography plugin.
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.style.maxWidth = '360px';
      img.style.maxHeight = '240px';
      img.style.width = 'auto';
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
      img.style.cursor = 'zoom-in';
      img.style.display = 'block';
      img.style.borderRadius = '8px';
      img.setAttribute('loading', 'lazy');
    });
    return doc.body.innerHTML;
  }, [html, apiBase]);

  // Event delegation: a single click handler on the container detects any
  // <img> click and forwards the src to the zoom handler.
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        const src = (target as HTMLImageElement).getAttribute('src');
        if (src) onImageClick(src);
      }
    },
    [onImageClick]
  );

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="prose prose-sm max-w-none text-gray-800"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: rewritten }}
    />
  );
}

/**
 * Fullscreen image zoom overlay. Closes on backdrop click, Esc key, or
 * the explicit close button.
 */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-6 cursor-zoom-out"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-md ring-1 ring-white/20"
        aria-label="Close preview"
      >
        <X size={18} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-[95vw] max-h-[92vh] rounded-lg shadow-2xl ring-1 ring-white/10 cursor-default"
      />
    </div>
  );
}

export function OverviewTab({ submission, apiBase }: OverviewTabProps) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  const {
    category,
    status,
    priority,
    body_html,
    problem,
    expected_output,
    reproducibility,
    intent,
    url,
    route,
    viewport_w,
    viewport_h,
    user_agent,
    app_version,
    user_name_snapshot,
    user_email_snapshot,
  } = submission;

  const hasBugFields = problem || expected_output || reproducibility;
  const hasFeatureFields = intent;

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      {/* Chips */}
      <div className="flex flex-wrap gap-1.5">
        <Chip
          label={category}
          variant={CATEGORY_CHIP[category] ?? CATEGORY_CHIP.general}
        />
        <Chip
          label={status}
          variant={STATUS_CHIP[status] ?? STATUS_CHIP.new}
        />
        {priority && (
          <Chip
            label={priority}
            variant={PRIORITY_CHIP[priority] ?? PRIORITY_CHIP.low}
          />
        )}
      </div>

      {/* Body HTML — pre-sanitized server-side */}
      {body_html && (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <SafeBodyHtml
            html={body_html}
            apiBase={apiBase}
            onImageClick={setZoomSrc}
          />
        </div>
      )}

      {/* Structured fields — bug */}
      {hasBugFields && (
        <Section title="Bug details" icon={Bug}>
          <div className="space-y-4">
            <FieldBlock label="Problem" value={problem} />
            <FieldBlock label="Expected output" value={expected_output} />
            {reproducibility && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Reproducibility
                </p>
                <p className="text-sm text-gray-800 capitalize">{reproducibility}</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Structured fields — feature */}
      {hasFeatureFields && (
        <Section title="Feature request" icon={Sparkles}>
          <FieldBlock label="Intent / goal" value={intent} />
        </Section>
      )}

      {/* Metadata */}
      <Section title="Page context" icon={Globe}>
        <dl>
          <MetaRow
            label="URL"
            value={
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-700 hover:underline break-all"
              >
                {url}
              </a>
            }
          />
          {route && <MetaRow label="Route" value={route} mono />}
          {(viewport_w != null || viewport_h != null) && (
            <MetaRow
              label="Viewport"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Monitor size={12} className="text-gray-400" />
                  <span className="font-mono text-xs">
                    {viewport_w ?? '?'} × {viewport_h ?? '?'}
                  </span>
                </span>
              }
            />
          )}
          {user_agent && (
            <MetaRow
              label="User agent"
              value={<span className="font-mono text-[11px] text-gray-700">{user_agent}</span>}
            />
          )}
          {app_version && <MetaRow label="App version" value={app_version} mono />}
        </dl>
      </Section>

      {/* Submitter */}
      <Section title="Submitter" icon={UserIcon}>
        <dl>
          <MetaRow
            label="Name"
            value={
              user_name_snapshot ?? (
                <span className="inline-flex items-center gap-1.5 text-gray-500">
                  <CircleHelp size={12} className="text-gray-400" />
                  Anonymous
                </span>
              )
            }
          />
          {user_email_snapshot && (
            <MetaRow
              label="Email"
              value={
                <a
                  href={`mailto:${user_email_snapshot}`}
                  className="text-violet-700 hover:underline"
                >
                  {user_email_snapshot}
                </a>
              }
            />
          )}
        </dl>
      </Section>

      {zoomSrc && <ImageLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </div>
  );
}
