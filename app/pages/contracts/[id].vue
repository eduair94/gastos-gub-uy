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

const title = computed(() => contractTitle(contract.value) || t('common.contract'))
const amount = computed(() => contractAmount(contract.value))
const currency = computed(() => contractCurrency(contract.value))
const suppliers = computed(() => contractSuppliers(contract.value))
const items = computed(() => contractItems(contract.value))
const date = computed(() => contractDate(contract.value))

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
  (contract.value as any)?.sourceUrl ?? govSourceUrl(contract.value?.id),
)

const documents = computed(() => {
  const c = contract.value as any
  const tender = c?.tender?.documents ?? []
  const award = (c?.awards ?? []).flatMap((a: any) => a.documents ?? [])
  return [...tender, ...award].filter((d: any) => d?.url)
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
          <div class="head__meta">
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
              <div class="party">
                <p class="party__role">
                  {{ t('contract.purchasedBy') }}
                </p>
                <NuxtLink
                  v-if="contract.buyer?.id"
                  :to="localePath(`/buyers/${encodeURIComponent(contract.buyer.id)}`)"
                  class="party__name"
                >
                  {{ contract.buyer?.name }}
                </NuxtLink>
                <span
                  v-else
                  class="party__name party__name--plain"
                >{{ contract.buyer?.name || '—' }}</span>
              </div>

              <div class="party">
                <p class="party__role">
                  {{ t('contract.awardedTo') }}
                </p>
                <template v-if="suppliers.length">
                  <NuxtLink
                    v-for="s in suppliers"
                    :key="s.name"
                    :to="s.id ? localePath(`/suppliers/${encodeURIComponent(s.id)}`) : localePath('/suppliers')"
                    class="party__name"
                  >
                    {{ s.name }}
                  </NuxtLink>
                </template>
                <span
                  v-else
                  class="party__name party__name--plain u-muted"
                >—</span>
              </div>

              <div class="party">
                <p class="party__role">
                  {{ t('contract.publishedOn') }}
                </p>
                <span class="party__name party__name--plain u-mono">{{ formatDateLong(date) }}</span>
              </div>
            </div>
          </section>

          <!-- ===== What was bought ===== -->
          <section class="panel block">
            <div class="panel__head">
              <h2>{{ t('contract.sections.items') }}</h2>
              <p class="panel__help">
                {{ t('contract.itemsHelp') }}
              </p>
            </div>
            <div
              v-if="!items.length"
              class="panel__body"
            >
              <p class="u-muted">
                {{ t('contract.noItems') }}
              </p>
            </div>
            <div
              v-else
              class="u-scroll-x"
            >
              <table class="itable">
                <thead>
                  <tr>
                    <th scope="col">
                      {{ t('common.description') }}
                    </th>
                    <th
                      scope="col"
                      class="itable__num"
                    >
                      {{ t('common.quantity') }}
                    </th>
                    <th
                      scope="col"
                      class="itable__num"
                    >
                      {{ t('common.unitPrice') }}
                    </th>
                    <th
                      scope="col"
                      class="itable__num"
                    >
                      {{ t('common.total') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(it, i) in items"
                    :key="i"
                  >
                    <td>
                      <span class="itable__d">{{ it.description || '—' }}</span>
                      <span
                        v-if="it.unitName"
                        class="itable__u"
                      >{{ it.unitName }}</span>
                    </td>
                    <td class="itable__num u-mono">
                      {{ formatNumber(it.quantity) }}
                    </td>
                    <td class="itable__num">
                      <MoneyAmount
                        :amount="it.unitAmount"
                        :currency="it.currency"
                        :rule="false"
                        size="sm"
                        decimals
                      />
                    </td>
                    <td class="itable__num">
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

/* ---- Items table ---- */
.itable {
  width: 100%;
  min-width: 560px;
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

@media (max-width: 700px) {
  .head { grid-template-columns: 1fr; }
  .head__title { max-width: none; }
  .head__money { min-width: 0; }

  .rank__link {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--s-1);
  }

  .rank__meta { grid-column: 1; grid-row: 2; }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}
</style>
