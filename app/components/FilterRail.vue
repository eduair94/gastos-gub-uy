<script setup lang="ts">
/**
 * The explorer's filter rail.
 *
 * Ordered by how people actually narrow a procurement search: what was
 * bought, then who bought it, then how much, then when, then how. Every
 * facet shows its own count so the reader can see how thin a filter is
 * before spending a click on it — `tender.status`, for instance, is
 * populated on under 9% of records, and hiding that would be a lie of
 * omission.
 */
export interface FilterState {
  search: string
  tag: string[]
  buyers: string[]
  suppliers: string[]
  /** Exact catalogue article description ("PIGMENTO"). Set by inbound links,
   *  not by a rail control — the rail only shows active values so they can be
   *  seen and removed. */
  category: string[]
  /** Catalogue code (classification.id, e.g. "16656"). The canonical, index-backed
   *  product key the "ver comparables" link uses — see comparablesLink in
   *  contracts/[id].vue. Must be a first-class filter or the link's product
   *  filter is silently dropped and the explorer lists every award. */
  categoryId: string[]
  procurementMethodDetails: string[]
  status: string[]
  currency: string[]
  yearFrom: number | null
  yearTo: number | null
  amountFrom: number | null
  amountTo: number | null
  hasAmount: boolean
}

interface Option { value: string | number, label: string, count?: number }

const props = defineProps<{
  modelValue: FilterState
  options: {
    years?: Option[]
    buyers?: Option[]
    suppliers?: Option[]
    procurementMethodDetails?: Option[]
    statuses?: Option[]
    currencies?: Option[]
  } | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [FilterState]
  'clear': []
}>()

const { t } = useI18n()

function patch(part: Partial<FilterState>) {
  emit('update:modelValue', { ...props.modelValue, ...part })
}

// Ordered by what a reader is most likely to want: the money stages
// first. Sourced from the shared vocabulary so the chips can never drift
// from the badges rendered on each row.
const STAGES = RELEASE_TAGS

function toggleTag(tag: string) {
  const next = props.modelValue.tag.includes(tag)
    ? props.modelValue.tag.filter(x => x !== tag)
    : [...props.modelValue.tag, tag]
  patch({ tag: next })
}

const years = computed(() => (props.options?.years ?? []).map(o => Number(o.value)).sort((a, b) => a - b))
const minYear = computed(() => years.value[0] ?? 2002)
const maxYear = computed(() => years.value[years.value.length - 1] ?? new Date().getFullYear())

function optLabel(o: Option) {
  return o.count !== undefined ? `${o.label} · ${formatNumber(o.count)}` : o.label
}
</script>

