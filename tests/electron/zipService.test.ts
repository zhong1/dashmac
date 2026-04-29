import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { zipPaths } from '../../electron/services/zipService'

const isDarwin = process.platform === 'darwin'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmac-zip-test-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe.skipIf(!isDarwin)('zipPaths (macOS only)', () => {
  test('zips a single file as <name>.zip', async () => {
    const f = path.join(tmp, 'a.txt')
    fs.writeFileSync(f, 'hello')
    const out = await zipPaths([f], tmp)
    expect(out).toBe(path.join(tmp, 'a.txt.zip'))
    expect(fs.existsSync(out)).toBe(true)
    // Verify by unzipping (requires unzip in PATH; macOS has it)
    const dest = path.join(tmp, 'unzipped'); fs.mkdirSync(dest)
    spawnSync('unzip', [out, '-d', dest])
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('hello')
  })

  test('zips multiple files as Archive.zip', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'A')
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'B')
    const out = await zipPaths(
      [path.join(tmp, 'a.txt'), path.join(tmp, 'b.txt')],
      tmp,
    )
    expect(out).toBe(path.join(tmp, 'Archive.zip'))
    expect(fs.existsSync(out)).toBe(true)
  })

  test('zips a directory recursively', async () => {
    const d = path.join(tmp, 'mydir'); fs.mkdirSync(d)
    fs.writeFileSync(path.join(d, 'inner.txt'), 'x')
    const out = await zipPaths([d], tmp)
    expect(out).toBe(path.join(tmp, 'mydir.zip'))
    const dest = path.join(tmp, 'unzipped'); fs.mkdirSync(dest)
    spawnSync('unzip', [out, '-d', dest])
    expect(fs.readFileSync(path.join(dest, 'mydir', 'inner.txt'), 'utf8')).toBe('x')
  })

  test('appends "(copy)" suffix when output name already exists', async () => {
    const f = path.join(tmp, 'a.txt')
    fs.writeFileSync(f, 'hello')
    fs.writeFileSync(path.join(tmp, 'a.txt.zip'), 'pre-existing')
    const out = await zipPaths([f], tmp)
    expect(out).toBe(path.join(tmp, 'a.txt (copy).zip'))
  })
})
