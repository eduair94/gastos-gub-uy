<script setup lang="ts">
/**
 * Deep-dive: the "consumición de cortesía" (art. 79764). The dispersion scatter is
 * the signature — Código de Barras' flat 4× premium against the cloud. The ledger
 * lists all 63 lines, each linking to its official record. Data + copy from the module.
 */
import {
  CORTESIA_BASELINE,
  CORTESIA_CONTRACTS,
  VERIFIED_METHODS,
  invContent,
} from '~/data/investigaciones'

const { locale } = useI18n()
const localePath = useLocalePath()
const c = computed(() => invContent(locale.value))
const cx = computed(() => c.value.cortesia)

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/casinos-cortesia',
}))

const titn = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ').map(w => w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w).join(' ')

const scatterPoints = computed(() => CORTESIA_CONTRACTS
  .filter(c2 => c2.unit > 0)
  .map(c2 => ({
    x: Date.parse(`${c2.date}T00:00:00Z`),
    y: c2.unit,
    label: titn(c2.sup),
    qty: c2.qty,
    tot: c2.tot,
    hi: c2.sup === 'CODIGO DE BARRAS SRL',
  })))

const ledger = computed(() => CORTESIA_CONTRACTS
  .slice()
  .sort((a, b) => (a.date < b.date ? -1 : 1))
  .map(c2 => ({
    ...c2,
    supName: titn(c2.sup),
    method: VERIFIED_METHODS[c2.idc],
    flag: c2.unit === 211749 || c2.qty === 0,
    flat: c2.unit === 211749,
    zero: c2.qty === 0,
  })))
</script>

