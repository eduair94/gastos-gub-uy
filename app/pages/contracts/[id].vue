<script setup lang="ts">
// `te` checks a key exists before we translate an OCDS documentType we
// may not have a Spanish label for.
const { t, te } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const id = computed(() => String(route.params.id))

const { data: res, error } = await useFetch<any>(() => `/api/contracts/${encodeURIComponent(id.value)}`)

const contract = computed<ContractLike | null>(() => res.value?.data ?? null)
const notFound = computed(() => !!error.value || !contract.value)

/**
 * Names the page.
 *
 * A clarification or an amendment has no subject of its own, so
 * `contractTitle` returns ''. Naming the stage and the tender it belongs
 * to says what the release actually is, where a bare "Contrato" read as
 * missing data.
 */
const title = computed(() => {
  const explicit = contractTitle(contract.value)
  if (explicit) return explicit
  const fb = contractTitleFallback(contract.value)
  return t(fb.key, fb.params)
})

/**
 * What is actually being bought, when the title doesn't say.
 *
 * Shown only when it adds something the heading doesn't already carry.
 */
const subject = computed(() => {
  const d = contract.value?.tender?.description?.trim()
  if (!d) return ''
  const heading = title.value.trim()
  if (!heading || d === heading || heading.startsWith(d)) return ''
  return d
})

const amount = computed(() => contractAmount(contract.value))
const currency = computed(() => contractCurrency(contract.value))
const suppliers = computed(() => contractSuppliers(contract.value))
const date = computed(() => contractDate(contract.value))

// Every stage the release carries. Only award/awardUpdate ever report
// money, so the stage is what explains an absent figure.
const tags = computed(() => contractTags(contract.value))
const showsMoney = computed(() => isMoneyStage(contract.value))

// The headline is pesos, but the source may have priced the contract in
// dollars. Saying "$ 337.781,72" above a line reading "US$ 8.400,00"
// without explanation reads as a contradiction, so name the conversion.
const originalCurrencies = computed(() =>
  (contract.value?.amount?.currencies ?? []).filter(Boolean),
)
const wasConverted = computed(() =>
  currency.value === 'UYU'
  && originalCurrencies.value.length > 0
  && !originalCurrencies.value.includes('UYU'),
)

// The whole point of the site: you can always go check the original.
// The API returns `sourceUrl`; derive it locally if a cached response
// predates that field.
const officialUrl = computed(() =>
  (contract.value as any)?.sourceUrl ?? govSourceUrl(contract.value?.ocid),
)

// The raw OCDS document we actually parsed — keyed on the release `id`,
// unlike the human page above which keys on the ocid.
const ocdsUrl = computed(() =>
  (contract.value as any)?.ocdsUrl ?? ocdsJsonUrl(contract.value?.id),
)

const documents = computed(() => {
  const c = contract.value as any
  const tender = c?.tender?.documents ?? []
  const award = (c?.awards ?? []).flatMap((a: any) => a.documents ?? [])
  return [...tender, ...award].filter((d: any) => d?.url)
})

// ---- What was bought ------------------------------------------------
// `contractItems` flattens every award into one list, which loses both
// the catalogue code and which award a line belongs to. The detail page
// is the one place that must not drop either, so it reads the awards
// directly rather than through the flattening helper.
interface RawItem {
  description?: string
  quantity?: number
  classification?: { id?: string, description?: string }
  unit?: { name?: string, value?: { amount?: number, currency?: string } }
}

interface RawAward {
  id?: string
  date?: string
  status?: string
  suppliers?: { id?: string, name?: string }[]
  items?: RawItem[]
}

interface ItemRow {
  key: string
  description: string
  code: string
  codeDescription: string
  quantity: number | null
  unitName: string
  unitAmount: number | null
  currency: string
  total: number | null
}

interface ItemGroup {
  key: string
  awardId?: string
  awardDate?: string
  awardStatus?: string
  suppliers: { id?: string, name?: string }[]
  rows: ItemRow[]
  hasPrices: boolean
}

function toRow(i: RawItem, key: string): ItemRow {
  const description = i.description?.trim() || i.classification?.description?.trim() || ''
  const codeDescription = i.classification?.description?.trim() || ''
  const unitAmount = i.unit?.value?.amount ?? null
  const quantity = i.quantity ?? null
  return {
    key,
    description,
    code: i.classification?.id?.trim() || '',
    // On most records the catalogue description repeats the item
    // description verbatim; printing it twice is noise, so it only
    // survives when it says something the description doesn't.
    codeDescription: codeDescription && codeDescription !== description ? codeDescription : '',
    quantity,
    unitName: i.unit?.name?.trim() || '',
    unitAmount,
    currency: i.unit?.value?.currency || 'UYU',
    total: unitAmount === null ? null : unitAmount * (quantity ?? 1),
  }
}

const itemGroups = computed<ItemGroup[]>(() => {
  const c = contract.value
  const awards = (c?.awards ?? []) as RawAward[]

  if (awards.length) {
    return awards.map((a, ai) => {
      const rows = (a.items ?? []).map((i, ii) => toRow(i, `a${ai}-${ii}`))
      return {
        key: a.id || `award-${ai}`,
        awardId: a.id,
        awardDate: a.date,
        awardStatus: a.status,
        suppliers: a.suppliers ?? [],
        rows,
        hasPrices: rows.some(r => r.unitAmount !== null),
      }
    })
  }

  // A tender-stage release has no award yet, but it still lists what the
  // state intends to buy — priced or not, that is the only item detail
  // it has and it was previously invisible here.
  const tenderItems = (c?.tender?.items ?? []) as RawItem[]
  if (!tenderItems.length) return []
  const rows = tenderItems.map((i, ii) => toRow(i, `t-${ii}`))
  return [{ key: 'tender', suppliers: [], rows, hasPrices: rows.some(r => r.unitAmount !== null) }]
})

