import { useTranslation } from '../../i18n/index'

interface Props {
  selection: { x: number; y: number; w: number; h: number }
  viewport: { w: number; h: number }
  onCopy: () => void
  onCancel: () => void
}

const TOOLBAR_HEIGHT = 32
const TOOLBAR_WIDTH_ESTIMATE = 180
const GAP = 8

export default function Toolbar({ selection, viewport, onCopy, onCancel }: Props) {
  const { t } = useTranslation()

  const belowY = selection.y + selection.h + GAP
  const aboveY = selection.y - TOOLBAR_HEIGHT - GAP
  const insideY = selection.y + selection.h - TOOLBAR_HEIGHT - GAP

  let top: number
  if (belowY + TOOLBAR_HEIGHT <= viewport.h) top = belowY
  else if (aboveY >= 0) top = aboveY
  else top = insideY

  const centerX = selection.x + selection.w / 2
  const left = Math.max(GAP, Math.min(centerX - TOOLBAR_WIDTH_ESTIMATE / 2, viewport.w - TOOLBAR_WIDTH_ESTIMATE - GAP))

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        height: TOOLBAR_HEIGHT,
        background: 'rgba(20, 20, 20, 0.95)',
        border: '1px solid rgba(64, 153, 255, 0.6)',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        gap: 4,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: 'white',
        zIndex: 1001,
      }}
    >
      <button
        onClick={onCopy}
        style={{
          background: 'rgb(31, 111, 235)', color: 'white', border: 'none', borderRadius: 3,
          padding: '4px 12px', cursor: 'pointer', fontSize: 12,
        }}
      >
        {t('screenshot.toolbar.copy')}
      </button>
      <button
        onClick={onCancel}
        style={{
          background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3,
          padding: '4px 12px', cursor: 'pointer', fontSize: 12,
        }}
      >
        {t('screenshot.toolbar.cancel')}
      </button>
    </div>
  )
}
