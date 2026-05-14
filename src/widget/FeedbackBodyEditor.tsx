'use client';
import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

// ---------------------------------------------------------------------------
// Custom inline image extension that carries a data-feedback-inline-id attr.
// Paste rules are disabled here — paste is handled by the wrapper div.
// ---------------------------------------------------------------------------
const FeedbackInlineImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-feedback-inline-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-feedback-inline-id'),
        renderHTML: (attrs) =>
          attrs['data-feedback-inline-id']
            ? { 'data-feedback-inline-id': attrs['data-feedback-inline-id'] }
            : {},
      },
    };
  },
  addPasteRules() {
    return []; // Paste is handled by the wrapper div's onPaste handler
  },
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface FeedbackBodyEditorProps {
  value: string;
  onChange: (html: string) => void;
  onImageAdded: (id: string, blob: Blob) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function FeedbackBodyEditor({
  value,
  onChange,
  onImageAdded,
  placeholder,
}: FeedbackBodyEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      FeedbackInlineImage,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: placeholder ?? 'Describe the issue...',
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external value changes (e.g. form reset) without re-triggering onChange
  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  // Intercept clipboard pastes that contain image data
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return; // Let Tiptap handle non-image paste normally

    e.preventDefault();

    const blob = imageItem.getAsFile();
    if (!blob) return;

    const id = crypto.randomUUID();
    onImageAdded(id, blob);

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .setImage({
          src: evt.target?.result as string,
          'data-feedback-inline-id': id,
        } as Parameters<ReturnType<typeof editor.chain>['setImage']>[0])
        .run();
    };
    reader.readAsDataURL(blob);
  };

  return (
    <div
      className={[
        'rounded-md border min-h-[120px] max-h-[360px] overflow-y-auto max-w-none cursor-text',
        'focus-within:ring-2 focus-within:ring-ring',
        // Tiptap placeholder styling — Placeholder extension adds .is-editor-empty + data-placeholder
        '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px]',
        '[&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
        '[&_.ProseMirror_p.is-editor-empty:first-child]:before:text-muted-foreground',
        '[&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left',
        '[&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none',
        '[&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0',
        // Inline images: cap so they're visible-but-don't-blow-out the dialog
        '[&_.ProseMirror_img]:max-h-64 [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:w-auto',
        '[&_.ProseMirror_img]:rounded [&_.ProseMirror_img]:border [&_.ProseMirror_img]:my-1',
      ].join(' ')}
      onClick={() => editor?.commands.focus()}
      onPaste={handlePaste}
    >
      <EditorContent editor={editor} className="p-3" />
    </div>
  );
}
