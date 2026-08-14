<script setup lang="ts">
/**
 * La agenda del día.
 *
 * EL ORDEN DICE LA VERDAD ANTES QUE EL DATO. La página abre con el registro del día, que es lo
 * único con volumen diario real, y la segunda sección explica —con la medición delante— por qué
 * NO hay un resumen diario de prensa. Poner la prensa arriba prometería algo que el archivo no
 * puede sostener seis días de cada siete.
 *
 * LO ÚNICO DORADO ES EL MONTO ADJUDICADO. Ni el IPC, ni el desempleo, ni el dólar: no son gasto
 * público (app/DESIGN.md).
 *
 * NADA DE ESTA PÁGINA PIDE NADA A UN TERCERO EN LA RUTA DE REQUEST. El registro y la prensa salen
 * de nuestra base vía /api/agenda; los indicadores oficiales son una tabla curada con su fecha de
 * verificación, por los motivos que documenta app/data/agenda.ts.
 */
import {
  AGENDA_REVISED_ON,
  AGENDA_SOURCES,
  CALENDAR,
  EXPECTATIONS_PANELS,
  INDICATORS,
  REUSE,
  agendaContent,
} from '~/data/agenda'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => agendaContent(locale.value))
const isEn = computed(() => locale.value === 'en')
const lx = (v: { es: string, en: string }) => (isEn.value ? v.en : v.es)

const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Análisis', path: '/analytics' },
  { name: c.value.title },
])

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/analytics/agenda',
  kicker: c.value.kicker,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': c.value.title,
      'description': c.value.dek.slice(0, 155),
    },
    breadcrumbLd,
    orgLd,
  ],
}))

/* El tablero en vivo. `lazy` para que la prosa pinte sin esperar a Mongo. */
const { data: res, pending } = await useFetch<any>('/api/agenda', { lazy: true })
const registry = computed(() => res.value?.data?.registry ?? null)
const press = computed<any[]>(() => res.value?.data?.press ?? [])
const fx = computed<any[]>(() => res.value?.data?.fx ?? [])
const issues = computed<any[]>(() => res.value?.data?.issues ?? [])

const nf = computed(() => new Intl.NumberFormat(isEn.value ? 'en-US' : 'es-UY'))

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat(isEn.value ? 'en-GB' : 'es-UY', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`))
}

function fmtLong(iso: string | null): string {
  if (!iso) return c.value.indPendiente
  return new Intl.DateTimeFormat(isEn.value ? 'en-GB' : 'es-UY', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`))
}

function fmtStamp(v: string | Date): string {
  return new Intl.DateTimeFormat(isEn.value ? 'en-GB' : 'es-UY', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(v))
}

/**
 * La serie llega sin los días que no tuvieron NINGÚN registro, y son justamente los domingos: si
 * se dibujan sólo los días presentes, el fin de semana desaparece y la carga parece continua.
 * Se rellenan con cero para que el hueco se vea como lo que es.
 */
const series = computed(() => {
  const raw: { day: string, count: number, uyu: number }[] = registry.value?.series ?? []
  if (!raw.length) return []
  const byDay = new Map(raw.map(d => [d.day, d]))
  const end = new Date(`${raw[0]!.day}T00:00:00Z`)
  const out: { day: string, count: number, uyu: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 864e5)
    const key = d.toISOString().slice(0, 10)
    out.push(byDay.get(key) ?? { day: key, count: 0, uyu: 0 })
  }
  return out
})

const maxCount = computed(() => Math.max(1, ...series.value.map(d => d.count)))
const today = computed(() => registry.value?.today ?? null)
const hasToday = computed(() => (today.value?.count ?? 0) > 0)

const heroTiles = computed(() => [
  {
    value: hasToday.value ? nf.value.format(today.value.count) : '0',
    label: c.value.tileToday,
    sub: c.value.tileTodaySub,
  },
  {
    amount: today.value?.uyu ?? 0,
    label: c.value.tileAmount,
    sub: c.value.tileAmountSub,
    compact: true,
  },
  {
    value: registry.value?.weekdayAverage ? nf.value.format(registry.value.weekdayAverage) : '—',
    label: c.value.tileAvg,
    sub: c.value.tileAvgSub,
  },
  { value: '257', label: c.value.tilePress, sub: c.value.tilePressSub },
])

