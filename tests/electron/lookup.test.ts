import { describe, expect, test } from 'vitest'
import { lookup, interpolate } from '../../src/i18n/lookup'

describe('lookup', () => {
  const dict = {
    sidebar: { dashboard: 'Dashboard', memory: 'Memory' },
    settings: { sections: { menuBar: 'Menu Bar' } },
    plain: 'Plain',
  }

  test('returns top-level leaf value', () => {
    expect(lookup(dict, 'plain')).toBe('Plain')
  })

  test('returns nested leaf value via dot path', () => {
    expect(lookup(dict, 'sidebar.memory')).toBe('Memory')
  })

  test('returns deeply nested leaf value', () => {
    expect(lookup(dict, 'settings.sections.menuBar')).toBe('Menu Bar')
  })

  test('returns undefined for missing leaf', () => {
    expect(lookup(dict, 'sidebar.nope')).toBeUndefined()
  })

  test('returns undefined when traversing through missing branch', () => {
    expect(lookup(dict, 'no.such.path')).toBeUndefined()
  })

  test('returns undefined when path stops at a non-leaf', () => {
    expect(lookup(dict, 'sidebar')).toBeUndefined()
  })

  test('returns undefined when descending into a string', () => {
    expect(lookup(dict, 'plain.foo')).toBeUndefined()
  })
})

describe('interpolate', () => {
  test('replaces a single named placeholder', () => {
    expect(interpolate('Hello {name}', { name: 'world' })).toBe('Hello world')
  })

  test('replaces multiple placeholders', () => {
    expect(interpolate('{a} and {b}', { a: 'X', b: 'Y' })).toBe('X and Y')
  })

  test('stringifies number values', () => {
    expect(interpolate('{n} items', { n: 3 })).toBe('3 items')
  })

  test('leaves unmatched placeholders intact', () => {
    expect(interpolate('Hello {name}', { other: 'x' })).toBe('Hello {name}')
  })

  test('returns template unchanged when vars argument is undefined', () => {
    expect(interpolate('Hello {name}')).toBe('Hello {name}')
  })

  test('handles a template with no placeholders', () => {
    expect(interpolate('plain', { x: 'y' })).toBe('plain')
  })
})
