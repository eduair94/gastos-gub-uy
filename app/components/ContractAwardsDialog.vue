<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1000px"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <div>
          <span>Contract Awards</span>
          <div class="text-subtitle-2 text-medium-emphasis">
            {{ contract?.tender?.title || 'Contract Details' }}
          </div>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="$emit('update:modelValue', false)"
        />
      </v-card-title>
      <v-card-text>
        <div v-if="contract?.awards && contract.awards.length > 0">
          <v-expansion-panels
            v-model="expandedAward"
            multiple
          >
            <v-expansion-panel
              v-for="(award, awardIndex) in contract.awards"
              :key="awardIndex"
              :value="awardIndex"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100">
                  <div class="d-flex flex-column">
                    <span class="font-weight-medium">{{ award.title || `Award ${awardIndex + 1}` }}</span>
                    <div class="text-caption text-medium-emphasis">
                      Status: {{ award.status || 'Unknown' }} • Date: {{ formatDate(award.date) }}
                    </div>
                  </div>
                  <v-chip
                    :color="getStatusColor(award.status)"
                    size="small"
                    variant="tonal"
                  >
                    {{ award.status || 'Unknown' }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-row>
                  <!-- Suppliers -->
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-card
                      variant="outlined"
                      class="mb-4"
                    >
                      <v-card-title class="text-h6">
                        <v-icon
                          class="mr-2"
                          color="success"
                        >
                          mdi-factory
                        </v-icon>
                        Suppliers
                      </v-card-title>
                      <v-card-text>
                        <div v-if="award.suppliers && award.suppliers.length > 0">
                          <v-chip
                            v-for="(supplier, supplierIndex) in award.suppliers"
                            :key="supplierIndex"
                            class="ma-1"
                            color="success"
                            variant="tonal"
                          >
                            <v-icon start>
                              mdi-domain
                            </v-icon>
                            {{ supplier.name }}
                          </v-chip>
                        </div>
                        <div
                          v-else
                          class="text-medium-emphasis"
                        >
                          No suppliers listed
                        </div>
                      </v-card-text>
                    </v-card>
                  </v-col>

                  <!-- Award Items -->
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-card
                      variant="outlined"
                      class="mb-4"
                    >
                      <v-card-title class="text-h6">
                        <v-icon
                          class="mr-2"
                          color="primary"
                        >
                          mdi-package-variant
                        </v-icon>
                        Items ({{ award.items?.length || 0 }})
                      </v-card-title>
                      <v-card-text>
                        <div v-if="award.items && award.items.length > 0">
                          <v-list dense>
                            <v-list-item
                              v-for="(item, itemIndex) in award.items"
                              :key="itemIndex"
                              class="px-0"
                            >
                              <template #default>
                                <v-list-item-title class="font-weight-medium">
                                  {{ getItemDescription(item, itemIndex) }}
                                </v-list-item-title>
                                <v-list-item-subtitle>
                                  <div class="d-flex flex-wrap ga-2 mt-1">
                                    <v-chip
                                      size="x-small"
                                      variant="outlined"
                                    >
                                      Qty: {{ item.quantity || 'N/A' }}
                                    </v-chip>
                                    <v-chip
                                      v-if="item.unit?.value?.amount"
                                      size="x-small"
                                      variant="outlined"
                                      color="success"
                                    >
                                      {{ formatCurrency(item.unit.value.amount, item.unit.value.currency) }}
                                    </v-chip>
                                    <v-chip
                                      v-if="item.unit?.name"
                                      size="x-small"
                                      variant="outlined"
                                    >
                                      {{ item.unit.name }}
                                    </v-chip>
                                    <v-chip
                                      v-if="item.classification?.description"
                                      size="x-small"
                                      variant="outlined"
                                      color="info"
                                    >
                                      {{ item.classification.description }}
                                    </v-chip>
                                  </div>
                                </v-list-item-subtitle>
                              </template>
                            </v-list-item>
                          </v-list>
                        </div>
                        <div
                          v-else
                          class="text-medium-emphasis"
                        >
                          No items listed
                        </div>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>

                <!-- Award Summary -->
                <v-row>
                  <v-col cols="12">
                    <v-card variant="outlined">
                      <v-card-title class="text-h6">
                        <v-icon
                          class="mr-2"
                          color="info"
                        >
                          mdi-calculator
                        </v-icon>
                        Award Summary
                      </v-card-title>
                      <v-card-text>
                        <v-row>
                          <v-col
                            cols="6"
                            md="3"
                          >
                            <div class="text-center">
                              <div class="text-h6 font-weight-bold text-success">
                                {{ formatAwardAmount(award) }}
                              </div>
                              <div class="text-caption text-medium-emphasis">
                                Total Amount
                              </div>
                            </div>
                          </v-col>
                          <v-col
                            cols="6"
                            md="3"
                          >
                            <div class="text-center">
                              <div class="text-h6 font-weight-bold text-primary">
                                {{ award.items?.length || 0 }}
                              </div>
                              <div class="text-caption text-medium-emphasis">
                                Items
                              </div>
                            </div>
                          </v-col>
                          <v-col
                            cols="6"
                            md="3"
                          >
                            <div class="text-center">
                              <div class="text-h6 font-weight-bold text-info">
                                {{ award.suppliers?.length || 0 }}
                              </div>
                              <div class="text-caption text-medium-emphasis">
                                Suppliers
                              </div>
                            </div>
                          </v-col>
                          <v-col
                            cols="6"
                            md="3"
                          >
                            <div class="text-center">
                              <div class="text-h6 font-weight-bold text-warning">
                                {{ award.documents?.length || 0 }}
                              </div>
                              <div class="text-caption text-medium-emphasis">
                                Documents
                              </div>
                            </div>
                          </v-col>
                        </v-row>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>

                <!-- Documents -->
                <v-row v-if="award.documents && award.documents.length > 0">
                  <v-col cols="12">
                    <v-card variant="outlined">
                      <v-card-title class="text-h6">
                        <v-icon
                          class="mr-2"
                          color="warning"
                        >
                          mdi-file-document
                        </v-icon>
                        Documents ({{ award.documents.length }})
                      </v-card-title>
                      <v-card-text>
                        <v-list dense>
                          <v-list-item
                            v-for="(document, docIndex) in award.documents"
                            :key="docIndex"
                            :href="document.url"
                            target="_blank"
                            class="px-0"
                          >
                            <template #prepend>
                              <v-icon color="warning">
                                mdi-file-document-outline
                              </v-icon>
                            </template>
                            <v-list-item-title>
                              {{ document.description || `Document ${docIndex + 1}` }}
                            </v-list-item-title>
                            <v-list-item-subtitle>
                              Type: {{ document.documentType || 'Unknown' }} •
                              Format: {{ document.format || 'Unknown' }} •
                              Published: {{ formatDate(document.datePublished) }}
                            </v-list-item-subtitle>
                            <template #append>
                              <v-icon>mdi-open-in-new</v-icon>
                            </template>
                          </v-list-item>
                        </v-list>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
        <div
          v-else
          class="text-center py-8"
        >
          <v-icon
            size="64"
            color="grey-lighten-2"
            class="mb-4"
          >
            mdi-trophy-outline
          </v-icon>
          <div class="text-h6 mb-2">
            No Awards Found
          </div>
          <div class="text-body-2 text-medium-emphasis">
            This contract doesn't have any awards listed.
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  modelValue: boolean
  contract: any
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

const props = defineProps<Props>()
defineEmits<Emits>()

// State
const expandedAward = ref([0]) // Expand first award by default

// Utility methods - auto-imported from Nuxt
// formatDate, getStatusColor, getItemDescription, formatCurrency, formatAwardAmount are all auto-imported

// Local utility functions that were defined in the original component
const formatDate = (dateString: string | Date): string => {
  return new Intl.DateTimeFormat('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
}

const getStatusColor = (status?: string): string => {
  const statusColors: Record<string, string> = {
    active: 'success',
    complete: 'info',
    cancelled: 'error',
    planning: 'warning',
    tender: 'primary',
  }
  return statusColors[status?.toLowerCase() || ''] || 'grey'
}

const getItemDescription = (item: Record<string, unknown>, index: number): string => {
  // Try multiple possible description fields, checking for non-empty values
  const description = item.description?.toString()?.trim()
    || item.title?.toString()?.trim()
    || item.name?.toString()?.trim()
    || (item.classification as Record<string, unknown>)?.description?.toString()?.trim()

  return description || `Item ${index + 1}`
}

// Watch for model value changes to reset expanded award when dialog opens
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    expandedAward.value = [0] // Expand first award by default when dialog opens
  }
})
</script>

<style scoped>
:deep(.v-chip) {
  font-size: 0.75rem;
}
</style>
