<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="isMobile ? '95vw' : '800px'"
    :fullscreen="isMobile"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span class="text-h6 text-sm-h6 text-subtitle-1">Contract Raw Data</span>
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="$emit('update:modelValue', false)"
        />
      </v-card-title>
      <v-card-text>
        <pre class="text-body-2 text-sm-body-2 text-caption">{{ JSON.stringify(contract, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

interface Props {
  modelValue: boolean
  contract: any
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

defineProps<Props>()
defineEmits<Emits>()

// Composables
const { mobile } = useDisplay()

// Computed
const isMobile = computed(() => mobile.value)
</script>

<style scoped>
pre {
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
