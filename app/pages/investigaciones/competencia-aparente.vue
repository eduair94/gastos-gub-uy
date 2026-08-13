<script setup lang="ts">
/**
 * Investigación propia: cuánta competencia hay realmente en un llamado competitivo.
 *
 * Dos hallazgos sobre la misma fuente (el bloque "Proveedores participantes" de cada ficha,
 * raspado a `call_bidders`): llamados con una sola oferta, y oferentes que compiten entre sí
 * compartiendo teléfono o domicilio. Datos y copy en ~/data/investigaciones-competencia.
 *
 * La sección "lo que no se puede medir" no es un descargo: es el hallazgo que evitó publicar
 * un 93,8% falso de la Intendencia de Montevideo, y va en la página con el mismo peso.
 */
import { invContent } from '~/data/investigaciones'
import {
  ARTIFACT_CHECK,
  COVERAGE,
  OUTLIER,
  PAIRS,
  PAIR_CALLS,
  PAIR_CALLS_BOTH_WON,
  SHARED_BUYERS,
  SOLE_BY_METHOD,
  SOLE_RATE_BY_METHOD,
  SOLE_TOP,
  SOLE_TOTAL_UYU_SIN_ATIPICO,
  competenciaContent,
} from '~/data/investigaciones-competencia'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => invContent(locale.value))
const cx = computed(() => competenciaContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: cx.value.title },
])

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/competencia-aparente',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': cx.value.title,
      'description': cx.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd,
  ],
}))

/** Los nombres vienen en mayúsculas desde el registro; se bajan para poder leerlos. */
const titn = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ').map(w => w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w).join(' ')

const nf = computed(() => new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'es-UY'))
const pct = (x: number) => `${(100 * x).toFixed(1).replace('.', locale.value === 'en' ? '.' : ',')} %`

/** Un renglón por par, con el vínculo que lo hizo entrar y su saldo de llamados. */
const pairRows = computed(() => PAIRS.map(p => ({
  ...p,
  nameA: titn(p.a.name),
  nameB: titn(p.b.name),
  bothWon: p.calls.filter(k => k.wonA && k.wonB).length,
  uyu: p.calls.reduce((s, k) => s + k.uyu, 0),
})))

/** Los 24 llamados desplegados, ordenados por monto para que el lector empiece por lo grande. */
const pairCalls = computed(() => PAIRS
  .flatMap(p => p.calls.map(k => ({
    ...k,
    firms: `${titn(p.a.name)} + ${titn(p.b.name)}`,
    who: k.wonA && k.wonB ? cx.value.bothWon : (k.wonA || k.wonB) ? cx.value.oneWon : cx.value.noneWon,
    both: k.wonA && k.wonB,
  })))
  .sort((a, b) => b.uyu - a.uyu))

/** Segunda capa: el organismo donde el par coincide con más plata. */
const sharedRows = computed(() => SHARED_BUYERS.map(g => ({
  ...g,
  nameA: titn(g.na),
  nameB: titn(g.nb),
  top: g.shared[0],
  topTotal: (g.shared[0]?.aUyu ?? 0) + (g.shared[0]?.bUyu ?? 0),
})).sort((a, b) => b.topTotal - a.topTotal))

const methodRows = computed(() => SOLE_RATE_BY_METHOD.map((m) => {
  const amount = SOLE_BY_METHOD.find(x => x.method === m.method)?.uyu ?? 0
  return { ...m, amount, share: m.probed > 0 ? m.sole / m.probed : 0 }
}))

const heroTiles = computed(() => cx.value.tiles.map(t2 => ({ value: t2.n, label: t2.l, sub: t2.s })))

const pairColumns = computed(() => [
  { key: 'pair', label: cx.value.colSupplier, primary: true, minWidth: '220px' },
  { key: 'link', label: cx.value.paresColLink },
  { key: 'calls', label: cx.value.paresColCalls, align: 'end' as const, mono: true },
  { key: 'bothWon', label: cx.value.paresColBoth, align: 'end' as const, mono: true },
  { key: 'uyu', label: cx.value.colAmount, align: 'end' as const },
])