/* Últimas adjudicaciones */
const latestRows = computed<any[]>(() =>
  (registry.value?.latest ?? []).map((r: any) => ({
    ...r,
    when: fmtStamp(r.date),
    buyerLabel: r.buyer ?? '—',
    supplierLabel: r.supplier ?? '—',
  })),
)
const latestColumns = computed(() => [
  { key: 'buyerLabel', label: c.value.colBuyer, primary: true, minWidth: '240px' },
  { key: 'supplierLabel', label: c.value.colSupplier, minWidth: '240px' },
  { key: 'uyu', label: c.value.colAmount, align: 'end' as const },
  { key: 'when', label: c.value.colWhen, align: 'end' as const, mono: true, muted: true, nowrap: true },
])

/* Cadencia honesta */
const cadenceRows = computed(() =>
  c.value.cadence.map((r, i) => ({ key: `cad-${i}`, ...r })),
)
const cadenceColumns = computed(() => [
  { key: 'layer', label: c.value.cadenceCols.layer, primary: true, minWidth: '200px' },
  { key: 'rate', label: c.value.cadenceCols.rate, minWidth: '190px' },
  { key: 'why', label: c.value.cadenceCols.why, minWidth: '380px', muted: true },
])

/* Indicadores */
const indicatorRows = computed(() =>
  INDICATORS.map(i => ({
    key: i.key,
    name: lx(i.name),
    value: lx(i.value),
    reference: lx(i.reference),
    published: i.published ? fmtLong(i.published) : c.value.indPendiente,
    body: i.body,
    url: i.url,
    note: i.note ? lx(i.note) : null,
  })),
)
const indicatorColumns = computed(() => [
  { key: 'name', label: c.value.indCols.name, primary: true, minWidth: '230px' },
  { key: 'value', label: c.value.indCols.value, minWidth: '210px', mono: true },
  { key: 'reference', label: c.value.indCols.reference, minWidth: '170px', muted: true },
  { key: 'published', label: c.value.indCols.published, minWidth: '160px', muted: true },
  { key: 'body', label: c.value.indCols.body, minWidth: '200px', muted: true },
])

/* Calendario */
const todayIso = new Date().toISOString().slice(0, 10)
const calendarRows = computed(() =>
  CALENDAR.map(e => ({
    key: e.key,
    what: lx(e.what),
    date: e.date ? fmtLong(e.date) : lx(e.approx!),
    done: e.date ? e.date <= todayIso : false,
  })),
)
const calendarColumns = computed(() => [
  { key: 'what', label: c.value.calCols.what, primary: true, minWidth: '280px' },
  { key: 'date', label: c.value.calCols.date, minWidth: '260px' },
])

/* Reuso */
const reuseRows = computed(() =>
  REUSE.map(r => ({ key: r.key, level: lx(r.level), detail: lx(r.detail) })),
)
const reuseColumns = computed(() => [
  { key: 'level', label: c.value.reuseCols.level, primary: true, minWidth: '280px' },
  { key: 'detail', label: c.value.reuseCols.detail, minWidth: '460px', muted: true },
])

/* Expectativas */
const expectations = computed(() =>
  EXPECTATIONS_PANELS.map(p => ({
    key: p.key,
    source: lx(p.source),
    published: fmtLong(p.published),
    reference: lx(p.reference),
    universe: lx(p.universe),
    statistic: lx(p.statistic),
    values: lx(p.values),
    url: p.url,
  })),
)

const pressItems = computed(() =>
  press.value.map((n: any) => ({
    ...n,
    typeLabel: (c.value.pressTypes as Record<string, string>)[n.sourceType] ?? n.sourceType,
    when: n.publishedAt ? fmtLong(String(n.publishedAt).slice(0, 10)) : '',
  })),
)

