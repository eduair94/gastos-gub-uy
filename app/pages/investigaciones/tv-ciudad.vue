<script setup lang="ts">
/**
 * TV Ciudad — el canal municipal de la Intendencia, a la luz de la base y la prensa.
 * Chrome estático alrededor de ~/data/investigaciones-tvciudad. El ledger sale de la
 * base (comprador 98-1, texto "TV Ciudad", ficha por ficha); el presupuesto, la
 * publicidad, la NBA y los recortes son prensa citada — el grueso del dinero, como
 * contexto, porque el canal se financia por presupuesto y casi no deja rastro en compras.
 */
import {
  TVC_BUDGET,
  TVC_LEDGER,
  TVC_NEWS,
  TVC_SOURCES,
  TVC_STATS,
  tvcContent,
} from '~/data/investigaciones-tvciudad'

const { locale } = useI18n()
const localePath = useLocalePath()
const c = computed(() => tvcContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: c.value.title },
])

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/tv-ciudad',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': c.value.title,
      'description': c.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd,
  ],
}))

const sortedBudget = computed(() => TVC_BUDGET.slice().sort((a, b) => b.spend - a.spend))
const budgetItems = computed(() =>
  sortedBudget.value.map(line => ({
    label: (c.value.budget as Record<string, string>)[line.key],
    value: line.spend,
    color: 'gold',
  })))

/** Adjudicados con monto primero (mayor a menor), luego los llamados por fecha desc. */
const ledger = computed(() =>
  TVC_LEDGER.slice().sort((a, b) => {
    if (a.amount !== b.amount) return b.amount - a.amount
    return b.date.localeCompare(a.date)
  }))
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
              :amount="TVC_STATS.presupuesto2023UYU"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <div class="inv-tile__l">
              {{ c.tiles.presupuesto }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.presupuestoSub }}
            </div>
          </div>
          <div class="inv-tile">
            <MoneyAmount
              :amount="TVC_STATS.presupuesto2026UYU"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <div class="inv-tile__l">
              {{ c.tiles.proyecto }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.proyectoSub }}
            </div>
          </div>
          <div class="inv-tile">
            <MoneyAmount
              :amount="TVC_STATS.publicidad2024UYU"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <div class="inv-tile__l">
              {{ c.tiles.publicidad }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.publicidadSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n">
              {{ TVC_STATS.dbRecords }}
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.registros }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.registrosSub }}
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

    <!-- La escala: presupuesto -->
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
              :items="budgetItems"
              format="moneyM"
              :row-height="46"
            />
          </div>
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
                <th>{{ c.ledger.colCat }}</th>
                <th class="num">
                  {{ c.ledger.colAmount }}
                </th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in ledger"
                :key="row.recordId"
              >
                <td
                  class="u-mono nowrap"
                  :data-label="c.ledger.colDate"
                >
                  {{ formatDate(row.date) }}
                </td>
                <td class="obj">
                  {{ row.desc }}
                </td>
                <td
                  class="sup"
                  :data-label="c.ledger.colSup"
                >
                  {{ row.supplier || '—' }}
                </td>
                <td :data-label="c.ledger.colCat">
                  <span
                    class="im-badge"
                    :class="`im-badge--${row.cat}`"
                  >{{ (c.cat as Record<string, string>)[row.cat] }}</span>
                </td>
                <td
                  class="num"
                  :data-label="c.ledger.colAmount"
                >
                  <MoneyAmount
                    v-if="row.amount > 0"
                    :amount="row.amount"
                    compact
                  />
                  <span
                    v-else
                    class="tvc-nomonto u-mono"
                  >{{ c.ledger.sinMonto }}</span>
                </td>
                <td class="num">
                  <NuxtLink
                    :to="localePath(`/contracts/${row.recordId}`)"
                    class="im-ficha u-mono"
                  >{{ c.ledger.ficha }} →</NuxtLink>
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
              :to="localePath('/investigaciones/intendencia-montevideo')"
              color="primary"
              variant="flat"
              prepend-icon="mdi-city-variant-outline"
              class="text-none"
            >
              {{ c.explore.im }}
            </v-btn>
            <v-btn
              :to="localePath('/buyers/98-1')"
              variant="outlined"
              prepend-icon="mdi-file-document-multiple-outline"
              class="text-none"
            >
              {{ c.explore.buyer }}
            </v-btn>
            <v-btn
              :to="localePath({ path: '/contracts', query: { buyerIds: '98-1', search: 'tv ciudad' } })"
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
            v-for="n in TVC_NEWS"
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
                v-for="s in TVC_SOURCES"
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
/* Ledger table — mismo look de expediente que el ledger de la IM/casinos. */
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
.im-ledger .obj { font-weight: 600; min-width: 220px; }
.im-ledger .sup { color: var(--text-muted); min-width: 170px; }
.tvc-nomonto { font-size: var(--t-xs); color: var(--text-muted); }

/* Mobile: each ledger row becomes a card — no horizontal scroll. */
@media (max-width: 760px) {
  .im-ledger { overflow-x: visible; }
  .im-ledger table { min-width: 0; display: block; }
  .im-ledger thead {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap;
  }
  .im-ledger tbody { display: flex; flex-direction: column; gap: var(--s-3); }
  .im-ledger tbody tr {
    display: block;
    padding: var(--s-4);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-1);
  }
  .im-ledger tbody tr:hover { background: var(--surface); }
  .im-ledger tbody td {
    display: block;
    min-width: 0;
    padding: var(--s-2) 0;
    border: 0;
    border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent);
    text-align: left;
    white-space: normal;
  }
  .im-ledger tbody td:first-child { border-top: 0; padding-top: 0; }
  .im-ledger tbody td[data-label]::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 3px;
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }
  .im-ledger tbody td.obj { min-width: 0; font-size: var(--t-base); font-weight: 700; }
  .im-ledger tbody td.sup { min-width: 0; }
  .im-ledger tbody td.num { text-align: left; white-space: normal; }
}

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
.im-badge--equipamiento { border-color: color-mix(in srgb, var(--celeste) 45%, transparent); color: var(--celeste-deep); }
.im-badge--vehiculo { border-color: color-mix(in srgb, var(--alerta) 40%, transparent); color: var(--alerta); }
.im-badge--insumos { border-color: color-mix(in srgb, var(--sol) 50%, transparent); color: var(--money); }
.im-badge--obra { border-color: var(--rule-strong); color: var(--text-muted); }

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
