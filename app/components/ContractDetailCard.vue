<template>
  <v-card class="mb-6">
    <v-card-title class="d-flex align-center justify-space-between">
      <div class="d-flex align-center ga-2">
        <v-icon
          v-if="icon"
          :color="iconColor"
        >
          {{ icon }}
        </v-icon>
        <span>{{ title }}</span>
      </div>
      <v-chip
        v-if="badge"
        :color="badgeColor"
        size="small"
        variant="tonal"
      >
        {{ badge }}
      </v-chip>
    </v-card-title>

    <v-divider v-if="!hideTopDivider" />

    <v-card-text>
      <slot />
    </v-card-text>

    <v-divider v-if="hasActions" />

    <v-card-actions v-if="hasActions">
      <slot name="actions" />
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { useSlots } from 'vue'

interface Props {
  title: string
  icon?: string
  iconColor?: string
  badge?: string
  badgeColor?: string
  hideTopDivider?: boolean
}

withDefaults(defineProps<Props>(), {
  iconColor: 'primary',
  badgeColor: 'primary',
  hideTopDivider: false,
})

const slots = useSlots()
const hasActions = Boolean(slots.actions)
</script>
