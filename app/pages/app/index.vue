<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const { user } = useAuth()

useSeo({ title: t('dashboard.title'), description: t('dashboard.title'), path: '/app', noindex: true })

const { data: watchesData } = await useFetch<{ data: Array<{ active?: boolean, name: string, _id: string }> }>('/api/watches', { server: false })
const watches = computed(() => watchesData.value?.data ?? [])
const activeCount = computed(() => watches.value.filter(w => w.active).length)

const { data: calData } = await useFetch<{ data: { items: Array<Record<string, unknown>> } }>('/api/calendar', { server: false })
const upcoming = computed(() => (calData.value?.data?.items ?? []).slice(0, 6))
</script>

<template>
  <div class="u-container dash">
    <header class="dash__head">
      <p class="u-eyebrow">
        {{ t('dashboard.title') }}
      </p>
      <h1 class="u-hero">
        {{ t('dashboard.welcome') }}{{ user?.displayName ? `, ${user.displayName}` : '' }}
      </h1>
      <p
        v-if="user && !user.emailVerified"
        class="dash__verify"
      >
        {{ t('auth.verifyNotice') }}
      </p>
    </header>

    <div class="dash__cols">
      <section class="panel dash__panel">
        <div class="dash__panelhead">
          <h2 class="u-eyebrow">
            {{ t('dashboard.myAlerts') }}
          </h2>
          <NuxtLink
            :to="localePath('/app/alertas')"
            class="dash__link"
          >
            {{ t('dashboard.manageAlerts') }}
          </NuxtLink>
        </div>
        <p
          v-if="watches.length"
          class="dash__stat"
        >
          {{ t('dashboard.activeAlerts', { n: activeCount }) }}
        </p>
        <ul
          v-if="watches.length"
          class="dash__watches"
        >
          <li
            v-for="w in watches.slice(0, 5)"
            :key="w._id"
            class="dash__watch"
          >
            <v-icon
              size="16"
              :color="w.active ? 'success' : undefined"
            >
              {{ w.active ? 'mdi-bell' : 'mdi-bell-off-outline' }}
            </v-icon>
            <span class="u-truncate">{{ w.name }}</span>
          </li>
        </ul>
        <div
          v-else
          class="dash__empty"
        >
          <p>{{ t('dashboard.noAlerts') }}</p>
          <NuxtLink
            :to="localePath('/app/alertas')"
            class="dash__cta"
          >
            {{ t('alerts.new') }}
          </NuxtLink>
        </div>
      </section>

      <section class="panel dash__panel">
        <div class="dash__panelhead">
          <h2 class="u-eyebrow">
            {{ t('dashboard.upcoming') }}
          </h2>
          <NuxtLink
            :to="localePath('/app/calendario')"
            class="dash__link"
          >
            {{ t('dashboard.viewCalendar') }}
          </NuxtLink>
        </div>
        <ul
          v-if="upcoming.length"
          class="dash__upcoming"
        >
          <li
            v-for="(c, i) in upcoming"
            :key="`u-${i}`"
            class="dash__up"
          >
            <NuxtLink
              :to="localePath(`/llamados/${(c as any).compraId}`)"
              class="dash__uplink"
            >
              <span class="u-truncate">{{ (c as any).title }}</span>
              <span
                v-if="(c as any).endDate"
                class="u-mono u-muted dash__update"
              >{{ formatDate((c as any).endDate) }}</span>
            </NuxtLink>
          </li>
        </ul>
        <p
          v-else
          class="u-muted dash__nomuted"
        >
          {{ t('dashboard.noUpcoming') }}
        </p>
      </section>
    </div>

    <NuxtLink
      :to="localePath('/llamados')"
      class="dash__browse"
    >
      <v-icon size="18">
        mdi-bullhorn-outline
      </v-icon> {{ t('dashboard.browseLlamados') }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.dash { padding-block: var(--s-6) var(--s-8); }
.dash__head { margin-bottom: var(--s-5); }
.dash__verify {
  margin-top: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--sol) 12%, transparent);
  font-size: var(--t-sm);
}
.dash__cols { display: grid; grid-template-columns: 1fr; gap: var(--s-4); }
@media (min-width: 800px) { .dash__cols { grid-template-columns: 1fr 1fr; } }
.dash__panel { padding: var(--s-5); }
.dash__panelhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--s-3); }
.dash__link { color: var(--celeste-deep); text-decoration: none; font-size: var(--t-sm); }
.dash__stat { font-weight: 600; margin: 0 0 var(--s-2); }
.dash__watches, .dash__upcoming { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.dash__watch { display: flex; align-items: center; gap: var(--s-2); font-size: var(--t-sm); }
.dash__up { border-bottom: 1px solid var(--rule); padding-bottom: var(--s-2); }
.dash__up:last-child { border-bottom: 0; }
.dash__uplink { display: flex; justify-content: space-between; gap: var(--s-3); text-decoration: none; color: var(--text); font-size: var(--t-sm); }
.dash__uplink:hover { color: var(--celeste-deep); }
.dash__empty { color: var(--text-muted); }
.dash__cta, .dash__browse {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-3);
  padding: 0 var(--s-4);
  height: 40px;
  border-radius: var(--r-md);
  background: var(--cta-fill);
  color: var(--cta-fg);
  font-weight: 600;
  font-size: var(--t-sm);
  text-decoration: none;
}
.dash__browse { margin-top: var(--s-5); }
</style>
