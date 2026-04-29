import { describe, expect, test } from 'vitest'
import { parseShellArgs } from '../../electron/services/shlex'

describe('parseShellArgs', () => {
  test('single bare token', () => {
    expect(parseShellArgs('bup')).toEqual(['bup'])
  })

  test('multiple tokens split on whitespace', () => {
    expect(parseShellArgs('bup --foo bar')).toEqual(['bup', '--foo', 'bar'])
  })

  test('double-quoted token preserves spaces', () => {
    expect(parseShellArgs('bup --foo "a b"')).toEqual(['bup', '--foo', 'a b'])
  })

  test('single-quoted token preserves spaces (no escapes)', () => {
    expect(parseShellArgs("bup 'a b'")).toEqual(['bup', 'a b'])
  })

  test('escaped double-quote inside double quotes', () => {
    expect(parseShellArgs('bup "a\\"b"')).toEqual(['bup', 'a"b'])
  })

  test('escaped backslash inside double quotes', () => {
    expect(parseShellArgs('bup "a\\\\b"')).toEqual(['bup', 'a\\b'])
  })

  test('backslash escape outside quotes', () => {
    expect(parseShellArgs('bup a\\ b')).toEqual(['bup', 'a b'])
  })

  test('throws on unclosed double quote', () => {
    expect(() => parseShellArgs('bup "unclosed')).toThrow('unclosed quote')
  })

  test('throws on unclosed single quote', () => {
    expect(() => parseShellArgs("bup 'unclosed")).toThrow('unclosed quote')
  })

  test('empty string returns empty array', () => {
    expect(parseShellArgs('')).toEqual([])
  })

  test('whitespace-only returns empty array', () => {
    expect(parseShellArgs('   \t  ')).toEqual([])
  })

  test('adjacent quoted segments concatenate into one token', () => {
    expect(parseShellArgs('"a""b"')).toEqual(['ab'])
  })
})
