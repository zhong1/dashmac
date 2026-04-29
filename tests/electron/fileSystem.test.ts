import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { listDirectory, validateName } from '../../electron/services/fileSystem'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmac-fs-test-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('validateName', () => {
  test('rejects empty string', () => { expect(validateName('')).toBe(false) })
  test('rejects "/"', () => { expect(validateName('a/b')).toBe(false) })
  test('rejects NUL byte', () => { expect(validateName('a\0b')).toBe(false) })
  test('rejects "."', () => { expect(validateName('.')).toBe(false) })
  test('rejects ".."', () => { expect(validateName('..')).toBe(false) })
  test('accepts plain name', () => { expect(validateName('foo')).toBe(true) })
  test('accepts name with extension', () => { expect(validateName('foo.txt')).toBe(true) })
  test('accepts unicode', () => { expect(validateName('文件.txt')).toBe(true) })
})

describe('listDirectory', () => {
  test('returns entries for a directory', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello')
    fs.mkdirSync(path.join(tmp, 'sub'))
    const entries = await listDirectory(tmp)
    expect(entries.length).toBe(2)
    const file = entries.find((e) => e.name === 'a.txt')!
    expect(file.isDirectory).toBe(false)
    expect(file.size).toBe(5)
    expect(file.ext).toBe('.txt')
    expect(file.path).toBe(path.join(tmp, 'a.txt'))
    expect(typeof file.modifiedAt).toBe('number')
    const dir = entries.find((e) => e.name === 'sub')!
    expect(dir.isDirectory).toBe(true)
    expect(dir.size).toBe(0)
    expect(dir.ext).toBe('')
  })

  test('returns hidden entries (filtering is renderer-side)', async () => {
    fs.writeFileSync(path.join(tmp, '.hidden'), 'x')
    fs.writeFileSync(path.join(tmp, 'visible.txt'), 'y')
    const entries = await listDirectory(tmp)
    expect(entries.map((e) => e.name).sort()).toEqual(['.hidden', 'visible.txt'])
  })

  test('expands ~ to home directory', async () => {
    const entries = await listDirectory('~')
    // ~ should resolve to homedir; just confirm we got an array (whatever home contains)
    expect(Array.isArray(entries)).toBe(true)
  })

  test('throws ENOENT for missing path', async () => {
    await expect(listDirectory(path.join(tmp, 'nope'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('throws ENOTDIR for a file path', async () => {
    const file = path.join(tmp, 'f.txt')
    fs.writeFileSync(file, '')
    await expect(listDirectory(file)).rejects.toMatchObject({ code: 'ENOTDIR' })
  })
})
