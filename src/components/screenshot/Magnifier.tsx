import { useEffect, useRef, useState } from 'react'
import type { OverlayState } from './OverlayApp'

const SIZE = 110
const ZOOM = 10
const SAMPLE = SIZE / ZOOM

export default function Magnifier({ state }: { state: OverlayState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pixelInfo, setPixelInfo] = useState<{ r: number; g: number; b: number } | null>(null)

  useEffect(() => {
    if (!state.imageDataURL || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      const sx = state.cursor.x * state.scaleFactor - (SAMPLE * state.scaleFactor) / 2
      const sy = state.cursor.y * state.scaleFactor - (SAMPLE * state.scaleFactor) / 2
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.drawImage(img, sx, sy, SAMPLE * state.scaleFactor, SAMPLE * state.scaleFactor, 0, 0, SIZE, SIZE)
      ctx.strokeStyle = 'rgba(64, 153, 255, 0.9)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(SIZE / 2 - ZOOM / 2, SIZE / 2)
      ctx.lineTo(SIZE / 2 + ZOOM / 2, SIZE / 2)
      ctx.moveTo(SIZE / 2, SIZE / 2 - ZOOM / 2)
      ctx.lineTo(SIZE / 2, SIZE / 2 + ZOOM / 2)
      ctx.stroke()

      const data = ctx.getImageData(SIZE / 2, SIZE / 2, 1, 1).data
      setPixelInfo({ r: data[0], g: data[1], b: data[2] })
    }
    img.src = state.imageDataURL
  }, [state.cursor.x, state.cursor.y, state.imageDataURL, state.scaleFactor])

  const popX = Math.min(state.cursor.x + 16, state.imageSize.w - SIZE - 8)
  const popY = Math.min(state.cursor.y + 16, state.imageSize.h - SIZE - 32 - 8)

  const hex = pixelInfo
    ? '#' + [pixelInfo.r, pixelInfo.g, pixelInfo.b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()
    : '#------'

  return (
    <div
      style={{
        position: 'absolute',
        left: popX,
        top: popY,
        width: SIZE,
        height: SIZE + 32,
        pointerEvents: 'none',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(64, 153, 255, 0.9)',
        color: 'white',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
        zIndex: 1000,
      }}
    >
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block' }} />
      <div style={{ padding: '4px 6px', lineHeight: '14px' }}>
        <div>{`(${state.cursor.x}, ${state.cursor.y}) ${hex}`}</div>
        {state.selection && (state.mode === 'DRAGGING' || state.mode === 'CONFIRMED') && (
          <div>{`${Math.round(state.selection.w)} × ${Math.round(state.selection.h)}`}</div>
        )}
      </div>
    </div>
  )
}
