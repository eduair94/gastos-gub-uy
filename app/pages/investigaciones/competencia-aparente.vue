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
  SOLE_BY_METHOD,
  SOLE_RATE_BY_METHOD,
  SOLE_TOP,
  SOLE_TOTAL_UYU_SIN_ATIPICO,
  competenciaContent,
} from '~/data/investigaciones-competencia'

const { locale } = useI18n()
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

const methodRows = computed(() => SOLE_RATE_BY_METHOD.map((m) => {
  const amount = SOLE_BY_METHOD.find(x => x.method === m.method)?.uyu ?? 0
  return { ...m, amount, share: m.probed > 0 ? m.sole / m.probed : 0 }
}))

/** Los datos ya publicados que viajan dentro del mensaje a Uruguay Leaks. */
const leakFacts = computed(() => [
  `${nf.value.format(COVERAGE.sole)} de ${nf.value.format(COVERAGE.withBlock)} compras competitivas miradas (2025-2026) recibieron una sola oferta.`,
  `${PAIRS.length} pares de empresas comparten teléfono o domicilio y se presentaron juntas a ${PAIR_CALLS} llamados.`,
  `Fuente: bloque "Proveedores participantes" de comprasestatales.gub.uy + domicilio declarado en RUPE.`,
])
</script>

