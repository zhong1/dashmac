export type ClipOp = 'copy' | 'cut'
export type Clipboard = { paths: string[]; op: ClipOp } | null

let state: Clipboard = null

export function setClip(paths: string[], op: ClipOp): void {
  state = { paths: [...paths], op }
}

export function getClip(): Clipboard {
  return state
}

export function clearClip(): void {
  state = null
}
