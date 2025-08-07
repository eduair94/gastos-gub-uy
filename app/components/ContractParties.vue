<template>
  <div>
    <div class="text-subtitle-2 text-medium-emphasis mb-3">
      Contract Parties ({{ parties.length }})
    </div>

    <v-row>
      <v-col
        v-for="party in parties"
        :key="party.id"
        cols="12"
        md="6"
        lg="4"
      >
        <v-card
          variant="outlined"
          class="h-100"
        >
          <v-card-text>
            <div class="d-flex align-center ga-3 mb-3">
              <v-avatar
                :color="getPartyColor(party.roles)"
                size="40"
              >
                <v-icon>
                  {{ getPartyIcon(party.roles) }}
                </v-icon>
              </v-avatar>
              <div class="flex-grow-1">
                <div class="font-weight-medium">
                  {{ party.name }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  ID: {{ party.id }}
                </div>
              </div>
            </div>

            <div class="mb-3">
              <div class="text-caption text-medium-emphasis mb-1">
                Roles
              </div>
              <div class="d-flex flex-wrap ga-1">
                <v-chip
                  v-for="role in party.roles"
                  :key="role"
                  :color="getRoleColor(role)"
                  size="x-small"
                  variant="tonal"
                >
                  {{ formatRole(role) }}
                </v-chip>
              </div>
            </div>

            <div
              v-if="party.contactPoint"
              class="contact-info"
            >
              <div class="text-caption text-medium-emphasis mb-2">
                Contact Information
              </div>
              <v-list
                density="compact"
                class="pa-0"
              >
                <v-list-item
                  v-if="party.contactPoint.name"
                  density="compact"
                  class="px-0"
                >
                  <template #prepend>
                    <v-icon
                      size="16"
                      class="mr-2"
                    >
                      mdi-account
                    </v-icon>
                  </template>
                  <v-list-item-title class="text-body-2">
                    {{ party.contactPoint.name }}
                  </v-list-item-title>
                </v-list-item>

                <v-list-item
                  v-if="party.contactPoint.email"
                  density="compact"
                  class="px-0"
                >
                  <template #prepend>
                    <v-icon
                      size="16"
                      class="mr-2"
                    >
                      mdi-email
                    </v-icon>
                  </template>
                  <v-list-item-title class="text-body-2">
                    <a
                      :href="`mailto:${party.contactPoint.email}`"
                      class="text-decoration-none text-primary"
                    >
                      {{ party.contactPoint.email }}
                    </a>
                  </v-list-item-title>
                </v-list-item>

                <v-list-item
                  v-if="party.contactPoint.telephone"
                  density="compact"
                  class="px-0"
                >
                  <template #prepend>
                    <v-icon
                      size="16"
                      class="mr-2"
                    >
                      mdi-phone
                    </v-icon>
                  </template>
                  <v-list-item-title class="text-body-2">
                    <a
                      :href="`tel:${party.contactPoint.telephone}`"
                      class="text-decoration-none text-primary"
                    >
                      {{ party.contactPoint.telephone }}
                    </a>
                  </v-list-item-title>
                </v-list-item>

                <v-list-item
                  v-if="party.contactPoint.faxNumber"
                  density="compact"
                  class="px-0"
                >
                  <template #prepend>
                    <v-icon
                      size="16"
                      class="mr-2"
                    >
                      mdi-fax
                    </v-icon>
                  </template>
                  <v-list-item-title class="text-body-2">
                    {{ party.contactPoint.faxNumber }}
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import type { IParty } from '../../types'

interface Props {
  parties: IParty[]
}

defineProps<Props>()

// Utility functions
const getPartyIcon = (roles: string[]): string => {
  if (roles.includes('buyer')) return 'mdi-account-tie'
  if (roles.includes('supplier')) return 'mdi-domain'
  if (roles.includes('procuringEntity')) return 'mdi-office-building'
  if (roles.includes('tenderer')) return 'mdi-handshake'
  return 'mdi-account-group'
}

const getPartyColor = (roles: string[]): string => {
  if (roles.includes('buyer')) return 'primary'
  if (roles.includes('supplier')) return 'success'
  if (roles.includes('procuringEntity')) return 'info'
  if (roles.includes('tenderer')) return 'warning'
  return 'grey'
}

const getRoleColor = (role: string): string => {
  const roleColors: Record<string, string> = {
    buyer: 'primary',
    supplier: 'success',
    procuringEntity: 'info',
    tenderer: 'warning',
    funder: 'purple',
    enquirer: 'orange',
    reviewBody: 'indigo',
  }
  return roleColors[role] || 'grey'
}

const formatRole = (role: string): string => {
  const roleLabels: Record<string, string> = {
    buyer: 'Buyer',
    supplier: 'Supplier',
    procuringEntity: 'Procuring Entity',
    tenderer: 'Tenderer',
    funder: 'Funder',
    enquirer: 'Enquirer',
    reviewBody: 'Review Body',
  }
  return roleLabels[role] || role.charAt(0).toUpperCase() + role.slice(1)
}
</script>

<style scoped>
.contact-info {
  border-top: 1px solid rgb(var(--v-theme-surface-variant));
  padding-top: 12px;
}
</style>
