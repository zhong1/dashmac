import { describe, expect, test } from 'vitest'
import { cssRectToNativePx, clampRectToBounds } from '../../../electron/services/screenshot/coordTransform'

describe('cssRectToNativePx', () => {
  test('1x scale: returns same numbers', () => {
    expect(cssRectToNativePx({ x: 10, y: 20, w: 100, h: 50 }, 1)).toEqual({ x: 10, y: 20, w: 100, h: 50 })
  })

  test('2x scale (retina): doubles all numbers', () => {
    expect(cssRectToNativePx({ x: 10, y: 20, w: 100, h: 50 }, 2)).toEqual({ x: 20, y: 40, w: 200, h: 100 })
  })

  test('rounds to integer pixels', () => {
    expect(cssRectToNativePx({ x: 10.4, y: 20.6, w: 100.5, h: 50.5 }, 2)).toEqual({ x: 21, y: 41, w: 201, h: 101 })
  })
})

describe('clampRectToBounds', () => {
  test('rect entirely inside bounds: unchanged', () => {
    expect(clampRectToBounds({ x: 10, y: 10, w: 50, h: 50 }, { w: 200, h: 200 })).toEqual({ x: 10, y: 10, w: 50, h: 50 })
  })

  test('rect overflows right edge: w clipped', () => {
    expect(clampRectToBounds({ x: 150, y: 10, w: 100, h: 50 }, { w: 200, h: 200 })).toEqual({ x: 150, y: 10, w: 50, h: 50 })
  })

  test('negative origin: clipped to 0,0', () => {
    expect(clampRectToBounds({ x: -10, y: -20, w: 50, h: 50 }, { w: 200, h: 200 })).toEqual({ x: 0, y: 0, w: 40, h: 30 })
  })

  test('rect entirely outside: returns 0-area rect', () => {
    expect(clampRectToBounds({ x: 300, y: 300, w: 50, h: 50 }, { w: 200, h: 200 })).toEqual({ x: 200, y: 200, w: 0, h: 0 })
  })
})
