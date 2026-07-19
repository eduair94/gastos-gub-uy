<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const api = useMonitorApi()

useSeo({ title: t('inbox.title'), description: t('inbox.lead'), path: '/app/notificaciones', noindex: true })

interface InboxItem {
  id: string
  compraId: string
  matchedOn: { categories?: string[], keywords?: string[] } | null
  readAt: string | null
  createdAt: string
  call: {
    compraId: string
    title: string
    buyer?: { name?: string }
    status: string
    tenderPeriod?: { endDate?: string }
    procurementMethodDetails?: string
    estimatedValue?: number
    currency?: string
  } | null
}

const items = ref<InboxItem[]>([])
const unread = ref(0)
const total = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const PAGE = 20

async function load(reset = false) {
  loading.value = true
  try {
    const skip = reset ? 0 : items.value.length
    const res = await api.notifications.list({ limit: PAGE, skip })
    const batch = res.data.items as InboxItem[]
    items.value = reset ? batch : [...items.value, ...batch]
    unread.value = res.data.unread
    total.value = res.data.total
    hasMore.value = res.data.hasMore
  }
  finally {
    loading.value = false
  }
}

await useAsyncData('inbox-first', () => load(true))

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
  if (d === 0) return `${t('inbox.closes')} hoy`
  return `${t('inbox.closes')} ${d}d`
}

function chips(item: InboxItem): string[] {
  const m = item.matchedOn
  if (!m) return []
  return [...(m.keywords ?? []), ...(m.categories ?? [])].slice(0, 5)
}

async function onOpen(item: InboxItem) {
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
</script>

<template>
  <div class="u-container inbox">
    <header class="inbox__head">
      <div>
        <p class="u-eyebrow">
          {{ t('inbox.title') }}
        </p>
        <h1 class="u-hero">
          {{ t('inbox.title') }}
        </h1>
        <p class="inbox__lead">
          {{ t('inbox.lead') }}
        </p>
      </div>
      <v-btn
        v-if="unread > 0"
        variant="tonal"
        size="small"
        prepend-icon="mdi-check-all"
        @click="markAll"
      >
        {{ t('inbox.markAllRead') }}
      </v-btn>
    </header>

    <p
      v-if="unread > 0"
      class="inbox__count"
    >
      {{ unread }} {{ t('inbox.newCount') }}
    </p>

    <div
      v-if="!items.length"
      class="panel inbox__empty"
    >
      <v-icon
        size="40"
        class="inbox__emptyicon"
      >
        mdi-bell-sleep-outline
      </v-icon>
      <p>{{ t('inbox.empty') }}</p>
      <v-btn
        variant="text"
        :to="localePath('/app/alertas')"
        prepend-icon="mdi-bell-plus-outline"
      >
        {{ t('alerts.new') }}
      </v-btn>
    </div>

    <ul
      v-else
      class="inbox__list"
    >
      <li
        v-for="item in items"
        :key="item.id"
      >
        <button
          class="inboxcard"
          :class="{ 'inboxcard--unread': !item.readAt }"
          type="button"
          @click="onOpen(item)"
        >
          <span
            class="inboxcard__dot"
            :class="{ 'inboxcard__dot--on': !item.readAt }"
          />
          <span class="inboxcard__body">
            <span class="inboxcard__title">{{ item.call?.title || item.compraId }}</span>
            <span class="inboxcard__meta">
              <template v-if="item.call?.buyer?.name">{{ item.call.buyer.name }}</template>
              <template v-if="item.call?.procurementMethodDetails"> · {{ item.call.procurementMethodDetails }}</template>
            </span>
            <span class="inboxcard__facts">
              <span
                v-if="fmtBudget(item.call?.estimatedValue, item.call?.currency)"
                class="inboxcard__budget"
              >
                {{ t('inbox.budget') }}: {{ fmtBudget(item.call?.estimatedValue, item.call?.currency) }}
              </span>
              <span
                v-if="closesIn(item.call?.tenderPeriod?.endDate)"
                class="inboxcard__closes"
              >
                ⏳ {{ closesIn(item.call?.tenderPeriod?.endDate) }}
              </span>
            </span>
            <span
              v-if="chips(item).length"
              class="inboxcard__chips"
            >
              <span class="inboxcard__why">{{ t('inbox.matched') }}:</span>
              <span
                v-for="c in chips(item)"
                :key="c"
                class="inboxcard__chip"
              >{{ c }}</span>
            </span>
          </span>
          <v-icon
            size="18"
            class="inboxcard__go"
          >
            mdi-chevron-right
          </v-icon>
        </button>
      </li>
    </ul>

    <div
      v-if="hasMore"
      class="inbox__more"
    >
      <v-btn
        variant="outlined"
        :loading="loading"
        @click="load(false)"
      >
        {{ t('inbox.loadMore') }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.inbox { padding-block: var(--s-6) var(--s-8); max-width: 760px; }
.inbox__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-4); margin-bottom: var(--s-4); }
.inbox__lead { color: var(--text-muted); font-size: var(--t-sm); margin-top: var(--s-2); }
.inbox__count { color: var(--celeste-deep); font-size: var(--t-sm); font-weight: 600; margin-bottom: var(--s-3); }

.inbox__empty { display: flex; flex-direction: column; align-items: center; gap: var(--s-3); padding: var(--s-8) var(--s-4); text-align: center; color: var(--text-muted); }
.inbox__empty p { margin: 0; }
.inbox__emptyicon { opacity: 0.45; }

.inbox__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-3); }

.inboxcard {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  width: 100%;
  padding: var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.inboxcard:hover { border-color: var(--rule-strong); background: var(--surface-sunken); }
.inboxcard--unread { border-color: color-mix(in srgb, var(--celeste) 40%, var(--rule)); background: color-mix(in srgb, var(--celeste) 6%, transparent); }

.inboxcard__dot { flex: none; width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: transparent; }
.inboxcard__dot--on { background: var(--celeste); }

.inboxcard__body { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.inboxcard__title { font-weight: 700; font-size: var(--t-base); line-height: 1.35; }
.inboxcard__meta { font-size: var(--t-sm); color: var(--text-muted); }
.inboxcard__facts { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); font-size: var(--t-sm); margin-top: 2px; }
.inboxcard__budget { font-weight: 600; font-family: var(--font-mono); }
.inboxcard__closes { color: var(--text-muted); }

.inboxcard__chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-1) var(--s-2); margin-top: var(--s-1); }
.inboxcard__why { font-size: var(--t-xs); color: var(--text-muted); }
.inboxcard__chip {
  font-size: var(--t-xs);
  padding: 1px var(--s-2);
  border-radius: var(--r-full);
  background: var(--surface-sunken);
  color: var(--text-muted);
  border: 1px solid var(--rule);
}
.inboxcard__go { flex: none; color: var(--text-muted); margin-top: 2px; }

.inbox__more { display: flex; justify-content: center; margin-top: var(--s-5); }
</style>
