<script setup lang="ts">
/**
 * Las encuestas de opinión, con su ficha técnica.
 *
 * EL ORDEN DE LA PÁGINA ES EL ARGUMENTO. Primero qué es esto y qué no es; después la divergencia
 * entre casas, que es el hallazgo; después el registro completo; y recién entonces el resto. Poner
 * la tabla primero convertiría la página en un tablero de "cómo va el gobierno", que es
 * exactamente lo que no es.
 *
 * NADA DE ESTO VA EN ORO. El oro es dinero y sólo dinero (app/DESIGN.md). Acá no hay un peso.
 *
 * La copia y los datos viven en app/data/encuestas.ts, no en los locales JSON, por la misma razón
 * que las investigaciones: es prosa larga y bilingüe, y meterla en los JSON produce cientos de
 * líneas de churn cada vez que se corrige una coma.
 */
import type { Poll } from '~/data/encuestas'
import {
  BREAKDOWNS,
  EXCLUSIONS,
  EXPECTATIONS,
  HISTORIC_CIFRA,
  HOUSE_CLAIMS,
  MAIN_PROBLEM,
  MINISTERS,
  MODES,
  MONTHS_18,
  ORSI_IMAGE,
  ORSI_IMAGE_SOURCE,
  POLLS,
  POLL_SOURCES,
  REVISED_ON,
  UNIVERSES,
  WEIGHTS,
  WINDOW_KEYS,
  balance,
  pollContent,
  windowSpread,
} from '~/data/encuestas'

const { locale, t } = useI18n()
const c = computed(() => pollContent(locale.value))
const isEn = computed(() => locale.value === 'en')
const lx = (v: { es: string, en: string }) => (isEn.value ? v.en : v.es)

const orgLd = useOrgLd()
const personLd = usePersonLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Análisis', path: '/analytics' },
  { name: c.value.title },
])

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/analytics/encuestas',
  type: 'article',
  kicker: c.value.kicker,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': c.value.title,
      'description': c.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
      'dateModified': REVISED_ON,
    },
    breadcrumbLd,
  ],
}))

/* ------------------------------------------------------------------ */
/* Fechas y formato                                                    */
/* ------------------------------------------------------------------ */

