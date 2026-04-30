export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function cssRectToNativePx(rect: Rect, scaleFactor: number): Rect {
  return {
    x: Math.round(rect.x * scaleFactor),
    y: Math.round(rect.y * scaleFactor),
    w: Math.round(rect.w * scaleFactor),
    h: Math.round(rect.h * scaleFactor),
  }
}

export function clampRectToBounds(rect: Rect, bounds: { w: number; h: number }): Rect {
  const x0 = Math.max(0, Math.min(rect.x, bounds.w))
  const y0 = Math.max(0, Math.min(rect.y, bounds.h))
  const x1 = Math.max(0, Math.min(rect.x + rect.w, bounds.w))
  const y1 = Math.max(0, Math.min(rect.y + rect.h, bounds.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
