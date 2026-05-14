'use client';
import type { FeedbackEvent, FeedbackEventType } from '../../types.js';
import { Clock, MessageSquare, ArrowRight, Download } from 'lucide-react';

interface ActivityTabProps {
  events: FeedbackEvent[];
}

function EventIcon({ type }: { type: FeedbackEventType }) {
  const cls = 'h-4 w-4 shrink-0';
  switch (type) {
    case 'status_changed':
    case 'priority_changed':
      return <ArrowRight className={cls} />;
    case 'comment_added':
      return <MessageSquare className={cls} />;
    case 'exported_prompt':
      return <Download className={cls} />;
    default:
      return <Clock className={cls} />;
  }
}

function EventDescription({ event }: { event: FeedbackEvent }) {
  switch (event.event_type) {
    case 'status_changed':
      return (
        <span>
          Status:{' '}
          <span className="font-medium capitalize">{event.from_value?.replace('_', ' ')}</span>
          {' → '}
          <span className="font-medium capitalize">{event.to_value?.replace('_', ' ')}</span>
        </span>
      );
    case 'priority_changed':
      return (
        <span>
          Priority:{' '}
          <span className="font-medium capitalize">{event.from_value}</span>
          {' → '}
          <span className="font-medium capitalize">{event.to_value}</span>
        </span>
      );
    case 'comment_added':
      return (
        <span>
          Comment:{' '}
          <span className="text-gray-700">{event.comment}</span>
        </span>
      );
    case 'exported_prompt':
      return <span>AI prompt exported</span>;
    default:
      return <span className="capitalize">{event.event_type}</span>;
  }
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return ts;
  }
}

export function ActivityTab({ events }: ActivityTabProps) {
  if (events.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm italic text-gray-400">(no activity yet)</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <ol className="space-y-0 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-gray-200">
        {events.map((event) => (
          <li key={event.id} className="flex gap-3 items-start pl-1 py-3">
            {/* Icon bubble */}
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500">
              <EventIcon type={event.event_type} />
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-sm text-gray-800">
                <EventDescription event={event} />
              </p>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTimestamp(event.created_at)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
