import { beforeEach, describe, expect, test } from 'vitest'
import { setClip, getClip, clearClip } from '../../electron/services/clipboard'

beforeEach(() => { clearClip() })

describe('clipboard', () => {
  test('initial state is null', () => {
    expect(getClip()).toBeNull()
  })

  test('setClip with copy persists state', () => {
    setClip(['/a', '/b'], 'copy')
    expect(getClip()).toEqual({ paths: ['/a', '/b'], op: 'copy' })
  })

  test('setClip with cut persists state', () => {
    setClip(['/a'], 'cut')
    expect(getClip()).toEqual({ paths: ['/a'], op: 'cut' })
  })

  test('clearClip resets to null', () => {
    setClip(['/a'], 'copy')
    clearClip()
    expect(getClip()).toBeNull()
  })

  test('setClip overwrites previous state', () => {
    setClip(['/a'], 'copy')
    setClip(['/b'], 'cut')
    expect(getClip()).toEqual({ paths: ['/b'], op: 'cut' })
  })
})