// ---- Who ------------------------------------------------------------
interface ContactPoint {
  name?: string
  email?: string
  telephone?: string
  faxNumber?: string
}

interface PartyRow {
  key: string
  name: string
  roles: string[]
  to: string | null
  legalName: string
  rut: string
  contact: { name: string, email: string, phone: string } | null
}

/**
 * Supplier ids carry slashes (`R/211203010017`) and the route is a
 * catch-all, so each segment is encoded on its own — encoding the whole
 * id would turn the separator into `%2F` and miss the route.
 */
function supplierPath(id: string): string {
  return `/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`
}

function partyPath(id: string | undefined, roles: string[]): string | null {
  if (!id) return null
  if (roles.includes('supplier')) return supplierPath(id)
  if (roles.includes('buyer') || roles.includes('procuringEntity')) return `/buyers/${encodeURIComponent(id)}`
  return null
}

function roleLabel(role: string): string {
  const key = `contract.roles.${role}`
  return te(key) ? t(key) : role
}

function submissionLabel(method: string): string {
  const key = `contract.submissionMethods.${method}`
  return te(key) ? t(key) : method
}

function boolLabel(v: boolean): string {
  return v ? t('common.yes') : t('common.no')
}

const partyRoster = computed<PartyRow[]>(() => {
  const c = contract.value
  const sup = c?.supplier
  const declared = (c?.parties ?? []).filter(p => p?.name || p?.id)

  // `parties[]` is the authoritative roster. Older records predate it,
  // so fall back to the buyer/supplier the release does carry rather
  // than showing nobody.
  const list: { id?: string, name: string, roles: string[], contactPoint?: ContactPoint }[] = declared.length
    ? declared.map(p => ({ id: p.id, name: p.name ?? '', roles: p.roles ?? [], contactPoint: (p as any).contactPoint }))
    : [
        ...(c?.buyer?.name || c?.buyer?.id ? [{ id: c.buyer.id, name: c.buyer.name ?? '', roles: ['buyer'] }] : []),
        ...contractSuppliers(c).map(s => ({ id: s.id, name: s.name, roles: ['supplier'] })),
      ]

  return list.map((p, i) => {
    // The release states the supplier's tax identity once, at the top
    // level. Attach it to the party it describes instead of stranding it.
    const isSupplier = !!sup && ((!!sup.id && sup.id === p.id) || (!!sup.name && sup.name === p.name))
    const legalName = isSupplier ? (sup.identifier?.legalName?.trim() ?? '') : ''

    // Who to actually contact about this tender. The source carries it
    // per party and the government's own page prints it; we were
    // dropping it entirely. `faxNumber` is routinely a copy of
    // `telephone` in this data, so it is not surfaced.
    const cp = p.contactPoint
    const contact = {
      name: cp?.name?.trim() ?? '',
      email: cp?.email?.trim() ?? '',
      phone: cp?.telephone?.trim() ?? '',
    }

    return {
      key: `${p.id ?? p.name}-${i}`,
      name: p.name,
      roles: p.roles,
      to: partyPath(p.id, p.roles),
      legalName: legalName && legalName !== p.name ? legalName : '',
      rut: isSupplier ? (sup.identifier?.id?.trim() ?? '') : '',
      contact: (contact.name || contact.email || contact.phone) ? contact : null,
    }
  })
})

// ---- The tender it belongs to ---------------------------------------
const tender = computed(() => contract.value?.tender ?? null)

/**
 * A period, with the closing time when the source gives one.
 *
 * "Recepción de ofertas hasta 30 sept 2026" loses the fact that it
 * closes at 15:00 — which is exactly the detail a bidder needs, and
 * which the government's page prints.
 */
function periodText(p?: { startDate?: string, endDate?: string } | null): string {
  if (!p) return ''
  const start = p.startDate ? formatDate(p.startDate) : ''
  const end = p.endDate ? formatDateTime(p.endDate) : ''
  if (start && end) return `${start} – ${end}`
  return start || end
}

/**
 * `submissionMethodDetails` is a packed string, not a sentence.
 *
 * The source ships it as semicolon-joined "key: value" pairs with raw
 * ISO timestamps inside:
 *
 *   "Lugar entrega de ofertas: Municipio de Carmelo- José Pedro Varela
 *    275 ;Fecha solicitud de prorroga: 2026-09-21T00:00:00Z"
 *
 * Printed verbatim that is machine exhaust. The government's own page
 * splits it into labelled lines and renders the date as a date, so do
 * the same. Anything that doesn't fit the pattern is passed through
 * untouched rather than mangled.
 */
const submissionParts = computed(() => {
  const raw = tender.value?.submissionMethodDetails?.trim()
  if (!raw) return []

  return raw.split(';').map(s => s.trim()).filter(Boolean).map((part) => {
    const m = /^([^:]{2,40}):\s*(.+)$/.exec(part)
    if (!m) return { label: '', value: part }

    const label = m[1].trim()
    let value = m[2].trim()

    // Turn any bare ISO timestamp into a readable date.
    const iso = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.exec(value)
    if (iso) value = formatDateTime(value)

    return { label: `${label}:`, value }
  })
})

const tenderPeriod = computed(() => periodText(tender.value?.tenderPeriod))
const enquiryPeriod = computed(() => periodText(tender.value?.enquiryPeriod))

