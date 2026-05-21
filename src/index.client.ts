// Components
export { FeedbackProvider } from './widget/FeedbackProvider.js';
export { FeedbackWidget } from './widget/FeedbackWidget.js';
export { FeedbackAdminPage } from './admin/FeedbackAdminPage.js';

// Hooks
export { useRegisterFeedbackContext } from './hooks/useRegisterFeedbackContext.js';
export { useCopyToClipboard } from './hooks/useCopyToClipboard.js';
export { useFeedbackProvider } from './hooks/useFeedbackProvider.js';
export type { FeedbackContextValue } from './hooks/useFeedbackProvider.js';

// Imperative API
export { feedback } from './feedback_api.js';

// i18n defaults
export { FEEDBACK_STRINGS } from './strings.js';

// Types
export type {
  FeedbackProviderProps,
  FeedbackUser,
  FeedbackContextEntry,
  CopyState,
  FeedbackSubmission,
  FeedbackAttachment,
  FeedbackEvent,
  FeedbackCategory,
  FeedbackStatus,
  FeedbackPriority,
} from './types.js';

export { FeedbackThread } from './widget/FeedbackThread.js';
export type { FeedbackThreadProps } from './widget/FeedbackThread.js';