const sourceGroups = computed(() =>
  AGENDA_SOURCES.map(g => ({
    title: g.key === 'oficiales' ? c.value.srcOficiales : c.value.srcReuso,
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
    </InvSection>

    <!-- El registro del día -->
    <InvSection
      :eyebrow="c.todayTag"
      :title="c.todayTitle"
      :dek="c.todayDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.today"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <SkeletonList
        v-if="pending && !registry"
        :rows="4"
      />

      <template v-else>
        <h3 class="ag-h">
          {{ c.seriesTitle }}
        </h3>
        <ul class="ag-bars">
          <li
            v-for="d in series"
            :key="d.day"
            class="ag-bars__i"
            :title="`${fmtDay(d.day)}: ${nf.format(d.count)}`"
          >
            <span
              class="ag-bars__bar"
              :style="{ height: `${Math.round((d.count / maxCount) * 100)}%` }"
            />
            <span class="ag-bars__n u-mono">{{ d.count }}</span>
            <span class="ag-bars__d">{{ fmtDay(d.day) }}</span>
          </li>
        </ul>

        <StatePanel
          v-if="!hasToday"
          :title="c.emptyToday"
          :body="c.emptyTodayBody"
          level="p"
          variant="inline"
        />

        <h3 class="ag-h">
          {{ c.latestTitle }}
        </h3>
        <InvLedger
          :columns="latestColumns"
          :rows="latestRows"
          row-key="id"
          :min-width="820"
        >
          <template #cell:buyerLabel="{ row }">
            <NuxtLink :to="localePath(`/contracts/${row.id}`)">
              {{ row.buyerLabel }}
            </NuxtLink>
          </template>
          <template #cell:uyu="{ row }">
            <MoneyAmount
              :amount="row.uyu"
              size="sm"
              compact
            />
          </template>
        </InvLedger>

        <p class="ag-cta">
          <NuxtLink :to="localePath('/contracts')">
            {{ c.exploreCta }} →
          </NuxtLink>
        </p>
      </template>

      <!-- La cotización sale de nuestra propia colección, así que va con el registro. -->
      <section
        v-if="fx.length"
        class="ag-card"
      >
        <h3 class="ag-h">
          {{ c.fxTitle }}
        </h3>
        <p class="ag-meta">
          {{ c.fxDek }}
        </p>
        <dl class="ag-fx">
          <div>
            <dt>{{ c.fxUsd }}</dt>
            <dd class="u-mono">
              {{ fx[0].usd?.toFixed(3) ?? '—' }}
            </dd>
          </div>
          <div>
            <dt>{{ c.fxUi }}</dt>
            <dd class="u-mono">
              {{ fx[0].ui?.toFixed(4) ?? '—' }}
            </dd>
          </div>
          <div>
            <dt>{{ c.indCols.reference }}</dt>
            <dd class="u-mono">
              {{ fx[0].month }}
            </dd>
          </div>
        </dl>
        <p class="inv-note">
          {{ c.fxNote }}
        </p>
      </section>
    </InvSection>

    <!-- Por qué no hay digest diario. La medición va delante del argumento. -->
    <InvSection
      alt
      :eyebrow="c.noDigestTag"
      :title="c.noDigestTitle"
      :dek="c.noDigestDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.noDigest"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvFinding
        :kicker="c.noDigestFindingKicker"
        :title="c.noDigestFindingTitle"
        :body="c.noDigestFinding"
      />

      <h3 class="ag-h">
        {{ c.cadenceTitle }}
      </h3>
      <InvLedger
        :columns="cadenceColumns"
        :rows="cadenceRows"
        row-key="key"
        :min-width="800"
      />
    </InvSection>

    <!-- Indicadores oficiales -->
    <InvSection
      :eyebrow="c.indTag"
      :title="c.indTitle"
      :dek="c.indDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.ind"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="indicatorColumns"
        :rows="indicatorRows"
        row-key="key"
        :min-width="1040"
      >
        <template #cell:name="{ row }">
          <a
            v-if="row.url"
            :href="row.url"
            target="_blank"
            rel="noopener noreferrer"
          >{{ row.name }}</a>
          <span v-else>{{ row.name }}</span>
        </template>
      </InvLedger>

      <ul class="ag-warn">
        <li
          v-for="row in indicatorRows.filter(r => r.note)"
          :key="row.key"
        >
          <strong>{{ row.name }}.</strong> {{ row.note }}
        </li>
      </ul>

      <p class="inv-note ag-rev">
        {{ c.revisedOn }} <time :datetime="AGENDA_REVISED_ON">{{ fmtLong(AGENDA_REVISED_ON) }}</time>
      </p>
    </InvSection>

    <!-- Expectativas: la misma lección que la página de encuestas -->
    <InvSection
      alt
      :eyebrow="c.expTag"
      :title="c.expTitle"
      :dek="c.expDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.exp"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <div class="ag-grid">
        <section
          v-for="e in expectations"
          :key="e.key"
          class="ag-card"
        >
          <h3 class="ag-h">
            {{ e.source }}
          </h3>
          <p class="ag-meta">
            {{ e.reference }} · {{ e.published }}
          </p>
          <p class="ag-body">
            {{ e.values }}
          </p>
          <dl class="ag-def">
            <dt>{{ c.expUniverse }}</dt>
            <dd>{{ e.universe }}</dd>
            <dt>{{ c.expStat }}</dt>
            <dd>{{ e.statistic }}</dd>
          </dl>
          <a
            class="ag-src"
            :href="e.url"
            target="_blank"
            rel="noopener noreferrer"
          >{{ e.source }} →</a>
        </section>
      </div>

      <ul class="ag-warn">
        <li
          v-for="(w, i) in c.expWarn"
          :key="i"
        >
          {{ w }}
        </li>
      </ul>

      <p class="ag-cta">
        <NuxtLink :to="localePath('/analytics/encuestas')">
          {{ c.expLink }} →
        </NuxtLink>
      </p>
    </InvSection>

    <!-- Calendario -->
    <InvSection
      :eyebrow="c.calTag"
      :title="c.calTitle"
      :dek="c.calDek"
    >
      <InvLedger
        :columns="calendarColumns"
        :rows="calendarRows"
        row-key="key"
        :min-width="620"
      >
        <template #cell:what="{ row }">
          <span class="chip-row chip-row--baseline">
            <span>{{ row.what }}</span>
            <span
              class="inv-badge"
              :class="row.done ? 'inv-badge--ok' : 'inv-badge--nd'"
            >{{ row.done ? c.calDone : c.calPending }}</span>
          </span>
        </template>
      </InvLedger>
    </InvSection>

    <!-- Prensa -->
    <InvSection
      alt
      :eyebrow="c.pressTag"
      :title="c.pressTitle"
      :dek="c.pressDek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.press"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <SkeletonList
        v-if="pending && !press.length"
        :rows="3"
      />
      <StatePanel
        v-else-if="!pressItems.length"
        :title="c.pressEmpty"
        :body="c.pressEmptyBody"
        level="p"
      />
      <ul
        v-else
        class="ag-news"
      >
        <li
          v-for="n in pressItems"
          :key="n.link"
          class="ag-news__i"
        >
          <span class="chip-row chip-row--baseline">
            <a
              :href="n.link"
              target="_blank"
              rel="noopener noreferrer"
            >{{ n.title }}</a>
            <!-- Prensa neutra; el Estado hablando de sí mismo, marcado; un partido, marcado fuerte:
                 es el ítem que más necesita distinguirse en una lista ordenada por fecha. -->
            <span
              class="inv-badge"
              :class="{
                'inv-badge--nd': n.sourceType === 'prensa',
                'inv-badge--co': n.sourceType === 'oficial',
                'inv-badge--exc': n.sourceType === 'partidaria',
              }"
            >{{ n.typeLabel }}</span>
          </span>
          <p class="ag-news__m">
            {{ n.source }} · {{ n.when }} ·
            <NuxtLink :to="localePath(`/buyers/${encodeURIComponent(n.buyerId)}`)">
              {{ n.buyerName }}
            </NuxtLink>
          </p>
        </li>
      </ul>

      <ul class="ag-warn">
        <li
          v-for="(w, i) in c.pressWarn"
          :key="i"
        >
          {{ w }}
        </li>
      </ul>
    </InvSection>

    <!-- El semanal -->
    <InvSection
      :eyebrow="c.weeklyTag"
      :title="c.weeklyTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.weekly"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <div
        v-if="issues.length"
        class="ag-grid"
      >
        <NuxtLink
          v-for="it in issues"
          :key="it.slug"
          class="ag-card ag-card--link"
          :to="localePath(`/blog/${it.slug}`)"
        >
          <h3 class="ag-h">
            {{ it.title }}
          </h3>
          <p class="ag-meta">
            {{ fmtLong(String(it.publishedAt).slice(0, 10)) }} · {{ nf.format(it.eligibleExpenseCount ?? 0) }} {{ c.weeklyProcesses }}
          </p>
        </NuxtLink>
      </div>
    </InvSection>

    <!-- Método y reuso -->
    <InvSection
      alt
      :eyebrow="c.reuseTag"
      :title="c.reuseTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.reuse"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="reuseColumns"
        :rows="reuseRows"
        row-key="key"
        :min-width="820"
      />
    </InvSection>

    <InvSection>
      <InvDisclaimer
        :title="c.readTitle"
        :paragraphs="c.read"
      />
    </InvSection>

    <InvSection
      alt
      :title="c.srcTitle"
    >
      <InvSources :groups="sourceGroups" />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
.ag-h {
  margin: var(--s-6) 0 var(--s-3);
  font-size: var(--t-md);
  line-height: 1.25;
}

.ag-meta {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.ag-body {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
}

/* Catorce barras. Los domingos valen cero y esa ausencia es parte del dato: sin ellos, la carga
   parecería continua. */
.ag-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(14, 1fr);
  gap: var(--s-1);
  align-items: end;
  border-bottom: 1px solid var(--rule);
  padding-bottom: var(--s-2);
}

.ag-bars__i {
  display: grid;
  grid-template-rows: 90px auto auto;
  gap: 2px;
  align-items: end;
  justify-items: center;
  min-width: 0;
}

.ag-bars__bar {
  width: 100%;
  min-height: 2px;
  align-self: end;
  background: var(--celeste);
  border-radius: var(--r-sm) var(--r-sm) 0 0;
}

.ag-bars__n {
  font-size: 0.6rem;
  color: var(--text-muted);
}

.ag-bars__d {
  font-size: 0.55rem;
  color: var(--text-muted);
  white-space: nowrap;
  transform: rotate(-45deg);
  transform-origin: center;
}

.ag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-5);
}

.ag-card {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-5);
  display: grid;
  gap: var(--s-3);
  align-content: start;
  margin-top: var(--s-5);

  &--link {
    margin-top: 0;
    text-decoration: none;
    color: inherit;
    transition: border-color var(--dur) var(--ease);
  }

  &--link:hover { border-color: var(--celeste); }
}