const hasTenderFacts = computed(() => {
  const tn = tender.value
  if (!tn) return false
  return !!(
    tn.id || tn.procuringEntity?.name || tn.status || tn.procurementMethodDetails
    || tenderPeriod.value || enquiryPeriod.value
    || typeof tn.hasEnquiries === 'boolean'
    || tn.submissionMethod?.length || tn.submissionMethodDetails
  )
})

const amendments = computed(() => tender.value?.amendments ?? [])

// ---- Amount internals -----------------------------------------------
const amt = computed(() => contract.value?.amount ?? null)

// Every currency the source reported, not just the headline one.
const totalAmounts = computed(() => Object.entries(amt.value?.totalAmounts ?? {}))

// A release with no money has nothing to break down — the stage note in
// the header already explains why, and a table of zeroes would not.
const showAmountDetail = computed(() => !!amt.value?.hasAmounts)

// ---- Where the record came from -------------------------------------
const webFetchDate = computed(() => (contract.value as any)?.webFetchDate as string | undefined)

const showProvenance = computed(() => {
  const c = contract.value
  return !!(c?.sourceFileName || c?.sourceYear || webFetchDate.value || c?.initiationType || c?.rssLink)
})

/**
 * Names a document the way a reader would. The source gives OCDS
 * machine vocabulary ("awardNotice"), which is the system's word, not
 * the public's — fall back to it only when we have nothing better.
 */
function docLabel(d: { description?: string, documentType?: string }): string {
  if (d.description?.trim()) return d.description.trim()
  const key = `contract.docTypes.${d.documentType}`
  if (d.documentType && te(key)) return t(key)
  return d.documentType || t('common.download')
}

// Only steps the source actually dated. A rail of placeholder steps
// would imply we know more about this contract than we do.
const timeline = computed(() => {
  const c = contract.value as any
  return [
    { key: 'enquiry', date: c?.tender?.enquiryPeriod?.endDate },
    { key: 'tender', date: c?.tender?.tenderPeriod?.endDate },
    { key: 'award', date: c?.awards?.[0]?.date },
    { key: 'published', date: c?.date },
  ]
    .filter(s => s.date && !Number.isNaN(new Date(s.date).getTime()))
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
})

const rawOpen = ref(false)

// "What else does this agency buy?" is the most common next question.
// `contract` is already resolved here, so the query is a plain value.
const buyerName = contract.value?.buyer?.name ?? ''
const { data: relatedRes } = await useFetch<any>('/api/contracts', {
  query: { buyers: buyerName, limit: 5, sortBy: 'date', sortOrder: 'desc' },
  immediate: !!buyerName,
})

const related = computed<ContractLike[]>(() =>
  (relatedRes.value?.data?.contracts ?? [])
    .filter((c: any) => c.id !== contract.value?.id)
    .slice(0, 4),
)

useSeo(() => ({
  title: contract.value
    ? t('seo.contractDetail.title', { title: title.value, buyer: contract.value.buyer?.name ?? '' })
    : t('contract.notFound.title'),
  description: contract.value
    ? t('seo.contractDetail.description', {
        buyer: contract.value.buyer?.name ?? '',
        amount: formatMoney(amount.value, currency.value),
        supplier: suppliers.value[0]?.name ?? '',
        date: formatDateLong(date.value),
      })
    : t('contract.notFound.body'),
  path: `/contracts/${id.value}`,
  noindex: notFound.value,
  jsonLd: contract.value
    ? {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        'name': title.value,
        'description': contract.value.tender?.description ?? title.value,
        'identifier': contract.value.ocid,
        'datePublished': date.value?.toISOString(),
        'isBasedOn': officialUrl.value,
        'creator': { '@type': 'GovernmentOrganization', 'name': contract.value.buyer?.name },
        'license': 'https://catalogodatos.gub.uy',
      }
    : undefined,
}))
</script>

