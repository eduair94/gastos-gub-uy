<script setup lang="ts">
import type {
  SupplierBusinessDetail,
  SupplierMapPoint,
} from '~/types/supplier-business'

const props = defineProps<{
  point: SupplierMapPoint | null
  detail: SupplierBusinessDetail | null
  loading: boolean
  error: boolean
}>()

const emit = defineEmits<{ retry: [] }>()
const open = defineModel<boolean>({ required: true })
const { t, locale } = useI18n()
const localePath = useLocalePath()

const record = computed(() => props.detail)
const identity = computed(() => props.detail ?? props.point)
const supplierHref = computed(() => {
  const id = identity.value?.supplierId
  return id
    ? localePath(`/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`)
    : null
})
const primaryEmail = computed(() => record.value?.emails[0]?.email ?? null)
const primaryPhone = computed(() => record.value?.phones[0]?.phone ?? null)
const contactAvailable = computed(() => !!(
  record.value?.emails.length
  || record.value?.phones.length
  || record.value?.website
  || record.value?.contactFormUrl
  || record.value?.socialLinks.length
))
const activityAvailable = computed(() => !!(
  record.value?.dei
  || record.value?.rubros.length
))
const registryAvailable = computed(() => !!(
  record.value?.dei
  || record.value?.rupe
))
const hourLines = computed(() =>
  record.value?.hours
    ?.split(/\s*\|\s*/)
    .map(line => line.trim())
    .filter(Boolean) ?? [],
)

function sourceLabel(source: string | null | undefined): string {
  const sourceKey: Record<string, string> = {
    webSearch: 'webSearch',
    website: 'website',
    googleMaps: 'googleMaps',
    manual: 'manual',
    dei: 'dei',
    rupe: 'rupe',
    impo: 'impo',
    crawl4ai: 'crawl4ai',
  }
  const key = source ? sourceKey[source] : null
  return key ? t(`contacts.source.${key}`) : t('contacts.businessDialog.sourceUnknown')
}

function formattedDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-US' : 'es-UY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function ciiuSecondary(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function meaningfulText(value: string | null | undefined): string | null {
  const clean = value?.trim()
  if (!clean || /^(?:0|null|n\/a|s\/d|sin dato)$/i.test(clean)) return null
  return clean
}

function firstMeaningful(...values: Array<string | null | undefined>): string {
  return values.map(meaningfulText).find(Boolean) ?? '—'
}

function meaningfulParts(...values: Array<string | null | undefined>): string {
  return values.map(meaningfulText).filter(Boolean).join(' · ')
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="1120"
    scrollable
  >
    <v-card
      v-if="identity"
      class="business-dialog"
      role="document"
      aria-labelledby="supplier-business-title"
    >
      <header class="business-dialog__head">
        <div class="business-dialog__identity">
          <p class="business-dialog__eyebrow">
            {{ t('contacts.businessDialog.eyebrow') }}
          </p>
          <h2 id="supplier-business-title">
            {{ identity.name }}
          </h2>
          <div class="business-dialog__identity-row">
            <code>{{ t('contacts.businessDialog.rut', { rut: identity.rut || '—' }) }}</code>
            <RupeStatusChip
              v-if="record?.rupeEstado || point?.rupeEstado"
              :status="record?.rupeEstado || point?.rupeEstado || ''"
            />
            <NeverAwardedChip v-if="record?.neverAwarded || point?.neverAwarded" />
          </div>
        </div>

        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          class="business-dialog__close"
          :aria-label="t('nav.close')"
          @click="open = false"
        />
      </header>

      <div
        v-if="record"
        class="business-dialog__actions"
        :aria-label="t('contacts.businessDialog.quickActions')"
      >
        <v-btn
          v-if="primaryEmail"
          prepend-icon="mdi-email-outline"
          :href="`mailto:${primaryEmail}`"
          color="primary"
        >
          {{ t('contacts.businessDialog.write') }}
        </v-btn>
        <v-btn
          v-if="primaryPhone"
          prepend-icon="mdi-phone-outline"
          :href="`tel:${primaryPhone}`"
          variant="outlined"
        >
          {{ t('contacts.businessDialog.call') }}
        </v-btn>
        <v-btn
          v-if="record.website"
          prepend-icon="mdi-link-variant"
          :href="record.website"
          target="_blank"
          rel="nofollow noopener"
          variant="outlined"
        >
          {{ t('contacts.businessDialog.website') }}
        </v-btn>
        <v-btn
          v-if="record.mapsUrl"
          prepend-icon="mdi-map-marker-outline"
          :href="record.mapsUrl"
          target="_blank"
          rel="nofollow noopener"
          variant="outlined"
        >
          {{ t('contacts.businessDialog.openMap') }}
        </v-btn>
        <v-btn
          v-if="supplierHref"
          append-icon="mdi-open-in-new"
          :to="supplierHref"
          variant="text"
          class="business-dialog__profile-action"
        >
          {{ t('contacts.businessDialog.fullProfile') }}
        </v-btn>
      </div>

      <v-progress-linear
        v-if="loading"
        indeterminate
        color="primary"
        height="3"
      />

      <v-card-text class="business-dialog__body">
        <div
          v-if="loading"
          class="business-dialog__loading"
          role="status"
        >
          <div
            class="business-dialog__loading-mark"
            aria-hidden="true"
          />
          <div>
            <strong>{{ t('contacts.businessDialog.loadingTitle') }}</strong>
            <p>{{ t('contacts.businessDialog.loadingBody') }}</p>
          </div>
        </div>

        <div
          v-else-if="error"
          class="business-dialog__error"
          role="alert"
        >
          <v-icon size="26">
            mdi-information-outline
          </v-icon>
          <div>
            <strong>{{ t('contacts.businessDialog.errorTitle') }}</strong>
            <p>{{ t('contacts.businessDialog.errorBody') }}</p>
            <v-btn
              prepend-icon="mdi-refresh"
              variant="outlined"
              size="small"
              @click="emit('retry')"
            >
              {{ t('contacts.map.retryContact') }}
            </v-btn>
          </div>
        </div>

        <template v-else-if="record">
          <section
            v-if="record.procurement"
            class="record-section record-section--metrics"
            :aria-labelledby="`procurement-${record.supplierId}`"
          >
            <div class="record-section__head">
              <div>
                <p>{{ t('contacts.businessDialog.procurementEyebrow') }}</p>
                <h3 :id="`procurement-${record.supplierId}`">
                  {{ t('contacts.businessDialog.procurementTitle') }}
                </h3>
              </div>
              <span class="record-section__date">
                {{ t('contacts.businessDialog.updated', { date: formattedDate(record.procurement.lastUpdated) }) }}
              </span>
            </div>

            <dl class="metric-grid">
              <div>
                <dt>{{ t('contacts.businessDialog.totalAwarded') }}</dt>
                <dd>
                  <MoneyAmount
                    :amount="record.procurement.totalValue"
                    size="lg"
                    align="start"
                    compact
                  />
                </dd>
              </div>
              <div>
                <dt>{{ t('contacts.businessDialog.contracts') }}</dt>
                <dd>{{ formatNumber(record.procurement.totalContracts) }}</dd>
              </div>
              <div>
                <dt>{{ t('contacts.businessDialog.buyers') }}</dt>
                <dd>{{ formatNumber(record.procurement.buyerCount) }}</dd>
              </div>
              <div>
                <dt>{{ t('contacts.businessDialog.activeYears') }}</dt>
                <dd>{{ formatNumber(record.procurement.yearCount) }}</dd>
              </div>
              <div>
                <dt>{{ t('contacts.businessDialog.directAwards') }}</dt>
                <dd>{{ formatNumber(record.procurement.directAwardCount) }}</dd>
              </div>
              <div>
                <dt>{{ t('contacts.businessDialog.tenders') }}</dt>
                <dd>{{ formatNumber(record.procurement.tenderAwardCount) }}</dd>
              </div>
            </dl>
          </section>

          <div class="business-dialog__columns">
            <div class="business-dialog__column">
              <section class="record-section">
                <div class="record-section__head">
                  <div>
                    <p>{{ t('contacts.businessDialog.contactEyebrow') }}</p>
                    <h3>{{ t('contacts.businessDialog.contactTitle') }}</h3>
                  </div>
                </div>

                <div
                  v-if="contactAvailable"
                  class="evidence-list"
                >
                  <div
                    v-for="email in record.emails"
                    :key="email.email"
                    class="evidence-row"
                  >
                    <v-icon size="18">
                      mdi-email-outline
                    </v-icon>
                    <div>
                      <a :href="`mailto:${email.email}`">{{ email.email }}</a>
                      <p>
                        {{ sourceLabel(email.source) }}
                        <span v-if="email.mxValid">· {{ t('contacts.businessDialog.verifiedEmail') }}</span>
                      </p>
                      <a
                        v-if="email.sourceUrl"
                        :href="email.sourceUrl"
                        target="_blank"
                        rel="nofollow noopener"
                        class="evidence-row__source"
                      >
                        {{ t('contacts.businessDialog.viewEvidence') }}
                      </a>
                    </div>
                  </div>

                  <div
                    v-for="phone in record.phones"
                    :key="`${phone.phone}-${phone.source}`"
                    class="evidence-row"
                  >
                    <v-icon size="18">
                      mdi-phone-outline
                    </v-icon>
                    <div>
                      <a :href="`tel:${phone.phone}`">{{ phone.phone }}</a>
                      <p>{{ sourceLabel(phone.source) }}</p>
                      <a
                        v-if="phone.sourceUrl"
                        :href="phone.sourceUrl"
                        target="_blank"
                        rel="nofollow noopener"
                        class="evidence-row__source"
                      >
                        {{ t('contacts.businessDialog.viewEvidence') }}
                      </a>
                    </div>
                  </div>

                  <div
                    v-if="record.website"
                    class="evidence-row"
                  >
                    <v-icon size="18">
                      mdi-link-variant
                    </v-icon>
                    <div>
                      <a
                        :href="record.website"
                        target="_blank"
                        rel="nofollow noopener"
                      >{{ record.website }}</a>
                      <p>
                        {{
                          sourceLabel(
                            record.websiteSource
                              || (record.methods.includes('crawl4ai') ? 'website' : null),
                          )
                        }}
                      </p>
                    </div>
                  </div>

                  <div
                    v-if="record.contactFormUrl"
                    class="evidence-row"
                  >
                    <v-icon size="18">
                      mdi-file-document-outline
                    </v-icon>
                    <div>
                      <a
                        :href="record.contactFormUrl"
                        target="_blank"
                        rel="nofollow noopener"
                      >{{ t('contacts.contactForm') }}</a>
                      <p>{{ t('contacts.businessDialog.providerWebsite') }}</p>
                    </div>
                  </div>

                  <div
                    v-for="social in record.socialLinks"
                    :key="social.url"
                    class="evidence-row"
                  >
                    <v-icon size="18">
                      mdi-link-variant
                    </v-icon>
                    <div>
                      <a
                        :href="social.url"
                        target="_blank"
                        rel="nofollow noopener"
                      >{{ social.label || social.platform }}</a>
                      <p>{{ sourceLabel(social.source) }}</p>
                    </div>
                  </div>
                </div>
                <p
                  v-else
                  class="record-section__empty"
                >
                  {{ t('contacts.map.noContact') }}
                </p>
              </section>

              <section class="record-section">
                <div class="record-section__head">
                  <div>
                    <p>{{ t('contacts.businessDialog.locationEyebrow') }}</p>
                    <h3>{{ t('contacts.businessDialog.locationTitle') }}</h3>
                  </div>
                </div>
                <dl class="field-grid">
                  <div>
                    <dt>{{ t('contacts.table.locality') }}</dt>
                    <dd>{{ firstMeaningful(record.locality, record.rupe?.localidad, record.dei?.localidad) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('contacts.location.address') }}</dt>
                    <dd>{{ firstMeaningful(record.address, record.rupe?.domicilioFiscal, record.dei?.direccion) }}</dd>
                  </div>
                  <div
                    v-if="
                      meaningfulText(record.websiteAddress)
                        && meaningfulText(record.websiteAddress) !== meaningfulText(record.address)
                    "
                  >
                    <dt>{{ t('contacts.location.websiteAddress') }}</dt>
                    <dd>{{ meaningfulText(record.websiteAddress) }}</dd>
                  </div>
                  <div v-if="hourLines.length">
                    <dt>{{ t('contacts.businessHours') }}</dt>
                    <dd>
                      <ul class="plain-list">
                        <li
                          v-for="line in hourLines"
                          :key="line"
                        >
                          {{ line }}
                        </li>
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ t('contacts.location.source') }}</dt>
                    <dd>{{ sourceLabel(record.placeSource) }}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <div class="business-dialog__column">
              <section
                v-if="activityAvailable"
                class="record-section"
              >
                <div class="record-section__head">
                  <div>
                    <p>{{ t('contacts.businessDialog.activityEyebrow') }}</p>
                    <h3>{{ t('contacts.businessDialog.activityTitle') }}</h3>
                  </div>
                  <v-chip
                    v-if="record.dei?.tamano"
                    size="small"
                  >
                    {{ record.dei.tamano }}
                  </v-chip>
                </div>
                <dl class="field-grid">
                  <div v-if="record.dei?.nombreComercial">
                    <dt>{{ t('sup.dei.f.nombreComercial') }}</dt>
                    <dd>{{ record.dei.nombreComercial }}</dd>
                  </div>
                  <div v-if="record.dei?.descripcionActividad">
                    <dt>{{ t('sup.dei.f.actividad') }}</dt>
                    <dd>{{ record.dei.descripcionActividad }}</dd>
                  </div>
                  <div v-if="record.dei?.ciiuPrincipal || record.dei?.ciiuPrincipalDesc">
                    <dt>{{ t('contacts.businessDialog.ciiu') }}</dt>
                    <dd>
                      <code>{{ record.dei.ciiuPrincipal }}</code>
                      {{ record.dei.ciiuPrincipalDesc }}
                    </dd>
                  </div>
                  <div v-if="record.dei?.tiposActividad?.length">
                    <dt>{{ t('sup.dei.f.tipos') }}</dt>
                    <dd>{{ record.dei.tiposActividad.join(' · ') }}</dd>
                  </div>
                  <div v-if="record.dei?.ciiuSecundarios?.length">
                    <dt>{{ t('contacts.businessDialog.secondaryCiiu') }}</dt>
                    <dd>{{ record.dei.ciiuSecundarios.map(ciiuSecondary).join(' · ') }}</dd>
                  </div>
                  <div v-if="record.rubros.length">
                    <dt>{{ t('contacts.businessDialog.procurementCategories') }}</dt>
                    <dd>
                      <ul class="plain-list">
                        <li
                          v-for="rubro in record.rubros"
                          :key="rubro.classificationId"
                        >
                          {{ rubro.label }}
                        </li>
                      </ul>
                    </dd>
                  </div>
                </dl>
              </section>

              <section
                v-if="registryAvailable"
                class="record-section"
              >
                <div class="record-section__head">
                  <div>
                    <p>{{ t('contacts.businessDialog.registryEyebrow') }}</p>
                    <h3>{{ t('contacts.businessDialog.registryTitle') }}</h3>
                  </div>
                </div>
                <div class="registry-stack">
                  <article
                    v-if="record.rupe"
                    class="registry-record"
                  >
                    <header>
                      <strong>{{ t('contacts.businessDialog.rupeRecord') }}</strong>
                      <RupeStatusChip :status="record.rupe.estado" />
                    </header>
                    <p>{{ record.rupe.denominacionSocial }}</p>
                    <small>
                      {{ meaningfulParts(record.rupe.domicilioFiscal, record.rupe.localidad, record.rupe.departamento, record.rupe.pais) }}
                    </small>
                  </article>
                  <article
                    v-if="record.dei"
                    class="registry-record"
                  >
                    <header>
                      <strong>{{ t('contacts.businessDialog.deiRecord') }}</strong>
                      <v-chip
                        v-if="record.dei.estado"
                        size="x-small"
                      >
                        {{ record.dei.estado }}
                      </v-chip>
                    </header>
                    <p>{{ record.dei.denominacionSocial }}</p>
                    <small v-if="record.dei.fechaRegistro || record.dei.fechaVencimiento">
                      {{ t('contacts.businessDialog.registryDates', {
                        start: formattedDate(record.dei.fechaRegistro),
                        end: formattedDate(record.dei.fechaVencimiento),
                      }) }}
                    </small>
                  </article>
                </div>
              </section>

              <section
                v-if="record.procurement"
                class="record-section"
              >
                <div class="record-section__head">
                  <div>
                    <p>{{ t('contacts.businessDialog.contextEyebrow') }}</p>
                    <h3>{{ t('contacts.businessDialog.contextTitle') }}</h3>
                  </div>
                </div>
                <dl class="field-grid">
                  <div v-if="record.procurement.years.length">
                    <dt>{{ t('contacts.businessDialog.years') }}</dt>
                    <dd>{{ [...record.procurement.years].sort((a, b) => b - a).join(' · ') }}</dd>
                  </div>
                  <div v-if="record.procurement.buyers.length">
                    <dt>{{ t('contacts.businessDialog.mainBuyers') }}</dt>
                    <dd>
                      <ul class="plain-list">
                        <li
                          v-for="buyer in record.procurement.buyers"
                          :key="buyer.id"
                        >
                          {{ buyer.name }}
                          <small v-if="buyer.name !== buyer.id">{{ buyer.id }}</small>
                        </li>
                      </ul>
                    </dd>
                  </div>
                  <div v-if="record.procurement.topCategories.length">
                    <dt>{{ t('contacts.businessDialog.topCategories') }}</dt>
                    <dd>
                      <ul class="category-list">
                        <li
                          v-for="category in record.procurement.topCategories"
                          :key="category.category"
                        >
                          <span>{{ category.category }}</span>
                          <MoneyAmount
                            :amount="category.totalAmount"
                            compact
                            size="sm"
                          />
                        </li>
                      </ul>
                    </dd>
                  </div>
                  <div v-if="record.procurement.items.length">
                    <dt>{{ t('contacts.businessDialog.items') }}</dt>
                    <dd>
                      <ul class="plain-list">
                        <li
                          v-for="item in record.procurement.items.slice(0, 6)"
                          :key="`${item.description}-${item.year}`"
                        >
                          {{ item.description }}
                          <span v-if="item.contractCount">
                            · {{ t('contacts.businessDialog.itemContracts', { count: formatNumber(item.contractCount) }) }}
                          </span>
                        </li>
                      </ul>
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>

          <footer class="business-dialog__foot">
            <p>
              {{ t('contacts.businessDialog.provenance', {
                methods: record.methods.length
                  ? record.methods.map(sourceLabel).join(' · ')
                  : t('contacts.businessDialog.sourceUnknown'),
              }) }}
            </p>
            <p>
              {{ t('contacts.businessDialog.contactUpdated', {
                date: formattedDate(record.meta.contactUpdatedAt || record.meta.mapsEnrichedAt),
              }) }}
            </p>
          </footer>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.business-dialog {
  overflow: hidden;
  border: 1px solid var(--rule-strong);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-3);
}

