<script setup lang="ts">
/**
 * Intendencia de Montevideo — gasto discrecional a la luz del déficit.
 * Chrome estático alrededor de ~/data/investigaciones-im. Cada contrato del ledger
 * enlaza a su ficha oficial; el déficit y los casos mediáticos son prensa citada.
 */
import {
  IM_CATEGORIES,
  IM_CONSULTORIA,
  IM_LEDGER,
  IM_NEWS,
  IM_SOURCES,
  IM_STATS,
  imContent,
} from '~/data/investigaciones-im'

const { locale } = useI18n()
const localePath = useLocalePath()
const c = computed(() => imContent(locale.value))

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/intendencia-montevideo',
}))

const sortedCats = computed(() => IM_CATEGORIES.slice().sort((a, b) => b.spend - a.spend))
const catItems = computed(() =>
  sortedCats.value.map(cat => ({
    label: (c.value.cat as Record<string, string>)[cat.key],
    value: cat.spend,
    color: 'gold',
  })))

/** Each category bar drills through to that Intendencia's contracts matching the rubro. */
const CAT_SEARCH: Record<string, string> = { publicidad: 'publicidad', eventos: 'espectáculo', mobiliario: 'mobiliario', catering: 'catering' }
function catHref(i: number): string | undefined {
  const cat = sortedCats.value[i]
  if (!cat) return undefined
  // buyerIds (stable id filter) not buyers (name) — matches the explorer's link convention.
  return localePath({ path: '/contracts', query: { buyerIds: '98-1', search: CAT_SEARCH[cat.key] ?? cat.key } })
}

const ledger = computed(() => IM_LEDGER.slice().sort((a, b) => b.amount - a.amount))
</script>

