// Opaque cursor for keyset ("changes since") pagination. Encodes a timestamp
// (ms) plus a document id tiebreak so a poller resumes exactly where it left off
// with no gaps or duplicates, even when many rows share the same timestamp.

export interface Cursor { t: number, id: string }

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.t}:${c.id}`, 'utf8').toString('base64url')
}

export function decodeCursor(s: string): Cursor | null {
  let decoded: string
  try {
    decoded = Buffer.from(s, 'base64url').toString('utf8')
  }
  catch {
    return null
  }
  const idx = decoded.indexOf(':')
  if (idx < 0) return null
  const t = Number(decoded.slice(0, idx))
  const id = decoded.slice(idx + 1)
  if (!Number.isFinite(t) || !id) return null
  return { t, id }
}
