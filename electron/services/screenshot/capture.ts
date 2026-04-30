import { desktopCapturer, screen, type NativeImage, type Rectangle } from 'electron'

export interface DisplayCapture {
  displayId: number
  image: NativeImage
  bounds: Rectangle
  scaleFactor: number
}

export async function takeScreenshots(): Promise<DisplayCapture[]> {
  const displays = screen.getAllDisplays()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: thumbnailSizeFor(displays),
  })
  return displays.map((display) => {
    const matched = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    return {
      displayId: display.id,
      image: matched.thumbnail,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
    }
  })
}

function thumbnailSizeFor(displays: Electron.Display[]): { width: number; height: number } {
  let maxW = 0
  let maxH = 0
  for (const d of displays) {
    const w = d.size.width * d.scaleFactor
    const h = d.size.height * d.scaleFactor
    if (w > maxW) maxW = w
    if (h > maxH) maxH = h
  }
  return { width: maxW, height: maxH }
}
