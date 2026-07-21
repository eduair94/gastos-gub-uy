# Contacto de la unidad compradora — panel + directorio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the contracting-unit contact (name/email/phone) — already ingested in `releases.parties[].contactPoint` but dropped by the `open_calls` projection — on the llamado page, the contract/adjudicación page, and a new searchable `/contactos` directory.

**Architecture:** One pure selector (`pickPartyContact`) reused everywhere. (1) `open_calls` gains a `contact` field: the projection reads `parties` (newly added to the release fetch) and stores the selected contactPoint; a one-off backfill fills the ~985 existing docs; the detail endpoint already spreads the doc so `contact` flows through for free. (2) The contract endpoint reads the contact from the award's own parties, else the tender sibling it already queries. (3) A precomputed `procurement_contacts` collection (refreshed by a full-scan job over tenders) feeds `/api/contactos` and a directory page mirroring `/suppliers`.

**Tech Stack:** Root package: `tsx`/CommonJS jobs, Mongoose. `app/`: Nuxt 3 (ESM), Nitro server, vue-i18n (es/en), Vuetify. Shared models + pure utils in `shared/`.

## Global Constraints

- **Money:** never re-sum raw `awards.items.unit.value.amount`; this feature touches no money. Do not write `release.amount`.
- **Gov links** derive from `ocid` via `shared/utils/ocid.ts`, never from a release `id`.
- **New Mongoose models** use the guarded form `mongoose.models.X || mongoose.model('X', S)`, an explicit `{ collection }`, and add every field to **both** the interface and the Schema.
- **Indexes** exist only if `scripts/ensure-indexes.ts` builds them (`autoIndex` off). A `Schema.index()` alone does nothing.
- **Optional TS props** are `?: T | undefined` (root tsconfig `exactOptionalPropertyTypes`).
- **UI:** gold = money only; the contact panel is **neutral/celeste**, never gold. es/en via i18n, keys in **both** locale files. Read `app/DESIGN.md` before UI edits.
- **Long jobs** raise `MONGO_SOCKET_TIMEOUT_MS` **before** `connectToDatabase()`.
- **Branch/deploy:** work stays on branch `feat/llamado-contact-info`. Stage explicit paths, never `git add -A` (concurrent sessions share the tree).
- **No test runner:** "tests" are standalone `tsx` scripts under `tests/unit/` that exit non-zero on failure. Verify UI/API/jobs with `curl :3600` and DB reads.
- **Privacy:** the contact is the official state-published purchasing contact (public data on comprasestatales.gub.uy). Displayed verbatim, no enrichment. Add a one-line code comment noting this where rendered.

## Data facts (verified against the live DB)

- `releases.parties[].contactPoint` for ocid `ocds-yfs5dr-1357118` (role `procuringEntity`): `{ name:"Noelia García", telephone:"42669166 INT 151/152", faxNumber:"42669166 INT 151/152", email:"compras.sancarlos@asse.com.uy" }`. `telephone === faxNumber` (collapse).
- ~532k/2.17M releases carry a party `contactPoint.email`; in a 20k sample all are `tender` (19,796) / `tenderUpdate` (204).
- `open_calls` = 985 docs, publishDate 2023-07-31 → now (recent/open only, keyed on tender deadline). Panel shows for these; contract page covers full history.
- `buyer.id === procuringEntity.id` in 100% of the open_calls sample, never null → directory groups by `buyer.id`.
- Projection currently reads `buyer` from `release.buyer` and `procuringEntity` from `release.tender.procuringEntity` — **neither has contactPoint**; must read `parties`.

## File Structure

- Create `shared/utils/contact-point.ts` — the pure selector `pickPartyContact`.
- Create `tests/unit/test-contact-point.ts` — assertions for the selector.
- Modify `shared/types/monitor.ts` — add `contact?` to `IOpenCall`.
- Modify `shared/models/open_call.ts` — add `contact` sub-schema.
- Modify `src/jobs/open-calls/project.ts` — `parties` on `ReleaseLike`, `contact` on `OpenCallProjection`, wire selector.
- Modify `src/jobs/open-calls/sync.ts` — add `parties` to `RELEASE_FIELDS`.
- Create `src/jobs/backfill-open-call-contacts.ts` — one-off backfill of existing open_calls.
- Modify `package.json` — `backfill-open-call-contacts` + `refresh-contacts` scripts.
- Modify `app/server/api/contracts/[id].get.ts` — return `contact`.
- Create `app/components/CallContact.vue` — the shared panel.
- Modify `app/pages/llamados/[compraId].vue` — render `<CallContact>` in the aside.
- Modify `app/pages/contracts/[id].vue` — render `<CallContact>` in `.grid__side`.
- Create `shared/models/procurement_contacts.ts` — the rollup model.
- Modify `shared/models/index.ts` — barrel export.
- Create `src/jobs/refresh-contacts.ts` — the rollup job.
- Modify `scripts/ensure-indexes.ts` — `procurement_contacts` indexes.
- Create `app/server/api/contactos/index.get.ts` — directory API.
- Create `app/pages/contactos/index.vue` — directory page.
- Modify `app/layouts/default.vue` — nav entry.
- Modify `app/i18n/locales/es.json` + `en.json` — `contactPanel.*`, `contactos.*`, `seo.contactos`, `nav.contactos`.

---

### Task 1: Pure contact selector + tests

**Files:**
- Create: `shared/utils/contact-point.ts`
- Test: `tests/unit/test-contact-point.ts`

**Interfaces:**
- Consumes: `IContactPoint` from `shared/types/database.ts` (`{ name?, telephone?, faxNumber?, email? }`).
- Produces: `pickPartyContact(parties?: PartyLike[] | null): IContactPoint | undefined` and type `PartyLike = { roles?: string[]; name?: string; contactPoint?: IContactPoint | null }`. Returns a cleaned contact (procuringEntity party preferred, else buyer), `faxNumber` dropped when equal to `telephone`, empty/whitespace fields removed, and `undefined` when no usable contact exists (no email and no telephone).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test-contact-point.ts`:

```ts
import { pickPartyContact } from '../../shared/utils/contact-point'
import assert from 'node:assert'

// Real shape from ocid ocds-yfs5dr-1357118.
const sanCarlos = [{
  roles: ['procuringEntity'],
  name: 'Hospital de San Carlos',
  contactPoint: { name: 'Noelia García', telephone: '42669166 INT 151/152', faxNumber: '42669166 INT 151/152', email: 'compras.sancarlos@asse.com.uy' },
}]

