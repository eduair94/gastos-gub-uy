import type { IContactPoint } from '../types/database'

export interface PartyLike {
  roles?: string[]
  name?: string
  contactPoint?: IContactPoint | null
}

const s = (v?: string | null): string | undefined => {
  const t = (v ?? '').trim()
  return t.length ? t : undefined
}

/**
 * The contracting-unit contact for a release, from its OCDS parties.
 *
 * Prefers the `procuringEntity` party, falls back to `buyer`. The gov feed
 * often repeats the phone in `faxNumber` (verified: ocid ocds-yfs5dr-1357118),
 * so a fax equal to the telephone is dropped. Returns undefined unless there is
 * at least an email or a telephone to show. This is the official, state-published
 * purchasing contact — public data, shown verbatim.
 */
export function pickPartyContact(parties?: PartyLike[] | null): IContactPoint | undefined {
  if (!parties?.length) return undefined
  const has = (role: string) =>
    parties.find(p => p.roles?.includes(role) && (s(p.contactPoint?.email) || s(p.contactPoint?.telephone)))
  const party = has('procuringEntity') || has('buyer')
  const cp = party?.contactPoint
  if (!cp) return undefined

  const email = s(cp.email)
  const telephone = s(cp.telephone)
  if (!email && !telephone) return undefined
  const faxNumber = s(cp.faxNumber)
  const out: IContactPoint = {}
  const name = s(cp.name)
  if (name) out.name = name
  if (telephone) out.telephone = telephone
  if (faxNumber && faxNumber !== telephone) out.faxNumber = faxNumber
  if (email) out.email = email
  return out
}
