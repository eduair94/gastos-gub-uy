# Product filter on /contracts + product-page overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the catalogue code a searchable multi-select filter on `/contracts`, show product-specific columns/sorts when one product is filtered, and enrich `/products/[code]` with charts, product+provider deep-links, and a "does the physical product vary?" panel powered by scraped item características.

**Architecture:** Reuse the existing index-backed `categoryId` filter and `/api/analytics/products` search — no new filter param. Add a `focusItem` projection to the contracts aggregation for single-product mode. Extract the existing característica scraper into a shared util feeding a new batch endpoint (lazy fill) and a new offline job (`refresh-product-variants`) that precomputes variant distributions for the bounded set of unexplained-anomaly codes into a new `product_variants` collection.

**Tech Stack:** Nuxt 3 (Vue 3, `<script setup>`), Nitro server routes (h3), Mongoose, Chart.js + vue-chartjs, lodash-es. Jobs are `tsx` scripts run by pm2 from compiled `dist`. No unit-test framework — pure functions are verified by standalone `tsx` assertion scripts (`node:assert/strict`, see `test/api-key.test.ts`); endpoints/pages/jobs are verified against the DB and in a browser.

## Global Constraints

- **es is the source-of-truth locale** (`app/i18n/locales/es.json`); `en.json` mirrors every key. In any i18n message, **never** put `$` immediately before a digit — vue-i18n eats it as a regex backreference; write `$ ` with a space.
- **Money renders only through `<MoneyAmount>`**; gold (`--sol`) is reserved for peso amounts. Never hand-format a peso figure. `<MoneyAmount :amount="null">` already shows "Sin monto" — don't add a `—` beside it.
- **Component names must be multi-word** (`vue/multi-word-component-names` is enforced): `ProductAutocomplete`, not `Product`.
- **Charts are Chart.js via vue-chartjs, wrapped in `<ClientOnly>`, theme-token-aware** (read CSS custom properties, observe `data-theme`). Copy the token-reading pattern from `app/components/InvHBars.vue`.
- **Filter the catalogue by `categoryId`** (exact `awards.items.classification.id`), never by `category` (the free-text description — commas fragment it, and it is not 1:1 with the id).
- **Junk code sentinels** `"0"`, `""`, `null`, `"UNKNOWN"` are excluded from every per-code aggregation.
- **Dev-server traps:** a change under `server/` is not reliably HMR-picked-up — restart `nuxt dev`. A green warm build is not proof; before trusting a build, `rm -rf .nuxt .output node_modules/.vite`. A 200 from the dev server can be a stale pre-edit page — check for your actual markup.
- **Verify against the LIVE DB.** The dev laptop reads a stale local mirror (1.89M releases, empty `item_price_baselines`, partial amounts). Money/baseline/variants correctness must be confirmed against production data, not the mirror.
- **Deploy** (only when asked): `cd app && npm run build` → pm2 restart `gastos-gub-dashboard`; the cron side runs compiled `dist` via pm2 (`npm run build` = `tsc`, then `cronserver.config.js`).

---

### Task 1: `codes` resolve mode on `/api/analytics/products`

Lets the autocomplete turn bare codes from the URL back into product labels for its chips.

**Files:**
- Modify: `app/server/api/analytics/products.get.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GET /api/analytics/products?codes=26392,123` → `{ success, data: { products: Array<{ code, description, canonicalName, contractCount, ... }> } }` — same item shape as the existing `search` mode, filtered to `code ∈ codes`. Pagination/meta may be default.

- [ ] **Step 1: Add the `codes` branch**

In `app/server/api/analytics/products.get.ts`, after the `search` block (around line 41), before the `rubro` block, add:

```ts
// Resolve mode: turn a set of bare codes back into product docs so a UI that
// received codes via the URL can label its chips. Bounded, exact, index-backed.
const codesParam = typeof query.codes === 'string' ? query.codes.trim() : ''
if (codesParam) {
  const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean).slice(0, 100)
  const docs = codes.length
    ? await ProductAnalyticsModel.find({ code: { $in: codes } })
        .select('code description canonicalName contractCount lineCount buyerCount supplierCount totalUYU currencies')
        .maxTimeMS(8000)
        .lean()
    : []
  return {
    success: true,
    data: {
      products: docs,
      pagination: { page: 1, limit: docs.length, total: docs.length, totalPages: 1 },
      meta: { sort: 'codes', totalProducts: docs.length },
    },
  }
}
```

- [ ] **Step 2: Verify against the DB**

Start the dev server (`cd app && npm run dev`), then:

Run: `curl -s "http://localhost:3600/api/analytics/products?codes=26392" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.data.products.map(p=>p.code+' '+(p.canonicalName||p.description)).join('\n'))})"`

Expected: one line for code `26392` with a bicarbonate description (or, on the mirror, whatever description it holds). An unknown code returns an empty `products` array, not an error.

- [ ] **Step 3: Commit**

```bash
git add app/server/api/analytics/products.get.ts
git commit -m "feat(products-api): resolve bare codes to labels for chip hydration"
```

---

### Task 2: `ProductAutocomplete` component + wire into the filter rail

**Files:**
- Create: `app/components/ProductAutocomplete.vue`
- Modify: `app/components/FilterRail.vue` (replace the display-only `categoryId` chip section, ~lines 152-173)
- Modify: `app/i18n/locales/es.json`, `app/i18n/locales/en.json`

**Interfaces:**
- Consumes: `GET /api/analytics/products?search=` and `?codes=` (Task 1).
- Produces: `<ProductAutocomplete v-model="…: string[]" />` — v-model is the array of selected catalogue **codes**. Emits `update:modelValue` with the new code array.

- [ ] **Step 1: Add i18n keys**

In `app/i18n/locales/es.json`, under the existing `filters` object, add:

```json
"product": "Producto / código de catálogo",
"productPlaceholder": "Buscá por nombre o código…",
"productHelp": "Filtrá los contratos por uno o más artículos del catálogo. Se aplica por código exacto.",
```

In `app/i18n/locales/en.json`, mirror:

```json
"product": "Product / catalogue code",
"productPlaceholder": "Search by name or code…",
"productHelp": "Filter contracts by one or more catalogue articles. Applied by exact code.",
```

- [ ] **Step 2: Write the component**

Create `app/components/ProductAutocomplete.vue`:

```vue
<script setup lang="ts">
/**
 * Server-side product typeahead. Emits catalogue CODES (classification.id)
 * via v-model, exactly the values the contracts `categoryId` filter matches.
 * Codes arriving from the URL are resolved to labels once so their chips read
 * as product names, not bare numbers.
 */
import { debounce } from 'lodash-es'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const { t } = useI18n()

interface Opt { value: string, title: string, sub?: string }

const items = ref<Opt[]>([])
const loading = ref(false)
const search = ref('')
/** code -> label, so a selected code always has a chip title. */
const labels = ref<Record<string, string>>({})

function toOpt(p: any): Opt {
  const title = p.canonicalName || p.description || p.code
  return { value: p.code, title, sub: p.contractCount ? t('filters.productCount', { n: p.contractCount }) : undefined }
}

const runSearch = debounce(async (q: string) => {
  if (!q || q.trim().length < 2) { items.value = []; loading.value = false; return }
  loading.value = true
  try {
    const res = await $fetch<any>('/api/analytics/products', { query: { search: q.trim(), limit: 20 } })
    const opts = (res?.data?.products ?? []).map(toOpt)
    for (const o of opts) labels.value[o.value] = o.title
    items.value = opts
  }
  catch { items.value = [] }
  finally { loading.value = false }
}, 300)

function onSearch(v: string) { search.value = v; runSearch(v) }

/** Resolve labels for any selected code we don't yet have a title for. */
async function hydrate(codes: string[]) {
  const missing = codes.filter(c => !labels.value[c])
  if (!missing.length) return
  try {
    const res = await $fetch<any>('/api/analytics/products', { query: { codes: missing.join(',') } })
    for (const p of res?.data?.products ?? []) labels.value[p.code] = p.canonicalName || p.description || p.code
    for (const c of missing) if (!labels.value[c]) labels.value[c] = c // fall back to the code itself
  }
  catch { for (const c of missing) labels.value[c] = c }
}

onMounted(() => hydrate(props.modelValue))
watch(() => props.modelValue, v => hydrate(v))

/**
 * v-autocomplete needs every selected value present in :items to render a chip.
 * Merge the current search results with a synthetic item per selected code so
 * chips survive after the search list changes.
 */
const mergedItems = computed<Opt[]>(() => {
  const map = new Map<string, Opt>()
  for (const o of items.value) map.set(o.value, o)
  for (const c of props.modelValue) if (!map.has(c)) map.set(c, { value: c, title: labels.value[c] || c })
  return [...map.values()]
})

function onModel(v: string[]) { emit('update:modelValue', v) }
</script>

<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="mergedItems"
    item-title="title"
    item-value="value"
    :search="search"
    :placeholder="t('filters.productPlaceholder')"
    :no-data-text="search.length < 2 ? t('filters.productPlaceholder') : t('filters.noOptions')"
    multiple
    chips
    closable-chips
    density="compact"
    :loading="loading"
    hide-no-data-on-loading
    @update:search="onSearch"
    @update:model-value="onModel"
  >
    <template #item="{ props: itemProps, item }">
      <v-list-item
        v-bind="itemProps"
        :subtitle="item.raw.sub"
      />
    </template>
  </v-autocomplete>
</template>
```

- [ ] **Step 3: Add the `productCount` key**

In `es.json` `filters`: `"productCount": "{n} contratos"`. In `en.json` `filters`: `"productCount": "{n} contracts"`.

- [ ] **Step 4: Wire into FilterRail**

In `app/components/FilterRail.vue`, replace the whole display-only `categoryId` section (the `<section v-if="modelValue.categoryId.length">` block, ~lines 152-173) with an always-present input section:

```vue
    <!-- Catalogue product (code). A real typeahead over ~20k products; emits
         the exact classification.id the server filter matches on. -->
    <section class="rail__sec">
      <label
        class="rail__label"
        for="f-product"
      >{{ t('filters.product') }}</label>
      <ProductAutocomplete
        id="f-product"
        :model-value="modelValue.categoryId"
        @update:model-value="v => patch({ categoryId: v })"
      />
      <p class="rail__help">
        {{ t('filters.productHelp') }}
      </p>
    </section>
```

Leave the `category` (description) display-only section above it untouched — legacy inbound links still use it.

- [ ] **Step 5: Verify in the browser**

Restart the dev server. Open `/contracts`. In the filter rail, type "bicarb" in the new Producto field → options appear after ~300ms. Select one → a chip with the product name shows and the URL gains `?categoryId=<code>`; the list narrows. Reload the page → the chip still reads the product name (not the bare code), proving hydration. Remove the chip → filter clears.

- [ ] **Step 6: Commit**

```bash
git add app/components/ProductAutocomplete.vue app/components/FilterRail.vue app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "feat(contracts): searchable multi-select product filter in the rail"
```

---

### Task 3: `focusItem` projection + product sorts on the contracts list

**Files:**
- Modify: `app/server/api/contracts/index.get.ts`
- Create: `test/focus-item.verify.ts` (live-DB verification script)

**Interfaces:**
- Consumes: existing `categoryId` filter.
- Produces: when the request has **exactly one** `categoryId`, each returned contract row carries:
  ```ts
  focusItem: {
    nro: number | null
    description: string
    quantity: number | null
    unitName: string | null
    unitAmount: number | null   // native currency
    currency: string | null
    lineAmount: number | null
  } | null
  compraId: string | null
  ```
  and two new `sortBy` values are accepted: `itemUnitPrice`, `itemQuantity` (with `sortOrder` asc/desc).

- [ ] **Step 1: Add the sort fields**

In `app/server/api/contracts/index.get.ts`, extend the `SORT_FIELDS` map (~lines 29-39) with:

```ts
  itemUnitPrice: 'focusItem.unitAmount',
  itemQuantity: 'focusItem.quantity',
```

- [ ] **Step 2: Detect single-code focus and project focusItem**

In the handler, after `buildContractFilters(...)` returns and before the pipeline `$sort` stage is pushed, compute the focus code and, when present, push an `$addFields`. Insert:

```ts
// Single-product focus: when the user filtered to exactly one catalogue code,
// surface THAT line's specifics (its own description/qty/unit price) so the
// table can show and sort by them. With zero or many codes there is no single
// "matched item", so this is skipped and the explorer behaves as before.
const focusCode = (() => {
  const ids = toArray(query.categoryId)
  return ids.length === 1 ? ids[0] : null
})()

// (build `pipeline` up to and including the $match stages as today, then:)
if (focusCode) {
  pipeline.push({
    $addFields: {
      compraId: {
        // ocid without its `ocds-<prefix>-` head — the gov id_compra.
        $let: {
          vars: { parts: { $split: ['$ocid', '-'] } },
          in: { $reduce: {
            input: { $slice: ['$$parts', 2, { $size: '$$parts' }] },
            initialValue: '',
            in: { $cond: [{ $eq: ['$$value', ''] }, '$$this', { $concat: ['$$value', '-', '$$this'] }] },
          } },
        },
      },
      focusItem: {
        $let: {
          vars: {
            matched: {
              $first: {
                $filter: {
                  input: {
                    $reduce: {
                      input: { $ifNull: ['$awards', []] },
                      initialValue: [],
                      in: { $concatArrays: ['$$value', { $ifNull: ['$$this.items', []] }] },
                    },
                  },
                  cond: { $eq: ['$$this.classification.id', focusCode] },
                },
              },
            },
          },
          in: {
            $cond: [
              { $eq: ['$$matched', null] },
              null,
              {
                nro: { $toInt: { $ifNull: [{ $arrayElemAt: [{ $split: ['$$matched.id', '-'] }, 0] }, null] } },
                description: { $ifNull: ['$$matched.classification.description', ''] },
                quantity: '$$matched.quantity',
                unitName: '$$matched.unit.name',
                unitAmount: '$$matched.unit.value.amount',
                currency: '$$matched.unit.value.currency',
                lineAmount: {
                  $cond: [
                    { $and: [{ $ne: ['$$matched.quantity', null] }, { $ne: ['$$matched.unit.value.amount', null] }] },
                    { $multiply: ['$$matched.quantity', '$$matched.unit.value.amount'] },
                    null,
                  ],
                },
              },
            ],
          },
        },
      },
    },
  })
}
```

Guard `$toInt` against a non-numeric item id prefix by wrapping in `$convert` with `onError`:

