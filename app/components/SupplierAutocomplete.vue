<template>
  <v-autocomplete
    v-model="modelValue"
    label="Suppliers"
    :items="items"
    item-title="label"
    variant="outlined"
    density="compact"
    multiple
    clearable
    chips
    :loading="loading"
    :search="searchQuery"
    return-object
    @update:search="onSearchUpdate"
    @update:model-value="onModelValueUpdate"
  >
    <!-- Custom chip display with metadata -->
    <template #chip="{ props: chipProps, item }">
      <v-chip
        v-bind="chipProps"
        closable
        size="small"
      >
        {{ item.title }}
        <v-tooltip
          v-if="item.title"
          activator="parent"
          location="top"
        >
          <div class="pa-2">
            <div class="font-weight-bold">
              {{ item.title }}
            </div>
          </div>
        </v-tooltip>
      </v-chip>
    </template>

    <!-- Custom item display with metadata -->
    <template #item="{ props: itemProps, item }">
      <v-list-item
        v-bind="itemProps"
        :title="item.raw.label"
        :subtitle="item.raw.meta ? `${formatCurrency(item.raw.meta.totalValue, 'UYU')} • ${item.raw.meta.totalContracts} contracts` : undefined"
      >
        <template #prepend>
          <v-icon color="success">
            mdi-factory
          </v-icon>
        </template>
      </v-list-item>
    </template>

    <!-- No data message -->
    <template #no-data>
      <div class="px-4 py-2 text-center text-medium-emphasis">
        {{ searchQuery ? 'No suppliers found' : 'Start typing to search suppliers...' }}
      </div>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { debounce } from 'lodash-es'
import { computed, ref } from 'vue'
import { formatCurrency } from '~/utils'

// Define props and emits
interface SupplierAutocompleteItem {
  value: string
  label: string
  meta?: {
    totalValue: number
    totalContracts: number
  }
}

interface Props {
  modelValue: SupplierAutocompleteItem[]
}

interface Emits {
  (e: 'update:model-value', value: SupplierAutocompleteItem[]): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Component state
const loading = ref(false)
const searchQuery = ref('')
const items = ref<SupplierAutocompleteItem[]>([])

// Internal model value for two-way binding
const modelValue = computed({
  get: () => props.modelValue,
  set: (value: SupplierAutocompleteItem[]) => emit('update:model-value', value),
})

// Debounced search function
const searchSuppliers = debounce(async (search: string) => {
  if (!search || search.length < 2) {
    items.value = []
    return
  }

  loading.value = true
  try {
    const { data } = await $fetch('/api/suppliers/autocomplete', {
      query: {
        search,
        limit: 20,
      },
    })

    if (data) {
      items.value = data
    }
  }
  catch (error) {
    console.error('Error fetching suppliers:', error)
    items.value = []
  }
  finally {
    loading.value = false
  }
}, 300)

// Handle search input changes
const onSearchUpdate = (search: string | null) => {
  searchQuery.value = search || ''
  searchSuppliers(searchQuery.value)
}

// Handle model value changes
const onModelValueUpdate = (value: SupplierAutocompleteItem[]) => {
  console.log('Model value update', value)
  emit('update:model-value', value)
}
</script>