/** Rango de campo en una línea. La fecha de campo manda en toda la página. */
function fieldRange(p: { fieldStart: string, fieldEnd: string }): string {
  const fmt = new Intl.DateTimeFormat(isEn.value ? 'en-GB' : 'es-UY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const a = fmt.format(new Date(`${p.fieldStart}T00:00:00Z`))
  const b = fmt.format(new Date(`${p.fieldEnd}T00:00:00Z`))
  return `${a} → ${b}`
}

function shortField(p: { fieldStart: string, fieldEnd: string }): string {
  const fmt = new Intl.DateTimeFormat(isEn.value ? 'en-GB' : 'es-UY', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const yr = p.fieldEnd.slice(0, 4)
  return `${fmt.format(new Date(`${p.fieldStart}T00:00:00Z`))} – ${fmt.format(new Date(`${p.fieldEnd}T00:00:00Z`))} ${yr}`
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat(isEn.value ? 'en-GB' : 'es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`))
}

/** El saldo lleva signo explícito: un −27 sin signo se lee como 27. */
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

const houseName = (h: Poll['house']) => (h === 'Usina' ? 'Usina de Percepción Ciudadana' : h)
const unitLabel = (u: Poll['unit']) => (u === 'gobierno' ? c.value.unitGob : c.value.unitPres)

/* ------------------------------------------------------------------ */
/* Portada                                                             */
/* ------------------------------------------------------------------ */

const spread = windowSpread()
const houseCount = new Set(POLLS.map(p => p.house)).size

const heroTiles = computed(() => [
  { value: String(houseCount), label: c.value.tiles.houses, sub: c.value.tiles.housesSub },
  { value: String(POLLS.length), label: c.value.tiles.polls, sub: c.value.tiles.pollsSub },
  { value: `${spread.min}% – ${spread.max}%`, label: c.value.tiles.spread, sub: c.value.tiles.spreadSub },
  { value: '0', label: c.value.tiles.vote, sub: c.value.tiles.voteSub },
])

/* ------------------------------------------------------------------ */
/* La ventana de once semanas                                          */
/* ------------------------------------------------------------------ */

const windowRows = computed(() =>
  WINDOW_KEYS
    .map(k => POLLS.find(p => p.key === k)!)
    .sort((a, b) => a.fieldEnd.localeCompare(b.fieldEnd))
    .map(p => ({
      ...p,
      houseLabel: houseName(p.house),
      field: shortField(p),
      modeLabel: lx(MODES[p.mode]),
      saldo: balance(p),
    })),
)

const windowColumns = computed(() => [
  { key: 'houseLabel', label: c.value.col.house, primary: true, minWidth: '190px' },
  { key: 'field', label: c.value.col.field, minWidth: '160px', muted: true },
  { key: 'n', label: c.value.col.n, align: 'end' as const, mono: true },
  { key: 'modeLabel', label: c.value.col.mode, minWidth: '210px', muted: true },
  { key: 'approve', label: c.value.col.approve, align: 'end' as const, mono: true },
  { key: 'middle', label: c.value.col.middle, align: 'end' as const, mono: true },
  { key: 'disapprove', label: c.value.col.disapprove, align: 'end' as const, mono: true },
  { key: 'saldo', label: c.value.col.balance, align: 'end' as const, mono: true },
])

/* ------------------------------------------------------------------ */
/* El registro completo                                                */
/* ------------------------------------------------------------------ */

const allRows = computed(() =>
  [...POLLS]
    .sort((a, b) => b.fieldEnd.localeCompare(a.fieldEnd))
    .map(p => ({
      ...p,
      houseLabel: houseName(p.house),
      unitLabel: unitLabel(p.unit),
      field: fieldRange(p),
      modeLabel: lx(MODES[p.mode]),
      universeLabel: lx(UNIVERSES[p.universe]),
      weightLabel: lx(WEIGHTS[p.weighting]),
      marginLabel: p.margin ?? c.value.nd,
      questionLabel: p.questionPublished ? c.value.questionYes : c.value.ndF,
      saldo: balance(p),
      // El desglose del bloque intermedio y la nota de la fila viajan juntos al pie de la tabla:
      // el desglose es lo que evita que un "23" de una casa se lea igual que el "23" de otra.
      noteText: [
        p.middleSplit ? `${c.value.col.middle}: ${lx(p.middleSplit)}.` : null,
        p.note ? lx(p.note) : null,
      ].filter(Boolean).join(' '),
    })),
)

const allColumns = computed(() => [
  { key: 'houseLabel', label: c.value.col.house, primary: true, minWidth: '180px' },
  { key: 'unitLabel', label: c.value.col.unit, minWidth: '110px' },
  { key: 'field', label: c.value.col.field, minWidth: '200px', muted: true },
  { key: 'n', label: c.value.col.n, align: 'end' as const, mono: true },
  { key: 'modeLabel', label: c.value.col.mode, minWidth: '220px', muted: true },
  { key: 'universeLabel', label: c.value.col.universe, minWidth: '260px', muted: true },
  { key: 'marginLabel', label: c.value.col.margin, minWidth: '130px', mono: true },
  { key: 'weightLabel', label: c.value.col.weighting, minWidth: '240px', muted: true },
  { key: 'approve', label: c.value.col.approve, align: 'end' as const, mono: true },
  { key: 'middle', label: c.value.col.middle, align: 'end' as const, mono: true },
  { key: 'disapprove', label: c.value.col.disapprove, align: 'end' as const, mono: true },
  { key: 'saldo', label: c.value.col.balance, align: 'end' as const, mono: true },
  { key: 'questionLabel', label: c.value.col.question, minWidth: '120px', muted: true },
])

/* ------------------------------------------------------------------ */
/* Series por casa                                                     */
/* ------------------------------------------------------------------ */

/** Una casa por gráfico. El componente no admite mezclar: es la regla, no una preferencia. */
const seriesByHouse = computed(() => {
  const order: Poll['house'][] = ['Cifra', 'Factum', 'Equipos', 'Opción']
  return order.map(h => ({
    house: h,
    label: h === 'Opción' ? `${h} — ${c.value.unitPres}` : h,
    points: POLLS
      .filter(p => p.house === h && p.unit === 'presidente')
      .sort((a, b) => a.fieldEnd.localeCompare(b.fieldEnd))
      .map(p => ({
        date: p.fieldEnd,
        approve: p.approve,
        disapprove: p.disapprove,
        label: shortField(p),
        hollow: p.mode === 'mixta',
      })),
  })).filter(s => s.points.length > 0)
})

/* ------------------------------------------------------------------ */
/* Tablas menores                                                      */
/* ------------------------------------------------------------------ */

const ministerRows = computed(() =>
  MINISTERS.rows.map(r => ({ ...r, officeLabel: lx(r.office) })),
)
const ministerColumns = computed(() => [
  { key: 'name', label: c.value.col.minister, primary: true, minWidth: '190px' },
  { key: 'officeLabel', label: c.value.col.office, minWidth: '170px', muted: true },
  { key: 'approve', label: c.value.col.approve, align: 'end' as const, mono: true },
  { key: 'middle', label: c.value.col.middle, align: 'end' as const, mono: true },
  { key: 'disapprove', label: c.value.col.disapprove, align: 'end' as const, mono: true },
  { key: 'noOpinion', label: c.value.col.noOpinion, align: 'end' as const, mono: true },
])

const histRows = computed(() =>
  HISTORIC_CIFRA.map(r => ({
    ...r,
    whenLabel: lx(r.when),
    disapproveLabel: r.disapprove == null ? c.value.nd : String(r.disapprove),
    netLabel: r.disapprove == null ? '—' : signed(r.approve - r.disapprove),
    levelLabel: r.level === 'ficha' ? c.value.histLevelFicha : c.value.histLevelCitada,
  })),
)
const histColumns = computed(() => [
  { key: 'president', label: c.value.col.president, primary: true, minWidth: '190px' },
  { key: 'whenLabel', label: c.value.col.when, minWidth: '190px', muted: true },
  { key: 'approve', label: c.value.col.approve, align: 'end' as const, mono: true },
  { key: 'disapproveLabel', label: c.value.col.disapprove, align: 'end' as const, mono: true },
  { key: 'netLabel', label: c.value.col.balance, align: 'end' as const, mono: true },
  { key: 'levelLabel', label: c.value.col.level, minWidth: '180px', muted: true },
])

const months18Rows = computed(() =>
  MONTHS_18.map(r => ({
    ...r,
    houseLabel: houseName(r.house),
    whenLabel: lx(r.when),
    marginLabel: r.margin ?? c.value.nd,
    net: r.approve - r.disapprove,
  })),
)
const months18Columns = computed(() => [
  { key: 'houseLabel', label: c.value.col.house, primary: true, minWidth: '150px' },
  { key: 'whenLabel', label: c.value.col.when, minWidth: '230px', muted: true },
  { key: 'n', label: c.value.col.n, align: 'end' as const, mono: true },
  { key: 'marginLabel', label: c.value.col.margin, minWidth: '130px', mono: true },
  { key: 'approve', label: c.value.col.approve, align: 'end' as const, mono: true },
  { key: 'disapprove', label: c.value.col.disapprove, align: 'end' as const, mono: true },
  { key: 'net', label: c.value.col.balance, align: 'end' as const, mono: true },
])

const expectationRows = computed(() =>
  EXPECTATIONS.rows.map((r, i) => ({ key: `exp-${i}`, label: lx(r.label), value: r.value })),
)
const expectationColumns = computed(() => [
  { key: 'label', label: c.value.col.indicator, primary: true, minWidth: '240px' },
  { key: 'value', label: c.value.col.value, align: 'end' as const, mono: true },
])

const exclusionRows = computed(() =>
  EXCLUSIONS.map((e, i) => ({ key: `ex-${i}`, what: lx(e.what), why: lx(e.why) })),
)
const exclusionColumns = computed(() => [
  { key: 'what', label: c.value.critExclWhat, primary: true, minWidth: '260px' },
  { key: 'why', label: c.value.critExclWhy, minWidth: '420px', muted: true },
])

const breakdowns = computed(() =>
  BREAKDOWNS.map((b) => {
    const poll = POLLS.find(p => p.key === b.pollKey)!
    return {
      ...b,
      houseLabel: houseName(b.house),
      field: fieldRange(poll),
      n: poll.n,
      texts: b.lines.map(l => lx(l)),
    }
  }),
)

const mainProblem = computed(() =>
  MAIN_PROBLEM.map(m => ({
    key: m.house,
    houseLabel: houseName(m.house),
    whenLabel: lx(m.when),
    n: m.n,
    result: lx(m.result),
  })),
)

const claims = computed(() =>
  HOUSE_CLAIMS.map(h => ({
    key: h.house,
    houseLabel: houseName(h.house),
    whenLabel: lx(h.when),
    quote: lx(h.quote),
    url: h.url,
  })),
)

/** La antipatía de octubre de 2025 no es un número en la fuente: es «menos de un tercio». */
const orsiImage = computed(() =>
  ORSI_IMAGE.map((r, i) => ({
    key: `oi-${i}`,
    when: lx(r.when),
    pro: r.pro,
    anti: typeof r.anti === 'number' ? `${r.anti}` : lx(r.anti),
  })),
)

const sourceGroups = computed(() =>
  POLL_SOURCES.map(g => ({
    title: g.key === 'casas' ? c.value.srcCasas : c.value.srcCriterio,
    items: g.items,
  })),
)
</script>

<template>
  <div class="inv">
    <InvCover
      tone="celeste"
      :kicker="c.kicker"
      :title="c.title"
      :dek="c.dek"
      :chips="c.chips"
      :fields="[
        { label: t('inv.file.alcance'), value: c.fileScope },
        { label: t('inv.file.periodo'), value: c.filePeriod },
        { value: c.fileSource },
      ]"
    />

    <!-- Qué es y qué no es. Va primero porque decide cómo se lee todo lo demás. -->
    <InvSection
      alt
      :eyebrow="c.introTag"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.intro"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvTiles
        :columns="4"
        :items="heroTiles"
      />

      <p class="inv-note en-rev">
        {{ c.revisedOn }}: <time :datetime="REVISED_ON">{{ longDate(REVISED_ON) }}</time> · {{ c.ownCalc }}
      </p>
    </InvSection>

    <!-- El hallazgo -->
    <InvSection
      :eyebrow="c.divTag"
      :title="c.divTitle"
      :dek="c.divDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.div"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="windowColumns"
        :rows="windowRows"
        row-key="key"
        :min-width="900"
      >
        <template #cell:middle="{ row }">
          {{ row.middle ?? c.nd }}
        </template>
        <template #cell:saldo="{ row }">
          {{ signed(row.saldo) }}
        </template>
      </InvLedger>

      <InvFinding
        :kicker="c.divFindingKicker"
        :title="c.divFindingTitle"
        :body="c.divFinding"
      />

      <ul class="en-warn">
        <li
          v-for="(w, i) in c.divWarn"
          :key="i"
        >
          {{ w }}
        </li>
      </ul>
    </InvSection>

    <!-- El registro completo -->
    <InvSection
      alt
      :eyebrow="c.tableTag"
      :title="c.tableTitle"
      :dek="c.tableDek"
    >
      <p class="inv-note">
        {{ c.tableNote }}
      </p>

      <InvLedger
        :columns="allColumns"
        :rows="allRows"
        row-key="key"
        :min-width="1500"
      >
        <template #cell:houseLabel="{ row }">
          <span class="chip-row chip-row--baseline">
            <a
              :href="row.source"
              target="_blank"
              rel="noopener noreferrer"
            >{{ row.houseLabel }}</a>
            <span
              v-if="row.viaPress"
              class="inv-badge inv-badge--nd"
              :title="c.viaPress"
            >~</span>
          </span>
        </template>
        <template #cell:middle="{ row }">
          {{ row.middle ?? c.nd }}
        </template>
        <template #cell:saldo="{ row }">
          {{ signed(row.saldo) }}
        </template>
      </InvLedger>

      <ul class="en-warn">
        <li
          v-for="row in allRows.filter(r => r.noteText)"
          :key="row.key"
        >
          <strong>{{ row.houseLabel }}, {{ row.field }}.</strong> {{ row.noteText }}
        </li>
      </ul>
    </InvSection>

    <!-- Por qué difieren -->
    <InvSection
      :eyebrow="c.whyTag"
      :title="c.whyTitle"
      :dek="c.whyDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.why"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
      <p class="inv-note">
        {{ c.whyNote }}
      </p>
    </InvSection>

    <!-- Series por casa -->
    <InvSection
      alt
      :eyebrow="c.seriesTag"
      :title="c.seriesTitle"
      :dek="c.seriesDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.series"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <div class="en-grid">
        <section
          v-for="s in seriesByHouse"
          :key="s.house"
          class="en-card"
        >
          <h3 class="en-card__h">
            {{ s.label }}
          </h3>
          <PollSeries
            :points="s.points"
            :label="s.label"
            :approve-label="c.seriesApprove"
            :disapprove-label="c.seriesDisapprove"
          />
        </section>
      </div>

      <ul class="en-warn">
        <li
          v-for="(w, i) in c.seriesWarn"
          :key="i"
        >
          {{ w }}
        </li>
      </ul>
    </InvSection>

    <!-- Causalidad -->
    <InvSection
      :eyebrow="c.causaTag"
      :title="c.causaTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.causa"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Qué no mide una encuesta -->
    <InvSection
      alt
      :eyebrow="c.limitsTag"
      :title="c.limitsTitle"
      :dek="c.limitsDek"
    >
      <dl class="en-limits">
        <template
          v-for="(l, i) in c.limits"
          :key="i"
        >
          <dt>{{ l.t }}</dt>
          <dd>{{ l.d }}</dd>
        </template>
      </dl>
    </InvSection>

    <!-- Cortes por voto -->
    <InvSection
      :eyebrow="c.cutsTag"
      :title="c.cutsTitle"
      :dek="c.cutsDek"
    >
      <p class="inv-prose">
        {{ c.cuts }}
      </p>

      <div class="en-grid">
        <section
          v-for="b in breakdowns"
          :key="b.key"
          class="en-card"
        >
          <h3 class="en-card__h">
            {{ b.houseLabel }}
          </h3>
          <p class="en-card__meta">
            {{ b.field }} · {{ b.n }} {{ c.col.n.toLowerCase() }}
          </p>
          <ul class="en-list">
            <li
              v-for="(line, i) in b.texts"
              :key="i"
            >
              {{ line }}
            </li>
          </ul>
          <a
            class="en-src"
            :href="b.source"
            target="_blank"
            rel="noopener noreferrer"
          >{{ b.houseLabel }} →</a>
        </section>
      </div>

      <p class="inv-note">
        {{ c.cutsWarn }}
      </p>
    </InvSection>

    <!-- Dirigentes. El rótulo de encargo va ARRIBA de la primera cifra. -->
    <InvSection
      alt
      :eyebrow="c.leadersTag"
      :title="c.leadersTitle"
      :dek="c.leadersDek"
    >
      <!-- La ausencia de la tabla ES el hallazgo de la sección, así que va con el peso de uno. -->
      <InvFinding
        :kicker="c.critExcl"
        :body="[c.leadersNoTable]"
      />

      <div class="inv-prose">
        <p
          v-for="(p, i) in c.leaders"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <section class="en-card en-card--flat">
        <h3 class="en-card__h">
          {{ c.leadersSerie }}
        </h3>
        <ul class="en-list">
          <li
            v-for="r in orsiImage"
            :key="r.key"
          >
            <span class="u-mono">{{ r.when }}</span> — {{ c.col.pro.toLowerCase() }} {{ r.pro }}, {{ c.col.anti.toLowerCase() }} {{ r.anti }}
          </li>
        </ul>
        <a
          class="en-src"
          :href="ORSI_IMAGE_SOURCE"
          target="_blank"
          rel="noopener noreferrer"
        >Cifra →</a>
      </section>

      <section class="en-card en-card--flat">
        <h3 class="en-card__h">
          Equipos
        </h3>
        <ul class="en-list">
          <li
            v-for="(p, i) in c.leadersEquipos"
            :key="i"
          >
            {{ p }}
          </li>
        </ul>
      </section>

      <ul class="en-warn">
        <li
          v-for="(w, i) in c.leadersWarn"
          :key="i"
        >
          {{ w }}
        </li>
      </ul>
    </InvSection>

    <!-- Ministros -->
    <InvSection
      :eyebrow="c.ministersTag"
      :title="c.ministersTitle"
      :dek="c.ministersDek"
    >
      <p class="inv-prose">
        {{ c.ministers }}
      </p>

      <InvLedger
        :columns="ministerColumns"
        :rows="ministerRows"
        row-key="name"
        :min-width="720"
      />

      <p class="inv-note">
        {{ c.ministersWarn }}
      </p>
    </InvSection>

    <!-- Comparación histórica -->
    <InvSection
      alt
      :eyebrow="c.histTag"
      :title="c.histTitle"
      :dek="c.histDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.hist"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="histColumns"
        :rows="histRows"
        row-key="president"
        :row-class="(r: any) => (r.level === 'citada' ? 'en-row--soft' : '')"
        :min-width="860"
      />

      <section class="en-card en-card--flat">
        <h3 class="en-card__h">
          {{ c.hist18Title }}
        </h3>
        <p class="en-card__meta">
          {{ c.hist18 }}
        </p>
        <InvLedger
          :columns="months18Columns"
          :rows="months18Rows"
          row-key="houseLabel"
          :min-width="760"
        >
          <template #cell:net="{ row }">
            {{ signed(row.net) }}
          </template>
        </InvLedger>
      </section>

      <section class="en-claims">
        <h3 class="en-card__h">
          {{ c.histClaimsTitle }}
        </h3>
        <p class="inv-note">
          {{ c.histClaims }}
        </p>
        <div
          v-for="cl in claims"
          :key="cl.key"
          class="en-claim"
        >
          <ReportedFigure
            :label="`${cl.houseLabel} · ${cl.whenLabel}`"
            :claim="`«${cl.quote}»`"
          />
          <a
            class="en-src"
            :href="cl.url"
            target="_blank"
            rel="noopener noreferrer"
          >{{ cl.houseLabel }} →</a>
        </div>
      </section>

      <p class="inv-note">
        {{ c.histWarn }}
      </p>
    </InvSection>

    <!-- Contexto -->
    <InvSection
      :eyebrow="c.ctxTag"
      :title="c.ctxTitle"
      :dek="c.ctxDek"
    >
      <p class="inv-prose">
        {{ c.ctx }}
      </p>

      <div class="en-grid">
        <section
          v-for="m in mainProblem"
          :key="m.key"
          class="en-card"
        >
          <h3 class="en-card__h">
            {{ m.houseLabel }}
          </h3>
          <p class="en-card__meta">
            {{ m.whenLabel }} · {{ m.n }} {{ c.col.n.toLowerCase() }}
          </p>
          <p class="en-card__body">
            {{ m.result }}
          </p>
        </section>
      </div>

      <section class="en-card en-card--flat">
        <h3 class="en-card__h">
          {{ c.expTitle }}
        </h3>
        <p class="en-card__meta">
          {{ c.expDek }}
        </p>
        <InvLedger
          :columns="expectationColumns"
          :rows="expectationRows"
          row-key="key"
          :min-width="420"
        />
      </section>
    </InvSection>

    <!-- Intención de voto: el módulo vacío es el hallazgo -->
    <InvSection
      alt
      :eyebrow="c.voteTag"
      :title="c.voteTitle"
    >
      <StatePanel
        :title="c.voteEmpty"
        :body="c.vote[0]"
        level="p"
      />
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.vote.slice(1)"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Criterio y exclusiones -->
    <InvSection
      :eyebrow="c.critTag"
      :title="c.critTitle"
      :dek="c.critDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.crit"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="en-card__h">
        {{ c.critExcl }}
      </h3>
      <InvLedger
        :columns="exclusionColumns"
        :rows="exclusionRows"
        row-key="key"
        :min-width="760"
      />
    </InvSection>

    <InvSection alt>
      <InvDisclaimer
        :title="c.readTitle"
        :paragraphs="c.read"
      />
    </InvSection>

    <InvSection
      :title="c.srcTitle"
      :dek="c.srcDek"
    >
      <InvSources :groups="sourceGroups" />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
.en-rev {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

/* Advertencias: mismo peso tipográfico que el cuerpo, color atenuado. No son notas al pie
   escondidas — varias de ellas son la razón por la que una cifra se puede leer. */
.en-warn {
  margin: var(--s-5) 0 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: 76ch;
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.55;
}

.en-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-5);
}

.en-card {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-5);
  display: grid;
  gap: var(--s-3);
  align-content: start;

  &--flat {
    margin-top: var(--s-5);
    background: var(--surface-sunken);
  }
}

.en-card__h {
  margin: 0;
  font-size: var(--t-md);
  line-height: 1.25;
}

.en-card__meta {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.en-card__body {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
}

.en-list {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-2);
  font-size: 0.95rem;
  line-height: 1.55;
}

.en-src {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
}

/* Los ocho límites del instrumento: el punto en negrita, la explicación debajo. */
.en-limits {
  margin: 0;
  max-width: 74ch;
  display: grid;
  gap: var(--s-2);
}

.en-limits dt {
  font-weight: 650;
  margin-top: var(--s-4);
}

.en-limits dd {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.en-claims {
  margin-top: var(--s-6);
  display: grid;
  gap: var(--s-3);
}

.en-claim {
  display: grid;
  gap: var(--s-2);
  justify-items: start;
}

/* Las cifras citadas sin ficha propia no se dibujan como las que sí la tienen. */
:deep(.en-row--soft) {
  color: var(--text-muted);
  font-style: italic;
}
</style>