```ts
                nro: { $convert: { input: { $arrayElemAt: [{ $split: ['$$matched.id', '-'] }, 0] }, to: 'int', onError: null, onNull: null } },
```

(Use this `$convert` form for `nro` instead of the `$toInt` line above.)

- [ ] **Step 3: Keep sort valid without focus**

Ensure that if `sortBy` is `itemUnitPrice`/`itemQuantity` but there is **no** `focusCode`, it falls back to the default date sort (the projected field won't exist). After resolving `sortField`, add:

```ts
if ((sortBy === 'itemUnitPrice' || sortBy === 'itemQuantity') && !focusCode) {
  sortField = 'date'
}
```

- [ ] **Step 4: Write the live-DB verification script**

Create `test/focus-item.verify.ts`:

```ts
import assert from 'node:assert/strict'
import { connectToDatabase } from '../app/server/utils/database'
import { ReleaseModel } from '../app/server/utils/models'

// Verifies the focusItem projection against whatever DB is configured. Uses a
// real bicarbonate code; on the mirror the description/qty/unitAmount come from
// the raw award items, which the mirror does have.
const CODE = process.env.FOCUS_CODE || '26392'

await connectToDatabase()
const rows = await ReleaseModel.aggregate([
  { $match: { tag: 'award', 'awards.items.classification.id': CODE } },
  { $addFields: {
    focusItem: { $let: {
      vars: { matched: { $first: { $filter: {
        input: { $reduce: { input: { $ifNull: ['$awards', []] }, initialValue: [], in: { $concatArrays: ['$$value', { $ifNull: ['$$this.items', []] }] } } },
        cond: { $eq: ['$$this.classification.id', CODE] },
      } } } },
      in: { $cond: [{ $eq: ['$$matched', null] }, null, {
        description: { $ifNull: ['$$matched.classification.description', ''] },
        quantity: '$$matched.quantity',
        unitName: '$$matched.unit.name',
        unitAmount: '$$matched.unit.value.amount',
        currency: '$$matched.unit.value.currency',
      }] },
    } },
  } },
  { $limit: 5 },
]).option({ maxTimeMS: 15000 })

assert.ok(rows.length > 0, `no award releases for code ${CODE}`)
for (const r of rows) assert.ok(r.focusItem && typeof r.focusItem.description === 'string', 'focusItem populated')
console.log(`focus-item.verify OK — ${rows.length} rows for ${CODE}`)
console.log(rows.map((r: any) => `  ${r.focusItem.description} | qty ${r.focusItem.quantity} | ${r.focusItem.unitAmount} ${r.focusItem.currency}`).join('\n'))
process.exit(0)
```

- [ ] **Step 5: Run it**

Run: `npx tsx test/focus-item.verify.ts`
Expected: `focus-item.verify OK — N rows for 26392` and a few printed item lines with descriptions and quantities. If it prints rows where every `focusItem.description` differs (different brands/presentations) that is exactly the variation the product panel will later surface.

- [ ] **Step 6: Verify the endpoint end-to-end**

Restart the dev server. Run:

`curl -s "http://localhost:3600/api/contracts?categoryId=26392&sortBy=itemUnitPrice&sortOrder=desc&limit=3" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);for(const c of j.data.contracts){console.log(c.compraId, JSON.stringify(c.focusItem))}})"`

Expected: three rows, each with a non-null `compraId` and a `focusItem`, ordered by descending `unitAmount`.

- [ ] **Step 7: Commit**

```bash
git add app/server/api/contracts/index.get.ts test/focus-item.verify.ts
git commit -m "feat(contracts-api): focusItem projection + item-price/qty sorts for single-product mode"
```

---

### Task 4: Extract the característica scraper into a shared util

Pure refactor that unblocks the batch endpoint (Task 5) and the job (Task 7). Locked by a parser unit test.

**Files:**
- Create: `app/server/utils/item-features.ts`
- Modify: `app/server/api/contracts/[id]/features.get.ts` (import from the util instead of defining locally)
- Create: `test/item-features.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ScrapedItem { nro: number; features: { name: string; value: string }[]; variation?: string }
  export function parseItemFeatures(rawHtml: string): ScrapedItem[]
  export function parseBuyObject(rawHtml: string): string | null
  export function scrapeItemFeatures(url: string): Promise<{ items: ScrapedItem[]; object: string | null } | null>
  ```

- [ ] **Step 1: Create the util**

Create `app/server/utils/item-features.ts` and move `decodeEntities`, `parseBuyObject`, `parseItemFeatures`, `FETCH_OPTS`, `fetchPage`, and the `scrape` function out of `app/server/api/contracts/[id]/features.get.ts` verbatim. Export `ScrapedItem`, `parseItemFeatures`, `parseBuyObject`, and rename `scrape` → `scrapeItemFeatures` on export. Keep `decodeEntities`/`fetchPage`/`FETCH_OPTS` module-private.

- [ ] **Step 2: Rewire the existing endpoint**

In `app/server/api/contracts/[id]/features.get.ts`, delete the moved definitions and add at the top:

```ts
import { parseItemFeatures, parseBuyObject, scrapeItemFeatures, type ScrapedItem } from '../../../utils/item-features'
```

Replace the local `scrape(` call site with `scrapeItemFeatures(`. Nothing else in the handler changes.

- [ ] **Step 3: Write the parser test**

Create `test/item-features.test.ts`:

```ts
import assert from 'node:assert/strict'
import { parseItemFeatures, parseBuyObject } from '../app/server/utils/item-features'

const html = `
<p class="buy-object">Solución bicarbonatada molar</p>
<h3 class="buy-item-title-small">Ítem Nº&nbsp;1</h3>
<table><caption>Características del Ítem Nº 1</caption><tbody>
<tr><td>Marca</td><td>FARMACO URUGUAYO</td></tr>
<tr><td>Concentraci&oacute;n</td><td>8.4 %</td></tr>
<tr><td>Presentaci&oacute;n</td><td>CAJA</td></tr>
<tr><td>Medida presentaci&oacute;n</td><td>72 ENVASE FLEXIBLE</td></tr>
</tbody></table>
<ul><li>Variaci&oacute;n:</li><li><strong>72 ENVASES 100 ML</strong></li></ul>`

const items = parseItemFeatures(html)
assert.equal(items.length, 1, 'one item')
assert.equal(items[0]!.nro, 1, 'nro parsed')
const f = Object.fromEntries(items[0]!.features.map(x => [x.name, x.value]))
assert.equal(f['Marca'], 'FARMACO URUGUAYO', 'marca')
assert.equal(f['Concentración'], '8.4 %', 'concentración decoded')
assert.equal(f['Presentación'], 'CAJA', 'presentación decoded')
assert.equal(items[0]!.variation, '72 ENVASES 100 ML', 'variación')
assert.equal(parseBuyObject(html), 'Solución bicarbonatada molar', 'object')
console.log('item-features.test OK')
```

- [ ] **Step 4: Run it — must fail first if the util is missing, then pass**

Run: `npx tsx test/item-features.test.ts`
Expected before Step 1/2: module-not-found. After: `item-features.test OK`.

- [ ] **Step 5: Confirm the existing endpoint still works**

Restart the dev server. Open a contract detail page known to have características (e.g. `/contracts/adjudicacion-1269909`) and confirm the características still render under its items. (On the mirror this scrapes live from the gov site, so it needs network.)

- [ ] **Step 6: Commit**

```bash
git add app/server/utils/item-features.ts "app/server/api/contracts/[id]/features.get.ts" test/item-features.test.ts
git commit -m "refactor(features): extract item-características scraper into a shared server util"
```

---

### Task 5: Batch característica endpoint

**Files:**
- Create: `app/server/api/contracts/item-features/batch.post.ts`

**Interfaces:**
- Consumes: `scrapeItemFeatures`, `parseItemFeatures` (Task 4); `ContractItemFeaturesModel`.
- Produces: `POST /api/contracts/item-features/batch` body `{ compras: string[] }` (compraIds; capped at 25) →
  ```ts
  { success: true, data: Record<string /*compraId*/, { items: ScrapedItem[]; object: string | null } | { pending: true }> }
  ```

- [ ] **Step 1: Write the endpoint**

Create `app/server/api/contracts/item-features/batch.post.ts`:

```ts
import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { ContractItemFeaturesModel } from '../../../utils/models'
import { scrapeItemFeatures } from '../../../utils/item-features'
import { awardUrl, sourceUrl } from '../../../utils/query'

/**
 * Batch características for a page of contracts. Cache-first: cached compras
 * return instantly; misses are scraped under a small concurrency cap within a
 * wall-clock budget, and anything still unfetched comes back { pending: true }
 * so the client can re-request later (the cache warms across views).
 */
const MAX_COMPRAS = 25
const CONCURRENCY = 5
const BUDGET_MS = 12000

export default defineEventHandler(async (event) => {
  await connectToDatabase()
  const body = await readBody<{ compras?: unknown }>(event)
  const compras = Array.isArray(body?.compras)
    ? [...new Set(body!.compras.filter((c): c is string => typeof c === 'string' && !!c))].slice(0, MAX_COMPRAS)
    : []
  if (!compras.length) throw createError({ statusCode: 400, statusMessage: 'compras[] required' })

  const out: Record<string, { items: any[]; object: string | null } | { pending: true }> = {}

  const cached = await ContractItemFeaturesModel.find({ compraId: { $in: compras } })
    .select('compraId items object').lean()
  const cachedBy = new Map(cached.map(c => [c.compraId, c]))
  const misses: string[] = []
  for (const id of compras) {
    const c = cachedBy.get(id)
    if (c && c.object !== undefined) out[id] = { items: c.items ?? [], object: c.object || null }
    else misses.push(id)
  }

  // Scrape misses under a deadline. The gov id_compra is the compraId; the
  // llamado page always exists, so scrape it (award page adds nothing new here).
  const deadline = Date.now() + BUDGET_MS
  let cursor = 0
  async function worker() {
    while (cursor < misses.length && Date.now() < deadline) {
      const id = misses[cursor++]!
      const ocid = `ocds-yfs5dr-${id}` // reconstruct for the URL builders
      const url = sourceUrl(ocid) || awardUrl(ocid)
      const scraped = url ? await scrapeItemFeatures(url) : null
      if (!scraped) { out[id] = { pending: true }; continue }
      out[id] = { items: scraped.items, object: scraped.object }
      await ContractItemFeaturesModel.updateOne(
        { compraId: id },
        { $set: { compraId: id, items: scraped.items, source: 'llamado', object: scraped.object ?? '', fetchedAt: new Date() } },
        { upsert: true },
      ).catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, misses.length) }, worker))
  for (const id of misses) if (!(id in out)) out[id] = { pending: true }

  // Fully-resolved batches are static; a batch with pending entries must not be cached.
  if (!Object.values(out).some(v => 'pending' in v)) setHeader(event, 'cache-control', 'public, max-age=86400')
  return { success: true, data: out }
})
```

> Note: confirm the ocid prefix. `sourceUrl`/`compraIdFromOcid` in `app/server/utils/query.ts` show the real prefix; if compras can carry non-`yfs5dr` prefixes, pass the full ocid from the client instead. See Step 2.

- [ ] **Step 2: De-risk the ocid reconstruction**

Because a compraId does not always come from the `yfs5dr` prefix, change the contract to accept the reconstruction-free value: have the client send `sourceUrl` directly is overkill — instead, the contracts list already returns `ocid` per row (Task 3 adds `compraId`). Update the endpoint to accept `{ items: Array<{ compraId: string, ocid: string }> }` and use `ocid` for the URL builders, `compraId` as the cache key. Adjust the body parse and the worker's URL line to `sourceUrl(item.ocid) || awardUrl(item.ocid)`. (This removes the hardcoded prefix.)

Final body shape:
```ts
{ items: Array<{ compraId: string, ocid: string }> }  // capped at 25
```

- [ ] **Step 3: Verify**

Restart the dev server. Pick a compra/ocid from the earlier curl (Task 3 Step 6). Run:

`curl -s -X POST http://localhost:3600/api/contracts/item-features/batch -H 'content-type: application/json' -d '{"items":[{"compraId":"<ID>","ocid":"<OCID>"}]}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).data,null,1)))"`

Expected: a map keyed by the compraId, with either `{items:[…],object}` (if cached or scrapeable) or `{pending:true}` (if the gov site didn't answer in budget). A second identical call returns the cached shape quickly.

- [ ] **Step 4: Commit**

```bash
git add app/server/api/contracts/item-features/batch.post.ts
git commit -m "feat(features): batch item-características endpoint (cache-first, budgeted scrape)"
```

---

### Task 6: Contracts table — product columns + product sorts (client)

**Files:**
- Modify: `app/pages/contracts/index.vue`
- Modify: `app/i18n/locales/es.json`, `app/i18n/locales/en.json`

**Interfaces:**
- Consumes: `c.focusItem`, `c.compraId`, `c.ocid` from the list API (Task 3); `POST /api/contracts/item-features/batch` (Task 5).
- Produces: no new outward interface.

- [ ] **Step 1: Add i18n keys**

`es.json` under `contracts.table`: `"product": "Producto (este ítem)"`, `"qty": "Cantidad"`, `"unitPrice": "Precio unit."`, `"brand": "Marca"`, `"presentation": "Presentación"`. Under `contracts` add a `sortProduct` group: `"unitPriceDesc": "Precio unitario ↓"`, `"unitPriceAsc": "Precio unitario ↑"`, `"qtyDesc": "Cantidad ↓"`, `"qtyAsc": "Cantidad ↑"`. Mirror all in `en.json` (English labels; keep the arrows).

- [ ] **Step 2: Compute the focus code + wire product sorts**

In `app/pages/contracts/index.vue`, add:

```ts
const focusCode = computed(() => filters.value.categoryId.length === 1 ? filters.value.categoryId[0]! : null)
```

Extend the `SORTS` map (~lines 66-72) with:

```ts
  itemPriceDesc: { sortBy: 'itemUnitPrice', sortOrder: 'desc' },
  itemPriceAsc:  { sortBy: 'itemUnitPrice', sortOrder: 'asc' },
  itemQtyDesc:   { sortBy: 'itemQuantity', sortOrder: 'desc' },
  itemQtyAsc:    { sortBy: 'itemQuantity', sortOrder: 'asc' },
```

In the sort `<select>` (~lines 508-530), add, guarded by focus:

```vue
        <template v-if="focusCode">
          <option value="itemPriceDesc">{{ t('contracts.sortProduct.unitPriceDesc') }}</option>
          <option value="itemPriceAsc">{{ t('contracts.sortProduct.unitPriceAsc') }}</option>
          <option value="itemQtyDesc">{{ t('contracts.sortProduct.qtyDesc') }}</option>
          <option value="itemQtyAsc">{{ t('contracts.sortProduct.qtyAsc') }}</option>
        </template>
```

Add a watch so leaving focus mode resets a now-invalid product sort:

```ts
watch(focusCode, (v) => { if (!v && ['itemPriceDesc','itemPriceAsc','itemQtyDesc','itemQtyAsc'].includes(sort.value)) sort.value = 'dateDesc' })
```

- [ ] **Step 3: Fetch características for the page in focus mode**

Add:

```ts
const featuresByCompra = ref<Map<string, { items: Array<{ nro: number, features: { name: string, value: string }[], variation?: string }>, object: string | null }>>(new Map())

/** First feature value whose (accent/case-insensitive) name matches any of `names`. */
function featureValue(compraId: string | null | undefined, nro: number | null | undefined, names: string[]): string | null {
  if (!compraId || nro == null) return null
  const rec = featuresByCompra.value.get(compraId)
  const item = rec?.items.find(i => i.nro === nro)
  if (!item) return null
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const wanted = names.map(norm)
  const hit = item.features.find(f => wanted.some(w => norm(f.name).includes(w)))
  return hit?.value ?? null
}

async function loadFeatures() {
  if (!focusCode.value) return
  const items = (listRes.value?.data?.contracts ?? [])
    .filter((c: any) => c.compraId && c.ocid && !featuresByCompra.value.has(c.compraId))
    .map((c: any) => ({ compraId: c.compraId, ocid: c.ocid }))
  if (!items.length) return
  try {
    const res = await $fetch<any>('/api/contracts/item-features/batch', { method: 'POST', body: { items: items.slice(0, 25) } })
    const next = new Map(featuresByCompra.value)
    for (const [id, v] of Object.entries<any>(res?.data ?? {})) if (!('pending' in v)) next.set(id, v)
    featuresByCompra.value = next
  }
  catch { /* leave cells blank; a later view retries */ }
}

watch(() => listRes.value?.data?.contracts, () => { loadFeatures() })
```

- [ ] **Step 4: Render the focus columns**

In the `<thead>` (after the Object `<th>`, before Buyer), add:

```vue
                  <template v-if="focusCode">
                    <th scope="col" class="ctable__c-prod">{{ t('contracts.table.product') }}</th>
                    <th scope="col" class="ctable__c-qty">{{ t('contracts.table.qty') }}</th>
                    <th scope="col" class="ctable__c-uprice">{{ t('contracts.table.unitPrice') }}</th>
                  </template>
```

In the `<tbody>` row, after the Object `<td>`, add:

```vue
                  <template v-if="focusCode">
                    <td class="ctable__c-prod" :data-label="t('contracts.table.product')">
                      <span class="u-clamp-2">{{ c.focusItem?.description || '—' }}</span>
                      <span
                        v-if="featureValue(c.compraId, c.focusItem?.nro, ['marca'])"
                        class="ctable__feat"
                      >{{ t('contracts.table.brand') }}: {{ featureValue(c.compraId, c.focusItem?.nro, ['marca']) }}</span>
                      <span
                        v-if="featureValue(c.compraId, c.focusItem?.nro, ['presentacion','nombre comercial','modelo'])"
                        class="ctable__feat"
                      >{{ featureValue(c.compraId, c.focusItem?.nro, ['nombre comercial','modelo','presentacion']) }}</span>
                    </td>
                    <td class="ctable__c-qty u-mono" :data-label="t('contracts.table.qty')">
                      {{ c.focusItem?.quantity != null ? formatNumber(c.focusItem.quantity) : '—' }}
                      <span v-if="c.focusItem?.unitName" class="ctable__unit">{{ c.focusItem.unitName }}</span>
                    </td>
                    <td class="ctable__c-uprice" :data-label="t('contracts.table.unitPrice')">
                      <MoneyAmount :amount="c.focusItem?.unitAmount ?? null" :currency="c.focusItem?.currency" :rule="false" size="sm" compact />
                    </td>
                  </template>
```

- [ ] **Step 5: Style the new cells**

In the page `<style scoped>` (SCSS — the block is `lang="scss"`? confirm; if plain CSS, use `/* */` comments only), add:

```css
.ctable__feat { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.ctable__unit { margin-left: .4ch; font-size: var(--t-xs); color: var(--text-muted); }
```

- [ ] **Step 6: Verify in the browser**

Restart the dev server. Open `/contracts?categoryId=26392`. Confirm: three extra columns appear (Producto / Cantidad / Precio unit.); the "Producto" cell shows the item's specific description and, once the batch resolves, a "Marca: …" line and the commercial/presentation line; the sort dropdown gains the four product options; picking "Precio unitario ↓" reorders by unit price. Remove the product filter → the extra columns and sort options disappear and the sort resets. Check mobile width: the `:data-label` values show as row labels.

- [ ] **Step 7: Commit**

```bash
git add app/pages/contracts/index.vue app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "feat(contracts): product-specific columns, características, and unit-price/qty sorts in focus mode"
```

---

### Task 7: `product_variants` model + `refresh-product-variants` job + cron + indexes

**Files:**
- Create: `shared/models/product_variants.ts`
- Create: `src/jobs/variants/rollup.ts` (pure aggregation helper)
- Create: `src/jobs/refresh-product-variants.ts` (the job)
- Create: `test/variants-rollup.test.ts`
- Modify: `package.json` (add `refresh-product-variants` script)
- Modify: `scripts/ensure-indexes.ts` (register indexes)
- Modify: `src/cronserver.ts` (schedule + `/cron/product-variants` route + guard)

**Interfaces:**
- Produces:
  ```ts
  // product_variants.ts
  export interface IVariantValue { value: string; count: number }
  export interface IVariantAttr { name: string; values: IVariantValue[]; distinct: number }
  export interface IProductVariants {
    code: string; sampledContracts: number; attributes: IVariantAttr[]; varies: boolean
    calculatedAt: Date; dataVersion: string
  }
  export const ProductVariantsModel: Model<IProductVariants>

  // rollup.ts
  export interface MatchedItem { features: { name: string; value: string }[]; variation?: string }
  export function rollupVariants(matched: MatchedItem[]): { attributes: IVariantAttr[]; varies: boolean; sampledContracts: number }
  ```

- [ ] **Step 1: Model**

Create `shared/models/product_variants.ts`:

```ts
import { Schema, Model } from 'mongoose'
import { mongoose } from '../connection/database'

// Per catalogue-code distribution of the SCRAPED item características (Marca,
// Concentración, Presentación, Nombre comercial, Variación). OCDS omits these
// and the SICE catalog does not carry them per article — they exist only in
// contract_item_features (scraped per compra). This precomputes, for the codes
// that carry an UNEXPLAINED anomaly, "does the physical product behind this
// code actually vary, and how" — the question a price spike raises.
export interface IVariantValue { value: string; count: number }
export interface IVariantAttr { name: string; values: IVariantValue[]; distinct: number }
export interface IProductVariants {
  code: string
  sampledContracts: number
  attributes: IVariantAttr[]
  varies: boolean
  calculatedAt: Date
  dataVersion: string
}

const ValueSchema = new Schema<IVariantValue>({ value: { type: String, required: true }, count: { type: Number, required: true } }, { _id: false })
const AttrSchema = new Schema<IVariantAttr>({ name: { type: String, required: true }, values: { type: [ValueSchema], default: [] }, distinct: { type: Number, required: true } }, { _id: false })

const ProductVariantsSchema = new Schema<IProductVariants>({
  code: { type: String, required: true },
  sampledContracts: { type: Number, required: true, default: 0 },
  attributes: { type: [AttrSchema], default: [] },
  varies: { type: Boolean, required: true, default: false },
  calculatedAt: { type: Date, required: true, default: Date.now },
  dataVersion: { type: String, required: true },
}, { timestamps: true, collection: 'product_variants' })

ProductVariantsSchema.index({ code: 1 }, { unique: true })
ProductVariantsSchema.index({ dataVersion: 1 })

export const ProductVariantsModel: Model<IProductVariants> = mongoose.model<IProductVariants>('ProductVariants', ProductVariantsSchema)
```

- [ ] **Step 2: Rollup helper (pure)**

Create `src/jobs/variants/rollup.ts`:

```ts
import type { IVariantAttr } from '../../../shared/models/product_variants'

export interface MatchedItem { features: { name: string; value: string }[]; variation?: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Feature names we roll up, in display order. Each entry lists the label to show
// and the normalized substrings that match the gov page's row labels.
const AXES: { label: string; match: string[]; key?: boolean }[] = [
  { label: 'Marca', match: ['marca'], key: true },
  { label: 'Nombre comercial/modelo', match: ['nombre comercial', 'modelo'], key: true },
  { label: 'Presentación', match: ['presentacion'], key: true },
  { label: 'Concentración', match: ['concentracion'] },
  { label: 'Medida presentación', match: ['medida'] },
  { label: 'Variación', match: ['__variation__'] },
]

export function rollupVariants(matched: MatchedItem[]): { attributes: IVariantAttr[]; varies: boolean; sampledContracts: number } {
  const counts = new Map<string, Map<string, number>>() // axis label -> value -> count
  for (const ax of AXES) counts.set(ax.label, new Map())

  for (const m of matched) {
    for (const ax of AXES) {
      let value: string | undefined
      if (ax.match[0] === '__variation__') value = m.variation
      else {
        const hit = m.features.find(f => ax.match.some(w => norm(f.name).includes(w)))
        value = hit?.value
      }
      if (!value) continue
      const bucket = counts.get(ax.label)!
      bucket.set(value, (bucket.get(value) ?? 0) + 1)
    }
  }

  const attributes: IVariantAttr[] = []
  let varies = false
  for (const ax of AXES) {
    const bucket = counts.get(ax.label)!
    if (!bucket.size) continue
    const values = [...bucket.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
    attributes.push({ name: ax.label, values, distinct: values.length })
    if (ax.key && values.length > 1) varies = true
  }
  return { attributes, varies, sampledContracts: matched.length }
}
```

- [ ] **Step 3: Test the rollup**

Create `test/variants-rollup.test.ts`:

```ts
import assert from 'node:assert/strict'
import { rollupVariants } from '../src/jobs/variants/rollup'

const out = rollupVariants([
  { features: [{ name: 'Marca', value: 'FARMACO URUGUAYO' }, { name: 'Presentación', value: 'CAJA' }], variation: '72 ENVASES' },
  { features: [{ name: 'Marca', value: 'FARMACO URUGUAYO' }, { name: 'Presentación', value: 'CAJA' }], variation: '72 ENVASES' },
  { features: [{ name: 'Marca', value: 'OTRA MARCA' }, { name: 'Presentación', value: 'FRASCO' }] },
])
const marca = out.attributes.find(a => a.name === 'Marca')!
assert.equal(marca.distinct, 2, 'two brands')
assert.equal(marca.values[0]!.value, 'FARMACO URUGUAYO', 'most common brand first')
assert.equal(marca.values[0]!.count, 2, 'count')
assert.equal(out.varies, true, 'varies when >1 brand')
assert.equal(out.sampledContracts, 3, 'sample size')

const same = rollupVariants([
  { features: [{ name: 'Marca', value: 'X' }] },
  { features: [{ name: 'Marca', value: 'X' }] },
])
assert.equal(same.varies, false, 'single brand → does not vary')
console.log('variants-rollup.test OK')
```

- [ ] **Step 4: Run it**

Run: `npx tsx test/variants-rollup.test.ts`
Expected: `variants-rollup.test OK`.

- [ ] **Step 5: Write the job**

Create `src/jobs/refresh-product-variants.ts`. Follow the shape of `src/jobs/cross-provider-anomalies.ts` for connection, `dataVersion` stamping, compute-then-swap, and logging. Core logic:

```ts
import { connectToDatabase } from '../../shared/connection/database'
import { AnomalyModel } from '../../shared/models/anomaly'
import { ReleaseModel } from '../../shared/models/release'
import { ContractItemFeaturesModel } from '../../shared/models/contract_item_features'
import { ProductVariantsModel } from '../../shared/models/product_variants'
import { rollupVariants, type MatchedItem } from './variants/rollup'
// Reuse the app scraper util path if importable from src; otherwise inline scrapeItemFeatures.
import { scrapeItemFeatures } from '../../app/server/utils/item-features'
import { compraIdFromOcid, sourceUrl, awardUrl } from '../../app/server/utils/query'

const JUNK = new Set(['0', '', 'UNKNOWN'])
const MAX_CONTRACTS_PER_CODE = 300

async function run() {
  await connectToDatabase()
  const dataVersion = new Date().toISOString() // stamp; Date is allowed here (job, not workflow)

  const codes = (await AnomalyModel.distinct('metadata.itemClassification.id', { 'aiVerdict.explainable': 'no' }))
    .filter((c): c is string => typeof c === 'string' && !JUNK.has(c))
  console.log(`[variants] ${codes.length} unexplained-anomaly codes`)

  for (const code of codes) {
    // {compraId, ocid, nro} for this code's award releases.
    const releases = await ReleaseModel.find({ tag: 'award', 'awards.items.classification.id': code })
      .select('ocid awards').limit(MAX_CONTRACTS_PER_CODE).lean()
    const targets = releases.map((r: any) => {
      const flat = (r.awards ?? []).flatMap((a: any) => a.items ?? [])
      const it = flat.find((i: any) => i?.classification?.id === code)
      const nro = it?.id ? Number(String(it.id).split('-')[0]) : null
      return { compraId: compraIdFromOcid(r.ocid), ocid: r.ocid, nro }
    }).filter(t => t.compraId && t.nro != null)

    // Ensure características cached (scrape misses sequentially to be gentle).
    const ids = [...new Set(targets.map(t => t.compraId!))]
    const cached = new Map((await ContractItemFeaturesModel.find({ compraId: { $in: ids } }).select('compraId items object').lean())
      .map((c: any) => [c.compraId, c]))
    for (const t of targets) {
      if (cached.has(t.compraId!)) continue
      const url = sourceUrl(t.ocid) || awardUrl(t.ocid)
      const scraped = url ? await scrapeItemFeatures(url) : null
      if (scraped) {
        await ContractItemFeaturesModel.updateOne({ compraId: t.compraId },
          { $set: { compraId: t.compraId, items: scraped.items, source: 'llamado', object: scraped.object ?? '', fetchedAt: new Date() } },
          { upsert: true }).catch(() => {})
        cached.set(t.compraId!, { items: scraped.items } as any)
      }
    }

    // Pick each contract's matched item and roll up.
    const matched: MatchedItem[] = []
    for (const t of targets) {
      const rec: any = cached.get(t.compraId!)
      const item = rec?.items?.find((i: any) => i.nro === t.nro)
      if (item) matched.push({ features: item.features ?? [], variation: item.variation })
    }
    if (!matched.length) continue
    const { attributes, varies, sampledContracts } = rollupVariants(matched)
    await ProductVariantsModel.updateOne({ code },
      { $set: { code, attributes, varies, sampledContracts, dataVersion, calculatedAt: new Date() } },
      { upsert: true })
    console.log(`[variants] ${code}: ${sampledContracts} sampled, varies=${varies}`)
  }

  // Drop stale docs from prior versions (codes no longer unexplained).
  await ProductVariantsModel.deleteMany({ dataVersion: { $ne: dataVersion } })
  console.log('[variants] done')
  process.exit(0)
}
run().catch(e => { console.error(e); process.exit(1) })
```

> If `app/server/utils/item-features.ts` cannot be imported from `src/` due to the app's tsconfig path setup, copy `scrapeItemFeatures` + its private helpers into `src/jobs/variants/scrape.ts` and import from there. Verify the import resolves under `tsx` before proceeding.

- [ ] **Step 6: Add the npm script**

In `package.json` scripts: `"refresh-product-variants": "tsx src/jobs/refresh-product-variants.ts",`.

- [ ] **Step 7: Register indexes**

In `scripts/ensure-indexes.ts`, near the other SICE/analytics index blocks, add index creation for `product_variants`: `{ code: 1 }` unique and `{ dataVersion: 1 }`. Match the file's existing `createIndex`/collection helper style.

- [ ] **Step 8: Schedule in the cronserver**

In `src/cronserver.ts`, following the `cross-provider-anomalies` pattern: add a run guard, a scheduled entry (weekly, e.g. `0 7 * * 0`, after the anomaly triage), and a `/cron/product-variants` manual-trigger route that spawns the compiled job. Match the existing spawn-of-`dist` approach (not `tsx`) noted in the deploy memory.

- [ ] **Step 9: Verify the job against the DB**

Run: `MAX_CODES=3 npx tsx src/jobs/refresh-product-variants.ts` (add a small `MAX_CODES` slice guard at the top of `run()` for this smoke test, then remove it). On the live DB it prints per-code lines and writes `product_variants`. Then:

`node -e "require('tsx/cjs');require('./scripts/quick-count')" ` — or simply re-query in a scratch tsx script asserting `ProductVariantsModel.findOne({code:'26392'})` has `attributes.length > 0`.

Expected: at least the bicarbonate code (26392, if it carries an unexplained anomaly) has a `Marca` attribute; `varies` reflects whether >1 brand/presentation/commercial name was seen.

- [ ] **Step 10: Commit**

```bash
git add shared/models/product_variants.ts src/jobs/variants/ src/jobs/refresh-product-variants.ts test/variants-rollup.test.ts package.json scripts/ensure-indexes.ts src/cronserver.ts
git commit -m "feat(variants): precompute item-característica variants for unexplained-anomaly products"
```

---

### Task 8: Product API returns variants

**Files:**
- Modify: `app/server/api/analytics/products/[code].get.ts`

**Interfaces:**
- Consumes: `ProductVariantsModel` (Task 7).
- Produces: the product response `data` gains `variants: IProductVariants | null`.

- [ ] **Step 1: Read variants non-fatally**

In `app/server/api/analytics/products/[code].get.ts`, add `ProductVariantsModel` to the imports from `../../../utils/models` (register it there if the barrel needs it), then alongside the `ItemPriceBaselineModel.find(...)` add:

```ts
const variants = await ProductVariantsModel.findOne({ code }).select('attributes varies sampledContracts calculatedAt').lean().catch(() => null)
```

and include `variants` in the returned `data`.

- [ ] **Step 2: Verify**

Restart the dev server. Run:

`curl -s "http://localhost:3600/api/analytics/products/26392" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log('variants:',JSON.stringify(d.variants))})"`

Expected: `variants: {...}` when the job has run for 26392, else `variants: null` — either way the endpoint stays 200.

- [ ] **Step 3: Commit**

```bash
git add "app/server/api/analytics/products/[code].get.ts" app/server/utils/models.ts
git commit -m "feat(products-api): return precomputed característica variants"
```

---

### Task 9: Product page — deep-links, charts, variants panel

**Files:**
- Modify: `app/pages/products/[code].vue`
- Create: `app/components/PriceDispersion.vue` (Chart.js range chart)
- Modify: `app/i18n/locales/es.json`, `app/i18n/locales/en.json`

**Interfaces:**
- Consumes: `product.topSuppliers/topBuyers` (with `lines`), `product.priceUnits`, `product.variants` (Task 8); `POST /api/contracts/item-features/batch` (Task 5) for the lazy panel; `InvHBars` for concentration.
- Produces: no new outward interface.

- [ ] **Step 1: i18n keys**

`es.json` under `products.detail`: `"filterHere": "Ver sus contratos de este producto"`, `"profile": "Perfil"`, `"concentrationTitle": "Concentración de proveedores"`, `"concentrationHelp": "Cuántos proveedores concentran las compras de este producto."`, `"dispersionTitle": "Dispersión de precios"`, `"dispersionHelp": "Rango de precio unitario por moneda y unidad (p25–p50–p95)."`, `"variesTitle": "¿Varía el producto?"`, `"variesYes": "El artículo aparece con detalles distintos entre contratos."`, `"variesNo": "El artículo se presenta igual en los contratos vistos."`, `"variesSample": "Sobre {n} contratos con características disponibles."`. Mirror in `en.json`.

- [ ] **Step 2: Fix who-sells / who-buys links**

In `app/pages/products/[code].vue`, change the row links so the **primary** action filters contracts by product **and** party, and add a secondary "perfil" link where an id exists.

Replace `supplierTo`/`buyerTo` usage: keep them (renamed intent) as the *profile* target, and add:

```ts
const sellerContractsTo = (s: { name: string }) => localePath(`/contracts?categoryId=${encodeURIComponent(code.value)}&suppliers=${encodeURIComponent(s.name)}`)
const buyerContractsTo = (b: { name: string }) => localePath(`/contracts?categoryId=${encodeURIComponent(code.value)}&buyers=${encodeURIComponent(b.name)}`)
```

In each rank row, make the main `<NuxtLink :to>` use `sellerContractsTo(s)` / `buyerContractsTo(b)`, and add after the name a small secondary link:

```vue
                <NuxtLink
                  v-if="s.id"
                  :to="supplierTo(s)"
                  class="rank__profile"
                  @click.stop
                >{{ t('products.detail.profile') }}</NuxtLink>
```

(`@click.stop` so the profile link doesn't also trigger the row link.) Add `.rank__profile { font-size: var(--t-xs); color: var(--celeste-deep); }`.

- [ ] **Step 3: Concentration bars**

Below the who-buys/who-sells section, add a section using the existing `InvHBars` for the top suppliers by lines:

```vue
      <section v-if="topSuppliers.length > 1" class="block">
        <div class="block__head"><h2>{{ t('products.detail.concentrationTitle') }}</h2></div>
        <p class="block__help">{{ t('products.detail.concentrationHelp') }}</p>
        <div class="panel panel--pad">
          <ClientOnly>
            <InvHBars :items="topSuppliers.slice(0,8).map(s => ({ label: s.name, value: s.lines, color: 'celeste' }))" format="count" />
          </ClientOnly>
        </div>
      </section>
```

- [ ] **Step 4: Price dispersion chart**

Create `app/components/PriceDispersion.vue` — a horizontal floating-bar chart (one row per `{currency,unitName}`, bar spanning p25→p95, a marker at p50), Chart.js `Bar` with a `[p25,p95]` floating dataset. Copy the token-reading + theme-observe scaffolding from `InvHBars.vue`. Props: `units: Array<{ currency, unitName, p25, p50, p95, n }>`. Render p50 as a point dataset or an annotation-free second dataset of zero-width bars at p50. Money labels via `formatMoney`. Then add a section on the product page (near the price table) rendering `<ClientOnly><PriceDispersion :units="priceUnits" /></ClientOnly>` when `priceUnits.length`.

- [ ] **Step 5: Variants panel**

Add a section that renders `product.variants` when present, else lazily aggregates. Script:

```ts
const variants = computed<any | null>(() => product.value?.variants ?? null)
const lazyVariants = ref<any | null>(null)
const variantsData = computed(() => variants.value ?? lazyVariants.value)

async function loadLazyVariants() {
  if (variants.value || lazyVariants.value) return
  // Sample this code's contracts, then batch-scrape their características and roll up client-side.
  const list = await $fetch<any>('/api/contracts', { query: { categoryId: code.value, tag: 'award', limit: 20, sortBy: 'date', sortOrder: 'desc' } }).catch(() => null)
  const rows = (list?.data?.contracts ?? []).filter((c: any) => c.compraId && c.ocid && c.focusItem?.nro != null)
  if (!rows.length) return
  const res = await $fetch<any>('/api/contracts/item-features/batch', { method: 'POST', body: { items: rows.map((c: any) => ({ compraId: c.compraId, ocid: c.ocid })) } }).catch(() => null)
  const matched: any[] = []
  for (const c of rows) {
    const rec = res?.data?.[c.compraId]
    const item = rec && !('pending' in rec) ? rec.items.find((i: any) => i.nro === c.focusItem.nro) : null
    if (item) matched.push({ features: item.features ?? [], variation: item.variation })
  }
  if (!matched.length) return
  // Minimal client roll-up mirroring the server axes.
  lazyVariants.value = clientRollup(matched)
}
onMounted(() => { if (!variants.value) loadLazyVariants() })
```

Add a small `clientRollup` in the page (or import a shared browser-safe copy) using the same normalized-name axis logic as `src/jobs/variants/rollup.ts`. Template:

```vue
      <section v-if="variantsData?.attributes?.length" class="block">
        <div class="block__head"><h2>{{ t('products.detail.variesTitle') }}</h2></div>
        <p class="block__help">
          {{ variantsData.varies ? t('products.detail.variesYes') : t('products.detail.variesNo') }}
          <span v-if="variantsData.sampledContracts">{{ ' ' + t('products.detail.variesSample', { n: variantsData.sampledContracts }) }}</span>
        </p>
        <div class="varies">
          <div v-for="a in variantsData.attributes" :key="a.name" class="varies__attr">
            <span class="varies__name">{{ a.name }}</span>
            <ul class="varies__vals">
              <li v-for="v in a.values.slice(0, 6)" :key="v.value">
                <span class="varies__v u-truncate">{{ v.value }}</span>
                <span class="varies__c u-mono">{{ v.count }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
```

Add scoped styles for `.varies`, `.varies__attr`, `.varies__vals`, etc. (grid of attributes; each a labelled value/count list).

- [ ] **Step 6: Verify in the browser**

Restart the dev server. Open `/products/26392`. Confirm: who-vende/who-compra rows now link to `/contracts?categoryId=26392&suppliers=…` (and the secondary "Perfil" link goes to the supplier profile); the concentration bars and price-dispersion chart render (dispersion needs `item_price_baselines`, which is empty on the mirror — verify this one against prod); the "¿Varía el producto?" panel shows Marca / Presentación / Nombre comercial value lists with counts, and the headline reads "varía" vs "igual" correctly for the bicarbonate.

- [ ] **Step 7: Commit**

```bash
git add "app/pages/products/[code].vue" app/components/PriceDispersion.vue app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "feat(products): product+provider deep-links, concentration + price-dispersion charts, and a variants panel"
```

---

### Task 10: Full-flow verification + clean build

**Files:** none (verification only).

- [ ] **Step 1: Run all pure-function tests**

Run: `npx tsx test/item-features.test.ts && npx tsx test/variants-rollup.test.ts`
Expected: both print `… OK`.

- [ ] **Step 2: Clean build**

Run: `cd app && rm -rf .nuxt .output node_modules/.vite && npm run build`
Expected: build succeeds (catches the SCSS `//`-comment and stale-route traps a warm build hides).

- [ ] **Step 3: Lint the server/job side**

Run: `npm run lint`
Expected: no new errors in the files this plan touched.

- [ ] **Step 4: Browser smoke of the whole flow**

With a fresh dev server (or the built output): `/contracts` → search+select a product → focus columns + características + product sort → click a product on `/products/[code]` → variants panel + charts + product+provider deep-links → follow a deep-link back into `/contracts` pre-filtered by product AND provider. Measure settled state (reduced-motion for any scroll checks).

- [ ] **Step 5: Report**

Summarize what was verified against the **live** DB vs the mirror (dispersion + variants completeness must be confirmed on prod), and note the `refresh-product-variants` cron is deploy-pending (runs from compiled `dist` under pm2).

---

## Self-Review

**Spec coverage:**
- Contracts multi-product autocomplete (spec Unit A/B) → Tasks 1–2. ✅
- Product-specific columns + sorting (Unit C/F) → Tasks 3, 6. ✅
- Shared scraper + batch endpoint (Unit D/E) → Tasks 4, 5. ✅
- Offline variants precompute + model + cron + indexes (Unit G/J) → Task 7. ✅
- Product API variants (Unit H) → Task 8. ✅
- Product page deep-links + charts + variants panel (Unit I) → Task 9. ✅
- i18n keys → folded into Tasks 2, 6, 9. ✅
- Full verification + clean build → Task 10. ✅

**Placeholder scan:** no TBD/TODO; every code step carries real code. Two explicit de-risk notes (ocid prefix in Task 5 Step 2; src→app import in Task 7 Step 5) are resolution instructions, not deferrals.

**Type consistency:** `focusItem` shape defined in Task 3 is consumed with the same field names in Task 6 and Task 9. `ScrapedItem` defined in Task 4 is used in Tasks 5, 7. `rollupVariants` signature in Task 7 matches its test and the page's `clientRollup` mirror. `ProductVariantsModel`/`IProductVariants` defined in Task 7, consumed in Task 8/9. Batch endpoint body settled to `{ items: {compraId, ocid}[] }` (Task 5 Step 2) and every caller (Tasks 6, 9) uses that shape. ✅

**Known caveats carried from spec:** native-currency unit-price sort (documented), variants completeness only guaranteed for unexplained-anomaly codes (lazy elsewhere), dispersion/variants must be verified on prod not the mirror.
