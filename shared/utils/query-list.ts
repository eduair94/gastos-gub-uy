/**
 * Comma-separated list params that survive values containing commas.
 *
 * Every multi-value filter travels as one comma-joined query param
 * (`?buyers=A,B`) — the form the public API documents and the dashboard writes
 * into the address bar. Uruguayan organism and article names contain commas:
 * the largest buyer in the corpus is
 * "Administración Nacional de Combustible, Alcohol y Portland". A raw comma
 * inside a value is indistinguishable from the separator, so that name split
 * into two fragments, neither of which is a real buyer, and the filter matched
 * nothing at all.
 *
 * The fix is to escape the separator inside each value before joining, and undo
 * it after splitting:
 *
 *   ['ANCAP, Alcohol y Portland'] -> 'ANCAP%2C Alcohol y Portland'
 *
 * `%` is escaped first so the transform is reversible for a value that already
 * contains the literal text `%2C`.
 *
 * The escaped form is written into URLs through one more round of percent
 * encoding (vue-router and `URLSearchParams` both turn the `%` into `%25`), so
 * the single decode that the router / Nitro performs hands us back the escaped
 * form — never a bare comma.
 *
 * Links already shared with a bare comma keep working: name filters also try
 * the unsplit value as an exact candidate (`toNameCandidates` in
 * app/server/utils/query.ts).
 */

/** Escapes the list separator inside one value. */
export function encodeQueryListItem(value: string): string {
  return value.replace(/%/g, '%25').replace(/,/g, '%2C')
}

/** Undoes `encodeQueryListItem`, in reverse order so the round-trip is exact. */
export function decodeQueryListItem(value: string): string {
  return value.replace(/%2c/gi, ',').replace(/%25/g, '%')
}

/** Joins values into the wire form of a list param. */
export function encodeQueryList(values: readonly string[]): string {
  return values.map(encodeQueryListItem).join(',')
}

/**
 * A list param, ready to paste into an `href`.
 *
 * The extra `encodeURIComponent` is what the router/Nitro will decode again, so
 * `parseQueryList` on the other side sees the escaped form.
 */
export function toQueryListParam(values: string | readonly string[]): string {
  return encodeURIComponent(encodeQueryList(typeof values === 'string' ? [values] : values))
}

/**
 * Reads a list param that may arrive as a scalar or a repeated key.
 *
 * `trim` is opt-in: the API trims (a hand-written `?buyers=A, B` should still
 * match), while the dashboard does not, so that a legacy bare-comma value
 * re-joins byte-for-byte into the name the API can fall back on.
 */
export function parseQueryList(value: unknown, trim = false): string[] {
  if (value === undefined || value === null || value === '') return []
  const arr = Array.isArray(value) ? value : [value]
  return arr
    .flatMap(x => (typeof x === 'string' ? x.split(',') : [x]))
    .map(x => (trim ? String(x).trim() : String(x)))
    .map(decodeQueryListItem)
    .filter(Boolean)
}

/**
 * Rebuilds values that an unescaped separator had split apart.
 *
 * A link written before the separator was escaped
 * (`?buyers=Administración Nacional de Combustible, Alcohol y Portland`) parses
 * into fragments that name nothing. Given the known values for that facet, any
 * run of consecutive fragments that re-joins into a known value collapses back
 * into it. Fragments are joined verbatim — the reader of a legacy param must not
 * trim them, or the name would no longer reassemble.
 *
 * The longest run wins, so a name carrying more than one comma is recovered
 * whole.
 */
export function collapseSplitValues(values: readonly string[], known: ReadonlySet<string>): string[] {
  if (values.length < 2) return [...values]
  const out: string[] = []
  for (let i = 0; i < values.length; i++) {
    let value = values[i]!
    let lastJoined = i
    for (let j = i + 1; j < values.length; j++) {
      const candidate = values.slice(i, j + 1).join(',')
      if (known.has(candidate)) {
        value = candidate
        lastJoined = j
      }
    }
    out.push(value)
    i = lastJoined
  }
  return out
}

/** The values as sent, WITHOUT splitting on the separator. */
export function rawQueryListValues(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return []
  const arr = Array.isArray(value) ? value : [value]
  return arr
    .map(x => decodeQueryListItem(String(x).trim()))
    .filter(Boolean)
}
