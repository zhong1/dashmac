import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { listDirectory, validateName, mkdir, createFile, rename } from '../../electron/services/fileSystem'

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

describe('mkdir', () => {
  test('creates a folder and returns its absolute path', async () => {
    const p = await mkdir(tmp, 'newfolder')
    expect(p).toBe(path.join(tmp, 'newfolder'))
    expect(fs.statSync(p).isDirectory()).toBe(true)
  })

  test('throws when target exists', async () => {
    fs.mkdirSync(path.join(tmp, 'exists'))
    await expect(mkdir(tmp, 'exists')).rejects.toMatchObject({ code: 'EEXIST' })
  })
})

describe('createFile', () => {
  test('creates an empty file', async () => {
    const p = await createFile(tmp, 'a.txt')
    expect(p).toBe(path.join(tmp, 'a.txt'))
    expect(fs.statSync(p).isFile()).toBe(true)
    expect(fs.readFileSync(p, 'utf8')).toBe('')
  })

  test('throws when target exists', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'x')
    await expect(createFile(tmp, 'a.txt')).rejects.toMatchObject({ code: 'EEXIST' })
  })
})

describe('rename', () => {
  test('renames a file in place', async () => {
    const old = path.join(tmp, 'old.txt')
    fs.writeFileSync(old, 'x')
    const p = await rename(old, 'new.txt')
    expect(p).toBe(path.join(tmp, 'new.txt'))
    expect(fs.existsSync(old)).toBe(false)
    expect(fs.existsSync(p)).toBe(true)
  })

  test('rejects invalid new name', async () => {
    const old = path.join(tmp, 'old.txt')
    fs.writeFileSync(old, 'x')
    await expect(rename(old, '')).rejects.toThrow(/invalid name/i)
    await expect(rename(old, 'a/b')).rejects.toThrow(/invalid name/i)
  })

  test('rejects when target exists', async () => {
    const a = path.join(tmp, 'a.txt'); fs.writeFileSync(a, '')
    fs.writeFileSync(path.join(tmp, 'b.txt'), '')
    await expect(rename(a, 'b.txt')).rejects.toMatchObject({ code: 'EEXIST' })
  })
})
