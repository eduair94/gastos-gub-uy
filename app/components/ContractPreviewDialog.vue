<script setup lang="ts">
/**
 * ContractPreviewDialog — a click-to-preview of one contract, without leaving
 * the results (and without loading the whole detail page first).
 *
 * It answers the three questions the table row can't: WHO (organismo and
 * proveedor, each linked to its profile), WHAT (every line, each linked to its
 * product), and HOW MUCH — restated honestly. The amount column on the row is
 * `primaryAmount`, a UYU conversion done at TODAY's rate, so a 2005 US$ price
 * reads as a large peso figure it never was. Here the amount is shown three
 * ways: native, in UYU at the BCU rate of the contract's OWN month, and in
 * today's pesos (deflated by the Unidad Indexada). Both conversions are the
 * shared pure functions the detail page uses server-side, fed the monthly rate
 * table the parent loaded once from /api/rates.
 */
import { monthKey, toNominalUyu, toTodayUyu } from '#shared/utils/real-value'
import type { RateTable } from '#shared/utils/real-value'

const props = defineProps<{
  modelValue: boolean
  contract: ContractLike | null
  rateTable: RateTable | null
  /** The active explorer search, so the line that matched leads. */
  searchPhrase?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const { t } = useI18n()
const localePath = useLocalePath()

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const filterQuery = ref('')
// Reset the in-dialog filter whenever a different contract opens.
watch(() => props.contract, () => {
  filterQuery.value = ''
})

// The explicit subject, else the stage-named fallback — same as the row heading.
const contractName = useContractTitle()
const title = computed(() => contractName(props.contract))
const stage = computed(() => primaryTag(props.contract))
const buyer = computed(() => props.contract?.buyer ?? null)
const suppliers = computed(() => contractSuppliers(props.contract))
const method = computed(() => props.contract?.tender?.procurementMethodDetails || '')
const date = computed(() => contractDate(props.contract))

/** Order lines so the search match leads, then apply the in-dialog filter. */
const allItems = computed(() => orderByMatchLocal(contractItems(props.contract), props.searchPhrase ?? ''))
const items = computed(() => {
  const tokens = filterQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return allItems.value
  return allItems.value.filter((r) => {
    const hay = `${r.description} ${r.code} ${r.codeDescription} ${r.unitName}`.toLowerCase()
    return tokens.every(tk => hay.includes(tk))
  })
})

/** The sum of the lines — only meaningful in a single currency. */
const itemsTotal = computed(() => {
  const rows = allItems.value.filter(r => typeof r.total === 'number' && r.total > 0)
  if (!rows.length) return null
  const currencies = new Set(rows.map(r => r.currency))
  if (currencies.size !== 1) return null
  return { amount: rows.reduce((s, r) => s + (r.total ?? 0), 0), currency: [...currencies][0]! }
})

/**
 * The contract amount in three forms. `native` is what the source reported;
 * `historic` is that amount in UYU at the BCU rate of its own month (only for a
 * single foreign currency); `today` deflates the UYU to today's pesos. Any
 * conversion the rate table can't cover comes back null and is simply not shown.
 */
const money = computed(() => {
  const c = props.contract
  if (!c) return null
  const amt = c.amount ?? {}
  const currencies = (amt.currencies ?? []).filter(Boolean)
  const mixed = currencies.length > 1

  let nativeCurrency = 'UYU'
  let nativeAmount: number | null = null
  if (currencies.length === 1 && typeof amt.totalAmounts?.[currencies[0]!] === 'number') {
    nativeCurrency = currencies[0]!
    nativeAmount = amt.totalAmounts[currencies[0]!]!
  }
  else if (typeof amt.totalAmounts?.UYU === 'number') {
    nativeAmount = amt.totalAmounts.UYU
  }
  else {
    nativeAmount = contractAmount(c)
    nativeCurrency = contractCurrency(c)
  }
  if (nativeAmount === null || !Number.isFinite(nativeAmount)) return null

  const table = props.rateTable
  const month = monthKey(date.value)
  const isForeign = nativeCurrency.toUpperCase() !== 'UYU'
  const historic = (!mixed && isForeign && table)
    ? toNominalUyu(nativeAmount, nativeCurrency, month, table)
    : null
  const today = (!mixed && table)
    ? toTodayUyu(nativeAmount, nativeCurrency, date.value, table)
    : null

  // "02/2005" — unambiguous across locales; the day isn't in the monthly table.
  const monthLabel = month ? `${month.slice(5)}/${month.slice(0, 4)}` : ''

  return { nativeAmount, nativeCurrency, isForeign, mixed, historic, today, monthLabel }
})

/**
 * Present only on releases where a lump sum stored in the item's unit price
 * inflated the header total by orders of magnitude and it was corrected
 * against the government's own published figure (see
 * `contractVerifiedOverride`). The line items below are deliberately left as
 * the raw feed reported them, so without this the header money and the
 * item table/footer total visibly contradict each other. Mirrors the badge
 * on the contract detail page (`app/pages/contracts/[id].vue`).
 */
const verifiedOverride = computed(() => contractVerifiedOverride(props.contract))

// --- Local display helpers (kept here so the dialog is self-contained) -------

/** Reorder lines so those matching the active search lead (stable within a tie). */
function orderByMatchLocal<T extends { description?: string, code?: string, codeDescription?: string }>(rows: T[], phrase: string): T[] {
  const tokens = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return rows
  const score = (r: T) => {
    const hay = `${r.description ?? ''} ${r.code ?? ''} ${r.codeDescription ?? ''}`.toLowerCase()
    return tokens.reduce((n, tk) => n + (hay.includes(tk) ? 1 : 0), 0)
  }
  return rows.map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => (b.s - a.s) || (a.i - b.i)).map(x => x.r)
}

