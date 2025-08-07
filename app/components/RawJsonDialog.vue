<template>
  <v-dialog
    :model-value="modelValue"
    max-width="900px"
    scrollable
    @update:model-value="updateValue"
  >
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <div class="d-flex align-center ga-2">
          <v-icon color="info">
            mdi-code-json
          </v-icon>
          <span>{{ title || 'Raw JSON Data' }}</span>
        </div>
        <div class="d-flex ga-1">
          <v-tooltip text="Copy to clipboard">
            <template #activator="{ props: activatorProps }">
              <v-btn
                icon="mdi-content-copy"
                size="small"
                variant="text"
                v-bind="activatorProps"
                @click="copyToClipboard"
              />
            </template>
          </v-tooltip>
          <v-tooltip text="Download JSON">
            <template #activator="{ props: activatorProps }">
              <v-btn
                icon="mdi-download"
                size="small"
                variant="text"
                v-bind="activatorProps"
                @click="downloadJson"
              />
            </template>
          </v-tooltip>
          <v-btn
            icon="mdi-close"
            size="small"
            variant="text"
            @click="updateValue(false)"
          />
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-0">
        <div class="d-flex justify-space-between align-center pa-3 bg-grey-lighten-5">
          <div class="text-body-2 text-medium-emphasis">
            {{ Object.keys(data || {}).length }} properties
            {{ dataSize ? `• ${dataSize}` : '' }}
          </div>
          <div class="d-flex ga-2">
            <v-btn
              :color="formatMode === 'pretty' ? 'primary' : 'default'"
              variant="text"
              size="small"
              @click="formatMode = 'pretty'"
            >
              Pretty
            </v-btn>
            <v-btn
              :color="formatMode === 'compact' ? 'primary' : 'default'"
              variant="text"
              size="small"
              @click="formatMode = 'compact'"
            >
              Compact
            </v-btn>
          </div>
        </div>

        <div class="json-container">
          <pre
            class="json-content"
            :class="{ 'json-compact': formatMode === 'compact' }"
          >{{ formattedJson }}</pre>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          @click="updateValue(false)"
        >
          Close
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Copy Success Snackbar -->
    <v-snackbar
      v-model="showCopySuccess"
      color="success"
      timeout="3000"
    >
      <v-icon class="mr-2">
        mdi-check
      </v-icon>
      JSON copied to clipboard successfully!
    </v-snackbar>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  modelValue: boolean
  data: Record<string, any> | null
  title?: string
  filename?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Raw JSON Data',
  filename: 'data.json',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// Reactive state
const formatMode = ref<'pretty' | 'compact'>('pretty')
const showCopySuccess = ref(false)

// Computed properties
const formattedJson = computed(() => {
  if (!props.data) return ''

  if (formatMode.value === 'compact') {
    return JSON.stringify(props.data)
  }

  return JSON.stringify(props.data, null, 2)
})

const dataSize = computed(() => {
  if (!props.data) return ''

  const jsonString = JSON.stringify(props.data)
  const bytes = new Blob([jsonString]).size

  if (bytes < 1024) {
    return `${bytes} bytes`
  }
  else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
})

// Methods
const updateValue = (value: boolean) => {
  emit('update:modelValue', value)
}

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(formattedJson.value)
    showCopySuccess.value = true
  }
  catch (error) {
    console.error('Failed to copy to clipboard:', error)
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = formattedJson.value
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    showCopySuccess.value = true
  }
}

const downloadJson = () => {
  const jsonString = formattedJson.value
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = props.filename || 'data.json'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

// Watch for data changes to reset format mode
watch(() => props.data, () => {
  formatMode.value = 'pretty'
})
</script>

<style scoped>
.json-container {
  max-height: 60vh;
  overflow: auto;
  background-color: #f8f9fa;
}

.json-content {
  margin: 0;
  padding: 16px;
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  color: #2e3440;
  background: transparent;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.json-compact {
  white-space: pre;
  word-wrap: normal;
}

/* JSON syntax highlighting */
.json-content :deep(.string) {
  color: #032f62;
}

.json-content :deep(.number) {
  color: #005cc5;
}

.json-content :deep(.boolean) {
  color: #d73a49;
}

.json-content :deep(.null) {
  color: #6f42c1;
}

.json-content :deep(.key) {
  color: #22863a;
}
</style>
