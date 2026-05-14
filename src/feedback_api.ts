// Module-scope ring buffer — breadcrumbs accumulate here until submitted
const MAX_BREADCRUMBS = 50;
void MAX_BREADCRUMBS; // referenced for documentation; ring-buffer enforcement is in the provider

let _addBreadcrumb:
  | ((type: string, message: string, data?: Record<string, unknown>) => void)
  | null = null;

export function _register_breadcrumb_handler(
  fn: (type: string, message: string, data?: Record<string, unknown>) => void
): void {
  _addBreadcrumb = fn;
}

export const feedback = {
  breadcrumb(type: string, message: string, data?: Record<string, unknown>): void {
    _addBreadcrumb?.(type, message, data);
  },
};
