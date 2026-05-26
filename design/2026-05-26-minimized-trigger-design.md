# Minimized Trigger Button — Design Spec
_Date: 2026-05-26_

## Summary

Change the default state of the `FeedbackWidget` floating trigger button from always-expanded (icon + text) to icon-only, expanding on hover to reveal the label. Expose a `minimized` prop so consumers can override the default.

---

## Behaviour

| State | `minimized={true}` (default) | `minimized={false}` |
|---|---|---|
| Rest | Icon-only pill | Icon + text pill (current behaviour) |
| Hover | Expands — icon + text appear | No change |
| Click | Opens dialog/drawer | Opens dialog/drawer |
| Mobile (< 640px) | Icon-only pill; hover expand is a no-op on touch | Text already hidden via `hidden sm:inline` |

On mobile the prop value has no visible effect — both modes render the same icon-only pill because there is no hover interaction on touch devices.

---

## API Change

```tsx
// FeedbackWidget.tsx
interface FeedbackWidgetProps {
  className?: string;
  minimized?: boolean;  // NEW — default: true
}
```

### Usage examples

```tsx
// New default — minimized, expands on hover
<FeedbackWidget />

// Explicit opt-in to minimized
<FeedbackWidget minimized={true} />

// Legacy / always-expanded behaviour
<FeedbackWidget minimized={false} />
```

---

## Animation Technique

**CSS-only via Tailwind `group` + `max-width`/`opacity` transitions.**

- The button element gets the `group` class
- The text `<span>` starts at `max-w-0 opacity-0 overflow-hidden` (collapsed)
- On hover: `group-hover:max-w-xs group-hover:opacity-100` (expanded)
- `transition-all duration-200 ease-in-out` on the span for smooth animation
- No JavaScript hover state; no layout reflow (animating `max-width`, not `width`)

Collapsed (rest):
```
[ 💬 ]
```

Expanded (hover):
```
[ 💬  Send feedback ]
```

---

## Files Changed

| File | Change |
|---|---|
| `src/widget/FeedbackWidget.tsx` | Add `minimized` prop (default `true`); apply conditional CSS classes |

No other files need to change. The prop is purely presentational and self-contained.

---

## Backward Compatibility

Existing consumers who render `<FeedbackWidget />` will see the new minimized-by-default behaviour after upgrading. Consumers who prefer the old always-expanded style must add `minimized={false}`. This is a **minor visual breaking change** — bump as a `patch` version since no API is removed, but document clearly in `CHANGE_LOG.md`.