<template>
  <div class="u-container page">
    <!-- ===== Not found ===== -->
    <div
      v-if="notFound"
      class="state"
    >
      <h1 class="state__t">
        {{ t('contract.notFound.title') }}
      </h1>
      <p class="state__b">
        {{ t('contract.notFound.body') }}
      </p>
      <NuxtLink
        :to="localePath('/contracts')"
        class="state__a"
      >
        {{ t('contract.notFound.action') }}
      </NuxtLink>
    </div>

    <template v-else-if="contract">
      <!-- ===== Header ===== -->
      <header class="head">
        <div class="head__main">
          <p class="u-eyebrow">
            {{ t('contract.eyebrow') }}
            <span v-if="contract.tender?.procurementMethodDetails">
              · {{ contract.tender.procurementMethodDetails }}
            </span>
          </p>
          <h1 class="head__title">
            {{ title }}
          </h1>

          <!-- The subject, in the source's own words.
               On tender releases `tender.title` is the bureaucratic
               label ("Llamado a Expresiones de Interés 14339/2026") and
               `tender.description` is what is actually being bought
               ("Terminal de Ómnibus de la ciudad de Carmelo"). The
               government's own page prints both; we were dropping the
               one that says something. -->
          <p
            v-if="subject"
            class="head__subject"
          >
            {{ subject }}
          </p>

          <div class="head__meta">
            <!-- The stage is the single fact that explains why a release
                 may carry no supplier, no items and no amount. It leads. -->
            <span
              v-for="tg in tags"
              :key="tg"
              class="tag"
              :class="tagTone(tg)"
              :title="t(`contract.stageHelp.${tg}`)"
            >{{ t(`contract.stage.${tg}`) }}</span>
            <span
              v-if="contract.tender?.status"
              class="tag"
              :class="statusTagClass(contract.tender.status)"
            >
              {{ contract.tender.status }}
            </span>
            <span class="head__ocid u-mono">{{ contract.ocid }}</span>
          </div>
        </div>

        <div class="head__money">
          <template v-if="showsMoney">
            <p class="head__moneyl">
              {{ t('contract.awarded') }}
            </p>
            <MoneyAmount
              :amount="amount"
              :currency="currency"
              size="xl"
              align="start"
              decimals
            />
            <p
              v-if="isMixedCurrency(contract)"
              class="head__fx"
            >
              {{ t('money.mixedCurrency') }}
            </p>
            <p
              v-else-if="wasConverted"
              class="head__fx"
            >
              {{ t('money.convertedFrom', { currency: originalCurrencies.join(', ') }) }}
            </p>
          </template>
          <!-- Not "Sin monto": this stage has no amount to report yet,
               which is a fact about the process, not a gap in the data. -->
          <p
            v-else
            class="head__nomoney"
          >
            {{ t('contract.noMoneyStage') }}
          </p>
        </div>
      </header>

      <!-- The link back to the source. The site's whole claim rests on
           this being one click away, on every contract. -->
      <a
        v-if="officialUrl"
        class="official"
        :href="officialUrl"
        target="_blank"
        rel="noopener external"
      >
        <v-icon
          size="20"
          class="official__i"
        >
          mdi-shield-check-outline
        </v-icon>
        <span class="official__text">
          <strong>{{ t('contract.officialSource') }}</strong>
          <span>{{ t('contract.officialSourceHelp') }}</span>
        </span>
        <v-icon
          size="18"
          class="official__go"
        >
          mdi-open-in-new
        </v-icon>
      </a>

      <div class="grid">
        <div class="grid__main">
          <!-- ===== Who ===== -->
          <section class="panel block">
            <div class="panel__head">
              <h2>{{ t('contract.sections.parties') }}</h2>
            </div>
            <div class="panel__body parties">
              <!-- Driven by `parties[]`, the release's own roster: every
                   entry, named with the role it actually played. -->
              <div
                v-for="p in partyRoster"
                :key="p.key"
                class="party"
              >
                <p class="party__role">
                  {{ p.roles.length ? p.roles.map(roleLabel).join(' · ') : t('contract.fields.roles') }}
                </p>
                <NuxtLink
                  v-if="p.to"
                  :to="localePath(p.to)"
                  class="party__name"
                >
                  {{ p.name || '—' }}
                </NuxtLink>
                <span
                  v-else
                  class="party__name party__name--plain"
                >{{ p.name || '—' }}</span>
                <span
                  v-if="p.legalName"
                  class="party__sub"
                >{{ t('contract.fields.legalName') }}: {{ p.legalName }}</span>
                <span
                  v-if="p.rut"
                  class="party__sub u-mono"
                >{{ t('contract.fields.rut') }}: {{ p.rut }}</span>

                <!-- Who to actually ask. The source carries this per
                     party and the government's own page prints it. -->
                <div
                  v-if="p.contact"
                  class="contact"
                >
                  <p class="contact__l">
                    {{ t('contract.fields.contact') }}
                  </p>
                  <span
                    v-if="p.contact.name"
                    class="contact__name"
                  >{{ p.contact.name }}</span>
                  <a
                    v-if="p.contact.email"
                    :href="`mailto:${p.contact.email}`"
                    class="contact__link u-truncate"
                  >{{ p.contact.email }}</a>
                  <a
                    v-if="p.contact.phone"
                    :href="`tel:${p.contact.phone.replace(/[^\d+]/g, '')}`"
                    class="contact__link u-mono"
                  >{{ p.contact.phone }}</a>
                </div>
              </div>

              <div class="party">
                <p class="party__role">
                  {{ t('contract.publishedOn') }}
                </p>
                <span class="party__name party__name--plain u-mono">{{ formatDateLong(date) }}</span>
              </div>
            </div>
          </section>

          <!-- ===== The tender this release belongs to ===== -->
          <section
            v-if="hasTenderFacts"
            class="panel block"
          >
            <div class="panel__head">
              <h2>{{ t('contract.sections.summary') }}</h2>
            </div>
            <div class="panel__body">
              <dl class="facts">
                <div
                  v-if="tender?.id"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.tenderId') }}</dt>
                  <dd class="u-mono">
                    {{ tender.id }}
                  </dd>
                </div>
                <div
                  v-if="tender?.procuringEntity?.name"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.procuringEntity') }}</dt>
                  <dd>{{ tender.procuringEntity.name }}</dd>
                </div>
                <div
                  v-if="tender?.status"
                  class="facts__row"
                >
                  <dt>{{ t('common.status') }}</dt>
                  <dd>{{ tender.status }}</dd>
                </div>
                <div
                  v-if="tender?.procurementMethodDetails"
                  class="facts__row"
                >
                  <dt>{{ t('common.method') }}</dt>
                  <dd>{{ tender.procurementMethodDetails }}</dd>
                </div>
                <div
                  v-if="tenderPeriod"
                  class="facts__row"
                >
                  <dt>{{ t('contract.timeline.tender') }}</dt>
                  <dd class="u-mono">
                    {{ tenderPeriod }}
                  </dd>
                </div>
                <div
                  v-if="enquiryPeriod"
                  class="facts__row"
                >
                  <dt>{{ t('contract.timeline.enquiry') }}</dt>
                  <dd class="u-mono">
                    {{ enquiryPeriod }}
                  </dd>
                </div>
                <div
                  v-if="typeof tender?.hasEnquiries === 'boolean'"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.hasEnquiries') }}</dt>
                  <dd>{{ boolLabel(tender.hasEnquiries) }}</dd>
                </div>
                <div
                  v-if="tender?.submissionMethod?.length"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.submissionMethod') }}</dt>
                  <dd>{{ tender.submissionMethod.map(submissionLabel).join(' · ') }}</dd>
                </div>
                <div
                  v-if="tender?.submissionMethodDetails"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.submissionMethodDetails') }}</dt>
                  <dd>
                    <span
                      v-for="(part, i) in submissionParts"
                      :key="i"
                      class="subm__part"
                    >
                      <span
                        v-if="part.label"
                        class="subm__k"
                      >{{ part.label }}</span>
                      <span>{{ part.value }}</span>
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <!-- ===== What was bought ===== -->
          <section class="panel block">
            <div class="panel__head">
              <!-- A tender lists what the state INTENDS to buy; nothing
                   is awarded yet and there are no prices. Calling that
                   "qué se compró / artículos adjudicados" states a fact
                   that hasn't happened. -->
              <h2>{{ showsMoney ? t('contract.sections.items') : t('contract.sections.itemsTender') }}</h2>
              <p class="panel__help">
                {{ showsMoney ? t('contract.itemsHelp') : t('contract.itemsTenderHelp') }}
              </p>
            </div>
            <div
              v-if="!itemGroups.length"
              class="panel__body"
            >
              <p class="u-muted">
                {{ t('contract.noItems') }}
              </p>
            </div>

            <!-- One block per award: the award's own id, date and status
                 sit above the lines it paid for, so a release with more
                 than one award never blurs into a single list. -->
            <div
              v-for="g in itemGroups"
              :key="g.key"
              class="agroup"
            >
              <dl
                v-if="g.awardId || g.awardDate || g.awardStatus"
                class="facts facts--award"
              >
                <div
                  v-if="g.awardId"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.awardId') }}</dt>
                  <dd class="u-mono">
                    {{ g.awardId }}
                  </dd>
                </div>
                <div
                  v-if="g.awardDate"
                  class="facts__row"
                >
                  <dt>{{ t('common.date') }}</dt>
                  <dd class="u-mono">
                    {{ formatDate(g.awardDate) }}
                  </dd>
                </div>
                <div
                  v-if="g.awardStatus"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.awardStatus') }}</dt>
                  <dd>
                    <span
                      class="tag"
                      :class="statusTagClass(g.awardStatus)"
                    >{{ g.awardStatus }}</span>
                  </dd>
                </div>
                <!-- Only worth naming per award when there is more than
                     one; otherwise the parties section already said it. -->
                <div
                  v-if="itemGroups.length > 1 && g.suppliers.length"
                  class="facts__row"
                >
                  <dt>{{ t('common.supplier') }}</dt>
                  <dd>{{ g.suppliers.map(s => s.name).filter(Boolean).join(' · ') }}</dd>
                </div>
              </dl>

              <p
                v-if="!g.rows.length"
                class="agroup__empty u-muted"
              >
                {{ t('contract.noItems') }}
              </p>

              <table
                v-else
                class="itable dtable"
              >
                <thead>
                  <tr>
                    <th scope="col">
                      {{ t('common.description') }}
                    </th>
                    <th scope="col">
                      {{ t('contract.fields.classification') }}
                    </th>
                    <th
                      scope="col"
                      class="itable__num"
                    >
                      {{ t('common.quantity') }}
                    </th>
                    <th scope="col">
                      {{ t('contract.fields.unit') }}
                    </th>
                    <th
                      v-if="g.hasPrices"
                      scope="col"
                      class="itable__num"
                    >
                      {{ t('common.unitPrice') }}
                    </th>
                    <th
                      v-if="g.hasPrices"
                      scope="col"
                      class="itable__num"
                    >
                      {{ t('common.total') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="it in g.rows"
                    :key="it.key"
                  >
                    <td data-primary>
                      <span class="itable__d">{{ it.description || '—' }}</span>
                    </td>
                    <td :data-label="t('contract.fields.classification')">
                      <span
                        v-if="it.code"
                        class="itable__code u-mono"
                      >{{ it.code }}</span>
                      <span
                        v-else
                        class="u-muted"
                      >—</span>
                      <span
                        v-if="it.codeDescription"
                        class="itable__u"
                      >{{ it.codeDescription }}</span>
                    </td>
                    <td
                      class="itable__num u-mono"
                      :data-label="t('common.quantity')"
                    >
                      {{ formatNumber(it.quantity) }}
                    </td>
                    <td :data-label="t('contract.fields.unit')">
                      <span
                        v-if="it.unitName"
                        class="itable__u"
                      >{{ it.unitName }}</span>
                      <span
                        v-else
                        class="u-muted"
                      >—</span>
                    </td>
                    <td
                      v-if="g.hasPrices"
                      class="itable__num"
                      :data-label="t('common.unitPrice')"
                    >
                      <MoneyAmount
                        :amount="it.unitAmount"
                        :currency="it.currency"
                        :rule="false"
                        size="sm"
                        decimals
                      />
                    </td>
                    <td
                      v-if="g.hasPrices"
                      class="itable__num"
                      :data-label="t('common.total')"
                    >
                      <MoneyAmount
                        :amount="it.total"
                        :currency="it.currency"
                        size="sm"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- ===== Amendments ===== -->
          <section
            v-if="amendments.length"
            class="panel block"
          >
            <div class="panel__head">
              <h2>{{ t('contract.sections.amendments') }}</h2>
            </div>
            <ol class="amds">
              <li
                v-for="(a, i) in amendments"
                :key="a.id || i"
                class="amds__row"
              >
                <span
                  v-if="a.date"
                  class="amds__date u-mono"
                >{{ formatDate(a.date) }}</span>
                <span class="amds__body">
                  <span
                    v-if="a.description"
                    class="amds__desc"
                  >{{ a.description }}</span>
                  <span
                    v-if="a.amendsReleaseID"
                    class="amds__ref u-mono"
                  >{{ t('contract.amendmentOf', { id: a.amendsReleaseID }) }}</span>
                </span>
              </li>
            </ol>
          </section>

          <!-- ===== Related ===== -->
          <section
            v-if="related.length"
            class="block"
          >
            <div class="block__head">
              <h2>{{ t('contract.relatedTitle') }}</h2>
              <NuxtLink
                v-if="contract.buyer?.name"
                :to="localePath(`/contracts?buyers=${encodeURIComponent(contract.buyer.name)}`)"
                class="block__all"
              >
                {{ t('common.viewAll') }}
              </NuxtLink>
            </div>
            <ol class="rank">
              <li
                v-for="r in related"
                :key="r.id"
                class="rank__row"
              >
                <NuxtLink
                  :to="localePath(`/contracts/${r.id}`)"
                  class="rank__link"
                >
                  <span class="rank__name u-truncate">{{ contractTitle(r) || t('common.contract') }}</span>
                  <span class="rank__meta">{{ formatDate(contractDate(r)) }}</span>
                  <MoneyAmount
                    :amount="contractAmount(r)"
                    :currency="contractCurrency(r)"
                    compact
                    size="sm"
                  />
                </NuxtLink>
              </li>
            </ol>
          </section>
        </div>

        <!-- ===== Aside ===== -->
        <aside class="grid__side">
          <!-- A genuine ordered sequence, so it is ordered by date —
               not numbered for decoration. -->
          <section
            v-if="timeline.length"
            class="panel block"
          >
            <div class="panel__head">
              <h2>{{ t('contract.sections.timeline') }}</h2>
            </div>
            <ol class="tl">
              <li
                v-for="s in timeline"
                :key="s.key"
                class="tl__step"
              >
                <span
                  class="tl__dot"
                  aria-hidden="true"
                />
                <span class="tl__body">
                  <span class="tl__label">{{ t(`contract.timeline.${s.key}`) }}</span>
                  <span class="tl__date u-mono">{{ formatDate(s.date) }}</span>
                </span>
              </li>
            </ol>
          </section>

          <section class="panel block">
            <div class="panel__head">
              <h2>{{ t('contract.sections.documents') }}</h2>
            </div>
            <div
              v-if="!documents.length"
              class="panel__body"
            >
              <p class="u-muted">
                {{ t('contract.noDocuments') }}
              </p>
            </div>
            <ul
              v-else
              class="docs"
            >
              <li
                v-for="(d, i) in documents"
                :key="i"
              >
                <a
                  :href="d.url"
                  target="_blank"
                  rel="noopener external"
                  class="docs__link"
                >
                  <v-icon size="16">
                    mdi-file-document-outline
                  </v-icon>
                  <span class="u-truncate">{{ docLabel(d) }}</span>
                  <v-icon size="14">
                    mdi-open-in-new
                  </v-icon>
                </a>
              </li>
            </ul>
          </section>

          <!-- ===== How the figure was built ===== -->
          <section
            v-if="showAmountDetail"
            class="panel block"
          >
            <div class="panel__head">
              <h2>{{ t('contract.sections.amount') }}</h2>
            </div>
            <div class="panel__body">
              <dl class="facts">
                <div
                  v-for="[cur, val] in totalAmounts"
                  :key="cur"
                  class="facts__row"
                >
                  <dt>{{ cur }}</dt>
                  <dd>
                    <MoneyAmount
                      :amount="val"
                      :currency="cur"
                      :rule="false"
                      size="sm"
                      align="start"
                      decimals
                    />
                  </dd>
                </div>
                <div
                  v-if="typeof amt?.totalItems === 'number'"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.totalItems') }}</dt>
                  <dd class="u-mono">
                    {{ formatNumber(amt.totalItems) }}
                  </dd>
                </div>
                <div
                  v-if="amt?.currencies?.length"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.currencies') }}</dt>
                  <dd class="u-mono">
                    {{ amt.currencies.join(' · ') }}
                  </dd>
                </div>
                <div
                  v-if="typeof amt?.originalUYUAmount === 'number'"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.originalUYU') }}</dt>
                  <dd>
                    <MoneyAmount
                      :amount="amt.originalUYUAmount"
                      currency="UYU"
                      :rule="false"
                      size="sm"
                      align="start"
                      decimals
                    />
                  </dd>
                </div>
                <div
                  v-if="typeof amt?.hasConvertedAmounts === 'boolean'"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.converted') }}</dt>
                  <dd>{{ boolLabel(amt.hasConvertedAmounts) }}</dd>
                </div>
                <div
                  v-if="amt?.exchangeRateDate"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.exchangeRateDate') }}</dt>
                  <dd class="u-mono">
                    {{ formatDate(amt.exchangeRateDate) }}
                  </dd>
                </div>
                <div
                  v-if="typeof amt?.version === 'number'"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.version') }}</dt>
                  <dd class="u-mono">
                    {{ amt.version }}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <!-- ===== Where this record came from ===== -->
          <section
            v-if="showProvenance"
            class="panel block"
          >
            <div class="panel__head">
              <h2>{{ t('contract.sections.provenance') }}</h2>
            </div>
            <div class="panel__body">
              <dl class="facts">
                <div
                  v-if="contract.initiationType"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.initiationType') }}</dt>
                  <dd>{{ contract.initiationType }}</dd>
                </div>
                <div
                  v-if="contract.sourceFileName"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.sourceFile') }}</dt>
                  <dd class="u-mono">
                    {{ contract.sourceFileName }}
                  </dd>
                </div>
                <div
                  v-if="contract.sourceYear"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.sourceYear') }}</dt>
                  <dd class="u-mono">
                    {{ contract.sourceYear }}
                  </dd>
                </div>
                <div
                  v-if="webFetchDate"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.fetched') }}</dt>
                  <dd class="u-mono">
                    {{ formatDate(webFetchDate) }}
                  </dd>
                </div>
                <div
                  v-if="contract.rssLink"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.rssLink') }}</dt>
                  <dd>
                    <a
                      :href="contract.rssLink"
                      target="_blank"
                      rel="noopener external"
                      class="facts__link u-truncate"
                    >{{ contract.rssLink }}</a>
                  </dd>
                </div>
                <!-- The machine-readable original, distinct from the
                     human page linked at the top. Someone checking our
                     arithmetic wants the exact document we parsed. -->
                <div
                  v-if="ocdsUrl"
                  class="facts__row"
                >
                  <dt>{{ t('contract.fields.ocdsJson') }}</dt>
                  <dd>
                    <a
                      :href="ocdsUrl"
                      target="_blank"
                      rel="noopener external"
                      class="facts__link u-truncate"
                    >{{ ocdsUrl }}</a>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="panel block">
            <div class="panel__head">
              <h2>{{ t('contract.sections.raw') }}</h2>
            </div>
            <div class="panel__body">
              <p class="u-muted rawnote">
                {{ t('contract.rawHelp') }}
              </p>
              <button
                class="rawbtn"
                type="button"
                @click="rawOpen = true"
              >
                {{ t('contract.sections.raw') }}
              </button>
            </div>
          </section>
        </aside>
      </div>

      <v-dialog
        v-model="rawOpen"
        max-width="900"
        scrollable
      >
        <div class="rawdlg">
          <div class="rawdlg__head">
            <h2>{{ contract.id }}</h2>
            <button
              class="rawdlg__x"
              type="button"
              :aria-label="t('nav.close')"
              @click="rawOpen = false"
            >
              <v-icon>mdi-close</v-icon>
            </button>
          </div>
          <pre class="rawdlg__pre">{{ JSON.stringify(contract, null, 2) }}</pre>
        </div>
      </v-dialog>
    </template>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

/* ---- Header ---- */
.head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-5);
  align-items: start;
  padding-bottom: var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.head__title {
  margin: var(--s-2) 0 var(--s-3);
  max-width: 24ch;
}

.head__subject {
  margin: calc(var(--s-2) * -1) 0 var(--s-3);
  max-width: 60ch;
  font-size: var(--t-md);
  line-height: 1.5;
  color: var(--text-muted);
}

.head__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
}

