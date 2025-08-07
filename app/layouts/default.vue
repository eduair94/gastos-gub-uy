<template>
    <v-app>
        <!-- Navigation Drawer -->
        <v-navigation-drawer v-model="navigationDrawer" app class="app-navigation" width="280"
            :permanent="$vuetify.display.lgAndUp">
            <!-- App Header -->
            <v-list-item class="pa-4">
                <template #prepend>
                    <v-avatar color="primary" size="40">
                        <v-icon color="white">
                            mdi-bank
                        </v-icon>
                    </v-avatar>
                </template>
                <v-list-item-title class="text-h6 font-weight-bold">
                    Gastos Gub
                </v-list-item-title>
                <v-list-item-subtitle>
                    Transparency Dashboard
                </v-list-item-subtitle>
            </v-list-item>

            <v-divider />

            <!-- Navigation Menu -->
            <v-list density="comfortable" nav>
                <v-list-item v-for="item in navigationItems" :key="item.title" :to="item.to" :exact="item.exact"
                    :prepend-icon="item.icon" :title="item.title" :disabled="item.disabled" class="mb-1" />
            </v-list>

            <!-- Quick Stats -->
            <template #append>
                <div class="pa-4">
                    <v-divider class="mb-4" />
                    <div class="text-caption text-medium-emphasis mb-2">
                        Quick Stats
                    </div>
                    <div class="text-body-2">
                        <div class="d-flex justify-space-between mb-1">
                            <span>Total Contracts:</span>
                            <span class="font-weight-medium">{{ formatNumber(quickStats.contracts) }}</span>
                        </div>
                        <div class="d-flex justify-space-between mb-1">
                            <span>Suppliers:</span>
                            <span class="font-weight-medium">{{ formatNumber(quickStats.suppliers) }}</span>
                        </div>
                        <div class="d-flex justify-space-between">
                            <span>Buyers:</span>
                            <span class="font-weight-medium">{{ formatNumber(quickStats.buyers) }}</span>
                        </div>
                    </div>
                </div>
            </template>
        </v-navigation-drawer>

        <!-- App Bar -->
        <v-app-bar app elevation="1" color="surface">
            <!-- Menu Toggle for Mobile -->
            <v-app-bar-nav-icon v-if="!$vuetify.display.lgAndUp" @click="toggleNavigationDrawer" />

            <!-- Page Title -->
            <v-app-bar-title class="text-h6 font-weight-medium">
                {{ pageTitle }}
            </v-app-bar-title>

            <v-spacer />

            <!-- Search -->
            <v-text-field v-model="searchQuery" placeholder="Search contracts, suppliers, buyers..."
                prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" hide-details clearable
                class="mx-4" style="max-width: 400px" @keyup.enter="performSearch" />

            <!-- Theme Toggle -->
            <v-btn icon variant="text" @click="toggleTheme">
                <v-icon>
                    {{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}
                </v-icon>
            </v-btn>

            <!-- Notifications -->
            <v-btn icon variant="text">
                <v-badge :content="notifications.length" :model-value="notifications.length > 0" color="error">
                    <v-icon>mdi-bell</v-icon>
                </v-badge>
            </v-btn>

            <!-- User Menu -->
            <v-menu>
                <template #activator="{ props }">
                    <v-btn icon variant="text" v-bind="props">
                        <v-avatar size="32">
                            <v-icon>mdi-account</v-icon>
                        </v-avatar>
                    </v-btn>
                </template>
                <v-list>
                    <v-list-item>
                        <v-list-item-title>Settings</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                        <v-list-item-title>Help</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item>
                        <v-list-item-title>About</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>
        </v-app-bar>

        <!-- Main Content -->
        <v-main>
            <v-container fluid class="pa-6">
                <!-- Breadcrumbs -->
                <v-breadcrumbs v-if="breadcrumbs.length > 1" :items="breadcrumbs" class="pa-0 mb-4" />

                <!-- Page Content -->
                <slot />
            </v-container>
        </v-main>

        <!-- Notifications Snackbar -->
        <v-snackbar v-for="notification in notifications" :key="notification.id" v-model="notification.show"
            :color="notification.type" :timeout="notification.timeout || 5000" :persistent="notification.persistent"
            location="top right" class="mb-2">
            <div class="d-flex align-center">
                <v-icon class="mr-2" :icon="getNotificationIcon(notification.type)" />
                <div>
                    <div class="font-weight-medium">
                        {{ notification.title }}
                    </div>
                    <div class="text-body-2">
                        {{ notification.message }}
                    </div>
                </div>
            </div>
            <template #actions>
                <v-btn variant="text" @click="dismissNotification(notification.id)">
                    Close
                </v-btn>
            </template>
        </v-snackbar>
    </v-app>
</template>

<script setup lang="ts">
import { useTheme } from 'vuetify'
import type { NavigationItem, Notification } from '~/types'

// Theme management
const theme = useTheme()
const isDark = computed(() => theme.global.name.value === 'dark')

// Navigation state
const navigationDrawer = ref(false)
const searchQuery = ref('')

// Page metadata
const route = useRoute()
const pageTitle = computed(() => {
    const titles: Record<string, string> = {
        '/': 'Dashboard',
        '/contracts': 'Contract Explorer',
        '/suppliers': 'Suppliers',
        '/buyers': 'Government Buyers',
        '/analytics': 'Analytics & Insights',
        '/reports': 'Reports'
    }
    return titles[route.path] || 'Dashboard'
})

// Breadcrumbs
const breadcrumbs = computed(() => {
    const paths = route.path.split('/').filter(Boolean)
    const items = [{ title: 'Home', to: '/' }]

    let currentPath = ''
    paths.forEach(path => {
        currentPath += `/${path}`
        const title = path.charAt(0).toUpperCase() + path.slice(1)
        items.push({
            title,
            to: currentPath,
            disabled: currentPath === route.path
        })
    })

    return items
})

// Navigation items
const navigationItems: NavigationItem[] = [
    {
        title: 'Dashboard',
        icon: 'mdi-view-dashboard',
        to: '/',
        exact: true
    },
    {
        title: 'Contract Explorer',
        icon: 'mdi-file-document-multiple',
        to: '/contracts'
    },
    {
        title: 'Suppliers',
        icon: 'mdi-domain',
        to: '/suppliers'
    },
    {
        title: 'Government Buyers',
        icon: 'mdi-bank',
        to: '/buyers'
    },
    {
        title: 'Analytics & Insights',
        icon: 'mdi-chart-line',
        to: '/analytics'
    },
    {
        title: 'Reports',
        icon: 'mdi-file-chart',
        to: '/reports'
    }
]

// Quick stats (would come from API)
const quickStats = ref({
    contracts: 125000,
    suppliers: 36000,
    buyers: 400
})

// Notifications
const notifications = ref<(Notification & { show: boolean })[]>([])

// Methods
const toggleNavigationDrawer = () => {
    navigationDrawer.value = !navigationDrawer.value
}

const toggleTheme = () => {
    theme.global.name.value = theme.global.name.value === 'light' ? 'dark' : 'light'
}

const performSearch = () => {
    if (searchQuery.value.trim()) {
        // Navigate to search results
        navigateTo(`/search?q=${encodeURIComponent(searchQuery.value)}`)
    }
}

const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('es-UY').format(num)
}

const getNotificationIcon = (type: string): string => {
    const icons = {
        success: 'mdi-check-circle',
        error: 'mdi-alert-circle',
        warning: 'mdi-alert',
        info: 'mdi-information'
    }
    return icons[type as keyof typeof icons] || 'mdi-information'
}

const dismissNotification = (id: string) => {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
        notifications.value[index].show = false
        setTimeout(() => {
            notifications.value.splice(index, 1)
        }, 300)
    }
}

// Initialize navigation drawer state
onMounted(() => {
    // Auto-open on desktop
    if (process.client && window.innerWidth >= 1280) {
        navigationDrawer.value = true
    }
})
</script>

<style scoped>
.v-app-bar {
    backdrop-filter: blur(10px);
}

.app-navigation {
    border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.v-navigation-drawer :deep(.v-list-item--active) {
    background-color: rgba(var(--v-theme-primary), 0.1);
    border-right: 3px solid rgb(var(--v-theme-primary));
}

.v-breadcrumbs :deep(.v-breadcrumbs-item) {
    font-size: 0.875rem;
}

@media (max-width: 959px) {
    .v-container {
        padding: 16px !important;
    }
}
</style>