<template>
  <div class="inv">
    <!-- Cover -->
    <header class="inv-cover">
      <div class="u-container">
        <div class="inv-file">
          <span>EXPEDIENTE&nbsp; <b>{{ c.file.org }}</b></span>
          <span>{{ c.file.inciso }}</span>
          <span>PERÍODO&nbsp; <b>{{ c.file.period }}</b></span>
          <span>{{ c.common.source }}</span>
        </div>
        <p class="inv-kicker">
          {{ c.kicker }}
        </p>
        <h1>{{ c.title }}</h1>
        <p class="inv-dek">
          {{ c.dek }}
        </p>
        <div class="inv-chips">
          <span
            v-for="ch in c.chips"
            :key="ch"
            class="inv-chip"
          >{{ ch }}</span>
        </div>
      </div>
    </header>

    <!-- Stat tiles -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-tiles">
          <div class="inv-tile">
            <MoneyAmount
              :amount="IM_STATS.comprasTotal"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <div class="inv-tile__l">
              {{ c.tiles.compras }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.comprasSub }}
            </div>
          </div>
          <div class="inv-tile">
            <MoneyAmount
              :amount="IM_STATS.deficit2024UYU"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <div class="inv-tile__l">
              {{ c.tiles.deficit }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.deficitSub }}
            </div>
          </div>
          <div class="inv-tile">
            <MoneyAmount
              :amount="IM_STATS.medianContract"
              align="start"
              :rule="false"
            />
            <div class="inv-tile__l">
              {{ c.tiles.mediana }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n inv-tile__n--alerta">
              ×{{ IM_STATS.deficitMult }}
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.mult }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Contexto -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.ctx.tag }}
          </p>
          <h2>{{ c.ctx.title }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.ctx.p1 }}</p>
          <p>{{ c.ctx.p2 }}</p>
        </div>
      </div>
    </section>

    <!-- Lo discrecional -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.disc.tag }}
          </p>
          <h2>{{ c.disc.title }}</h2>
          <p>{{ c.disc.intro }}</p>
        </div>
        <div class="inv-cardc">
          <h3>{{ c.disc.chart }}</h3>
          <div class="inv-scroll">
            <InvHBars
              :items="catItems"
              format="moneyM"
              :row-height="46"
              :href-for="catHref"
            />
          </div>
          <p class="inv-drillnote u-mono">
            {{ locale === 'en' ? 'Click a bar to see those contracts' : 'Tocá una barra para ver esos contratos' }}
          </p>
        </div>
        <div
          class="inv-finding"
          style="margin-top: var(--s-6);"
        >
          <p class="inv-kicker">
            {{ c.disc.tag }}
          </p>
          <p>{{ c.disc.finding }}</p>
        </div>
      </div>
    </section>

    <!-- Ledger -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.ledger.tag }}
          </p>
          <h2>{{ c.ledger.title }}</h2>
          <p>{{ c.ledger.intro }}</p>
        </div>
        <div class="im-ledger u-scroll-x">
          <table>
            <thead>
              <tr>
                <th>{{ c.ledger.colDate }}</th>
                <th>{{ c.ledger.colObjeto }}</th>
                <th>{{ c.ledger.colSup }}</th>
                <th>{{ c.ledger.colDesc }}</th>
                <th class="num">
                  {{ c.ledger.colAmount }}
                </th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in ledger"
                :key="row.ocid"
              >
                <td class="u-mono nowrap">
                  {{ formatDate(row.date) }}
                </td>
                <td class="obj">
                  {{ row.desc }}
                </td>
                <td class="sup">
                  {{ row.supplier }}
                </td>
                <td>
                  <span
                    class="im-badge"
                    :class="`im-badge--${row.cat}`"
                  >{{ (c.cat as Record<string, string>)[row.cat] }}</span>
                </td>
                <td class="num">
                  <MoneyAmount
                    :amount="row.amount"
                    compact
                  />
                </td>
                <td class="num">
                  <a
                    :href="row.url"
                    target="_blank"
                    rel="noopener"
                    class="im-ficha u-mono"
                  >{{ c.ledger.ficha }} →</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Interconexión con el sitio (Vuetify) -->
        <div class="im-explore">
          <p class="eyebrow-inline u-mono">
            {{ c.explore.tag }}
          </p>
          <h3>{{ c.explore.title }}</h3>
          <p class="im-explore__intro">
            {{ c.explore.intro }}
          </p>
          <div class="im-explore__btns">
            <v-btn
              :to="localePath('/buyers/98-1')"
              color="primary"
              variant="flat"
              prepend-icon="mdi-file-document-multiple-outline"
              class="text-none"
            >
              {{ c.explore.allContracts }}
            </v-btn>
            <v-btn
              :to="localePath('/analytics/intendencias')"
              variant="outlined"
              prepend-icon="mdi-scale-balance"
              class="text-none"
            >
              {{ c.explore.compare }}
            </v-btn>
            <v-btn
              :to="localePath({ path: '/contracts', query: { buyerIds: '98-1' } })"
              variant="text"
              prepend-icon="mdi-magnify"
              class="text-none"
            >
              {{ c.explore.search }}
            </v-btn>
          </div>
        </div>
      </div>
    </section>

    <!-- Casos mediáticos -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.casos.tag }}
          </p>
          <h2>{{ c.casos.title }}</h2>
          <p>{{ c.casos.intro }}</p>
        </div>
        <div class="im-news">
          <a
            v-for="n in IM_NEWS"
            :key="n.key"
            :href="n.url"
            target="_blank"
            rel="noopener"
            class="im-newscard"
          >
            <div class="im-newscard__amt u-mono">
              {{ n.amountText }}
            </div>
            <p class="im-newscard__txt">
              {{ (c.casos as Record<string, string>)[n.key] }}
            </p>
            <div class="im-newscard__src u-mono">
              {{ n.source }} · {{ n.date }} →
            </div>
          </a>
        </div>
        <p class="im-newsnote">
          {{ c.casos.note }}
        </p>
      </div>
    </section>

    <!-- Método -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.method.tag }}
          </p>
          <h2>{{ c.method.title }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.method.p1 }}</p>
          <p>{{ c.method.p2 }}</p>
        </div>
      </div>
    </section>

    <!-- Fuentes -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.sourcesTitle }}
          </p>
          <h2>{{ c.common.verified }}</h2>
        </div>
        <div class="inv-srcgroups">
          <div class="inv-srcgroup">
            <ul class="inv-srclist">
              <li
                v-for="s in IM_SOURCES"
                :key="s.url"
              >
                <a
                  :href="s.url"
                  target="_blank"
                  rel="noopener"
                >{{ s.label }}</a>
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
          <h3>{{ c.disclaimerTitle }}</h3>
          <p
            v-for="(p, i) in c.disclaimer"
            :key="i"
          >
            {{ p }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Ledger table — reuses the auditor's-expediente look of the casinos ledger. */
.im-ledger table { width: 100%; border-collapse: collapse; font-size: var(--t-sm); min-width: 640px; }
.im-ledger thead th {
  text-align: left;
  padding: var(--s-2) var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--rule);
}
.im-ledger thead th.num { text-align: right; }
.im-ledger tbody td { padding: var(--s-3); border-bottom: 1px solid var(--rule); vertical-align: top; }
.im-ledger tbody tr:hover { background: var(--surface-sunken); }
.im-ledger .num { text-align: right; white-space: nowrap; }
.im-ledger .nowrap { white-space: nowrap; }
.inv-drillnote { margin: var(--s-2) 0 0; font-size: var(--t-xs); color: var(--text-muted); }
.im-ledger .obj { font-weight: 600; min-width: 200px; }
.im-ledger .sup { color: var(--text-muted); min-width: 170px; }

