<script setup lang="ts">
// Top-bar notification bell: unread badge + a dropdown of the most recent matched
// llamados. Client-only data (the layout is SSR); polls lightly to keep the badge
// fresh. Only rendered for authenticated users by the layout.
const { t } = useI18n()
const localePath = useLocalePath()
const api = useMonitorApi()

interface InboxItem {
  id: string
  compraId: string
  readAt: string | null
  createdAt: string
  call: { title: string, buyer?: { name?: string }, tenderPeriod?: { endDate?: string }, estimatedValue?: number, currency?: string } | null
}

const items = ref<InboxItem[]>([])
const unread = ref(0)
const open = ref(false)
const loading = ref(false)

async function load() {
  if (!import.meta.client) return
  loading.value = true
  try {
    const res = await api.notifications.list({ limit: 8 })
    items.value = res.data.items as InboxItem[]
    unread.value = res.data.unread
  }
  catch {
    // silent — the bell is non-critical chrome
  }
  finally {
    loading.value = false
  }
}

function fmtBudget(v?: number, currency?: string): string | null {
  if (v == null || !Number.isFinite(v)) return null
  const cur = (currency ?? 'UYU').toUpperCase()
  const sym = cur === 'USD' ? 'US$' : '$'
  return `${sym} ${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 }).format(Math.round(v))}`
}

function closesIn(end?: string): string | null {
  if (!end) return null
  const d = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000)
  if (Number.isNaN(d) || d < 0) return null
  return d === 0 ? t('inbox.closes') + ' hoy' : `${t('inbox.closes')} ${d}d`
}

async function onItemClick(item: InboxItem) {
  open.value = false
  if (!item.readAt) {
    item.readAt = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
    api.notifications.read(item.id).catch(() => {})
  }
  await navigateTo(localePath(`/llamados/${item.compraId}`))
}

async function markAll() {
  unread.value = 0
  items.value = items.value.map(i => ({ ...i, readAt: i.readAt ?? new Date().toISOString() }))
  await api.notifications.readAll().catch(() => {})
}

// Refresh when the menu opens, plus a light poll for the badge.
watch(open, (v) => { if (v) load() })

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  load()
  timer = setInterval(load, 90_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
  >
    <template #activator="{ props }">
      <button
        v-bind="props"
        class="bellbtn"
        type="button"
        :aria-label="t('inbox.title')"
      >
        <v-badge
          :model-value="unread > 0"
          :content="unread > 99 ? '99+' : unread"
          color="error"
          offset-x="-2"
          offset-y="-2"
        >
          <v-icon size="20">
            {{ unread > 0 ? 'mdi-bell-ring-outline' : 'mdi-bell-outline' }}
          </v-icon>
        </v-badge>
      </button>
    </template>

    <div class="bellpanel">
      <header class="bellpanel__head">
        <span class="bellpanel__title">{{ t('inbox.title') }}</span>
        <button
          v-if="unread > 0"
          class="bellpanel__mark"
          type="button"
          @click="markAll"
        >
          {{ t('inbox.markAllRead') }}
        </button>
      </header>

      <div
        v-if="!items.length"
        class="bellpanel__empty"
      >
        <v-icon
          size="28"
          class="bellpanel__emptyicon"
        >
          mdi-bell-sleep-outline
        </v-icon>
        <p>{{ t('inbox.empty') }}</p>
      </div>

      <ul
        v-else
        class="bellpanel__list"
      >
        <li
          v-for="item in items"
          :key="item.id"
        >
          <button
            class="bellitem"
            :class="{ 'bellitem--unread': !item.readAt }"
            type="button"
            @click="onItemClick(item)"
          >
            <span
              class="bellitem__dot"
              :class="{ 'bellitem__dot--on': !item.readAt }"
            />
            <span class="bellitem__body">
              <span class="bellitem__title">{{ item.call?.title || item.compraId }}</span>
              <span class="bellitem__meta">
                <template v-if="item.call?.buyer?.name">{{ item.call.buyer.name }}</template>
                <template v-if="fmtBudget(item.call?.estimatedValue, item.call?.currency)">
                  · {{ fmtBudget(item.call?.estimatedValue, item.call?.currency) }}
                </template>
                <template v-if="closesIn(item.call?.tenderPeriod?.endDate)">
                  · {{ closesIn(item.call?.tenderPeriod?.endDate) }}
                </template>
              </span>
            </span>
          </button>
        </li>
      </ul>

      <footer class="bellpanel__foot">
        <NuxtLink
          :to="localePath('/app/notificaciones')"
          class="bellpanel__all"
          @click="open = false"
        >
          {{ t('inbox.viewAll') }}
        </NuxtLink>
      </footer>
    </div>
  </v-menu>
</template>

<style scoped>
.bellbtn {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 34px;
  padding: 0 var(--s-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.bellbtn:hover { color: var(--text); border-color: var(--rule-strong); }

.bellpanel {
  width: min(380px, 92vw);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}
.bellpanel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--rule);
}
.bellpanel__title { font-weight: 700; font-size: var(--t-sm); }
.bellpanel__mark {
  border: 0;
  background: transparent;
  color: var(--celeste-deep);
  font-size: var(--t-xs);
  cursor: pointer;
}
.bellpanel__mark:hover { text-decoration: underline; }

.bellpanel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-6) var(--s-4);
  color: var(--text-muted);
  text-align: center;
}
.bellpanel__empty p { margin: 0; font-size: var(--t-sm); }
.bellpanel__emptyicon { opacity: 0.5; }

.bellpanel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}
.bellitem {
  display: flex;
  gap: var(--s-3);
  width: 100%;
  padding: var(--s-3) var(--s-4);
  border: 0;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.bellitem:hover { background: var(--surface-sunken); }
.bellitem--unread { background: color-mix(in srgb, var(--celeste) 7%, transparent); }
.bellitem__dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: transparent;
}
.bellitem__dot--on { background: var(--celeste); }
.bellitem__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bellitem__title {
  font-weight: 600;
  font-size: var(--t-sm);
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.bellitem__meta { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.3; }

.bellpanel__foot {
  padding: var(--s-3) var(--s-4);
  text-align: center;
}
.bellpanel__all {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}
.bellpanel__all:hover { text-decoration: underline; }
</style>