.business-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-5) var(--s-6);
  border-bottom: 1px solid var(--ink-rule);
  background: var(--ink);
  color: var(--ink-fg);
}

.business-dialog__identity {
  min-width: 0;
}

.business-dialog__eyebrow,
.record-section__head p {
  margin: 0 0 var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.business-dialog__eyebrow {
  color: var(--ink-fg-dim);
}

.business-dialog__head h2 {
  max-width: 28ch;
  margin: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-display);
  font-size: var(--t-xl);
  line-height: 1.15;
}

.business-dialog__identity-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

.business-dialog__identity-row code {
  color: var(--ink-fg-dim);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.business-dialog__close {
  flex: none;
  color: var(--ink-fg);
}

.business-dialog__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-6);
  border-bottom: 1px solid var(--rule);
  background: var(--surface-sunken);
}

.business-dialog__profile-action {
  margin-left: auto;
}

.business-dialog__body {
  padding: var(--s-5) var(--s-6) var(--s-6) !important;
}

.business-dialog__loading,
.business-dialog__error {
  display: flex;
  align-items: flex-start;
  gap: var(--s-4);
  min-height: 15rem;
  padding: var(--s-6);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface-sunken);
}

.business-dialog__loading {
  align-items: center;
  justify-content: center;
}

.business-dialog__loading-mark {
  width: 2rem;
  height: 2rem;
  border: 3px solid var(--rule-strong);
  border-top-color: var(--celeste-deep);
  border-radius: var(--r-full);
  animation: dialog-spin 800ms linear infinite;
}