<template>
  <div class="rail">
    <!-- What was bought -->
    <section class="rail__sec">
      <label
        class="rail__label"
        for="f-search"
      >{{ t('filters.search') }}</label>
      <v-text-field
        id="f-search"
        :model-value="modelValue.search"
        :placeholder="t('common.searchPlaceholder')"
        density="compact"
        prepend-inner-icon="mdi-magnify"
        clearable
        @update:model-value="v => patch({ search: v ?? '' })"
      />
      <p class="rail__help">
        {{ t('filters.searchHelp') }}
      </p>
    </section>

    <!-- Stage first: it is the filter that explains why some rows carry
         no supplier or amount, so it belongs before the reader wonders. -->
    <section class="rail__sec">
      <span class="rail__label">{{ t('contract.stage.label') }}</span>
      <div class="rail__stages">
        <button
          v-for="s in STAGES"
          :key="s"
          class="stagechip"
          :class="{ 'stagechip--on': modelValue.tag.includes(s) }"
          type="button"
          :title="t(`contract.stageHelp.${s}`)"
          :aria-pressed="modelValue.tag.includes(s)"
          @click="toggleTag(s)"
        >
          {{ t(`contract.stage.${s}`) }}
        </button>
      </div>
      <p class="rail__help">
        {{ t('filters.tagHelp') }}
      </p>
    </section>

    <!-- Catalogue article, when a link brought one. Without this the
         filter would narrow the results invisibly — active but nowhere
         on screen to see or remove. -->
    <section
      v-if="modelValue.category.length"
      class="rail__sec"
    >
      <span class="rail__label">{{ t('filters.category') }}</span>
      <div class="rail__stages">
        <v-chip
          v-for="c in modelValue.category"
          :key="c"
          closable
          size="small"
          @click:close="patch({ category: modelValue.category.filter(x => x !== c) })"
        >
          {{ c }}
        </v-chip>
      </div>
      <p class="rail__help">
        {{ t('filters.categoryHelp') }}
      </p>
    </section>

    <!-- Catalogue code, when a "ver comparables" link brought one. Same
         reason as above: an invisible filter is a lie of omission. -->
    <section
      v-if="modelValue.categoryId.length"
      class="rail__sec"
    >
      <span class="rail__label">{{ t('filters.categoryCode') }}</span>
      <div class="rail__stages">
        <v-chip
          v-for="c in modelValue.categoryId"
          :key="c"
          closable
          size="small"
          @click:close="patch({ categoryId: modelValue.categoryId.filter(x => x !== c) })"
        >
          {{ c }}
        </v-chip>
      </div>
      <p class="rail__help">
        {{ t('filters.categoryCodeHelp') }}
      </p>
    </section>

    <!-- Who -->
    <section class="rail__sec">
      <label
        class="rail__label"
        for="f-buyer"
      >{{ t('filters.buyer') }}</label>
      <v-autocomplete
        id="f-buyer"
        :model-value="modelValue.buyers"
        :items="options?.buyers ?? []"
        :item-title="optLabel"
        item-value="value"
        :placeholder="t('filters.buyerPlaceholder')"
        :no-data-text="t('filters.noOptions')"
        multiple
        chips
        closable-chips
        density="compact"
        :loading="loading"
        @update:model-value="v => patch({ buyers: v })"
      />
    </section>

    <section class="rail__sec">
      <label
        class="rail__label"
        for="f-supplier"
      >{{ t('filters.supplier') }}</label>
      <v-autocomplete
        id="f-supplier"
        :model-value="modelValue.suppliers"
        :items="options?.suppliers ?? []"
        :item-title="optLabel"
        item-value="value"
        :placeholder="t('filters.supplierPlaceholder')"
        :no-data-text="t('filters.noOptions')"
        multiple
        chips
        closable-chips
        density="compact"
        :loading="loading"
        @update:model-value="v => patch({ suppliers: v })"
      />
    </section>

    <!-- How much -->
    <section class="rail__sec">
      <span class="rail__label">{{ t('filters.amount') }}</span>
      <div class="rail__pair">
        <v-text-field
          :model-value="modelValue.amountFrom"
          :label="t('filters.amountFrom')"
          type="number"
          density="compact"
          min="0"
          @update:model-value="v => patch({ amountFrom: v === '' || v === null ? null : Number(v) })"
        />
        <v-text-field
          :model-value="modelValue.amountTo"
          :label="t('filters.amountTo')"
          type="number"
          density="compact"
          min="0"
          @update:model-value="v => patch({ amountTo: v === '' || v === null ? null : Number(v) })"
        />
      </div>
      <p class="rail__help">
        {{ t('filters.amountHelp') }}
      </p>
      <v-checkbox
        :model-value="modelValue.hasAmount"
        :label="t('filters.hasAmount')"
        density="compact"
        hide-details
        @update:model-value="v => patch({ hasAmount: !!v })"
      />
      <p class="rail__help">
        {{ t('filters.hasAmountHelp') }}
      </p>
    </section>

    <!-- When -->
    <section class="rail__sec">
      <span class="rail__label">{{ t('filters.yearRange') }}</span>
      <div class="rail__pair">
        <v-select
          :model-value="modelValue.yearFrom"
          :label="t('filters.yearFrom')"
          :items="years"
          density="compact"
          clearable
          @update:model-value="v => patch({ yearFrom: v })"
        />
        <v-select
          :model-value="modelValue.yearTo"
          :label="t('filters.yearTo')"
          :items="years"
          density="compact"
          clearable
          @update:model-value="v => patch({ yearTo: v })"
        />
      </div>
      <p class="rail__help">
        {{ minYear }}–{{ maxYear }}
      </p>
    </section>

    <!-- How -->
    <section
      v-if="options?.procurementMethodDetails?.length"
      class="rail__sec"
    >
      <label
        class="rail__label"
        for="f-method"
      >{{ t('filters.method') }}</label>
      <v-select
        id="f-method"
        :model-value="modelValue.procurementMethodDetails"
        :items="options.procurementMethodDetails"
        :item-title="optLabel"
        :placeholder="t('filters.methodPlaceholder')"
        item-value="value"
        multiple
        chips
        closable-chips
        density="compact"
        @update:model-value="v => patch({ procurementMethodDetails: v })"
      />
      <p class="rail__help">
        {{ t('filters.methodHelp') }}
      </p>
    </section>

    <section
      v-if="options?.currencies?.length"
      class="rail__sec"
    >
      <label
        class="rail__label"
        for="f-currency"
      >{{ t('filters.currency') }}</label>
      <v-select
        id="f-currency"
        :model-value="modelValue.currency"
        :items="options.currencies"
        :item-title="optLabel"
        :placeholder="t('filters.currencyPlaceholder')"
        item-value="value"
        multiple
        chips
        closable-chips
        density="compact"
        @update:model-value="v => patch({ currency: v })"
      />
    </section>

    <section
      v-if="options?.statuses?.length"
      class="rail__sec"
    >
      <label
        class="rail__label"
        for="f-status"
      >{{ t('filters.status') }}</label>
      <v-select
        id="f-status"
        :model-value="modelValue.status"
        :items="options.statuses"
        :item-title="optLabel"
        :placeholder="t('filters.statusPlaceholder')"
        item-value="value"
        multiple
        chips
        closable-chips
        density="compact"
        @update:model-value="v => patch({ status: v })"
      />
      <!-- Under 9% of releases carry a status at all. Filtering on it
           silently drops the other 91%, so say so before the click. -->
      <p class="rail__help">
        {{ t('filters.statusHelp') }}
      </p>
    </section>

    <button
      class="rail__clear"
      type="button"
      @click="emit('clear')"
    >
      {{ t('common.clearAll') }}
    </button>
  </div>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.rail__sec {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.rail__label {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.rail__help {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.4;
}

.rail__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-2);
}

.rail__stages {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.stagechip {
  padding: 5px var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: var(--t-xs);
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.stagechip:hover {
  color: var(--text);
  border-color: var(--rule-strong);
}

.stagechip--on {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}

.rail__clear {
  align-self: flex-start;
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.rail__clear:hover {
  background: var(--surface-sunken);
  border-color: var(--text-muted);
}
</style>
