<template>
  <div v-if="hasDocuments">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="text-subtitle-2 text-medium-emphasis">
        Contract Documents ({{ totalDocuments }})
      </div>
      <v-btn
        v-if="totalDocuments > 0"
        variant="outlined"
        size="small"
        prepend-icon="mdi-download-multiple"
        @click="downloadAllDocuments"
      >
        Download All
      </v-btn>
    </div>

    <!-- Tender Documents -->
    <div
      v-if="contract.tender?.documents && contract.tender.documents.length > 0"
      class="mb-4"
    >
      <div class="text-body-2 font-weight-medium mb-2 d-flex align-center ga-2">
        <v-icon
          size="16"
          color="primary"
        >
          mdi-file-document
        </v-icon>
        Tender Documents ({{ contract.tender.documents.length }})
      </div>

      <v-list density="compact">
        <v-list-item
          v-for="document in contract.tender.documents"
          :key="document.id"
          :href="document.url"
          target="_blank"
        >
          <template #prepend>
            <v-avatar
              color="primary"
              size="32"
              variant="tonal"
            >
              <v-icon size="16">
                {{ getDocumentIcon(document.documentType) }}
              </v-icon>
            </v-avatar>
          </template>

          <v-list-item-title>{{ document.description || document.id }}</v-list-item-title>
          <v-list-item-subtitle>
            {{ document.documentType }} • {{ formatDate(document.datePublished) }}
            <v-chip
              v-if="document.format"
              size="x-small"
              variant="outlined"
              class="ml-2"
            >
              {{ document.format.toUpperCase() }}
            </v-chip>
          </v-list-item-subtitle>

          <template #append>
            <v-icon>mdi-open-in-new</v-icon>
          </template>
        </v-list-item>
      </v-list>
    </div>

    <!-- Award Documents -->
    <div
      v-for="(award, awardIndex) in contractAwards"
      :key="award.id"
      class="mb-4"
    >
      <div
        v-if="award.documents && award.documents.length > 0"
        class="text-body-2 font-weight-medium mb-2 d-flex align-center ga-2"
      >
        <v-icon
          size="16"
          color="success"
        >
          mdi-trophy
        </v-icon>
        Award {{ awardIndex + 1 }} Documents ({{ award.documents.length }})
      </div>

      <v-list
        v-if="award.documents && award.documents.length > 0"
        density="compact"
      >
        <v-list-item
          v-for="document in award.documents"
          :key="document.id"
          :href="document.url"
          target="_blank"
        >
          <template #prepend>
            <v-avatar
              color="success"
              size="32"
              variant="tonal"
            >
              <v-icon size="16">
                {{ getDocumentIcon(document.documentType) }}
              </v-icon>
            </v-avatar>
          </template>

          <v-list-item-title>{{ document.id }}</v-list-item-title>
          <v-list-item-subtitle>
            {{ document.documentType }} • {{ formatDate(document.datePublished) }}
            <v-chip
              v-if="document.format"
              size="x-small"
              variant="outlined"
              class="ml-2"
            >
              {{ document.format.toUpperCase() }}
            </v-chip>
          </v-list-item-subtitle>

          <template #append>
            <v-icon>mdi-open-in-new</v-icon>
          </template>
        </v-list-item>
      </v-list>
    </div>

    <!-- No Documents Message -->
    <div
      v-if="totalDocuments === 0"
      class="text-center py-8"
    >
      <v-icon
        size="64"
        color="grey-lighten-2"
        class="mb-4"
      >
        mdi-file-document-outline
      </v-icon>
      <div class="text-h6 mb-2">
        No Documents Available
      </div>
      <div class="text-body-2 text-medium-emphasis">
        This contract doesn't have any associated documents.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IRelease } from '../../types'

interface Props {
  contract: IRelease
}

const props = defineProps<Props>()

// Computed properties
const contractAwards = computed(() => props.contract.awards || [])

const totalDocuments = computed(() => {
  const tenderDocs = props.contract.tender?.documents?.length || 0
  const awardDocs = contractAwards.value.reduce((total, award) => {
    return total + (award.documents?.length || 0)
  }, 0)
  return tenderDocs + awardDocs
})

const hasDocuments = computed(() => {
  return (props.contract.tender?.documents && props.contract.tender.documents.length > 0)
    || contractAwards.value.some(award => award.documents && award.documents.length > 0)
})

// Methods
const downloadAllDocuments = () => {
  console.log('Download all documents functionality to be implemented')
  // TODO: Implement bulk document download
}

const getDocumentIcon = (documentType?: string): string => {
  if (!documentType) return 'mdi-file'

  const iconMap: Record<string, string> = {
    tenderNotice: 'mdi-file-document',
    awardNotice: 'mdi-trophy',
    contractNotice: 'mdi-file-contract',
    cancellationNotice: 'mdi-file-cancel',
    clarification: 'mdi-help-circle',
    evaluationReports: 'mdi-file-chart',
    contractSigned: 'mdi-file-check',
    biddingDocuments: 'mdi-file-multiple',
    technicalSpecifications: 'mdi-file-cog',
    unknown: 'mdi-file',
  }
  return iconMap[documentType] || 'mdi-file'
}

const formatDate = (dateString?: string | Date): string => {
  if (!dateString) return 'N/A'
  return new Intl.DateTimeFormat('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
}
</script>