.business-dialog__loading p,
.business-dialog__error p {
  max-width: 56ch;
  margin: var(--s-1) 0 var(--s-4);
  color: var(--text-muted);
}

.record-section {
  min-width: 0;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.record-section + .record-section {
  margin-top: var(--s-4);
}

.record-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-4);
  border-bottom: 1px solid var(--rule);
  background: var(--surface-sunken);
}

.record-section__head p {
  color: var(--text-muted);
}

.record-section__head h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-lg);
  line-height: 1.2;
}

.record-section__date {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.record-section--metrics {
  margin-bottom: var(--s-5);
}

.metric-grid {
  display: grid;
  grid-template-columns: 1.5fr repeat(5, minmax(6.2rem, 1fr));
  margin: 0;
}

.metric-grid > div {
  min-width: 0;
  padding: var(--s-4);
  border-right: 1px solid var(--rule);
}

.metric-grid > div:last-child {
  border-right: 0;
}

.metric-grid dt,
.field-grid dt {
  margin-bottom: var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.metric-grid dd,
.field-grid dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.metric-grid > div:not(:first-child) dd {
  font-family: var(--font-mono);
  font-size: var(--t-lg);
  font-weight: 650;
}

.business-dialog__columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-5);
  align-items: start;
}

.business-dialog__column {
  min-width: 0;
}

