<script setup lang="ts">
/**
 * "Panel para postulantes" — the historical award context a company needs before
 * bidding on this call, one card per rubro (classification code):
 *   - price band (p25 · mediana · p95) from item_price_baselines
 *   - who won similar awards before (topSuppliers) + who buys the rubro (topBuyers),
 *     each linking to that party's contracts *for this rubro* and to their profile
 *   - market signals (contratos / proveedores / compradores / años activos)
 *   - backlinks to the rubro's full ficha and to the filtered contract explorer
 *
 * All data is precomputed (product_analytics + item_price_baselines) and delivered by
 * /api/open-calls/{compraId}/benchmarks — this component only renders and links.
 */
interface RankEntry { id: string | null, name: string, spendUYU: number, lines: number }
interface PriceBaseline { currency: string, unitName: string, n: number, p25: number, p50: number, p75: number, p95: number }
interface BenchProduct {
  contractCount: number
  buyerCount: number
  supplierCount: number
  totalUYU: number
  firstYear: number | null
  lastYear: number | null
  topSuppliers: RankEntry[]
  topBuyers: RankEntry[]
}
interface Benchmark {
  classificationId: string
  label: string | null
  product: BenchProduct | null
  priceBaselines: PriceBaseline[]
}

defineProps<{ benchmarks: Benchmark[] }>()
const { t } = useI18n()
const localePath = useLocalePath()

const productTo = (code: string) => localePath(`/products/${encodeURIComponent(code)}`)
const explorerTo = (code: string) => localePath(`/contracts?categoryId=${encodeURIComponent(code)}`)
const sellerContractsTo = (code: string, name: string) => localePath(`/contracts?categoryId=${encodeURIComponent(code)}&suppliers=${encodeURIComponent(name)}`)
const buyerContractsTo = (code: string, name: string) => localePath(`/contracts?categoryId=${encodeURIComponent(code)}&buyers=${encodeURIComponent(name)}`)

/**
 * Supplier ids may or may not carry the `R/` slash that supplier profiles key on.
 * Normalise, keeping the slash inside a single named-route param so the router
 * doesn't split the path. Mirrors the helper on the product ficha.
 */
function supplierTo(s: RankEntry) {
  if (!s.id) return localePath(`/contracts?suppliers=${encodeURIComponent(s.name)}`)
  const key = /^[A-Za-z]\d+$/.test(s.id) ? s.id.replace(/^([A-Za-z])/, '$1/') : s.id
  return localePath({ name: 'suppliers-id', params: { id: key } })
}
const buyerTo = (b: RankEntry) => b.id
  ? localePath(`/buyers/${encodeURIComponent(b.id)}`)
  : localePath(`/contracts?buyers=${encodeURIComponent(b.name)}`)

const priceUnitLabel = (pb: PriceBaseline) => [pb.currency, pb.unitName].filter(Boolean).join(' · ')
</script>

