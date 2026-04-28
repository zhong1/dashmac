export type NestedDict = { [k: string]: string | NestedDict }

export function lookup(dict: NestedDict, path: string): string | undefined {
  const parts = path.split('.')
  let cur: string | NestedDict = dict
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return undefined
    const next: string | NestedDict | undefined = (cur as NestedDict)[p]
    if (next === undefined) return undefined
    cur = next
  }
  return typeof cur === 'string' ? cur : undefined
}

export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  )
}