<template>
  <div class="inv">
    <!-- Cover -->
    <header class="inv-cover">
      <div class="u-container">
        <div class="inv-file">
          <span>EXPEDIENTE&nbsp; <b>{{ cx.fileArt }}</b></span>
          <span>ORGANISMO&nbsp; <b>{{ cx.fileOrg }}</b></span>
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

    <!-- Hero number + tiles -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-hero">
          <div>
            <p class="u-eyebrow">
              {{ cx.statTotal }}
            </p>
            <MoneyAmount
              :amount="58849923"
              size="xl"
              align="start"
              :rule="false"
            />
            <p class="inv-hero__usd">
              {{ cx.statTotalSub }}
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

    <!-- Qué es -->
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

    <!-- Hallazgo central -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.hallazgoTag }}
          </p>
          <h2>{{ cx.hallazgoTitle }}</h2>
        </div>
        <div class="inv-finding">
          <p class="inv-kicker">
            {{ cx.hallazgoKicker }}
          </p>
          <h3>{{ cx.hallazgoH }}</h3>
          <p>{{ cx.hallazgoP }}</p>
          <div class="inv-law">
            {{ cx.hallazgoLaw }}
          </div>
          <div class="inv-contra">
            <div class="inv-contra__cell">
              <div class="inv-contra__h">
                {{ cx.contraA }}
              </div>
              <div class="inv-contra__b">
                {{ cx.contraAp }}
              </div>
            </div>
            <div class="inv-contra__vs">
              vs
            </div>
            <div class="inv-contra__cell">
              <div class="inv-contra__h">
                {{ cx.contraB }}
              </div>
              <div class="inv-contra__b">
                {{ cx.contraBp }}
              </div>
            </div>
          </div>
        </div>

        <div class="inv-balance">
          <div class="inv-balance__h">
            {{ cx.balanceH }}
          </div>
          <p
            v-for="(p, i) in cx.balance"
            :key="i"
          >
            {{ p }}
          </p>
        </div>
      </div>
    </section>

    <!-- Dispersión (signature) -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.scatterTag }}
          </p>
          <h2>{{ cx.scatterTitle }}</h2>
          <p>{{ cx.scatterIntro }}</p>
        </div>
        <div class="inv-cardc">
          <div class="inv-scroll">
            <InvScatter
              :points="scatterPoints"
              :median="CORTESIA_BASELINE.p50"
              :y-max="220000"
              :median-label="c.chart.median"
              :unit-label="c.chart.unit"
            />
          </div>
          <div class="inv-legend">
            <span><i style="background: var(--money-rule);" /> {{ cx.scatterLegendRest }}</span>
            <span><i style="background: var(--alerta);" /> {{ cx.scatterLegendCdb }}</span>
            <span><i style="background: var(--celeste); height: 3px; width: 16px; border-radius: 0;" /> {{ c.chart.median }} $ 51.230</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Observaciones -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.obsTag }}
          </p>
          <h2>{{ cx.obsTitle }}</h2>
        </div>
        <div class="inv-obs-grid">
          <div
            v-for="o in cx.obs"
            :key="o.h"
            class="inv-obs"
          >
            <span class="inv-obs__tag">{{ o.tag }}</span>
            <h3>{{ o.h }}</h3>
            <p>{{ o.p }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Ledger -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.ledgerTag }}
          </p>
          <h2>{{ cx.ledgerTitle }}</h2>
          <p>{{ cx.ledgerIntro }}</p>
        </div>
        <div class="inv-ledger u-scroll-x">
          <table>
            <thead>
              <tr>
                <th>{{ cx.colDate }}</th>
                <th>{{ cx.colSup }}</th>
                <th class="num">
                  {{ cx.colQty }}
                </th>
                <th class="num">
                  {{ cx.colUnit }}
                </th>
                <th class="num">
                  {{ cx.colTot }}
                </th>
                <th>{{ cx.colMethod }}</th>
                <th>{{ cx.colFicha }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in ledger"
                :key="row.ocid + row.date"
                :class="{ rowflag: row.flag }"
              >
                <td
                  class="mono"
                  :data-label="cx.colDate"
                >
                  {{ row.date }}
                </td>
                <td class="sup">
                  {{ row.supName }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.colQty"
                >
                  {{ row.qty }}
                </td>
                <td
                  class="num mono"
                  :data-label="cx.colUnit"
                >
                  {{ formatMoney(row.unit, 'UYU') }}<span
                    v-if="row.flat"
                    class="inv-warnpill"
                  >{{ locale === 'en' ? 'flat' : 'fijo' }}</span>
                </td>
                <td
                  class="num"
                  :data-label="cx.colTot"
                >
                  <MoneyAmount
                    :amount="row.tot"
                    size="sm"
                    compact
                  /><span
                    v-if="row.zero"
                    class="inv-warnpill"
                  >qty 0</span>
                </td>
                <td :data-label="cx.colMethod">
                  <span
                    v-if="row.method"
                    class="inv-badge inv-badge--exc"
                  >{{ row.method }}</span>
                  <span
                    v-else
                    class="inv-badge inv-badge--nd"
                  >{{ cx.consultar }}</span>
                </td>
                <td :data-label="cx.colFicha">
                  <a
                    :href="row.url"
                    target="_blank"
                    rel="noopener"
                  >{{ row.idc }} ↗</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Sources + back -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cx.sourcesTitle }}
          </p>
          <h2>{{ c.common.verified }}</h2>
        </div>
        <div class="inv-srcgroups">
          <div class="inv-srcgroup">
            <h4>Compras Estatales</h4>
            <ul class="inv-srclist">
              <li>
                <a
                  href="https://www.comprasestatales.gub.uy/consultas/detalle/id/1307206"
                  target="_blank"
                  rel="noopener"
                >Ficha ejemplo — Compra por Excepción 51/2025</a>
              </li>
              <li>
                <a
                  href="https://www.comprasestatales.gub.uy/consultas/buscar/tipo-pub/ADJ/inciso/5/ue/13/tipo-doc/C/filtro-cat/CAT/tipo-orden/DESC"
                  target="_blank"
                  rel="noopener"
                >Adjudicaciones DGC (Inciso 05 / UE 013)</a>
              </li>
            </ul>
          </div>
          <div class="inv-srcgroup">
            <h4>Normativa · prensa</h4>
            <ul class="inv-srclist">
              <li>
                <a
                  href="https://impo.com.uy/bases/tocaf-tcr/150-2012/33"
                  target="_blank"
                  rel="noopener"
                >TOCAF Art. 33 (IMPO)</a>
              </li>
              <li>
                <a
                  href="https://www.elobservador.com.uy/nota/la-explicacion-que-dio-economia-sobre-los-880-000-del-desayuno-merienda-de-casinos-2021315194155"
                  target="_blank"
                  rel="noopener"
                >La explicación de Economía — El Observador (2021)</a>
              </li>
            </ul>
          </div>
        </div>
        <p style="margin-top: var(--s-6);">
          <NuxtLink :to="localePath('/investigaciones/casinos')">
            ← {{ c.casinos.title }}
          </NuxtLink>
        </p>
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