const c = pickPartyContact(sanCarlos)
assert.deepStrictEqual(c, { name: 'Noelia García', telephone: '42669166 INT 151/152', email: 'compras.sancarlos@asse.com.uy' }, 'collapses fax==tel, keeps name/tel/email')

// procuringEntity preferred over buyer.
const both = [
  { roles: ['buyer'], name: 'B', contactPoint: { email: 'buyer@x.uy' } },
  { roles: ['procuringEntity'], name: 'P', contactPoint: { email: 'proc@x.uy' } },
]
assert.strictEqual(pickPartyContact(both)?.email, 'proc@x.uy', 'procuringEntity wins')

// Falls back to buyer when no procuringEntity contact.
const buyerOnly = [{ roles: ['buyer'], name: 'B', contactPoint: { telephone: '123' } }]
assert.deepStrictEqual(pickPartyContact(buyerOnly), { telephone: '123' }, 'buyer fallback, empties dropped')

// No usable contact → undefined.
assert.strictEqual(pickPartyContact([{ roles: ['supplier'], name: 'S', contactPoint: { email: 'a@b.uy' } }]), undefined, 'ignores non buyer/proc roles')
assert.strictEqual(pickPartyContact([{ roles: ['procuringEntity'], name: 'P', contactPoint: { faxNumber: '', name: '  ' } }]), undefined, 'no email/tel → undefined')
assert.strictEqual(pickPartyContact(null), undefined, 'null-safe')
assert.strictEqual(pickPartyContact([]), undefined, 'empty-safe')

console.log('OK test-contact-point')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contact-point.ts`
Expected: FAIL — `Cannot find module '../../shared/utils/contact-point'`.

- [ ] **Step 3: Write minimal implementation**

Create `shared/utils/contact-point.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contact-point.ts`
Expected: `OK test-contact-point` (exit 0).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add shared/utils/contact-point.ts tests/unit/test-contact-point.ts
git commit -m "feat(contact): pure pickPartyContact selector + tests"
```

---

### Task 2: `contact` field on the open_call model + projection

**Files:**
- Modify: `shared/types/monitor.ts` (IOpenCall, after the `procuringEntity` line ~136)
- Modify: `shared/models/open_call.ts` (schema, after the `procuringEntity` block ~76)
- Modify: `src/jobs/open-calls/project.ts` (ReleaseLike ~37-69, OpenCallProjection ~78-79, projectOpenCall ~256-294)
- Modify: `src/jobs/open-calls/sync.ts` (RELEASE_FIELDS line 47)

**Interfaces:**
- Consumes: `pickPartyContact` (Task 1), `IContactPoint`.
- Produces: `OpenCallProjection.contact?: IContactPoint`; open_call documents carry `contact` when a usable one exists.

- [ ] **Step 1: Add `contact` to the `IOpenCall` interface**

In `shared/types/monitor.ts`, add an import if `IContactPoint` isn't already imported, and add the field right after the `procuringEntity: {...}` line:

```ts
  procuringEntity: { id?: string | undefined, name?: string | undefined }
  // The contracting unit's official contact (name/email/phone), from the tender
  // release's parties[].contactPoint. Public data from comprasestatales.
  contact?: import('./database').IContactPoint | undefined
```

- [ ] **Step 2: Add the `contact` sub-schema**

In `shared/models/open_call.ts`, after the `procuringEntity: { id, name }` block:

```ts
    procuringEntity: {
      id: { type: String },
      name: { type: String },
    },
    contact: {
      name: { type: String },
      telephone: { type: String },
      faxNumber: { type: String },
      email: { type: String },
    },
```

- [ ] **Step 3: Fetch `parties` in the sync**

In `src/jobs/open-calls/sync.ts` line 47:

```ts
const RELEASE_FIELDS = "id ocid date tag buyer tender awards parties";
```

- [ ] **Step 4: Wire the selector into the projection**

In `src/jobs/open-calls/project.ts`:

(a) add `parties` to `ReleaseLike` (inside the interface, e.g. after the `buyer` field):

```ts
  parties?: Array<{ roles?: string[]; name?: string; contactPoint?: import('../../../shared/types/database').IContactPoint | null }> | null;
```

(b) add `contact` to `OpenCallProjection` (after the `procuringEntity` field ~79):

```ts
  contact?: import('../../../shared/types/database').IContactPoint;
```

(c) import the selector at the top of the file:

```ts
import { pickPartyContact } from '../../../shared/utils/contact-point'
```

(d) compute it inside `projectOpenCall`, next to the buyer/procuringEntity derivation (~256):

```ts
  const buyer = latestFirst.find(r => r.buyer)?.buyer || releases.find(r => r.buyer)?.buyer || {};
  const procuringEntity = pick(t => t.procuringEntity) || {};
  // Contact lives on parties[].contactPoint (procuringEntity/buyer role), not on
  // the denormalized buyer/procuringEntity. Gather across the group's releases.
  const contact = pickPartyContact(releases.flatMap(r => r.parties ?? []));
```

(e) emit it in the returned object, only when present (respects exactOptionalPropertyTypes), after the `procuringEntity` line (~294):

```ts
    buyer: { id: buyer.id, name: buyer.name },
    procuringEntity: { id: procuringEntity.id, name: procuringEntity.name },
    ...(contact ? { contact } : {}),
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add shared/types/monitor.ts shared/models/open_call.ts src/jobs/open-calls/project.ts src/jobs/open-calls/sync.ts
git commit -m "feat(open-calls): project parties[].contactPoint into open_call.contact"
```

---

### Task 3: Backfill the existing open_calls

**Files:**
- Create: `src/jobs/backfill-open-call-contacts.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `pickPartyContact`, `OpenCallModel`, `ReleaseModel`.
- Produces: `contact` populated on the ~985 existing open_calls; script `npm run backfill-open-call-contacts`.

- [ ] **Step 1: Write the backfill script**

Create `src/jobs/backfill-open-call-contacts.ts`:

```ts
#!/usr/bin/env tsx
/**
 * One-off: fill `contact` on open_calls that predate the projection change.
 * The hourly sync-open-calls covers new/updated calls; this covers the backlog.
 * Idempotent — re-runnable. Reads each call's source releases' parties and
 * applies the same pickPartyContact selector the projection uses.
 */
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { OpenCallModel } from '../../shared/models/open_call'
import { ReleaseModel } from '../../shared/models/release'
import { pickPartyContact } from '../../shared/utils/contact-point'

