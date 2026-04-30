import type { OverlayState, Selection } from './OverlayApp'

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface Props {
  state: OverlayState
  onCursorMove: (x: number, y: number) => void
  onMouseDown: (x: number, y: number, on: 'empty' | 'inside' | { handle: HandleId }) => void
  onMouseUp: () => void
  onDoubleClickInside: () => void
}

const HANDLE_SIZE = 8

export default function SelectionLayer({ state, onCursorMove, onMouseDown, onMouseUp, onDoubleClickInside }: Props) {
  const sel = state.selection
  const showHandles = state.mode === 'CONFIRMED' && sel !== null

  function handleMouseDown(e: React.MouseEvent) {
    const x = e.clientX, y = e.clientY
    if (sel && pointInsideRect(x, y, sel)) {
      onMouseDown(x, y, 'inside')
    } else {
      onMouseDown(x, y, 'empty')
    }
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, cursor: state.mode === 'IDLE' ? 'crosshair' : 'default' }}
      onMouseMove={(e) => onCursorMove(e.clientX, e.clientY)}
      onMouseDown={handleMouseDown}
      onMouseUp={onMouseUp}
      onDoubleClick={(e) => {
        if (sel && pointInsideRect(e.clientX, e.clientY, sel)) onDoubleClickInside()
      }}
    >
      {sel && (
        <div
          style={{
            position: 'absolute',
            left: sel.x,
            top: sel.y,
            width: sel.w,
            height: sel.h,
            outline: '1px solid rgba(64, 153, 255, 0.9)',
            background: 'transparent',
          }}
        >
          {showHandles && (
            <>
              <Handle id="nw" pos={{ left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 }} cursor="nwse-resize" onDown={onMouseDown} />
              <Handle id="n"  pos={{ left: sel.w / 2 - HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 }} cursor="ns-resize" onDown={onMouseDown} />
              <Handle id="ne" pos={{ right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 }} cursor="nesw-resize" onDown={onMouseDown} />
              <Handle id="e"  pos={{ right: -HANDLE_SIZE / 2, top: sel.h / 2 - HANDLE_SIZE / 2 }} cursor="ew-resize" onDown={onMouseDown} />
              <Handle id="se" pos={{ right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 }} cursor="nwse-resize" onDown={onMouseDown} />
              <Handle id="s"  pos={{ left: sel.w / 2 - HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 }} cursor="ns-resize" onDown={onMouseDown} />
              <Handle id="sw" pos={{ left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 }} cursor="nesw-resize" onDown={onMouseDown} />
              <Handle id="w"  pos={{ left: -HANDLE_SIZE / 2, top: sel.h / 2 - HANDLE_SIZE / 2 }} cursor="ew-resize" onDown={onMouseDown} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Handle({ id, pos, cursor, onDown }: {
  id: HandleId
  pos: { left?: number; right?: number; top?: number; bottom?: number }
  cursor: string
  onDown: (x: number, y: number, on: { handle: HandleId }) => void
}) {
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation()
        onDown(e.clientX, e.clientY, { handle: id })
      }}
      style={{
        position: 'absolute',
        ...pos,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        background: 'white',
        border: '1px solid rgba(64, 153, 255, 0.9)',
        cursor,
      }}
    />
  )
}

function pointInsideRect(x: number, y: number, r: Selection): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}
