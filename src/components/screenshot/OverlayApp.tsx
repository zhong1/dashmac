import { useEffect, useReducer, useRef } from 'react'
import SelectionLayer from './SelectionLayer'
import Magnifier from './Magnifier'
import Toolbar from './Toolbar'

type Mode = 'IDLE' | 'DRAGGING' | 'CONFIRMED' | 'RESIZING' | 'MOVING'
type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface Selection { x: number; y: number; w: number; h: number }

export interface OverlayState {
  imageDataURL: string | null
  imageSize: { w: number; h: number }
  scaleFactor: number
  displayId: number | null
  mode: Mode
  selection: Selection | null
  cursor: { x: number; y: number }
  dragAnchor: { x: number; y: number } | null
  resizeHandle: HandleId | null
  moveOffset: { dx: number; dy: number } | null
}

type Action =
  | { type: 'init'; imageDataURL: string; bounds: { width: number; height: number }; scaleFactor: number; displayId: number }
  | { type: 'cursor-move'; x: number; y: number }
  | { type: 'mouse-down'; x: number; y: number; on: 'empty' | 'inside' | { handle: HandleId } }
  | { type: 'mouse-up' }
  | { type: 'cancel' }

function reducer(s: OverlayState, a: Action): OverlayState {
  switch (a.type) {
    case 'init':
      return { ...s, imageDataURL: a.imageDataURL, imageSize: { w: a.bounds.width, h: a.bounds.height }, scaleFactor: a.scaleFactor, displayId: a.displayId }
    case 'cursor-move': {
      const next: OverlayState = { ...s, cursor: { x: a.x, y: a.y } }
      if (s.mode === 'DRAGGING' && s.dragAnchor) {
        next.selection = rectFromPoints(s.dragAnchor, { x: a.x, y: a.y })
      } else if (s.mode === 'RESIZING' && s.selection && s.resizeHandle) {
        next.selection = resizeRect(s.selection, s.resizeHandle, a.x, a.y)
      } else if (s.mode === 'MOVING' && s.selection && s.moveOffset) {
        next.selection = {
          ...s.selection,
          x: a.x - s.moveOffset.dx,
          y: a.y - s.moveOffset.dy,
        }
      }
      return next
    }
    case 'mouse-down': {
      if (s.mode === 'IDLE') {
        return { ...s, mode: 'DRAGGING', dragAnchor: { x: a.x, y: a.y }, selection: { x: a.x, y: a.y, w: 0, h: 0 } }
      }
      if (s.mode === 'CONFIRMED' && s.selection) {
        if (a.on === 'inside') {
          return { ...s, mode: 'MOVING', moveOffset: { dx: a.x - s.selection.x, dy: a.y - s.selection.y } }
        }
        if (typeof a.on === 'object') {
          return { ...s, mode: 'RESIZING', resizeHandle: a.on.handle }
        }
        return { ...s, mode: 'DRAGGING', dragAnchor: { x: a.x, y: a.y }, selection: { x: a.x, y: a.y, w: 0, h: 0 } }
      }
      return s
    }
    case 'mouse-up': {
      if (s.mode === 'DRAGGING' || s.mode === 'RESIZING' || s.mode === 'MOVING') {
        const sel = s.selection ? normalizeRect(s.selection) : null
        return { ...s, mode: sel && (sel.w > 2 && sel.h > 2) ? 'CONFIRMED' : 'IDLE', selection: sel, dragAnchor: null, resizeHandle: null, moveOffset: null }
      }
      return s
    }
    case 'cancel':
      return { ...s, mode: 'IDLE', selection: null, dragAnchor: null, resizeHandle: null, moveOffset: null }
  }
}

function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Selection {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

function normalizeRect(r: Selection): Selection {
  return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) }
}

function resizeRect(r: Selection, h: HandleId, x: number, y: number): Selection {
  let ax = r.x, ay = r.y, bx = r.x + r.w, by = r.y + r.h
  switch (h) {
    case 'nw': ax = bx; ay = by; bx = x; by = y; break
    case 'ne': ax = r.x; ay = by; bx = x; by = y; break
    case 'sw': ax = bx; ay = r.y; bx = x; by = y; break
    case 'se': ax = r.x; ay = r.y; bx = x; by = y; break
    case 'n': by = y; break
    case 's': by = y; break
    case 'e': bx = x; break
    case 'w': bx = x; break
  }
  if (h === 'n' || h === 's') return { x: r.x, y: Math.min(ay, by), w: r.w, h: Math.abs(by - ay) }
  if (h === 'e' || h === 'w') return { x: Math.min(ax, bx), y: r.y, w: Math.abs(bx - ax), h: r.h }
  return rectFromPoints({ x: ax, y: ay }, { x: bx, y: by })
}

const INITIAL: OverlayState = {
  imageDataURL: null,
  imageSize: { w: 0, h: 0 },
  scaleFactor: 1,
  displayId: null,
  mode: 'IDLE',
  selection: null,
  cursor: { x: 0, y: 0 },
  dragAnchor: null,
  resizeHandle: null,
  moveOffset: null,
}

export default function OverlayApp() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubscribe = window.overlay.onInit((p) => {
      dispatch({ type: 'init', imageDataURL: p.imageDataURL, bounds: p.bounds, scaleFactor: p.scaleFactor, displayId: p.displayId })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.overlay.cancel()
      } else if (e.key === 'Enter' && state.mode === 'CONFIRMED' && state.selection && state.displayId !== null) {
        window.overlay.confirm({ action: 'copy', displayId: state.displayId, selection: state.selection })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.mode, state.selection, state.displayId])

  if (!state.imageDataURL) return null

  const onConfirmCopy = () => {
    if (!state.selection || state.displayId === null) return
    window.overlay.confirm({ action: 'copy', displayId: state.displayId, selection: state.selection })
  }

  const onCancel = () => window.overlay.cancel()

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}>
      <img
        src={state.imageDataURL}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none', userSelect: 'none' }}
        draggable={false}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
      <SelectionLayer
        state={state}
        onCursorMove={(x, y) => dispatch({ type: 'cursor-move', x, y })}
        onMouseDown={(x, y, on) => dispatch({ type: 'mouse-down', x, y, on })}
        onMouseUp={() => dispatch({ type: 'mouse-up' })}
        onDoubleClickInside={onConfirmCopy}
      />
      <Magnifier state={state} />
      {state.mode === 'CONFIRMED' && state.selection && (
        <Toolbar selection={state.selection} viewport={state.imageSize} onCopy={onConfirmCopy} onCancel={onCancel} />
      )}
    </div>
  )
}