<template>
  <section
    v-if="benchmarks.length"
    id="benchmarks"
    class="panel bench"
  >
    <h2 class="u-eyebrow bench__title">
      {{ t('llamados.benchmarksTitle') }}
    </h2>
    <p class="bench__lead u-muted">
      {{ t('llamados.benchmarksLead') }}
    </p>

    <article
      v-for="b in benchmarks"
      :key="b.classificationId"
      class="rb"
    >
      <!-- Rubro head + market signals -->
      <header class="rb__head">
        <div class="rb__id">
          <NuxtLink
            :to="productTo(b.classificationId)"
            class="rb__label"
          >
            {{ b.label || b.classificationId }}
          </NuxtLink>
          <span class="rb__code u-mono">{{ t('products.codeLabel', { code: b.classificationId }) }}</span>
        </div>
        <div
          v-if="b.product"
          class="rb__stats"
        >
          <span class="rb__stat">
            <strong>{{ formatNumber(b.product.contractCount) }}</strong> {{ t('llamados.benchContracts') }}
          </span>
          <span class="rb__stat">
            <strong>{{ formatNumber(b.product.supplierCount) }}</strong> {{ t('llamados.benchSuppliers') }}
          </span>
          <span class="rb__stat">
            <strong>{{ formatNumber(b.product.buyerCount) }}</strong> {{ t('llamados.benchBuyers') }}
          </span>
          <span
            v-if="b.product.lastYear"
            class="rb__stat rb__years u-mono"
          >{{ b.product.firstYear }}–{{ b.product.lastYear }}</span>
        </div>
      </header>

      <!-- Price band: p25 · mediana · p95 -->
      <div
        v-if="b.priceBaselines.length"
        class="rb__prices"
      >
        <div
          v-for="(pb, j) in b.priceBaselines.slice(0, 2)"
          :key="`pb-${j}`"
          class="rb__price"
        >
          <span class="rb__priceunit u-mono">{{ priceUnitLabel(pb) }}</span>
          <div class="rb__band">
            <span class="rb__pcell">
              <span class="rb__plabel">p25</span>
              <MoneyAmount
                :amount="pb.p25"
                :currency="pb.currency"
                :rule="false"
                size="sm"
              />
            </span>
            <span class="rb__pcell rb__pcell--mid">
              <span class="rb__plabel">{{ t('llamados.benchMedian') }}</span>
              <MoneyAmount
                :amount="pb.p50"
                :currency="pb.currency"
                :rule="false"
                size="sm"
              />
            </span>
            <span class="rb__pcell">
              <span class="rb__plabel">p95</span>
              <MoneyAmount
                :amount="pb.p95"
                :currency="pb.currency"
                :rule="false"
                size="sm"
              />
            </span>
          </div>
          <span class="rb__n u-mono">{{ t('llamados.benchComparables', { n: formatNumber(pb.n) }) }}</span>
        </div>
      </div>

      <!-- Who won / who buys -->
      <div
        v-if="b.product && (b.product.topSuppliers.length || b.product.topBuyers.length)"
        class="rb__cols"
      >
        <div
          v-if="b.product.topSuppliers.length"
          class="rb__col"
        >
          <h3 class="rb__coltitle">
            {{ t('llamados.benchWinnersTitle') }}
          </h3>
          <ol class="rb__rank">
            <li
              v-for="s in b.product.topSuppliers"
              :key="s.id || s.name"
              class="rb__rankrow"
            >
              <NuxtLink
                :to="sellerContractsTo(b.classificationId, s.name)"
                class="rb__ranklink"
              >
                <span class="rb__rankname u-truncate">{{ s.name }}</span>
                <span class="rb__rankmeta">{{ t('llamados.benchPurchases', { n: formatNumber(s.lines) }) }}</span>
                <MoneyAmount
                  :amount="s.spendUYU > 0 ? s.spendUYU : null"
                  compact
                  size="sm"
                />
              </NuxtLink>
              <NuxtLink
                v-if="s.id"
                :to="supplierTo(s)"
                class="rb__rankprofile"
              >
                {{ t('llamados.benchProfile') }}
              </NuxtLink>
            </li>
          </ol>
        </div>

        <div
          v-if="b.product.topBuyers.length"
          class="rb__col"
        >
          <h3 class="rb__coltitle">
            {{ t('llamados.benchBuyersTitle') }}
          </h3>
          <ol class="rb__rank">
            <li
              v-for="by in b.product.topBuyers"
              :key="by.id || by.name"
              class="rb__rankrow"
            >
              <NuxtLink
                :to="buyerContractsTo(b.classificationId, by.name)"
                class="rb__ranklink"
              >
                <span class="rb__rankname u-truncate">{{ by.name }}</span>
                <span class="rb__rankmeta">{{ t('llamados.benchPurchases', { n: formatNumber(by.lines) }) }}</span>
                <MoneyAmount
                  :amount="by.spendUYU > 0 ? by.spendUYU : null"
                  compact
                  size="sm"
                />
              </NuxtLink>
              <NuxtLink
                v-if="by.id"
                :to="buyerTo(by)"
                class="rb__rankprofile"
              >
                {{ t('llamados.benchProfile') }}
              </NuxtLink>
            </li>
          </ol>
        </div>
      </div>

      <!-- Backlinks -->
      <div class="rb__foot">
        <NuxtLink
          :to="productTo(b.classificationId)"
          class="rb__cta"
        >
          {{ t('llamados.benchViewProduct') }}
          <v-icon size="14">mdi-arrow-right</v-icon>
        </NuxtLink>
        <NuxtLink
          :to="explorerTo(b.classificationId)"
          class="rb__cta rb__cta--ghost"
        >
          {{ t('llamados.benchViewContracts') }}
        </NuxtLink>
      </div>
    </article>

    <p class="bench__disc u-muted">
      {{ t('llamados.benchDisclaimer') }}
    </p>
  </section>