/* Interconnection band */
.im-explore {
  margin-top: var(--s-6);
  padding: var(--s-5) var(--s-6);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface-sunken);
}
.eyebrow-inline {
  font-size: var(--t-xs); letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--celeste-deep); margin: 0 0 4px;
}
.im-explore h3 { margin: 0 0 6px; font-size: var(--t-lg); }
.im-explore__intro { margin: 0 0 var(--s-4); color: var(--text-muted); font-size: var(--t-sm); max-width: 68ch; }
.im-explore__btns { display: flex; flex-wrap: wrap; gap: var(--s-3); }

.im-newsnote {
  margin: var(--s-4) 0 0; font-size: var(--t-xs); color: var(--text-muted);
  line-height: 1.55; max-width: 82ch;
}
.im-ficha { color: var(--celeste-deep); text-decoration: none; font-size: var(--t-xs); white-space: nowrap; }
.im-ficha:hover { text-decoration: underline; }
.im-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 8px;
  border-radius: var(--r-full);
  border: 1px solid var(--rule);
  color: var(--text-muted);
  white-space: nowrap;
}
.im-badge--publicidad { border-color: color-mix(in srgb, var(--celeste) 45%, transparent); color: var(--celeste-deep); }
.im-badge--eventos { border-color: color-mix(in srgb, var(--alerta) 40%, transparent); color: var(--alerta); }
.im-badge--merchandising { border-color: color-mix(in srgb, var(--sol) 50%, transparent); color: var(--money); }

/* News-case cards. */
.im-news { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s-4); }
.im-newscard {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--alerta);
  border-radius: var(--r-lg);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease);
}
.im-newscard:hover { border-color: var(--rule-strong); border-left-color: var(--alerta); }
.im-newscard__amt { font-size: var(--t-xl); font-weight: 700; color: var(--alerta); }
.im-newscard__txt { margin: 0; font-size: var(--t-sm); line-height: 1.55; color: var(--text); }
.im-newscard__src { font-size: var(--t-xs); color: var(--text-muted); }

@media (max-width: 720px) {
  .im-news { grid-template-columns: 1fr; }
}
</style>
