import { spawn } from 'child_process'
import * as path from 'path'
import { resolveDuplicateName } from './fileSystem'

export async function zipPaths(srcs: string[], destDir: string): Promise<string> {
  if (srcs.length === 0) throw new Error('No sources to zip')

  const baseName = srcs.length === 1 ? `${path.basename(srcs[0])}.zip` : 'Archive.zip'
  const finalName = await resolveDuplicateName(baseName, destDir)
  const outPath = path.join(destDir, finalName)

  return new Promise<string>((resolve, reject) => {
    const args = ['-c', '-k', '--sequesterRsrc', '--', ...srcs, outPath]
    const child = spawn('ditto', args)
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('close', (code) => {
      if (code === 0) resolve(outPath)
      else reject(new Error(`ditto exited with code ${code}: ${stderr.trim()}`))
    })
    child.on('error', reject)
  })
}