async function run(): Promise<void> {
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(5 * 60 * 1000)
  }
  await connectToDatabase()
  const calls = await OpenCallModel.find({}, { compraId: 1, ocid: 1 }).lean()
  console.log(`[backfill-contacts] ${calls.length} open_calls`)
  let set = 0
  let cleared = 0
  for (const c of calls) {
    const rels = await ReleaseModel.find({ ocid: c.ocid }, { parties: 1 }).lean()
    const contact = pickPartyContact(rels.flatMap((r: any) => r.parties ?? []))
    if (contact) {
      await OpenCallModel.updateOne({ compraId: c.compraId }, { $set: { contact } })
      set++
    } else {
      await OpenCallModel.updateOne({ compraId: c.compraId }, { $unset: { contact: '' } })
      cleared++
    }
  }
  console.log(`[backfill-contacts] done — set ${set}, cleared ${cleared}`)
}

run()
  .then(async () => { await disconnectFromDatabase(); process.exit(0) })
  .catch(async (err) => { console.error('[backfill-contacts] failed:', err); await disconnectFromDatabase().catch(() => {}); process.exit(1) })
```

- [ ] **Step 2: Register the npm script**

In `package.json` scripts, near `sync-open-calls`:

```json
    "backfill-open-call-contacts": "tsx src/jobs/backfill-open-call-contacts.ts",
```

- [ ] **Step 3: Run the backfill**

Run: `npm run backfill-open-call-contacts`
Expected: prints `... open_calls` then `done — set N, cleared M` with N ≥ 1.

- [ ] **Step 4: Verify the example call**

Run:
```bash
npx tsx -e "import('./shared/connection/database').then(async m=>{await m.connectToDatabase();const {OpenCallModel}=await import('./shared/models/open_call');const c=await OpenCallModel.findOne({compraId:'1357118'},{contact:1}).lean();console.log(JSON.stringify((c as any)?.contact));process.exit(0)})"
```
Expected: `{"name":"Noelia García","telephone":"42669166 INT 151/152","email":"compras.sancarlos@asse.com.uy"}` (no `faxNumber`).

- [ ] **Step 5: Commit**

```bash
git add src/jobs/backfill-open-call-contacts.ts package.json
git commit -m "feat(open-calls): one-off backfill of open_call.contact"
```

---

### Task 4: `CallContact.vue` + render on the llamado page

**Files:**
- Create: `app/components/CallContact.vue`
- Modify: `app/pages/llamados/[compraId].vue` (aside, line 282)
- Modify: `app/i18n/locales/es.json` + `en.json` (`contactPanel` group)

**Interfaces:**
- Consumes: a `contact?: { name?, telephone?, faxNumber?, email? }` prop. Renders nothing when absent.
- Produces: reusable `<CallContact :contact="..." :organism="..." />` (organism optional label). Auto-imported (no import needed on pages).

- [ ] **Step 1: Add i18n keys (both locales)**

In `app/i18n/locales/es.json`, add a top-level `"contactPanel"` group:

```json
  "contactPanel": {
    "title": "Contacto de la unidad compradora",
    "note": "Dato de contacto oficial publicado por el organismo en comprasestatales.gub.uy.",
    "copy": "Copiar",
    "copied": "Copiado",
    "srEmail": "Enviar correo a {v}",
    "srPhone": "Llamar al {v}"
  },
```

In `app/i18n/locales/en.json`, the same keys:

```json
  "contactPanel": {
    "title": "Contracting unit contact",
    "note": "Official contact published by the agency on comprasestatales.gub.uy.",
    "copy": "Copy",
    "copied": "Copied",
    "srEmail": "Email {v}",
    "srPhone": "Call {v}"
  },
```

- [ ] **Step 2: Create the component**

Create `app/components/CallContact.vue`:

```vue
<script setup lang="ts">
// The contracting unit's contact. Public data republished from
// comprasestatales.gub.uy — official purchasing contact, shown verbatim.
interface Contact { name?: string, telephone?: string, faxNumber?: string, email?: string }
const props = defineProps<{ contact?: Contact | null, organism?: string | null }>()
const { t } = useI18n()

const has = computed(() => {
  const c = props.contact
  return !!(c && (c.email || c.telephone || c.name))
})

// tel: needs the raw number; strip the "INT 151/152" annotation for the link
// but keep the full string on screen.
const telHref = computed(() => {
  const raw = props.contact?.telephone ?? ''
  const digits = raw.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : ''
})

const copied = ref('')
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    setTimeout(() => { if (copied.value === value) copied.value = '' }, 1500)
  } catch { /* clipboard unavailable — no-op */ }
}
</script>

