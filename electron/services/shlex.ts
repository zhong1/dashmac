// Minimal shell-style argument parser.
// Supports: whitespace splitting, single quotes (no escapes), double quotes (\" \\),
// backslash escape outside quotes. Throws Error('unclosed quote') on imbalance.
export function parseShellArgs(input: string): string[] {
  const out: string[] = []
  let i = 0
  const n = input.length
  let token = ''
  let inToken = false

  while (i < n) {
    const ch = input[i]

    if (!inToken && (ch === ' ' || ch === '\t' || ch === '\n')) {
      i++
      continue
    }

    if (ch === '"') {
      inToken = true
      i++
      while (i < n && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < n && (input[i + 1] === '"' || input[i + 1] === '\\')) {
          token += input[i + 1]
          i += 2
        } else {
          token += input[i]
          i++
        }
      }
      if (i >= n) throw new Error('unclosed quote')
      i++ // consume closing "
      continue
    }

    if (ch === "'") {
      inToken = true
      i++
      while (i < n && input[i] !== "'") {
        token += input[i]
        i++
      }
      if (i >= n) throw new Error('unclosed quote')
      i++ // consume closing '
      continue
    }

    if (ch === '\\' && i + 1 < n) {
      inToken = true
      token += input[i + 1]
      i += 2
      continue
    }

    if (ch === ' ' || ch === '\t' || ch === '\n') {
      out.push(token)
      token = ''
      inToken = false
      i++
      continue
    }

    inToken = true
    token += ch
    i++
  }

  if (inToken) out.push(token)
  return out
}