.ag-grid .ag-card { margin-top: 0; }

.ag-def {
  margin: 0;
  display: grid;
  gap: var(--s-1);
  font-size: var(--t-sm);
}

.ag-def dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ag-def dd {
  margin: 0 0 var(--s-2);
  line-height: 1.5;
}

.ag-fx {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-5);
}

.ag-fx dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ag-fx dd {
  margin: 0;
  font-size: var(--t-lg);
  font-weight: 600;
}

.ag-news {
  list-style: none;
  margin: var(--s-5) 0 0;
  padding: 0;
  display: grid;
  gap: var(--s-4);
  max-width: 80ch;
}

/* `min-width: 0` no es decorativo: un ítem de grilla trae `min-width: auto`, y con un nombre de
   organismo largo ("Centro de Rehabilitación Médico Ocupacional y Sicosocial") eso empujaba el
   documento 11px a 360px de ancho. Medido, no supuesto. */
.ag-news__i {
  border-top: 1px solid var(--rule);
  padding-top: var(--s-3);
  min-width: 0;
}

.ag-news__i a { overflow-wrap: anywhere; }

.ag-news__m {
  margin: var(--s-1) 0 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.ag-warn {
  margin: var(--s-5) 0 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: 78ch;
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.55;
}

.ag-cta {
  margin: var(--s-4) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
}

.ag-rev {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.ag-src {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
}

/* A 360px, catorce barras dan 22px cada una: las fechas no entran y las cifras tampoco.
   Se dejan las barras, que siguen contando la forma, y el detalle vive en el title. */
@media (max-width: 560px) {
  .ag-bars__i { grid-template-rows: 70px; }
  .ag-bars__n,
  .ag-bars__d { display: none; }
}
</style>
