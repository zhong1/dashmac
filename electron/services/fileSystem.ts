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