const pairCallColumns = computed(() => [
  { key: 'id', label: cx.value.colCall },
  { key: 'buyer', label: cx.value.colBuyer },
  { key: 'firms', label: cx.value.colSupplier, primary: true, minWidth: '220px' },
  { key: 'bidders', label: cx.value.colBidders, align: 'end' as const, mono: true },
  { key: 'uyu', label: cx.value.colAmount, align: 'end' as const },
  { key: 'who', label: cx.value.colWho },
])

const sharedColumns = computed(() => [
  { key: 'pair', label: cx.value.colPair, primary: true, minWidth: '220px' },
  { key: 'sharedCount', label: cx.value.colSharedOrgs, align: 'end' as const, mono: true },
  { key: 'topBuyer', label: cx.value.colTopOrg },
  { key: 'topTotal', label: cx.value.colBilledPair, align: 'end' as const },
])

const methodColumns = computed(() => [
  { key: 'method', label: cx.value.colMethod, primary: true },
  { key: 'probed', label: cx.value.colProbed, align: 'end' as const, mono: true },
  { key: 'sole', label: cx.value.colSole, align: 'end' as const, mono: true },
  { key: 'share', label: cx.value.colShare, align: 'end' as const, mono: true },
  { key: 'amount', label: cx.value.colAmount, align: 'end' as const },
])

const topColumns = computed(() => [
  { key: 'id', label: cx.value.colCall },
  { key: 'buyer', label: cx.value.colBuyer },
  { key: 'sup', label: cx.value.colSupplier, primary: true, minWidth: '200px' },
  { key: 'method', label: cx.value.colMethod },
  { key: 'uyu', label: cx.value.colAmount, align: 'end' as const },
])

const artifactColumns = computed(() => [
  { key: 'buyer', label: cx.value.artifactCol, primary: true },
  { key: 'probed', label: cx.value.artifactProbed, align: 'end' as const, mono: true },
  { key: 'multi', label: cx.value.artifactMulti, align: 'end' as const, mono: true },
  { key: 'withLosers', label: cx.value.artifactLosers, align: 'end' as const, mono: true },
  { key: 'measurable', label: cx.value.artifactVerdict },
])

