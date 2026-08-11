/**
 * Credits shown on /colaboradores — people, data sources and software.
 *
 * The DATA lives in `app/data/contributors.json` and that file is the only edit
 * needed to add someone: it carries both languages inline (the `Bi` shape used
 * by `data/comparativa-alertas.ts`), so a new contributor never touches the
 * locale files. This module only puts a type over it, so a malformed entry is a
 * type error at build time rather than a broken page in production.
 *
 * Deliberately a static import: a credits page should not be able to fail at
 * runtime, and it costs ~2 KB in the bundle. No GitHub API, no avatars — see
 * docs/superpowers/specs/2026-08-10-colaboradores-design.md.
 */
import raw from '~/data/contributors.json'

/** Human-facing copy carried by the data file itself, in both locales. */
export interface Bi { es: string, en: string }

/** Labels come from i18n (`colaboradores.role.<role>`), never from the JSON. */
export type ContributorRole = 'maintainer' | 'contributor'

export interface Person {
  name: string
  /** GitHub handle, without the @. The only identity we publish — no email, no photo. */
  github: string
  role: ContributorRole
  /** `YYYY-MM` of their first commit. */
  since: string
  blurb: Bi
}

export interface DataSource {
  name: string
  url: string
  /** Set only where the licence requires attribution (e.g. geoBoundaries CC BY 4.0). */
  license?: string | undefined
  note: Bi
}

export interface SoftwareCredit {
  name: string
  url: string
  license: string
}

export interface Credits {
  people: Person[]
  dataSources: DataSource[]
  software: SoftwareCredit[]
}

export const credits = raw as Credits

/** Maintainers first, then contributors; within a group, whoever arrived first. */
export const people: Person[] = [...credits.people].sort((a, b) =>
  a.role === b.role ? a.since.localeCompare(b.since) : a.role === 'maintainer' ? -1 : 1,
)

/**
 * Pick the caller's locale out of a `Bi`, falling back to Spanish — Spanish is
 * the source of truth for copy across this site, so a half-translated entry
 * degrades to a readable page rather than an empty one.
 */
export function bi(v: Bi, locale: string): string {
  return locale.startsWith('en') ? (v.en || v.es) : v.es
}

/**
 * A stable hue per person, hashed from the GitHub handle. Two contributors get
 * different colours and the same contributor keeps theirs across deploys —
 * which is the whole job an avatar would otherwise do.
 */
export function monogramHue(handle: string): number {
  let h = 0
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

/** Up to two initials: "Nahuel Lopez" → "NL", "eduair94" → "ED". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return (words[0] ?? '?').slice(0, 2).toUpperCase()
}