<template>
  <section v-if="has" class="panel calldetail__section cc">
    <h2 class="u-eyebrow">{{ t('contactPanel.title') }}</h2>
    <ul class="cc__list">
      <li v-if="contact?.name" class="cc__row">
        <v-icon size="16" class="cc__icon">mdi-account-outline</v-icon>
        <span class="cc__val">{{ contact.name }}</span>
      </li>
      <li v-if="organism" class="cc__row">
        <v-icon size="16" class="cc__icon">mdi-office-building-outline</v-icon>
        <span class="cc__val u-truncate">{{ organism }}</span>
      </li>
      <li v-if="contact?.email" class="cc__row">
        <v-icon size="16" class="cc__icon">mdi-email-outline</v-icon>
        <a class="cc__val cc__link" :href="`mailto:${contact.email}`" :aria-label="t('contactPanel.srEmail', { v: contact.email })">{{ contact.email }}</a>
        <button type="button" class="cc__copy" :title="t('contactPanel.copy')" @click="copy(contact.email!)">
          <v-icon size="14">{{ copied === contact.email ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
        </button>
      </li>
      <li v-if="contact?.telephone" class="cc__row">
        <v-icon size="16" class="cc__icon">mdi-phone-outline</v-icon>
        <a v-if="telHref" class="cc__val cc__link" :href="telHref" :aria-label="t('contactPanel.srPhone', { v: contact.telephone })">{{ contact.telephone }}</a>
        <span v-else class="cc__val">{{ contact.telephone }}</span>
        <button type="button" class="cc__copy" :title="t('contactPanel.copy')" @click="copy(contact.telephone!)">
          <v-icon size="14">{{ copied === contact.telephone ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
        </button>
      </li>
    </ul>
    <p class="cc__note">{{ t('contactPanel.note') }}</p>
  </section>
</template>

<style scoped>
.cc__list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--rule); border-radius: var(--r-md); overflow: hidden; }
.cc__row { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--s-3); font-size: var(--t-sm); }
.cc__row + .cc__row { border-top: 1px solid var(--rule); }
.cc__icon { color: var(--celeste-deep); flex: none; }
.cc__val { min-width: 0; }
.cc__link { color: var(--celeste-deep); text-decoration: none; }
.cc__link:hover { text-decoration: underline; }
.cc__copy { margin-left: auto; flex: none; display: inline-flex; align-items: center; padding: 2px 6px; border: 1px solid var(--rule); border-radius: var(--r-sm); background: transparent; color: var(--text-muted); cursor: pointer; }
.cc__copy:hover { background: var(--surface-sunken); color: var(--text); }
.cc__note { margin: var(--s-2) 0 0; font-size: var(--t-xs); color: var(--text-muted); }
</style>
```

- [ ] **Step 3: Render on the llamado page**

In `app/pages/llamados/[compraId].vue`, insert as the first child of the `<aside class="calldetail__aside">` (before the Documentos `<section>` at line 283):

```vue
      <aside class="calldetail__aside">
        <CallContact
          :contact="(call as any).contact"
          :organism="call.buyer?.name"
        />
        <section
          v-if="call.documents?.length"
          class="panel calldetail__section"
        >
```

- [ ] **Step 4: Verify render (dev server on :3600)**

Run: `curl -s "http://localhost:3600/llamados/1357118" | grep -c "Noelia García"`
Expected: ≥ 1. Also load the page in a browser and confirm the panel shows name/email/phone with working mailto/tel + copy buttons, and no gold styling.

- [ ] **Step 5: Commit**

```bash
git add app/components/CallContact.vue "app/pages/llamados/[compraId].vue" app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "feat(llamados): contracting-unit contact panel"
```

---

### Task 5: Contact on the contract/adjudicación page

**Files:**
- Modify: `app/server/api/contracts/[id].get.ts` (`siblingTenderDescription` ~89-113, `Promise.all` ~153-157, `enhancedContract` ~186-230)
- Modify: `app/pages/contracts/[id].vue` (`.grid__side` aside, line 1729)

**Interfaces:**
- Consumes: `pickPartyContact`, the in-hand `contract.parties`, the tender sibling's `parties`.
- Produces: the contract detail response gains `contact?: IContactPoint`; the page renders `<CallContact>`.

- [ ] **Step 1: Extend the sibling lookup to also return the contact**

In `app/server/api/contracts/[id].get.ts`, add the import and replace `siblingTenderDescription` with a version returning both description and contact. Add near the other imports:

```ts
import { pickPartyContact } from '../../../../shared/utils/contact-point'
import type { IContactPoint } from '../../../../shared/types/database'
```

Replace the function (was `siblingTenderDescription`, returns `string | null`) with:

```ts
// The tender-stage sibling (same ocid) supplies both the borrowed description
// (award releases carry none) and the contracting-unit contact, which lives on
// parties[].contactPoint — award releases don't carry it. One query for both.
async function siblingTenderInfo(contract: IRelease): Promise<{ description: string | null, contact: IContactPoint | undefined }> {
  // The award release's own parties rarely carry a contact; prefer it if present.
  let contact = pickPartyContact((contract as any).parties)

  const needDescription = !contract.tender?.description?.trim()
  if (!contract.ocid) return { description: null, contact }

  const sib = await ReleaseModel.findOne(
    { ocid: contract.ocid, tag: 'tender' },
    { 'tender.description': 1, parties: 1 },
  ).maxTimeMS(3000).lean().catch(() => null) as { tender?: { description?: string }, parties?: any[] } | null

  if (!contact) contact = pickPartyContact(sib?.parties)

  let description: string | null = null
  if (needDescription) {
    if (sib?.tender?.description?.trim()) {
      description = sib.tender.description.trim()
    } else {
      const compraId = compraIdFromOcid(contract.ocid)
      if (compraId) {
        const feat = await ContractItemFeaturesModel.findOne({ compraId }, { object: 1 })
          .maxTimeMS(3000).lean().catch(() => null) as { object?: string } | null
        if (feat?.object?.trim()) description = feat.object.trim()
      }
    }
  }
  return { description, contact }
}
```

- [ ] **Step 2: Update the `Promise.all` call site**

Change (was `borrowedDescription`) at ~153-157:

```ts
    const [baselines, sibling, rateTable] = await Promise.all([
      itemBaselines(contract),
      siblingTenderInfo(contract),
      loadRateTable(),
    ])
    const borrowedDescription = sibling.description
```

(Keeping `borrowedDescription` as a local avoids touching the later `tender:` line.)

- [ ] **Step 3: Attach `contact` to the response**

In the `enhancedContract` object (~186), add after the `tender:` line:

```ts
      // Contracting-unit contact (name/email/phone), from the tender sibling's
      // parties. Public data from comprasestatales, shown verbatim.
      ...(sibling.contact ? { contact: sibling.contact } : {}),
```

- [ ] **Step 4: Typecheck the server half**

Run: `npx tsc --noEmit`
Expected: no errors (the pure imports resolve; `IContactPoint` used).

- [ ] **Step 5: Render on the contract page**

In `app/pages/contracts/[id].vue`, insert as the first child of `<aside class="grid__side">` (before the timeline `<section>` at line 1732):

```vue
        <aside class="grid__side">
          <CallContact
            :contact="(contract as any)?.contact"
            :organism="contract?.buyer?.name"
          />
          <!-- A genuine ordered sequence, so it is ordered by date — -->
```

- [ ] **Step 6: Verify (dev :3600)**

Pick an award release id for compra 1357118's ocid, or any contract whose ocid has a tender contact. Quick check via API:
```bash
curl -s "http://localhost:3600/api/contracts/llamado-1357118" | grep -o '"contact":{[^}]*}'
```
Expected: a `"contact":{...}` object with the email. Then load a `/contracts/<id>` page and confirm the panel renders in the sidebar.

- [ ] **Step 7: Commit**

```bash
git add "app/server/api/contracts/[id].get.ts" "app/pages/contracts/[id].vue"
git commit -m "feat(contracts): show contracting-unit contact from tender sibling"
```

---

### Task 6: `procurement_contacts` model

**Files:**
- Create: `shared/models/procurement_contacts.ts`
- Modify: `shared/models/index.ts` (barrel)

**Interfaces:**
- Produces: `ProcurementContactModel` + `IProcurementContact` (fields: `organismId`, `organismName`, `contactName?`, `email?`, `telephone?`, `faxNumber?`, `variants[]`, `llamadosCount`, `lastSeenAt`, `sampleReleaseId?`, `dataVersion`, `calculatedAt`).

- [ ] **Step 1: Create the model**

Create `shared/models/procurement_contacts.ts`:

```ts
import type { Model } from 'mongoose'
import { Schema } from 'mongoose'
import { mongoose } from '../connection/database'

/**
 * Precomputed directory of contracting-unit purchasing contacts, one per
 * organism (buyer.id). Built by src/jobs/refresh-contacts.ts from the
 * parties[].contactPoint on tender releases. Public data (comprasestatales).
 */
export interface IContactVariant {
  name?: string
  email?: string
  telephone?: string
}

export interface IProcurementContact {
  organismId: string
  organismName: string
  contactName?: string
  email?: string
  telephone?: string
  faxNumber?: string
  variants: IContactVariant[]
  llamadosCount: number
  lastSeenAt?: Date | null
  sampleReleaseId?: string
  dataVersion: string
  calculatedAt: Date
}

const VariantSchema = new Schema<IContactVariant>(
  {
    name: { type: String },
    email: { type: String },
    telephone: { type: String },
  },
  { _id: false }
)

const ProcurementContactSchema = new Schema<IProcurementContact>(
  {
    organismId: { type: String, required: true },
    organismName: { type: String, required: true },
    contactName: { type: String },
    email: { type: String },
    telephone: { type: String },
    faxNumber: { type: String },
    variants: { type: [VariantSchema], default: [] },
    llamadosCount: { type: Number, required: true },
    lastSeenAt: { type: Date, default: null },
    sampleReleaseId: { type: String },
    // Concatenated searchable text (organism + name + email); the $text index
    // is built in scripts/ensure-indexes.ts.
    searchText: { type: String, default: '' },
    dataVersion: { type: String, required: true },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: 'procurement_contacts' }
)

ProcurementContactSchema.index({ organismId: 1 }, { unique: true })
ProcurementContactSchema.index({ llamadosCount: -1 })
ProcurementContactSchema.index({ dataVersion: 1 })

export const ProcurementContactModel =
  (mongoose.models.ProcurementContact as Model<IProcurementContact>)
  || mongoose.model<IProcurementContact>('ProcurementContact', ProcurementContactSchema)
```

Note: `searchText` is stored (concat) but not in the interface's display fields — add it to the interface too for completeness:

```ts
  searchText?: string
```
(insert in `IProcurementContact` before `dataVersion`.)

- [ ] **Step 2: Barrel export**

In `shared/models/index.ts`, add:

```ts
export * from './procurement_contacts';
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add shared/models/procurement_contacts.ts shared/models/index.ts
git commit -m "feat(model): procurement_contacts rollup"
```

---

### Task 7: `refresh-contacts` rollup job

**Files:**
- Create: `src/jobs/refresh-contacts.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `ReleaseModel`, `ProcurementContactModel`, `compraIdFromOcid` (unused here; link uses releaseId).
- Produces: populated `procurement_contacts`; script `npm run refresh-contacts`.

- [ ] **Step 1: Write the job**

Create `src/jobs/refresh-contacts.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Full-scan rollup of contracting-unit contacts into procurement_contacts,
 * one doc per organism (buyer.id). Source: parties[].contactPoint on tender
 * releases (the feed carries no contact on awards). Public data.
 *
 * No index on parties.contactPoint — this is a COLLSCAN with allowDiskUse; run
 * on the server (167) with the raised socket timeout. Compute-then-swap by
 * dataVersion so a partial run never leaves the collection half-empty.
 */
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { ReleaseModel } from '../../shared/models/release'
import { ProcurementContactModel, type IContactVariant } from '../../shared/models/procurement_contacts'

interface Row {
  _id: string
  organismName: string
  lastSeenAt: Date | null
  sampleReleaseId: string
  llamadosCount: number
  contacts: Array<{ name?: string, email?: string, telephone?: string, faxNumber?: string, date?: Date | null }>
}

async function run(): Promise<void> {
  const started = Date.now()
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(15 * 60 * 1000)
  }
  const dataVersion = `v${Date.now()}`
  console.log('[refresh-contacts] connecting…')
  await connectToDatabase()

  console.log('[refresh-contacts] aggregating…')
  const rows = await ReleaseModel.aggregate<Row>([
    {
      $match: {
        tag: { $in: ['tender', 'tenderUpdate'] },
        'buyer.id': { $exists: true, $ne: null },
        'parties.contactPoint.email': { $exists: true, $ne: null },
      },
    },
    {
      $project: {
        ocid: 1,
        id: 1,
        date: 1,
        buyerId: '$buyer.id',
        buyerName: '$buyer.name',
        party: {
          $first: {
            $filter: {
              input: { $ifNull: ['$parties', []] },
              as: 'p',
              cond: {
                $and: [
                  { $ne: [{ $ifNull: ['$$p.contactPoint.email', null] }, null] },
                  { $gt: [{ $size: { $ifNull: [{ $setIntersection: ['$$p.roles', ['procuringEntity', 'buyer']] }, []] } }, 0] },
                ],
              },
            },
          },
        },
      },
    },
    { $match: { party: { $ne: null } } },
    {
      $group: {
        _id: '$buyerId',
        organismName: { $last: '$buyerName' },
        lastSeenAt: { $max: '$date' },
        sampleReleaseId: { $last: '$id' },
        llamadosCount: { $sum: 1 },
        contacts: {
          $push: {
            name: '$party.name',
            email: '$party.contactPoint.email',
            telephone: '$party.contactPoint.telephone',
            faxNumber: '$party.contactPoint.faxNumber',
            date: '$date',
          },
        },
      },
    },
  ]).option({ allowDiskUse: true })

  console.log(`[refresh-contacts] ${rows.length} organisms — writing…`)
  const now = new Date()
  for (const r of rows) {
    if (!r._id) continue
    // Newest contact wins as primary; the rest become distinct variants.
    const sorted = [...r.contacts].sort((a, b) => (new Date(b.date ?? 0).getTime()) - (new Date(a.date ?? 0).getTime()))
    const primary = sorted[0]
    const tel = (primary?.telephone ?? '').trim() || undefined
    const fax = (primary?.faxNumber ?? '').trim() || undefined
    const seen = new Set<string>()
    const variants: IContactVariant[] = []
    for (const c of sorted) {
      const email = (c.email ?? '').trim()
      const name = (c.name ?? '').trim()
      const key = `${name}|${email}`
      if (seen.has(key)) continue
      seen.add(key)
      if (c === primary) continue
      variants.push({ name: name || undefined, email: email || undefined, telephone: (c.telephone ?? '').trim() || undefined })
    }
    const organismName = (r.organismName ?? '').trim() || r._id
    const contactName = (primary?.name ?? '').trim() || undefined
    const email = (primary?.email ?? '').trim() || undefined
    const searchText = [organismName, contactName, email].filter(Boolean).join(' ').toLowerCase()

    await ProcurementContactModel.replaceOne(
      { organismId: r._id },
      {
        organismId: r._id,
        organismName,
        contactName,
        email,
        telephone: tel,
        faxNumber: fax && fax !== tel ? fax : undefined,
        variants: variants.slice(0, 20),
        llamadosCount: r.llamadosCount,
        lastSeenAt: r.lastSeenAt ?? null,
        sampleReleaseId: r.sampleReleaseId,
        searchText,
        dataVersion,
        calculatedAt: now,
      },
      { upsert: true }
    )
  }
  const swept = await ProcurementContactModel.deleteMany({ dataVersion: { $ne: dataVersion } })
  console.log(`[refresh-contacts] done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${rows.length} organisms (swept ${swept.deletedCount} stale)`)
}

run()
  .then(async () => { await disconnectFromDatabase(); process.exit(0) })
  .catch(async (err) => { console.error('[refresh-contacts] failed:', err); await disconnectFromDatabase().catch(() => {}); process.exit(1) })
```

- [ ] **Step 2: Register the npm script**

In `package.json`, near the other `refresh-*`:

```json
    "refresh-contacts": "tsx src/jobs/refresh-contacts.ts",
```

- [ ] **Step 3: Run it**

Run: `npm run refresh-contacts`
Expected: `[refresh-contacts] N organisms` then `done in Xs — N organisms (swept M stale)`, N in the thousands. (May take minutes — full scan.)

- [ ] **Step 4: Verify the example organism**

Run:
```bash
npx tsx -e "import('./shared/connection/database').then(async m=>{await m.connectToDatabase();const {ProcurementContactModel}=await import('./shared/models/procurement_contacts');const d=await ProcurementContactModel.findOne({organismId:'29-54'}).lean();console.log(JSON.stringify(d));process.exit(0)})"
```
Expected: a doc with `organismName` ~"Hospital de San Carlos", `email: compras.sancarlos@asse.com.uy`, `llamadosCount ≥ 1`.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/refresh-contacts.ts package.json
git commit -m "feat(job): refresh-contacts organism directory rollup"
```

---

### Task 8: Indexes for `procurement_contacts`

**Files:**
- Modify: `scripts/ensure-indexes.ts` (add a block near the `supplier_contacts` block ~557; also a dry-run plan line ~595-616)

**Interfaces:**
- Produces: unique `organismId`, `llamadosCount` sort index, and a `$text` index on `searchText`.

- [ ] **Step 1: Add the index block**

In `scripts/ensure-indexes.ts`, inside the `if (!dryRun)` body near `supplier_contacts`:

```ts
      // --- procurement_contacts (organism purchasing contacts directory) ---
      const pc = db.collection('procurement_contacts')
      await pc.createIndex({ organismId: 1 }, { unique: true, background: true, name: 'organismId_1' })
      await pc.createIndex({ llamadosCount: -1 }, { background: true, name: 'llamadosCount_-1' })
      await pc.createIndex({ dataVersion: 1 }, { background: true, name: 'dataVersion_1' })
      await pc.createIndex(
        { searchText: 'text' },
        { name: 'procurement_contacts_text', default_language: 'none', background: true },
      )
      console.log('✅ procurement_contacts indexes ensured (organismId unique, llamadosCount, dataVersion, text)')
```

And in the dry-run `else` branch, a matching plan line:

```ts
      console.log('   plan: procurement_contacts → organismId unique, llamadosCount, dataVersion, searchText text')
```

- [ ] **Step 2: Run ensure-indexes**

Run: `npm run ensure-indexes`
Expected: prints `✅ procurement_contacts indexes ensured ...` with no error.

- [ ] **Step 3: Commit**

```bash
git add scripts/ensure-indexes.ts
git commit -m "chore(indexes): procurement_contacts (unique, sort, text)"
```

---

### Task 9: `/api/contactos` directory endpoint

**Files:**
- Create: `app/server/api/contactos/index.get.ts`

**Interfaces:**
- Consumes: `ProcurementContactModel`.
- Produces: `GET /api/contactos?q&page&limit` → `{ success, data: { contacts, pagination: { page, limit, total, totalPages } } }`.

- [ ] **Step 1: Write the endpoint**

Create `app/server/api/contactos/index.get.ts`:

```ts
import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { ProcurementContactModel } from '../../../../shared/models/procurement_contacts'

// Public directory of contracting-unit purchasing contacts, from the
// precomputed procurement_contacts rollup (refresh-contacts job).
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const page = Math.max(1, Number(q.page ?? 1) || 1)
  const limit = Math.min(50, Math.max(1, Number(q.limit ?? 25) || 25))
  const search = typeof q.q === 'string' ? q.q.trim() : ''

  await connectToDatabase()

  const filter: Record<string, unknown> = {}
  if (search) {
    // $text over searchText (organism + name + email), default_language none.
    filter.$text = { $search: search }
  }

  const skip = (page - 1) * limit
  const [contacts, total] = await Promise.all([
    ProcurementContactModel.find(filter)
      .sort(search ? { llamadosCount: -1 } : { llamadosCount: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ProcurementContactModel.countDocuments(filter),
  ])

  return {
    success: true,
    data: {
      contacts,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    },
  }
})
```

- [ ] **Step 2: Verify**

Run:
```bash
curl -s "http://localhost:3600/api/contactos?q=san%20carlos" | grep -o '"email":"compras.sancarlos@asse.com.uy"'
curl -s "http://localhost:3600/api/contactos?limit=1" | grep -o '"total":[0-9]*'
```
Expected: the email match, and a `total` in the thousands.

- [ ] **Step 3: Commit**

```bash
git add app/server/api/contactos/index.get.ts
git commit -m "feat(api): /api/contactos directory endpoint"
```

---

### Task 10: `/contactos` directory page + nav

**Files:**
- Create: `app/pages/contactos/index.vue`
- Modify: `app/layouts/default.vue` (nav array ~60)
- Modify: `app/i18n/locales/es.json` + `en.json` (`contactos`, `seo.contactos`, `nav.contactos`)

**Interfaces:**
- Consumes: `/api/contactos`, `PaginatedList` component, `useSeo`, `formatNumber` (auto-imported).
- Produces: the public directory route.

- [ ] **Step 1: Add i18n keys (both locales)**

In `app/i18n/locales/es.json`: add `nav.contactos: "Contactos"`, a `seo.contactos` group, and a `contactos` group:

```json
  "contactos": {
    "title": "Contactos de compras del Estado",
    "lead": "A quién escribirle en cada organismo: el contacto oficial de compras publicado en los llamados.",
    "resultsSummary": "{count} organismos",
    "searchPlaceholder": "Buscar organismo, persona o correo…",
    "colOrganism": "Organismo",
    "colContact": "Contacto",
    "colEmail": "Correo",
    "colPhone": "Teléfono",
    "colCalls": "Llamados",
    "empty": {
      "title": "Ningún contacto coincide con esa búsqueda",
      "body": "Probá con parte del nombre del organismo, la persona o el correo.",
      "action": "Limpiar búsqueda"
    },
    "note": "Datos de contacto oficiales publicados por los organismos en comprasestatales.gub.uy."
  },
```

In `app/i18n/locales/en.json`, the mirror:

```json
  "contactos": {
    "title": "State purchasing contacts",
    "lead": "Who to write to at each agency: the official purchasing contact published in the open calls.",
    "resultsSummary": "{count} agencies",
    "searchPlaceholder": "Search agency, person or email…",
    "colOrganism": "Agency",
    "colContact": "Contact",
    "colEmail": "Email",
    "colPhone": "Phone",
    "colCalls": "Calls",
    "empty": {
      "title": "No contact matches that search",
      "body": "Try part of the agency name, the person, or the email.",
      "action": "Clear search"
    },
    "note": "Official contact data published by the agencies on comprasestatales.gub.uy."
  },
```

Add `nav.contactos` (`"Contactos"` / `"Contacts"`) next to `nav.suppliers`, and a `seo.contactos` group mirroring `seo.suppliers` (title + description in each locale — copy the shape from `seo.suppliers`).

- [ ] **Step 2: Add the nav entry**

In `app/layouts/default.vue`, in the `nav` computed array, next to the suppliers entry (~line 60):

```ts
  { key: 'suppliers', to: localePath('/suppliers'), icon: 'mdi-domain' },
  { key: 'contactos', to: localePath('/contactos'), icon: 'mdi-card-account-details-outline' },
```

- [ ] **Step 3: Create the page**

Create `app/pages/contactos/index.vue`:

```vue
<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const search = ref((route.query.q as string) ?? '')
const page = ref(Number(route.query.page ?? 1) || 1)
const searchDebounced = refDebounced(search, 350)
const searchTerm = computed(() => searchDebounced.value.trim())

const listQuery = computed(() => ({
  page: page.value,
  limit: 25,
  ...(searchTerm.value ? { q: searchTerm.value } : {}),
}))

watch(searchTerm, () => { page.value = 1 })
watch([searchTerm, page], () => {
  router.replace({ query: { ...(searchTerm.value ? { q: searchTerm.value } : {}), ...(page.value > 1 ? { page: String(page.value) } : {}) } })
})

const { data: listRes, pending, error } = await useFetch<any>('/api/contactos', { query: listQuery })
const { data: totalRes } = await useFetch<any>('/api/contactos', { query: { limit: 1 }, key: 'contactos-total' })

const contacts = computed<any[]>(() => listRes.value?.data?.contacts ?? [])
const pagination = computed(() => listRes.value?.data?.pagination ?? null)
const directoryTotal = computed<number | null>(() => totalRes.value?.data?.pagination?.total ?? null)
const totalPages = computed(() => Math.max(1, pagination.value?.totalPages ?? 1))

function clearSearch() { search.value = '' }
function telHref(v?: string) { const d = (v ?? '').replace(/[^\d+]/g, ''); return d ? `tel:${d}` : '' }

useSeo({ title: t('seo.contactos.title'), description: t('seo.contactos.description') })
</script>

<template>
  <div class="wrap directory">
    <header class="directory__head">
      <h1>{{ t('contactos.title') }}</h1>
      <p class="u-muted">{{ t('contactos.lead') }}</p>
    </header>

    <form class="find" role="search" @submit.prevent>
      <label class="u-sr-only" for="contact-q">{{ t('common.search') }}</label>
      <v-icon class="find__icon" size="20">mdi-magnify</v-icon>
      <input id="contact-q" v-model="search" class="find__input" type="search" :placeholder="t('contactos.searchPlaceholder')">
      <button v-if="search" class="find__x" type="button" :aria-label="t('common.clear')" @click="clearSearch">
        <v-icon size="18">mdi-close</v-icon>
      </button>
    </form>

    <p v-if="pagination?.total != null" class="count">
      {{ t('contactos.resultsSummary', { count: formatNumber(pagination.total) }) }}
    </p>

    <PaginatedList v-model:page="page" :total-pages="totalPages">
      <p v-if="error" class="u-muted">{{ t('common.error') }}</p>
      <div v-else-if="pending" class="u-muted">…</div>
      <div v-else-if="!contacts.length" class="empty">
        <h2>{{ t('contactos.empty.title') }}</h2>
        <p class="u-muted">{{ t('contactos.empty.body') }}</p>
        <button class="btn" type="button" @click="clearSearch">{{ t('contactos.empty.action') }}</button>
      </div>
      <table v-else class="ctable">
        <thead>
          <tr>
            <th>{{ t('contactos.colOrganism') }}</th>
            <th>{{ t('contactos.colContact') }}</th>
            <th>{{ t('contactos.colEmail') }}</th>
            <th>{{ t('contactos.colPhone') }}</th>
            <th class="u-num">{{ t('contactos.colCalls') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in contacts" :key="c.organismId">
            <td>
              <NuxtLink :to="localePath(`/buyers/${encodeURIComponent(c.organismId)}`)" class="ctable__link u-truncate">{{ c.organismName }}</NuxtLink>
            </td>
            <td>{{ c.contactName || '—' }}</td>
            <td>
              <a v-if="c.email" :href="`mailto:${c.email}`" class="ctable__link">{{ c.email }}</a>
              <span v-else>—</span>
            </td>
            <td>
              <a v-if="c.telephone && telHref(c.telephone)" :href="telHref(c.telephone)" class="ctable__link">{{ c.telephone }}</a>
              <span v-else>{{ c.telephone || '—' }}</span>
            </td>
            <td class="u-num u-mono">{{ formatNumber(c.llamadosCount) }}</td>
          </tr>
        </tbody>
      </table>
    </PaginatedList>

    <p class="u-muted directory__note">{{ t('contactos.note') }}</p>
  </div>
</template>

<style scoped>
.directory__head { margin-bottom: var(--s-4); }
.count { color: var(--text-muted); font-size: var(--t-sm); margin: var(--s-3) 0; }
.ctable { width: 100%; border-collapse: collapse; }
.ctable th, .ctable td { text-align: left; padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--rule); font-size: var(--t-sm); vertical-align: top; }
.ctable__link { color: var(--celeste-deep); text-decoration: none; }
.ctable__link:hover { text-decoration: underline; }
.u-num { text-align: right; }
.directory__note { font-size: var(--t-xs); margin-top: var(--s-4); }
.empty { text-align: center; padding: var(--s-6) 0; }
</style>
```

Note: if `useSeo`, `refDebounced`, `PaginatedList`, `.wrap`, `.find*`, `.btn`, `common.search/clear/error` don't match the repo's exact names, align them to `app/pages/suppliers/index.vue` (which uses all of them) before finishing — that page is the canonical reference for this scaffold.

- [ ] **Step 4: Verify (dev :3600)**

Run:
```bash
curl -s "http://localhost:3600/contactos" | grep -c "Contactos de compras"
curl -s "http://localhost:3600/contactos?q=san+carlos" | grep -c "compras.sancarlos"
```
Expected: ≥ 1 each. Load `/contactos` in a browser: search works, rows link to `/buyers/…`, mailto/tel active, nav shows "Contactos".

- [ ] **Step 5: Commit**

```bash
git add app/pages/contactos/index.vue app/layouts/default.vue app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "feat(contactos): searchable purchasing-contacts directory + nav"
```

---

### Task 11: Cron registration + final verification

**Files:**
- Modify: `src/cronserver.ts` (add a weekly `refresh-contacts` schedule near the other refresh jobs)

**Interfaces:**
- Produces: `refresh-contacts` runs weekly on prod.

- [ ] **Step 1: Register the weekly cron**

Find where other `refresh-*` jobs are scheduled in `src/cronserver.ts` (search for `runJobProcess("jobs/refresh-` or an existing weekly `cron.schedule`). Add a weekly schedule mirroring the nearest example, e.g.:

```ts
    // Purchasing-contacts directory — weekly (Sundays 04:30). Full scan; slow but
    // the data changes slowly. Independent of busyWith.
    cron.schedule('30 4 * * 0', async () => {
      await this.runJobProcess('jobs/refresh-contacts')
    }, { scheduled: true, timezone: 'America/Montevideo' })
    this.logger.info('refresh-contacts scheduled: 30 4 * * 0 (Uruguay timezone)')
```

Match the exact `runJobProcess` signature/pattern used by the neighboring jobs (the open-calls example uses `await this.runJobProcess("jobs/sync-open-calls")`).

- [ ] **Step 2: Typecheck the root**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full verification sweep**

- `npx tsx tests/unit/test-contact-point.ts` → `OK`.
- `curl -s :3600/api/open-calls/1357118 | grep -o '"contact":{[^}]*}'` → contact present.
- `curl -s :3600/api/contactos?q=san+carlos | grep -o '"email":"compras.sancarlos@asse.com.uy"'` → match.
- Load `/llamados/1357118`, a `/contracts/<id>` for that ocid, and `/contactos` — panels + directory render, no gold, es/en both.

- [ ] **Step 4: Commit**

```bash
git add src/cronserver.ts
git commit -m "chore(cron): weekly refresh-contacts"
```

---

## Self-Review

**Spec coverage:**
- Objetivo 1 (panel en llamado) → Tasks 2–4. ✓
- Objetivo 2 (contacto en adjudicación) → Task 5. ✓
- Objetivo 3 (directorio /contactos) → Tasks 6–10. ✓
- Projection reads `parties` (spec §A) → Task 2. ✓
- Backfill (spec §A) → Task 3. ✓
- Contract inherits from tender sibling (spec §B) → Task 5. ✓
- Precomputed collection + job + indexes + API + page + nav (spec §C) → Tasks 6–10. ✓
- Cron (spec §C "diario o semanal") → Task 11. ✓
- Privacy note → code comments in Tasks 1, 4, 5, 7, 9, 10. ✓
- Open question 1 (open_calls refresh job) → resolved: hourly `sync-open-calls` (`20 * * * *`) covers future; Task 3 backfills the backlog.
- Open question 2 (coverage) → resolved: `open_calls` recent-only (985); panel there, contract page for history.
- Open question 3 (nav placement) → resolved: next to Proveedores (Task 10).
- Open question 4 (group key) → resolved: `buyer.id` (== procuringEntity.id, 100% of sample).

**Placeholder scan:** No TBD/TODO. Task 10 flags names to align against `suppliers/index.vue` — that is an explicit reconciliation step with a named reference, not a blank. Task 11 references "the nearest example" for the cron signature — the neighboring pattern is shown (`runJobProcess("jobs/sync-open-calls")`).

**Type consistency:** `pickPartyContact` returns `IContactPoint | undefined` (Task 1), consumed identically in Tasks 2, 3, 5. `IContactPoint = { name?, telephone?, faxNumber?, email? }` used everywhere. `ProcurementContactModel` / `IProcurementContact` (Task 6) consumed in Tasks 7, 9. Response shape `{ success, data: { contacts, pagination } }` (Task 9) consumed by the page (Task 10). `contact` field name consistent across model, projection, endpoints, and components.
