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

function splitExt(name: string): { base: string; ext: string } {
  const ext = path.extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  return { base, ext }
}

export async function resolveDuplicateName(name: string, dirPath: string): Promise<string> {
  const dir = path.resolve(expandTilde(dirPath))
  try { await fs.access(path.join(dir, name)) }
  catch { return name }  // ENOENT → no collision

  const { base, ext } = splitExt(name)
  const firstAttempt = `${base} (copy)${ext}`
  try { await fs.access(path.join(dir, firstAttempt)) }
  catch { return firstAttempt }

  for (let i = 2; i < 1000; i++) {
    const attempt = `${base} (copy ${i})${ext}`
    try { await fs.access(path.join(dir, attempt)) }
    catch { return attempt }
  }
  throw new Error(`Could not find available name for ${name} in ${dir}`)
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  const stat = await fs.stat(src)
  if (stat.isDirectory()) {
    await fs.mkdir(dest)
    const entries = await fs.readdir(src)
    for (const e of entries) await copyRecursive(path.join(src, e), path.join(dest, e))
  } else {
    await fs.copyFile(src, dest)
  }
}

export async function copyMany(srcs: string[], destDir: string): Promise<void> {
  const dest = path.resolve(expandTilde(destDir))
  for (const src of srcs) {
    const baseName = path.basename(src)
    const finalName = await resolveDuplicateName(baseName, dest)
    await copyRecursive(src, path.join(dest, finalName))
  }
}

export async function moveMany(srcs: string[], destDir: string): Promise<void> {
  const dest = path.resolve(expandTilde(destDir))
  for (const src of srcs) {
    const srcParent = path.dirname(src)
    if (srcParent === dest) {
      throw new Error(`Cannot move into the source folder itself: ${src}`)
    }
    // Reject if dest is inside src (would move folder into its own subtree)
    const relative = path.relative(src, dest)
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      throw new Error(`Cannot move into a subdirectory or ancestor of source: ${src}`)
    }
    const baseName = path.basename(src)
    const finalName = await resolveDuplicateName(baseName, dest)
    await fs.rename(src, path.join(dest, finalName))
  }
}