</template>

<style scoped>
.bench { padding: var(--s-5); }
.bench__title { margin: 0 0 var(--s-1); }
.bench__lead { font-size: var(--t-sm); margin: 0 0 var(--s-4); max-width: 68ch; }
.bench__disc { font-size: var(--t-xs); margin: var(--s-4) 0 0; }

/* ---- Rubro card ---- */
.rb {
  padding: var(--s-4) 0;
  border-top: 1px solid var(--rule);
}
.rb:first-of-type { border-top: 0; padding-top: 0; }

.rb__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  flex-wrap: wrap;
  margin-bottom: var(--s-3);
}
.rb__id { min-width: 0; }
.rb__label {
  font-weight: 700;
  font-size: var(--t-base);
  color: var(--text);
  text-decoration: none;
}
.rb__label:hover { color: var(--celeste-deep); text-decoration: underline; }
.rb__code { display: block; font-size: var(--t-xs); color: var(--text-muted); margin-top: 2px; }

.rb__stats {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--s-1) var(--s-3);
  font-size: var(--t-xs);
  color: var(--text-muted);
}
.rb__stat strong { color: var(--text); font-weight: 700; }
.rb__years { color: var(--text-muted); }

/* ---- Price band ---- */
.rb__prices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-4);
  margin-bottom: var(--s-4);
}
.rb__price {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-3);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
}
.rb__priceunit { font-size: var(--t-xs); color: var(--text-muted); }
.rb__band { display: flex; align-items: flex-end; gap: var(--s-4); }
.rb__pcell { display: flex; flex-direction: column; gap: 2px; }
.rb__plabel {
  font-family: var(--font-mono);
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.rb__pcell--mid { padding: 0 var(--s-4); border-inline: 1px solid var(--rule); }
.rb__n { font-size: var(--t-xs); color: var(--text-muted); }

/* ---- Rank columns (winners / buyers) ---- */
.rb__cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4);
  align-items: start;
  margin-bottom: var(--s-3);
}
.rb__coltitle {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin: 0 0 var(--s-2);
}
.rb__rank {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  overflow: hidden;
}
.rb__rankrow { display: flex; align-items: stretch; }
.rb__rankrow + .rb__rankrow { border-top: 1px solid var(--rule); }
.rb__ranklink {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur) var(--ease);
}
.rb__ranklink:hover { background: var(--surface-sunken); }
.rb__rankname { font-size: var(--t-sm); font-weight: 600; }
.rb__rankmeta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}
.rb__rankprofile {
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 var(--s-3);
  border-left: 1px solid var(--rule);
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  text-decoration: none;
  white-space: nowrap;
}
.rb__rankprofile:hover { background: var(--surface-sunken); text-decoration: underline; }

/* ---- Backlinks ---- */
.rb__foot { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.rb__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--celeste-deep);
  font-weight: 600;
  font-size: var(--t-xs);
  text-decoration: none;
}
.rb__cta:hover { background: var(--surface-sunken); }
.rb__cta--ghost { border-color: var(--rule); font-weight: 500; color: var(--text-muted); }

@media (max-width: 700px) {
  .rb__cols { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .rb__ranklink { grid-template-columns: minmax(0, 1fr) auto; row-gap: 2px; }
  .rb__rankmeta { grid-column: 1; grid-row: 2; }
  .rb__ranklink :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}
</style>