.evidence-list,
.field-grid,
.registry-stack {
  display: grid;
}

.evidence-row {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--rule);
}

.evidence-row:last-child {
  border-bottom: 0;
}

.evidence-row > .v-icon {
  margin-top: 2px;
  color: var(--text-muted);
}

.evidence-row a {
  overflow-wrap: anywhere;
  color: var(--celeste-deep);
  font-weight: 650;
  text-decoration: none;
}

.evidence-row a:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.evidence-row p,
.evidence-row__source {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 400 !important;
}

.evidence-row__source {
  display: inline-block;
}

.field-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.field-grid > div {
  min-width: 0;
  padding: var(--s-4);
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}

.field-grid > div:nth-child(even) {
  border-right: 0;
}

.field-grid > div:nth-last-child(-n + 2) {
  border-bottom: 0;
}

.plain-list,
.category-list {
  display: grid;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.plain-list li + li {
  padding-top: var(--s-2);
  border-top: 1px solid var(--rule);
}

.category-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-3);
  align-items: start;
}

.record-section__empty {
  margin: 0;
  padding: var(--s-5);
  color: var(--text-muted);
}

.registry-record {
  padding: var(--s-4);
  border-bottom: 1px solid var(--rule);
}

.registry-record:last-child {
  border-bottom: 0;
}

