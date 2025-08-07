<template>
  <div>
    <div class="timeline-container">
      <v-timeline
        density="compact"
        direction="horizontal"
        class="contract-timeline"
      >
        <!-- Contract Date -->
        <v-timeline-item
          dot-color="primary"
          size="small"
        >
          <template #icon>
            <v-icon size="16">
              mdi-file-document
            </v-icon>
          </template>
          <div class="timeline-content">
            <div class="font-weight-medium">
              Contract Created
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ formatDate(contract.date) }}
            </div>
            <div class="text-caption">
              Year: {{ contract.sourceYear }}
            </div>
          </div>
        </v-timeline-item>

        <!-- Tender Period -->
        <v-timeline-item
          v-if="contract.tender?.tenderPeriod"
          dot-color="info"
          size="small"
        >
          <template #icon>
            <v-icon size="16">
              mdi-calendar-clock
            </v-icon>
          </template>
          <div class="timeline-content">
            <div class="font-weight-medium">
              Tender Period
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ formatDate(contract.tender.tenderPeriod.startDate) }} -
              {{ formatDate(contract.tender.tenderPeriod.endDate) }}
            </div>
            <div class="text-caption">
              Duration: {{ getTenderDuration(contract.tender.tenderPeriod) }}
            </div>
          </div>
        </v-timeline-item>

        <!-- Enquiry Period -->
        <v-timeline-item
          v-if="contract.tender?.enquiryPeriod"
          dot-color="warning"
          size="small"
        >
          <template #icon>
            <v-icon size="16">
              mdi-help-circle
            </v-icon>
          </template>
          <div class="timeline-content">
            <div class="font-weight-medium">
              Enquiry Period
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ formatDate(contract.tender.enquiryPeriod.startDate) }} -
              {{ formatDate(contract.tender.enquiryPeriod.endDate) }}
            </div>
          </div>
        </v-timeline-item>

        <!-- Awards -->
        <v-timeline-item
          v-for="(award, index) in sortedAwards"
          :key="award.id"
          :dot-color="getAwardStatusColor(award.status)"
          size="small"
        >
          <template #icon>
            <v-icon size="16">
              mdi-trophy
            </v-icon>
          </template>
          <div class="timeline-content">
            <div class="font-weight-medium">
              Award {{ index + 1 }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ formatDate(award.date) }}
            </div>
            <v-chip
              :color="getAwardStatusColor(award.status)"
              size="x-small"
              variant="tonal"
              class="mt-1"
            >
              {{ award.status }}
            </v-chip>
          </div>
        </v-timeline-item>
      </v-timeline>
    </div>

    <!-- Timeline Summary -->
    <v-card
      variant="tonal"
      class="mt-4"
    >
      <v-card-text class="py-3">
        <div class="d-flex flex-wrap ga-4 text-body-2">
          <div class="d-flex align-center ga-2">
            <v-icon
              size="16"
              color="primary"
            >
              mdi-calendar
            </v-icon>
            <span><strong>Total Duration:</strong> {{ getTotalDuration() }}</span>
          </div>
          <div
            v-if="contract.tender?.hasEnquiries"
            class="d-flex align-center ga-2"
          >
            <v-icon
              size="16"
              color="info"
            >
              mdi-help-circle
            </v-icon>
            <span><strong>Had Enquiries:</strong> Yes</span>
          </div>
          <div class="d-flex align-center ga-2">
            <v-icon
              size="16"
              color="success"
            >
              mdi-trophy
            </v-icon>
            <span><strong>Awards:</strong> {{ contract.awards?.length || 0 }}</span>
          </div>
          <div class="d-flex align-center ga-2">
            <v-icon
              size="16"
              color="warning"
            >
              mdi-tag
            </v-icon>
            <span><strong>Tags:</strong> {{ contract.tag?.join(', ') || 'None' }}</span>
          </div>
        </div>
      </v-card-text>
    </v-card>
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
const sortedAwards = computed(() => {
  if (!props.contract.awards) return []
  return [...props.contract.awards].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime(),
  )
})

// Utility functions
const formatDate = (dateString?: string | Date): string => {
  if (!dateString) return 'N/A'
  return new Intl.DateTimeFormat('es-UY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
}

const getTenderDuration = (tenderPeriod: { startDate: Date, endDate: Date }): string => {
  const start = new Date(tenderPeriod.startDate)
  const end = new Date(tenderPeriod.endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}`
  }
  else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} week${weeks !== 1 ? 's' : ''}`
  }
  else {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months !== 1 ? 's' : ''}`
  }
}

const getTotalDuration = (): string => {
  const contractDate = new Date(props.contract.date)
  const latestAwardDate = sortedAwards.value.length > 0
    ? new Date(sortedAwards.value[sortedAwards.value.length - 1].date)
    : contractDate

  const diffTime = Math.abs(latestAwardDate.getTime() - contractDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Same day'
  if (diffDays < 30) return `${diffDays} days`
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months !== 1 ? 's' : ''}`
  }
  const years = Math.floor(diffDays / 365)
  return `${years} year${years !== 1 ? 's' : ''}`
}

const getAwardStatusColor = (status?: string): string => {
  if (!status) return 'grey'

  const statusColors: Record<string, string> = {
    active: 'success',
    complete: 'info',
    cancelled: 'error',
    unsuccessful: 'warning',
    pending: 'orange',
  }
  return statusColors[status.toLowerCase()] || 'grey'
}
</script>

<style scoped>
.timeline-container {
  overflow-x: auto;
  padding: 16px 0;
}

.contract-timeline {
  min-width: 600px;
}

.timeline-content {
  text-align: center;
  min-width: 120px;
  padding: 8px;
}

.timeline-content .font-weight-medium {
  margin-bottom: 4px;
}

.timeline-content .text-caption {
  line-height: 1.2;
}

:deep(.v-timeline-item__body) {
  justify-content: center;
}

:deep(.v-timeline-item__opposite) {
  display: none;
}
</style>
