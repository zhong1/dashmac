import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import type { DirEntry } from '../../src/types'

function expandTilde(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

export function validateName(name: string): boolean {
  if (name.length === 0) return false
  if (name.includes('/')) return false
  if (name.includes('\0')) return false
  if (name === '.' || name === '..') return false
  return true
}

export async function listDirectory(rawPath: string): Promise<DirEntry[]> {
  const dir = path.resolve(expandTilde(rawPath))
  const stat = await fs.stat(dir)
  if (!stat.isDirectory()) {
    const err = new Error(`Not a directory: ${dir}`) as NodeJS.ErrnoException
    err.code = 'ENOTDIR'
    throw err
  }
  const names = await fs.readdir(dir)
  const entries: DirEntry[] = []
  for (const name of names) {
    const p = path.join(dir, name)
    try {
      const s = await fs.stat(p)
      const isDir = s.isDirectory()
      entries.push({
        name,
        path: p,
        isDirectory: isDir,
        size: isDir ? 0 : s.size,
        modifiedAt: s.mtimeMs,
        ext: isDir ? '' : path.extname(name).toLowerCase(),
      })
    } catch {
      // Skip entries we can't stat (broken symlinks etc.) silently.
    }
  }
  return entries
}

export async function mkdir(parent: string, name: string): Promise<string> {
  if (!validateName(name)) throw new Error(`Invalid name: ${name}`)
  const target = path.join(path.resolve(expandTilde(parent)), name)
  await fs.mkdir(target)
  return target
}

export async function createFile(parent: string, name: string): Promise<string> {
  if (!validateName(name)) throw new Error(`Invalid name: ${name}`)
  const target = path.join(path.resolve(expandTilde(parent)), name)
  // Use 'wx' to fail if target exists
  const handle = await fs.open(target, 'wx')
  await handle.close()
  return target
}

export async function rename(oldPath: string, newName: string): Promise<string> {
  if (!validateName(newName)) throw new Error(`Invalid name: ${newName}`)
  const dir = path.dirname(oldPath)
  const target = path.join(dir, newName)
  // Manually check existence to throw EEXIST instead of clobbering
  try {
    await fs.access(target)
    const err = new Error(`Target exists: ${target}`) as NodeJS.ErrnoException
    err.code = 'EEXIST'
    throw err
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err  // re-throw EEXIST or unexpected
  }
  await fs.rename(oldPath, target)
  return target
}
