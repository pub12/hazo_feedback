'use client';

import { useFeedbackProvider } from 'hazo_feedback/client';
import { MessageSquare, MousePointerClick } from 'lucide-react';

function TriggerDemo() {
  const { setIsOpen } = useFeedbackProvider();

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <MousePointerClick size={22} className="text-violet-500" />
        <h1 className="text-xl font-bold text-gray-900">Trigger Button Variants</h1>
      </div>
      <p className="text-gray-500 text-sm mb-8">
        Live demos of the{' '}
        <code className="bg-gray-100 px-1 rounded text-xs">minimized</code> prop on{' '}
        <code className="bg-gray-100 px-1 rounded text-xs">&lt;FeedbackWidget /&gt;</code>.
        Hover each button to see the animation. Click to open the feedback dialog.
      </p>

      {/* minimized={true} */}
      <section className="mb-8">
        <h2 className="font-semibold text-gray-800 mb-0.5 text-sm uppercase tracking-wide">
          minimized=&#123;true&#125; — default
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Renders as an icon-only pill at rest. On hover (desktop), the label slides in from the
          right via a <code className="bg-gray-100 px-1 rounded text-xs">max-w / opacity</code>{' '}
          CSS transition — no JS state.
        </p>
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 flex items-center justify-center">
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center rounded-full bg-primary py-2 px-3 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors overflow-hidden group"
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="hidden sm:block max-w-0 opacity-0 whitespace-nowrap overflow-hidden transition-all duration-200 ease-in-out group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2">
              Send feedback
            </span>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">↑ Hover the button to see the expand animation.</p>
      </section>

      {/* minimized={false} */}
      <section className="mb-8">
        <h2 className="font-semibold text-gray-800 mb-0.5 text-sm uppercase tracking-wide">
          minimized=&#123;false&#125;
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Always shows the full icon + label. Pass{' '}
          <code className="bg-gray-100 px-1 rounded text-xs">minimized=&#123;false&#125;</code> to
          opt out of the collapsed style and restore the pre-2.1.2 appearance.
        </p>
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 flex items-center justify-center">
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 rounded-full bg-primary py-2 px-4 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Send feedback</span>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">↑ Label is always visible — no hover required.</p>
      </section>

      {/* Usage */}
      <section className="mb-8">
        <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">Usage</h2>
        <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto">
          {`// Default — icon-only pill, expands on hover (new in v2.1.2)
<FeedbackWidget />

// Always-expanded (pre-2.1.2 style)
<FeedbackWidget minimized={false} />`}
        </pre>
      </section>

      {/* Note */}
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-sm text-violet-800">
        <strong>Note:</strong> The floating button in the bottom-right corner is the live{' '}
        <code className="bg-violet-100 px-1 rounded text-xs">&lt;FeedbackWidget /&gt;</code> from the
        root layout (minimized by default). Hover it to confirm the same animation works on the
        actual component.
      </div>
    </div>
  );
}

export default function TriggerPage() {
  return <TriggerDemo />;
}
