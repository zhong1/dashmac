# Sidebar Traffic-Light Spacing Fix

**Date:** 2026-04-29
**Status:** Design approved, pending implementation

## Problem

DashMac uses `titleBarStyle: 'hiddenInset'` on macOS, which hides the title bar but keeps the three traffic-light buttons (close / minimize / maximize) at the top-left of the window. The Sidebar's top header (`<div className="p-4">` containing `<h1>DashMac</h1>`) only reserves 16 px of top padding, so the brand text visually collides with the traffic lights.

## Fix

Change `src/components/layout/Sidebar.tsx` line 26 from:

```tsx
<div className="p-4 border-b border-border-primary">
```

to:

```tsx
<div className="pt-10 px-4 pb-4 border-b border-border-primary app-drag">
```

- **`pt-10`** (40 px top padding) clears the standard 28–32 px traffic-light area so `DashMac` sits below the buttons.
- **`app-drag`** matches the existing `Header.tsx` convention and turns the brand area into a draggable window region (small UX win — currently the top-left of the sidebar isn't draggable).
- `px-4` and `pb-4` preserve the existing horizontal and bottom padding so no other layout regresses.

## Acceptance Criteria

- [ ] On macOS, `DashMac` brand text in the Sidebar is below the traffic-light buttons with no visual overlap or crowding.
- [ ] Clicking and dragging the area above/around the brand text moves the window (matches macOS app convention).
- [ ] Sidebar nav items, version label, and right-pane Header are unchanged.
- [ ] No regressions in tests or build (`npm test`, `npm run build`).

## Out of Scope

- Sidebar width change
- Moving the brand to a different location
- Changes to other pages' Header
- Restructuring the Sidebar component

## Files Touched

**Modified:**
- `src/components/layout/Sidebar.tsx` — single-line className change