.registry-record header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.registry-record strong {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
}

.registry-record p {
  margin: var(--s-3) 0 var(--s-1);
  font-weight: 650;
}

.registry-record small {
  color: var(--text-muted);
}

.business-dialog__foot {
  display: flex;
  justify-content: space-between;
  gap: var(--s-4);
  margin-top: var(--s-5);
  padding-top: var(--s-4);
  border-top: 1px solid var(--rule);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.business-dialog__foot p {
  margin: 0;
}

@keyframes dialog-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .business-dialog__loading-mark { animation: none; }
}

@media (max-width: 960px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-grid > div {
    border-bottom: 1px solid var(--rule);
  }

  .metric-grid > div:nth-child(3n) {
    border-right: 0;
  }

  .metric-grid > div:nth-last-child(-n + 3) {
    border-bottom: 0;
  }

  .business-dialog__columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 600px) {
  .business-dialog__head,
  .business-dialog__actions,
  .business-dialog__body {
    padding-right: var(--s-4) !important;
    padding-left: var(--s-4) !important;
  }

  .business-dialog__actions > .v-btn {
    flex: 1 1 auto;
  }

  .business-dialog__profile-action {
    flex-basis: 100% !important;
    margin-left: 0;
  }

  .metric-grid,
  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .metric-grid > div,
  .field-grid > div {
    border-right: 0;
    border-bottom: 1px solid var(--rule);
  }

  .metric-grid > div:last-child,
  .field-grid > div:last-child {
    border-bottom: 0;
  }

  .business-dialog__foot {
    flex-direction: column;
  }
}
</style>
