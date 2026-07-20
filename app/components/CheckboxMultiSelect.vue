<script setup lang="ts">
/**
 * Reusable multi-select with literal checkbox rows, backed by a searchable
 * `v-autocomplete`. Generic — no knowledge of buyers/rubros or any other
 * domain; the caller supplies `items` (value/label/optional count) and gets
 * back the chosen `value`s.
 *
 * `v-autocomplete multiple` does NOT show checkboxes by default (it just
 * highlights the selected row), which reads ambiguously once there are
 * hundreds of options to scan — so the `#item` slot renders an explicit
 * `v-checkbox-btn` per row instead. Its checked state is computed directly
 * against `modelValue` (not read from Vuetify's internal slot props), so it
 * stays correct regardless of the exact item-slot shape a given Vuetify
 * version hands back — the one thing this component must never get wrong.
 * Clicking anywhere in the row (including the checkbox, which is bound
 * one-way and never double-toggles) still uses the row's own default click
 * handling from `itemProps` to add/remove the value — no custom toggle
 * logic duplicated here.
 *
 * rawOf() below exists because the slot's `item` shape isn't stable across
 * Vuetify versions: older docs show `item.raw` (a ListItem wrapper around
 * the option), while this project's installed Vuetify (^4.1.5) hands back
 * `item` already aliased to the raw option itself (`item.raw` is
 * `undefined` there — confirmed live, it threw `Cannot read properties of
 * undefined (reading 'count')` before this helper was added). Falling back
 * to `item` when `.raw` is absent works across both shapes.
 *
 * Selected values render as closable chips, capped at MAX_CHIPS visible so
 * picking dozens of organismos doesn't blow out the field's height; the
 * rest collapse into a single "N seleccionados" summary.
 */
export interface CheckboxMultiSelectOption {
  value: string
  label: string
  count?: number
}

const MAX_CHIPS = 3

const props = withDefaults(defineProps<{
  modelValue: string[]
  items: CheckboxMultiSelectOption[]
  label: string
  icon?: string
  loading?: boolean
  placeholder?: string
}>(), {
  loading: false,
})

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const { t } = useI18n()

function isSelected(value: string): boolean {
  return props.modelValue.includes(value)
}

/** Unwraps a v-autocomplete slot `item` to the raw {value,label,count} option
 *  regardless of whether this Vuetify version wraps it in `.raw` or hands it
 *  back directly (see file-header note). */
function rawOf(item: any): CheckboxMultiSelectOption {
  return item?.raw ?? item
}

function onUpdate(v: string[]) {
  emit('update:modelValue', v)
}

function removeValue(value: string) {
  emit('update:modelValue', props.modelValue.filter(v => v !== value))
}
</script>

<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="items"
    item-title="label"
    item-value="value"
    :label="label"
    :placeholder="placeholder"
    :prepend-inner-icon="icon"
    :loading="loading"
    :no-data-text="t('filters.noOptions')"
    multiple
    chips
    closable-chips
    clearable
    density="comfortable"
    variant="outlined"
    hide-details
    @update:model-value="onUpdate"
  >
    <template #item="{ item, props: itemProps }">
      <v-list-item v-bind="itemProps">
        <template #prepend>
          <v-checkbox-btn
            :model-value="isSelected(rawOf(item).value)"
            density="compact"
            tabindex="-1"
            class="cms__cb"
          />
        </template>
        <template
          v-if="rawOf(item).count != null"
          #append
        >
          <span class="cms__count">{{ formatNumber(rawOf(item).count) }}</span>
        </template>
      </v-list-item>
    </template>

    <template #selection="{ item, index }">
      <v-chip
        v-if="index < MAX_CHIPS"
        size="small"
        variant="tonal"
        closable
        class="cms__chip"
        @click:close="removeValue(rawOf(item).value)"
      >
        {{ rawOf(item).label }}
      </v-chip>
      <span
        v-else-if="index === MAX_CHIPS"
        class="cms__more"
      >
        {{ t('common.moreSelected', { n: modelValue.length - MAX_CHIPS }) }}
      </span>
    </template>
  </v-autocomplete>
</template>

<style scoped>
.cms__cb { margin-right: 4px; }
.cms__count { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-muted); }
.cms__chip { max-width: 220px; }
.cms__more { align-self: center; margin-left: 4px; font-size: var(--t-xs); color: var(--text-muted); white-space: nowrap; }
</style>