<template>
  <div class="inv">
    <!-- Cover -->
    <header class="inv-cover">
      <div class="u-container">
        <div class="inv-file">
          <span>ALCANCE&nbsp; <b>{{ cx.fileScope }}</b></span>
          <span>ORGANISMOS&nbsp; <b>{{ cx.fileOrg }}</b></span>
          <span>PERÍODO&nbsp; <b>{{ cx.filePeriod }}</b></span>
          <span>{{ c.common.source }}</span>
        </div>
        <p class="inv-kicker">
          {{ cx.kicker }}
        </p>
        <h1>{{ cx.title }}</h1>
        <p class="inv-dek">
          {{ cx.dek }}
        </p>
        <div class="inv-chips">
          <span
            v-for="ch in cx.chips"
            :key="ch"
            class="inv-chip"
          >{{ ch }}</span>
        </div>
      </div>
    </header>

    <!-- Hero -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
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
          <div class="inv-tiles inv-tiles--2">
            <div
              v-for="tl in cx.tiles"
              :key="tl.l"
              class="inv-tile"
            >
              <div class="inv-tile__n">
                {{ tl.n }}
              </div>
              <div class="inv-tile__l">
                {{ tl.l }}
              </div>
              <div class="inv-tile__s">
                {{ tl.s }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Qué miramos -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.queTag }}
          </p>
          <h2>{{ cx.queTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p
            v-for="(p, i) in cx.que"
            :key="i"
          >
            {{ p }}
          </p>
        </div>
      </div>
    </section>

    <!-- Hallazgo 1 · pares -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.paresTag }}
          </p>
          <h2>{{ cx.paresTitle }}</h2>
          <p>{{ cx.paresIntro }}</p>
        </div>

        <div class="inv-finding">
          <p class="inv-kicker">
            {{ PAIRS.length }} · {{ PAIR_CALLS }} · {{ PAIR_CALLS_BOTH_WON }}
          </p>
          <h3>{{ cx.paresTitle }}</h3>
          <p>{{ cx.paresLead }}</p>
        </div>

        <div class="inv-ledger u-scroll-x">
          <table>
            <thead>
              <tr>
                <th>{{ cx.colSupplier }}</th>
                <th>{{ cx.paresColLink }}</th>
                <th class="num">
                  {{ cx.paresColCalls }}
                </th>
                <th class="num">
                  {{ cx.paresColBoth }}
                </th>
                <th class="num">
                  {{ cx.colAmount }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in pairRows"
                :key="p.a.rut + p.b.rut"
              >
                <td class="sup">
                  {{ p.nameA }}
                  <span class="inv-flagword">+</span>
                  {{ p.nameB }}
                </td>
                <td :data-label="cx.paresColLink">
                  <span
                    v-if="p.addr"
                    class="inv-badge inv-badge--exc"
                  >{{ cx.paresAddr }}</span>
                  <span
                    v-if="p.phone"
                    class="inv-badge inv-badge--co"
                  >{{ cx.paresPhone }}</span>
                  <div class="cmp-linkdet u-mono">
                    {{ p.addr ? titn(p.addr) : `tel. ${p.phone}` }} —
                    {{ cx.paresOwners(p.addr ? p.addrOwners : p.phoneOwners) }}
                  </div>
                </td>
                <td
                  class="num mono"
                  :data-label="cx.paresColCalls"
                >
                  {{ p.calls.length }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.paresColBoth"
                >
                  {{ p.bothWon }}
                </td>
                <td
                  class="num"
                  :data-label="cx.colAmount"
                >
                  <MoneyAmount
                    :amount="p.uyu"
                    size="sm"
                    compact
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          class="inv-head"
          style="margin-top: var(--s-8);"
        >
          <h3>{{ cx.paresCallsTitle }}</h3>
        </div>
        <div class="inv-ledger u-scroll-x">
          <table>
            <thead>
              <tr>
                <th>{{ cx.colCall }}</th>
                <th>{{ cx.colBuyer }}</th>
                <th>{{ cx.colSupplier }}</th>
                <th class="num">
                  {{ cx.colBidders }}
                </th>
                <th class="num">
                  {{ cx.colAmount }}
                </th>
                <th>{{ cx.colWho }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="k in pairCalls"
                :key="k.id + k.firms"
                :class="{ rowflag: k.both }"
              >
                <td :data-label="cx.colCall">
                  <NuxtLink :to="localePath(`/contracts/adjudicacion-${k.id}`)">
                    {{ k.id }} →
                  </NuxtLink>
                </td>
                <td :data-label="cx.colBuyer">
                  {{ k.buyer }}
                </td>
                <td class="sup">
                  {{ k.firms }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.colBidders"
                >
                  {{ k.bidders }}
                </td>
                <td
                  class="num"
                  :data-label="cx.colAmount"
                >
                  <MoneyAmount
                    :amount="k.uyu"
                    size="sm"
                    compact
                  />
                </td>
                <td :data-label="cx.colWho">
                  <span
                    class="inv-badge"
                    :class="k.both ? 'inv-badge--exc' : 'inv-badge--nd'"
                  >{{ k.who }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Hallazgo 2 · oferente único -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.unicoTag }}
          </p>
          <h2>{{ cx.unicoTitle }}</h2>
          <p>{{ cx.unicoIntro }}</p>
        </div>

        <div class="inv-ledger u-scroll-x">
          <table>
            <thead>
              <tr>
                <th>{{ cx.colMethod }}</th>
                <th class="num">
                  {{ cx.colProbed }}
                </th>
                <th class="num">
                  {{ cx.colSole }}
                </th>
                <th class="num">
                  {{ cx.colShare }}
                </th>
                <th class="num">
                  {{ cx.colAmount }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in methodRows"
                :key="m.method"
              >
                <td class="sup">
                  {{ m.method }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.colProbed"
                >
                  {{ nf.format(m.probed) }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.colSole"
                >
                  {{ nf.format(m.sole) }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.colShare"
                >
                  {{ pct(m.share) }}
                </td>
                <td
                  class="num"
                  :data-label="cx.colAmount"
                >
                  <MoneyAmount
                    :amount="m.amount"
                    size="sm"
                    compact
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="inv-note">
          {{ cx.unicoNote }}
        </div>

        <div
          class="inv-head"
          style="margin-top: var(--s-8);"
        >
          <h3>{{ cx.topTitle }}</h3>
        </div>
        <div class="inv-ledger u-scroll-x">
          <table>
            <thead>
              <tr>
                <th>{{ cx.colCall }}</th>
                <th>{{ cx.colBuyer }}</th>
                <th>{{ cx.colSupplier }}</th>
                <th>{{ cx.colMethod }}</th>
                <th class="num">
                  {{ cx.colAmount }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in SOLE_TOP"
                :key="r.id"
              >
                <td :data-label="cx.colCall">
                  <NuxtLink :to="localePath(`/contracts/adjudicacion-${r.id}`)">
                    {{ r.id }} →
                  </NuxtLink>
                </td>
                <td :data-label="cx.colBuyer">
                  {{ r.buyer }}
                </td>
                <td class="sup">
                  {{ titn(r.sup) }}
                </td>
                <td :data-label="cx.colMethod">
                  <span class="inv-badge inv-badge--nd">{{ r.method }}</span>
                </td>
                <td
                  class="num"
                  :data-label="cx.colAmount"
                >
                  <MoneyAmount
                    :amount="r.uyu"
                    size="sm"
                    compact
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Lo que no se puede medir -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.inmedibleTag }}
          </p>
          <h2>{{ cx.inmedibleTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p
            v-for="(p, i) in cx.inmedible"
            :key="i"
          >
            {{ p }}
          </p>
        </div>

        <div
          class="inv-ledger u-scroll-x"
          style="margin-top: var(--s-6);"
        >
          <table>
            <thead>
              <tr>
                <th>{{ cx.artifactCol }}</th>
                <th class="num">
                  {{ cx.artifactProbed }}
                </th>
                <th class="num">
                  {{ cx.artifactMulti }}
                </th>
                <th class="num">
                  {{ cx.artifactLosers }}
                </th>
                <th>{{ cx.artifactVerdict }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="a in ARTIFACT_CHECK"
                :key="a.buyer"
                :class="{ rowflag: !a.measurable }"
              >
                <td class="sup">
                  {{ a.buyer }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.artifactProbed"
                >
                  {{ nf.format(a.probed) }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.artifactMulti"
                >
                  {{ nf.format(a.multi) }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.artifactLosers"
                >
                  {{ nf.format(a.withLosers) }}
                </td>
                <td :data-label="cx.artifactVerdict">
                  <span
                    class="inv-badge"
                    :class="a.measurable ? 'inv-badge--co' : 'inv-badge--exc'"
                  >{{ a.measurable ? cx.yes : cx.no }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          class="inv-balance"
          style="margin-top: var(--s-7);"
        >
          <div class="inv-balance__h">
            {{ cx.outlierTitle }}
          </div>
          <p>{{ cx.outlierP }}</p>
          <p
            class="u-mono"
            style="font-size: 0.82rem;"
          >
            <NuxtLink :to="localePath(`/contracts/adjudicacion-${OUTLIER.id}`)">
              {{ OUTLIER.id }} →
            </NuxtLink>
            · {{ OUTLIER.buyer }} · {{ nf.format(OUTLIER.qty) }} × {{ formatMoney(OUTLIER.unit, 'UYU') }}
            = {{ formatMoney(OUTLIER.uyu, 'UYU') }}
          </p>
        </div>
      </div>
    </section>

    <!-- Uruguay Leaks -->
    <section class="inv-sec">
      <div class="u-container">
        <LeakTip
          :subject="cx.title"
          path="/investigaciones/competencia-aparente"
          :facts="leakFacts"
        />
      </div>
    </section>

    <!-- Fuentes -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.sourcesTag }}
          </p>
          <h2>{{ cx.sourcesTitle }}</h2>
          <p>{{ cx.sourcesP }}</p>
        </div>
        <div class="inv-srcgroups">
          <div class="inv-srcgroup">
            <h3>Compras Estatales</h3>
            <ul class="inv-srclist">
              <li>
                <a
                  href="https://www.comprasestatales.gub.uy/consultas/detalle/id/1270831"
                  target="_blank"
                  rel="noopener"
                >Ficha con oferentes — compra 1270831 (Casinos)</a>
              </li>
              <li>
                <a
                  href="https://www.comprasestatales.gub.uy/consultas/detalle/id/i473855"
                  target="_blank"
                  rel="noopener"
                >Ficha donde participantes = adjudicatarios (IM)</a>
              </li>
            </ul>
          </div>
          <div class="inv-srcgroup">
            <h3>Registros · sitio</h3>
            <ul class="inv-srclist">
              <li>
                <a
                  href="https://www.comprasestatales.gub.uy/rupe/"
                  target="_blank"
                  rel="noopener"
                >RUPE — Registro Único de Proveedores del Estado</a>
              </li>
              <li>
                <NuxtLink :to="localePath('/analytics/competencia')">
                  Competencia por organismo (en vivo)
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Disclaimer -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-disclaimer">
          <h3>{{ c.common.disclaimerTitle }}</h3>
          <p
            v-for="(p, i) in c.common.disclaimer"
            :key="i"
          >
            {{ p }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
/* El detalle del vínculo va bajo los badges: el badge dice QUÉ comparten, esta línea dice
   cuál es y cuántas empresas más lo declaran — que es lo que separa una pista de una central. */
.cmp-linkdet {
  margin-top: var(--s-1);
  font-size: 0.72rem;
  color: var(--text-muted);
}
</style>
