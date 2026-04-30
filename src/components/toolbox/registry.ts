import type { AppSettings } from '../../types'

export interface ToolboxTool {
  id: string
  titleKey: string         // i18n key, e.g. 'toolbox.tools.screenshot.title'
  descKey: string          // i18n key, e.g. 'toolbox.tools.screenshot.desc'
  icon: string             // emoji/unicode rendered on the card
  isEnabled: (s: AppSettings) => boolean
}

export const TOOLBOX_TOOLS: ToolboxTool[] = [
  {
    id: 'screenshot',
    titleKey: 'toolbox.tools.screenshot.title',
    descKey: 'toolbox.tools.screenshot.desc',
    icon: '📷',
    isEnabled: (s) => s.toolbox.screenshotEnabled,
  },
]