.head__ocid {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.head__money { min-width: 200px; }

.head__moneyl {
  margin: 0 0 var(--s-1);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.head__fx {
  margin: var(--s-2) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  max-width: 28ch;
}

.head__nomoney {
  margin: 0;
  max-width: 30ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Official source ---- */
.official {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-top: var(--s-5);
  padding: var(--s-3) var(--s-4);
  border: 1px solid color-mix(in srgb, var(--celeste) 40%, transparent);
  border-radius: var(--r-lg);
  background: var(--celeste-wash);
  color: var(--text);
  text-decoration: none;
  transition: border-color var(--dur) var(--ease);
}

.official:hover { border-color: var(--celeste); }

.official__i {
  color: var(--celeste-deep);
  flex: none;
}

.official__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.official__text strong { font-size: var(--t-sm); }

.official__text span {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.official__go {
  margin-left: auto;
  color: var(--celeste-deep);
  flex: none;
}

/* ---- Grid ---- */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--s-6);
  align-items: start;
  margin-top: var(--s-6);
}

.grid__main,
.grid__side { min-width: 0; }

.block + .block { margin-top: var(--s-5); }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.block__all {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.panel__help {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- Parties ---- */
.parties {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-4);
}

.party {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  min-width: 0;
}

.party__role {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.party__name {
  font-weight: 600;
  font-size: var(--t-sm);
  color: var(--celeste-deep);
  text-decoration: none;
}

a.party__name:hover { text-decoration: underline; }

.party__name--plain {
  color: var(--text);
  font-weight: 500;
}

.party__sub {
  font-size: var(--t-xs);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

/* ---- Submission conditions ---- */
.subm__part {
  display: block;
}

.subm__part + .subm__part { margin-top: var(--s-1); }

.subm__k {
  margin-right: var(--s-1);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

/* ---- Contact ---- */
.contact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--s-2);
  padding-top: var(--s-2);
  border-top: 1px dashed var(--rule);
  min-width: 0;
}

.contact__l {
  margin: 0 0 2px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.contact__name {
  font-size: var(--t-xs);
  color: var(--text);
}

.contact__link {
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  text-decoration: none;
}

.contact__link:hover { text-decoration: underline; }

/* ---- Fact lists ---- */
.facts {
  margin: 0;
  display: grid;
  gap: var(--s-3);
}

.facts__row {
  display: grid;
  grid-template-columns: minmax(0, 11ch) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--s-3);
}

.facts dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.facts dd {
  margin: 0;
  min-width: 0;
  font-size: var(--t-sm);
  overflow-wrap: anywhere;
}

.facts__link {
  /* `.u-truncate` sets overflow:hidden, which does nothing on an inline
     box — the raw source URL just ran past the viewport. A block box
     inside the min-width:0 track truncates as intended. */
  display: block;
  min-width: 0;
  max-width: 100%;
  color: var(--celeste-deep);
  font-size: var(--t-xs);
}

/* The award's own identity, sitting above the lines it paid for. */
.facts--award {
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  justify-content: start;
  gap: var(--s-5);
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--rule);
}

.facts--award .facts__row {
  grid-template-columns: none;
  gap: 2px;
}

.agroup + .agroup { border-top: 1px solid var(--rule-strong); }

.agroup__empty {
  margin: 0;
  padding: var(--s-4);
  font-size: var(--t-sm);
}

/* ---- Amendments ---- */
.amds {
  margin: 0;
  padding: 0;
  list-style: none;
}

.amds__row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--s-4);
  padding: var(--s-3) var(--s-5);
}

.amds__row + .amds__row { border-top: 1px solid var(--rule); }

.amds__date {
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.amds__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.amds__desc {
  font-size: var(--t-sm);
  overflow-wrap: anywhere;
}

.amds__ref {
  font-size: var(--t-xs);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

/* ---- Items table ---- */
.itable {
  width: 100%;
  /* Tuned to still fit at the 760px card breakpoint, so the table never
     pushes the page sideways in the gap before `.dtable` takes over. */
  min-width: 680px;
  border-collapse: collapse;
}

.itable th {
  padding: var(--s-3) var(--s-4);
  text-align: left;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
}

.itable td {
  padding: var(--s-3) var(--s-4);
  font-size: var(--t-sm);
  vertical-align: top;
  border-bottom: 1px solid var(--rule);
}

.itable tr:last-child td { border-bottom: 0; }

.itable__d { display: block; }

.itable__code {
  display: block;
  font-size: var(--t-sm);
}

.itable__u {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.itable th.itable__num,
.itable td.itable__num {
  text-align: right;
  white-space: nowrap;
}

/* ---- Rank ---- */
.rank {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.rank__row + .rank__row { border-top: 1px solid var(--rule); }

.rank__link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
  text-decoration: none;
  color: inherit;
}

.rank__link:hover { background: var(--surface-sunken); }

.rank__name {
  font-size: var(--t-sm);
  font-weight: 600;
}

.rank__meta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- Timeline ---- */
.tl {
  margin: 0;
  padding: var(--s-4) var(--s-5);
  list-style: none;
}

.tl__step {
  position: relative;
  display: flex;
  gap: var(--s-3);
  padding-bottom: var(--s-4);
}

.tl__step:last-child { padding-bottom: 0; }

.tl__step::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 12px;
  bottom: 0;
  width: 1px;
  background: var(--rule);
}

.tl__step:last-child::before { display: none; }

.tl__dot {
  position: relative;
  z-index: 1;
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--celeste);
}

.tl__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tl__label {
  font-size: var(--t-sm);
  font-weight: 500;
}

.tl__date {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- Docs ---- */
.docs {
  margin: 0;
  padding: 0;
  list-style: none;
}

.docs li + li { border-top: 1px solid var(--rule); }

.docs__link {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-5);
  font-size: var(--t-sm);
  color: var(--celeste-deep);
  text-decoration: none;
}

.docs__link:hover { background: var(--surface-sunken); }

/* ---- Raw ---- */
.rawnote {
  margin: 0 0 var(--s-3);
  font-size: var(--t-xs);
}

.rawbtn {
  width: 100%;
  padding: var(--s-2);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.rawbtn:hover { background: var(--surface-sunken); }

.rawdlg {
  display: flex;
  flex-direction: column;
  max-height: 84dvh;
  background: var(--surface);
  border-radius: var(--r-lg);
}

.rawdlg__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s-4) var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.rawdlg__head h2 {
  font-size: var(--t-md);
  font-family: var(--font-mono);
}

.rawdlg__x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.rawdlg__pre {
  margin: 0;
  padding: var(--s-5);
  overflow: auto;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  line-height: 1.6;
  color: var(--text);
}

/* ---- State ---- */
.state {
  padding: var(--s-9) var(--s-5);
  text-align: center;
}

.state__t { margin: 0 0 var(--s-2); }

.state__b {
  margin: 0 auto var(--s-5);
  max-width: 46ch;
  color: var(--text-muted);
}

.state__a {
  display: inline-block;
  padding: var(--s-3) var(--s-5);
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  font-weight: 600;
  font-size: var(--t-sm);
  text-decoration: none;
}

/* ---- Responsive ---- */
@media (max-width: 960px) {
  .grid { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  /* The award meta reads as a row of pairs on desktop; stacked, it would
     fight the item cards below it, so it wraps instead. */
  .facts--award {
    grid-auto-flow: row;
    grid-auto-columns: auto;
    gap: var(--s-3);
  }
}

@media (max-width: 700px) {
  .head { grid-template-columns: 1fr; }
  .head__title { max-width: none; }
  .head__money { min-width: 0; }
  .head__nomoney { max-width: none; }

  .amds__row {
    grid-template-columns: 1fr;
    row-gap: var(--s-1);
  }

  .rank__link {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--s-1);
  }

  .rank__meta { grid-column: 1; grid-row: 2; }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}
</style>