const sourceGroups = [
  {
    title: 'Compras Estatales',
    items: [
      { label: 'Ficha con oferentes — compra 1270831 (Casinos)', url: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/1270831' },
      { label: 'Ficha donde participantes = adjudicatarios (IM)', url: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/i473855' },
    ],
  },
  {
    title: 'Registros · sitio',
    items: [
      { label: 'RUPE — Registro Único de Proveedores del Estado', url: 'https://www.comprasestatales.gub.uy/rupe/' },
      { label: 'Competencia por organismo (en vivo)', to: localePath('/analytics/competencia') },
    ],
  },
]

/** Los datos ya publicados que viajan dentro del mensaje a Uruguay Leaks. */
const leakFacts = computed(() => [
  `${nf.value.format(COVERAGE.sole)} de ${nf.value.format(COVERAGE.withBlock)} compras competitivas miradas (2025-2026) recibieron una sola oferta.`,
  `${PAIRS.length} pares de empresas comparten teléfono o domicilio y se presentaron juntas a ${PAIR_CALLS} llamados.`,
  `Fuente: bloque "Proveedores participantes" de comprasestatales.gub.uy + domicilio declarado en RUPE.`,
])
</script>

<template>
  <div class="inv">
    <InvCover
      :fields="[
        { label: t('inv.file.alcance'), value: cx.fileScope },
        { label: t('inv.file.organismos'), value: cx.fileOrg },
        { label: t('inv.file.periodo'), value: cx.filePeriod },
        { value: c.common.source },
      ]"
      :kicker="cx.kicker"
      :title="cx.title"
      :dek="cx.dek"
      :chips="cx.chips"
    />

    <!-- Hero -->
    <InvSection alt>
      <div class="inv-hero">
        <div>
          <p class="u-eyebrow">
            {{ cx.statHead }}
          </p>
          <MoneyAmount
            :amount="SOLE_TOTAL_UYU_SIN_ATIPICO"
            size="xl"
            align="start"
            :rule="false"
          />
          <p class="inv-hero__usd">
            {{ cx.statSub }}
          </p>
        </div>
        <InvTiles
          :columns="2"
          :items="heroTiles"
        />
      </div>
    </InvSection>

    <!-- Qué miramos -->
    <InvSection
      :eyebrow="cx.queTag"
      :title="cx.queTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.que"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Hallazgo 1 · pares -->
    <InvSection
      alt
      :eyebrow="cx.paresTag"
      :title="cx.paresTitle"
      :dek="cx.paresIntro"
    >
      <InvFinding
        :kicker="`${PAIRS.length} · ${PAIR_CALLS} · ${PAIR_CALLS_BOTH_WON}`"
        :title="cx.paresTitle"
        :body="cx.paresLead"
      />

      <InvLedger
        :columns="pairColumns"
        :rows="pairRows"
        :row-key="(row) => row.a.rut + row.b.rut"
        :min-width="720"
      >
        <template #cell:pair="{ row }">
          {{ row.nameA }}
          <span class="inv-flagword">+</span>
          {{ row.nameB }}
        </template>
        <template #cell:link="{ row }">
          <span class="chip-row">
            <span
              v-if="row.addr"
              class="inv-badge inv-badge--exc"
            >{{ cx.paresAddr }}</span>
            <span
              v-if="row.phone"
              class="inv-badge inv-badge--co"
            >{{ cx.paresPhone }}</span>
          </span>
          <span class="cmp-linkdet u-mono">
            {{ row.addr ? titn(row.addr) : `tel. ${row.phone}` }} —
            {{ cx.paresOwners(row.addr ? row.addrOwners : row.phoneOwners) }}
          </span>
        </template>
        <template #cell:calls="{ row }">
          {{ row.calls.length }}
        </template>
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            size="sm"
            compact
          />
        </template>
      </InvLedger>

      <h3 class="inv-subhead">
        {{ cx.paresCallsTitle }}
      </h3>
      <InvLedger
        :columns="pairCallColumns"
        :rows="pairCalls"
        :row-key="(row) => row.id + row.firms"
        :row-class="(row) => ({ rowflag: row.both })"
        :min-width="760"
      >
        <template #cell:id="{ row }">
          <NuxtLink :to="localePath(`/contracts/adjudicacion-${row.id}`)">
            {{ row.id }} →
          </NuxtLink>
        </template>
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            size="sm"
            compact
          />
        </template>
        <template #cell:who="{ row }">
          <span
            class="inv-badge"
            :class="row.both ? 'inv-badge--exc' : 'inv-badge--nd'"
          >{{ row.who }}</span>
        </template>
      </InvLedger>
    </InvSection>

    <!-- Hallazgo 1, segunda capa · el mismo comprador por dos puertas -->
    <InvSection
      :eyebrow="cx.grupoTag"
      :title="cx.grupoTitle"
      :dek="cx.grupoIntro"
    >
      <InvFinding
        :title="cx.grupoTitle"
        :body="cx.grupoLead"
      />

      <InvLedger
        :columns="sharedColumns"
        :rows="sharedRows"
        :row-key="(row) => row.ra + row.rb"
      >
        <template #cell:pair="{ row }">
          {{ row.nameA }}
          <span class="inv-flagword">+</span>
          {{ row.nameB }}
        </template>
        <template #cell:topBuyer="{ row }">
          {{ row.top?.buyer }}
          <span class="cmp-linkdet u-mono">
            {{ formatMoney(row.top?.aUyu ?? 0, 'UYU') }} / {{ row.top?.aN }} · {{ formatMoney(row.top?.bUyu ?? 0, 'UYU') }} / {{ row.top?.bN }}
          </span>
        </template>
        <template #cell:topTotal="{ row }">
          <MoneyAmount
            :amount="row.topTotal"
            size="sm"
            compact
          />
        </template>
      </InvLedger>

      <p class="inv-note inv-note--spaced">
        {{ cx.grupoNote }}
      </p>
    </InvSection>

    <!-- Hallazgo 2 · oferente único -->
    <InvSection
      alt
      :eyebrow="cx.unicoTag"
      :title="cx.unicoTitle"
      :dek="cx.unicoIntro"
    >
      <InvLedger
        :columns="methodColumns"
        :rows="methodRows"
        row-key="method"
      >
        <template #cell:probed="{ row }">
          {{ nf.format(row.probed) }}
        </template>
        <template #cell:sole="{ row }">
          {{ nf.format(row.sole) }}
        </template>
        <template #cell:share="{ row }">
          {{ pct(row.share) }}
        </template>
        <template #cell:amount="{ row }">
          <MoneyAmount
            :amount="row.amount"
            size="sm"
            compact
          />
        </template>
      </InvLedger>

      <p class="inv-note inv-note--spaced">
        {{ cx.unicoNote }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.topTitle }}
      </h3>
      <InvLedger
        :columns="topColumns"
        :rows="SOLE_TOP"
        row-key="id"
        :min-width="720"
      >
        <template #cell:id="{ row }">
          <NuxtLink :to="localePath(`/contracts/adjudicacion-${row.id}`)">
            {{ row.id }} →
          </NuxtLink>
        </template>
        <template #cell:sup="{ row }">
          {{ titn(row.sup) }}
        </template>
        <template #cell:method="{ row }">
          <span class="inv-badge inv-badge--nd">{{ row.method }}</span>
        </template>
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            size="sm"
            compact
          />
        </template>
      </InvLedger>
    </InvSection>

    <!-- Lo que no se puede medir -->
    <InvSection
      :eyebrow="cx.inmedibleTag"
      :title="cx.inmedibleTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.inmedible"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.artifactCol }}
      </h3>
      <InvLedger
        :columns="artifactColumns"
        :rows="ARTIFACT_CHECK"
        row-key="buyer"
        :row-class="(row) => ({ rowflag: !row.measurable })"
      >
        <template #cell:probed="{ row }">
          {{ nf.format(row.probed) }}
        </template>
        <template #cell:multi="{ row }">
          {{ nf.format(row.multi) }}
        </template>
        <template #cell:withLosers="{ row }">
          {{ nf.format(row.withLosers) }}
        </template>
        <template #cell:measurable="{ row }">
          <span
            class="inv-badge"
            :class="row.measurable ? 'inv-badge--co' : 'inv-badge--exc'"
          >{{ row.measurable ? cx.yes : cx.no }}</span>
        </template>
      </InvLedger>

      <div class="inv-balance">
        <div class="inv-balance__h">
          {{ cx.outlierTitle }}
        </div>
        <p>{{ cx.outlierP }}</p>
        <p class="cmp-outlier u-mono">
          <NuxtLink :to="localePath(`/contracts/adjudicacion-${OUTLIER.id}`)">
            {{ OUTLIER.id }} →
          </NuxtLink>
          · {{ OUTLIER.buyer }} · {{ nf.format(OUTLIER.qty) }} × {{ formatMoney(OUTLIER.unit, 'UYU') }}
          = {{ formatMoney(OUTLIER.uyu, 'UYU') }}
        </p>
      </div>
    </InvSection>

    <!-- Uruguay Leaks -->
    <InvSection alt>
      <LeakTip
        :subject="cx.title"
        path="/investigaciones/competencia-aparente"
        :facts="leakFacts"
      />
    </InvSection>

    <!-- Fuentes -->
    <InvSection
      :eyebrow="cx.sourcesTag"
      :title="cx.sourcesTitle"
      :dek="cx.sourcesP"
    >
      <InvSources :groups="sourceGroups" />
    </InvSection>

    <InvSection alt>
      <InvDisclaimer
        :title="c.common.disclaimerTitle"
        :paragraphs="c.common.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
/* El detalle del vínculo va bajo los badges: el badge dice QUÉ comparten, esta línea dice
   cuál es y cuántas empresas más lo declaran — que es lo que separa una pista de una central. */
.cmp-linkdet {
  display: block;
  margin-top: var(--s-1);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.cmp-outlier { font-size: 0.82rem; }
</style>
