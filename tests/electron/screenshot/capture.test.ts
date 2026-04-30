import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: vi.fn(),
  },
  screen: {
    getAllDisplays: vi.fn(),
  },
}))

import { desktopCapturer, screen } from 'electron'
import { takeScreenshots } from '../../../electron/services/screenshot/capture'

const fakeNativeImage = { __nativeImage: true, isEmpty: () => false } as any

describe('takeScreenshots', () => {
  beforeEach(() => {
    vi.mocked(desktopCapturer.getSources).mockReset()
    vi.mocked(screen.getAllDisplays).mockReset()
  })

  test('single display: returns one source matched by display_id', async () => {
    vi.mocked(screen.getAllDisplays).mockReturnValue([
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 2 } as any,
    ])
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([
      { id: 'screen:1:0', display_id: '1', name: 'Screen 1', thumbnail: fakeNativeImage } as any,
    ])

    const result = await takeScreenshots()
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      displayId: 1,
      image: fakeNativeImage,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 2,
    })
    expect(desktopCapturer.getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 3840, height: 2160 },
    })
  })

  test('multi display: matches each by display_id', async () => {
    vi.mocked(screen.getAllDisplays).mockReturnValue([
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 } as any,
      { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, scaleFactor: 1 } as any,
    ])
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([
      { id: 'screen:1:0', display_id: '1', thumbnail: fakeNativeImage } as any,
      { id: 'screen:2:0', display_id: '2', thumbnail: fakeNativeImage } as any,
    ])

    const result = await takeScreenshots()
    expect(result).toHaveLength(2)
    expect(result[0].displayId).toBe(1)
    expect(result[1].displayId).toBe(2)
  })

  test('display_id not found in sources: falls back to first source', async () => {
    vi.mocked(screen.getAllDisplays).mockReturnValue([
      { id: 99, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 } as any,
    ])
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([
      { id: 'screen:0:0', display_id: '1', thumbnail: fakeNativeImage } as any,
    ])

    const result = await takeScreenshots()
    expect(result).toHaveLength(1)
    expect(result[0].image).toBe(fakeNativeImage)
  })
})