const PLURALISABLE = new Set(['unidad', 'kilo', 'kilogramo', 'litro', 'metro', 'hora', 'día', 'dia', 'mes', 'año', 'ano', 'caja', 'bolsa', 'paquete', 'juego', 'rollo', 'tonelada', 'gramo'])
function qtyLabel(it: { quantity?: number | null, unitName?: string }): string {
  const n = it.quantity ?? 0
  const qty = formatNumber(n)
  const raw = (it.unitName ?? '').trim().toLowerCase()
  if (!raw) return qty
  const plural = n !== 1 && PLURALISABLE.has(raw) ? (/[aeiou]$/.test(raw) ? `${raw}s` : `${raw}es`) : raw
  return `${qty} ${plural}`
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="860"
    scrollable
  >
    <div
      v-if="contract"
      class="idlg"
    >
      <div class="idlg__head">
        <div class="idlg__headtext">
          <p class="u-eyebrow">
            {{ t('preview.eyebrow') }}
          </p>
          <h2 class="idlg__title">
            {{ title }}
          </h2>
          <div class="idlg__tags">
            <span
              v-if="stage"
              class="tag"
              :class="tagTone(stage)"
              :title="t(`contract.stageHelp.${stage}`)"
            >{{ t(`contract.stage.${stage}`) }}</span>
            <span
              v-if="method"
              class="idlg__method u-mono"
            >{{ method }}</span>
            <span
              v-if="date"
              class="idlg__method u-mono"
            >{{ formatDate(date) }}</span>
          </div>
        </div>
        <button
          class="idlg__x"
          type="button"
          :aria-label="t('nav.close')"
          @click="open = false"
        >
          <v-icon>mdi-close</v-icon>
        </button>
      </div>

      <div class="idlg__body u-scroll-x">
        <!-- Who: organismo + proveedor, each linked to its profile. -->
        <div class="idlg__meta">
          <div class="idlg__metacell">
            <span class="idlg__metalabel">{{ t('common.buyer') }}</span>
            <NuxtLink
              v-if="buyer?.id"
              :to="localePath(`/buyers/${encodeURIComponent(buyer.id)}`)"
              class="idlg__metalink"
            >{{ buyer.name || buyer.id }}</NuxtLink>
            <span
              v-else
              class="idlg__metaval"
            >{{ buyer?.name || '—' }}</span>
          </div>
          <div class="idlg__metacell">
            <span class="idlg__metalabel">{{ t('common.supplier') }}</span>
            <template v-if="suppliers.length">
              <span
                v-for="(s, i) in suppliers"
                :key="s.name"
                class="idlg__metaitem"
              >
                <NuxtLink
                  v-if="s.id"
                  :to="localePath(`/suppliers/${encodeURIComponent(s.id)}`)"
                  class="idlg__metalink"
                >{{ s.name }}</NuxtLink>
                <span
                  v-else
                  class="idlg__metaval"
                >{{ s.name }}</span>
                <span v-if="i < suppliers.length - 1">, </span>
              </span>
            </template>
            <span
              v-else
              class="idlg__metaval"
            >—</span>
          </div>
        </div>

        <!-- How much: native, historic UYU (contract's month), and today. -->
        <div
          v-if="money"
          class="idlg__money"
        >
          <div class="idlg__amtmain">
            <MoneyAmount
              :amount="money.nativeAmount"
              :currency="money.nativeCurrency"
              size="lg"
              align="start"
              :rule="false"
            />
          </div>
          <ul class="idlg__conv">
            <li v-if="money.mixed">
              {{ t('money.mixedCurrency') }}
            </li>
            <li v-if="money.historic !== null">
              <span class="idlg__convlabel">{{ t('preview.atBcu', { month: money.monthLabel }) }}</span>
              <MoneyAmount
                :amount="money.historic"
                currency="UYU"
                size="sm"
                align="start"
                :rule="false"
                compact
              />
            </li>
            <li
              v-if="money.today !== null"
              class="idlg__convtoday"
            >
              <span
                class="idlg__convlabel"
                :title="t('money.todayHelp')"
              >{{ t('money.today') }}</span>
              <MoneyAmount
                :amount="money.today"
                currency="UYU"
                size="sm"
                align="start"
                :rule="false"
                compact
              />
            </li>
          </ul>
        </div>

        <!-- Present only on releases where a lump sum stored in the item's
             unit price inflated this total by orders of magnitude and the
             header figure was corrected against the official record (see
             `contractVerifiedOverride`). The line items below are left as
             the raw feed reported them, so this explains the gap instead
             of leaving it looking like a contradiction. -->
        <div
          v-if="verifiedOverride"
          class="idlg__verified"
        >
          <span
            class="tag tag--activo"
            :title="t('contract.verifiedTotalHelp')"
          >
            <v-icon size="12">
              mdi-check-decagram
            </v-icon>
            {{ t('contract.verifiedTotalBadge') }}
          </span>
          <p class="idlg__verifiedhelp">
            {{ t('contract.verifiedTotalHelp') }}
            <a
              :href="verifiedOverride.sourceUrl"
              target="_blank"
              rel="noopener external"
            >{{ t('contract.verifiedTotalSource') }}</a>
          </p>
        </div>

        <!-- In-dialog search: a big contract can list hundreds of lines. -->
        <div
          v-if="allItems.length > 6"
          class="idlg__filter"
        >
          <v-icon
            size="16"
            class="idlg__filtericon"
          >
            mdi-magnify
          </v-icon>
          <input
            v-model="filterQuery"
            type="search"
            class="idlg__filterinput"
            :placeholder="t('contracts.itemFilter')"
          >
          <span class="idlg__filtercount u-mono">{{ items.length }}/{{ allItems.length }}</span>
        </div>

        <table
          v-if="allItems.length"
          class="itable"
        >
          <thead>
            <tr>
              <th scope="col">
                {{ t('common.description') }}
              </th>
              <th
                scope="col"
                class="itable__num"
              >
                {{ t('common.quantity') }}
              </th>
              <th
                scope="col"
                class="itable__num"
                :title="verifiedOverride ? t('contract.verifiedTotalHelp') : undefined"
              >
                {{ t('common.unitPrice') }}
              </th>
              <th
                scope="col"
                class="itable__num"
                :title="verifiedOverride ? t('contract.verifiedTotalHelp') : undefined"
              >
                {{ t('common.total') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!items.length">
              <td
                :colspan="4"
                class="idlg__empty u-muted"
              >
                {{ t('contracts.itemFilterNoMatch') }}
              </td>
            </tr>
            <tr
              v-for="(it, i) in items"
              :key="i"
            >
              <td data-primary>
                <span class="idlg__desc">{{ it.description || '—' }}</span>
                <NuxtLink
                  v-if="it.code"
                  :to="localePath(`/products/${encodeURIComponent(it.code)}`)"
                  class="idlg__code u-mono"
                  :title="t('contract.reference.viewProduct')"
                >{{ t('products.codeLabel', { code: it.code }) }}</NuxtLink>
              </td>
              <td
                class="itable__num"
                :data-label="t('common.quantity')"
              >
                {{ qtyLabel(it) }}
              </td>
              <td
                class="itable__num"
                :data-label="t('common.unitPrice')"
              >
                <MoneyAmount
                  :amount="it.unitAmount"
                  :currency="it.currency"
                  :rule="false"
                  size="sm"
                  decimals
                />
              </td>
              <td
                class="itable__num"
                :data-label="t('common.total')"
              >
                <MoneyAmount
                  :amount="it.total"
                  :currency="it.currency"
                  size="sm"
                />
              </td>
            </tr>
          </tbody>
          <tfoot v-if="itemsTotal">
            <tr v-if="verifiedOverride">
              <td
                :colspan="4"
                class="idlg__verifiedcaption"
              >
                {{ t('contract.verifiedTotalHelp') }}
              </td>
            </tr>
            <tr>
              <td :colspan="3">
                {{ t('common.total') }}
              </td>
              <td class="itable__num">
                <MoneyAmount
                  :amount="itemsTotal.amount"
                  :currency="itemsTotal.currency"
                  size="sm"
                  decimals
                />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="idlg__foot">
        <NuxtLink
          :to="localePath(`/contracts/${contract.id}`)"
          class="idlg__go"
        >
          {{ t('preview.viewContract') }}
          <v-icon size="16">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.idlg {
  display: flex;
  flex-direction: column;
  max-height: 86dvh;
  background: var(--surface);
  border-radius: var(--r-lg);
}

.idlg__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.idlg__headtext { min-width: 0; }

.idlg__title {
  margin: var(--s-1) 0 0;
  font-size: var(--t-md);
  font-stretch: 100%;
  letter-spacing: -0.01em;
  line-height: 1.25;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.idlg__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-2);
}
.idlg__method { font-size: var(--t-xs); color: var(--text-muted); }

.idlg__x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.idlg__x:hover { color: var(--text); background: var(--surface-sunken); }

.idlg__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--s-4) var(--s-5);
}

/* Who: linked organismo + proveedor. */
.idlg__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--s-3) var(--s-5);
  margin-bottom: var(--s-4);
}
.idlg__metacell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.idlg__metalabel {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.idlg__metaval { font-size: var(--t-sm); color: var(--text); overflow-wrap: anywhere; }
.idlg__metaitem { font-size: var(--t-sm); }
.idlg__metalink { color: var(--celeste-deep); text-decoration: none; overflow-wrap: anywhere; }
.idlg__metalink:hover { text-decoration: underline; }

/* How much: native + the two conversions. */
.idlg__money {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-4) var(--s-6);
  padding: var(--s-4);
  margin-bottom: var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
}
.idlg__conv { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.idlg__conv li { display: flex; align-items: center; gap: var(--s-3); font-size: var(--t-sm); }
.idlg__convlabel { min-width: 12ch; font-size: var(--t-xs); color: var(--text-muted); }
.idlg__convtoday .idlg__convlabel { color: var(--celeste-deep); cursor: help; }

/* Verified total (correct-lumpsum-artifacts.ts override) — mirrors
   .head__verified/.head__verifiedhelp on the contract detail page. */
.idlg__verified { margin-bottom: var(--s-4); }
.idlg__verifiedhelp {
  margin: var(--s-1) 0 0;
  font-size: var(--t-xs);
  line-height: 1.5;
  color: var(--text-muted);
}
.idlg__verifiedhelp a {
  color: var(--celeste-deep);
  font-weight: 600;
}

.idlg__filter {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-bottom: var(--s-3);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
}
.idlg__filter:focus-within { border-color: var(--celeste-deep); }
.idlg__filtericon { flex: none; color: var(--text-muted); }
.idlg__filterinput {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: none;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  outline: none;
}
.idlg__filtercount { flex: none; font-size: var(--t-xs); color: var(--text-muted); }

.idlg__desc { display: block; }
.idlg__code {
  display: inline-block;
  margin-top: 3px;
  color: var(--celeste-deep);
  font-size: var(--t-xs);
  text-decoration: none;
}
.idlg__code:hover { text-decoration: underline; }

.idlg__empty { padding: var(--s-6) var(--s-4); text-align: center; font-size: var(--t-sm); }

.idlg__foot {
  padding: var(--s-3) var(--s-5);
  border-top: 1px solid var(--rule);
  text-align: right;
}
.idlg__go {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}
.idlg__go:hover { text-decoration: underline; }

.itable { width: 100%; border-collapse: collapse; table-layout: fixed; }
.itable th {
  padding: var(--s-2) var(--s-3);
  text-align: left;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
}
.itable td {
  padding: var(--s-3);
  font-size: var(--t-sm);
  vertical-align: middle;
  border-bottom: 1px solid var(--rule);
  overflow-wrap: anywhere;
}
.itable tbody tr:hover { background: var(--surface-sunken); }
.itable th.itable__num,
.itable td.itable__num { text-align: right; white-space: nowrap; }
.itable th:nth-child(1) { width: auto; }
.itable th:nth-child(2) { width: 16%; }
.itable th:nth-child(3) { width: 20%; }
.itable th:nth-child(4) { width: 20%; }
.itable td.itable__num :deep(.money) { align-items: flex-end; }
.itable tfoot td {
  padding-top: var(--s-3);
  border-top: 2px solid var(--rule-strong);
  border-bottom: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
/* The "raw feed" note above the total: a full sentence, not a label —
   overrides the mono/uppercase/letter-spacing the total row uses. */
.itable tfoot .idlg__verifiedcaption {
  padding-top: var(--s-2);
  font-family: var(--font-body);
  font-size: var(--t-xs);
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  line-height: 1.5;
  white-space: normal;
}

@media (max-width: 760px) {
  .itable { table-layout: auto; }
}
</style>
