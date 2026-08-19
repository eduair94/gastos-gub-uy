<script setup lang="ts">
/**
 * Canales de YouTube uruguayos sobre gasto público y política.
 *
 * La página tiene dos mitades y no se mezclan:
 *
 *   - El DIRECTORIO es curado y verificado. Cada canal pasó una prueba de identidad
 *     que está escrita en ~/data/canales-youtube y se puede volver a correr.
 *   - «Lo último» es una LECTURA AUTOMÁTICA del feed público de esos mismos canales.
 *     No verificamos el contenido de ningún video, y el aviso lo dice arriba.
 *
 * El filtro «gasto y política» corre sobre títulos de canales ya verificados. Ese
 * orden es el que lo hace publicable: el mismo filtro sobre YouTube entero traería
 * cualquier cosa, igual que la búsqueda de prensa por nombre de proveedor.
 */
import {
  CHANNELS, GAPS, LIMITES, METODO, REJECTED, VERIFIED_ON,
  channelPath, channelUrl, isActive, matchesTopic,
  type Category, type Channel,
} from '~/data/canales-youtube'
import { SAMPLED_ON, SAMPLES } from '~/data/canales-youtube-muestra'

interface FeedVideo {
  videoId: string
  title: string
  published: string
  channelId: string
  channelName: string
  category: Category
  url: string
  thumbnail: string
}

const { t, locale } = useI18n()
const localePath = useLocalePath()

type L = 'es' | 'en'
function bi(x: { es: string, en: string }): string {
  return x[locale.value as L] ?? x.es
}

const { data: feedRes } = await useFetch<{ success: boolean, data: { videos: FeedVideo[], fetchedAt: string, failed: string[] }, stale: boolean }>('/api/canales-youtube')

const videos = computed<FeedVideo[]>(() => feedRes.value?.data?.videos ?? [])
const fetchedAt = computed(() => feedRes.value?.data?.fetchedAt ?? null)
const stale = computed(() => Boolean(feedRes.value?.stale))

// La ventana de actividad se mide contra la carga de la página, no contra el reloj
// del módulo: un worker de pm2 vive días y congelaría "hoy" en su arranque.
const now = new Date()
const activeChannels = computed(() => CHANNELS.filter(c => isActive(c, now)))
const inactiveChannels = computed(() =>
  CHANNELS.filter(c => !isActive(c, now)).sort((a, b) => (b.lastUpload ?? '').localeCompare(a.lastUpload ?? '')),
)

const ORDER: Category[] = ['estado', 'medios', 'partidos', 'analisis']

// Dos órdenes, porque son dos preguntas distintas: «cuál es el más grande» y «cuál
// habla más de lo que a este sitio le importa». La medición sale de la muestra de
// títulos; un canal sin muestra queda último en ese orden, no primero.
type SortKey = 'tamano' | 'gasto'
const sortBy = ref<SortKey>('tamano')

function topicShare(id: string): number | null {
  const s = SAMPLES[id]
  if (!s || s.n === 0) return null
  return s.topicHits / s.n
}

const groups = computed(() => ORDER.map(key => ({
  key,
  channels: activeChannels.value
    .filter(c => c.category === key)
    .sort((a, b) => sortBy.value === 'tamano'
      ? b.subscribersApprox - a.subscribersApprox
      : (topicShare(b.id) ?? -1) - (topicShare(a.id) ?? -1)),
})).filter(g => g.channels.length > 0))

// Filtros del feed. `onlyTopic` arranca prendido porque la página es sobre dinero
// público; el contador dice cuántos videos esconde, así que la elección es visible.
const onlyTopic = ref(true)
const categoryFilter = ref<Category | 'todos'>('todos')

const feedByTopic = computed(() => videos.value.filter(v => matchesTopic(v.title)))
const visibleVideos = computed(() => {
  const base = onlyTopic.value ? feedByTopic.value : videos.value
  return categoryFilter.value === 'todos' ? base : base.filter(v => v.category === categoryFilter.value)
})
const hiddenByTopic = computed(() => videos.value.length - feedByTopic.value.length)

const categoryChips = computed(() => [
  { key: 'todos' as const, label: t('canalesYt.filterAll') },
  ...ORDER.map(k => ({ key: k, label: t(`canalesYt.cat.${k}`) })),
])

function proofLabel(c: Channel): string {
  if (c.proofs.length === 2) return t('canalesYt.proof.both')
  return c.proofs[0] === 'sitio' ? t('canalesYt.proof.site') : t('canalesYt.proof.country')
}

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.canalesYt.title'),
  description: t('seo.canalesYt.description'),
  path: '/canales-youtube',
  kicker: 'Directorio',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': t('seo.canalesYt.title'),
    'description': t('seo.canalesYt.description'),
    'numberOfItems': CHANNELS.length,
    'itemListElement': CHANNELS.map((c, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'name': c.name,
      'url': channelUrl(c.id),
    })),
    'publisher': orgLd,
  },
}))
</script>

<template>
  <div class="yt">
    <!-- Hero -->
    <section class="yhero">
      <div class="yhero__in u-container">
        <p class="u-eyebrow yhero__eyebrow">
          {{ t('canalesYt.eyebrow') }}
        </p>
        <h1 class="yhero__title">
          {{ t('canalesYt.title') }}
        </h1>
        <p class="yhero__lead">
          {{ t('canalesYt.lead') }}
        </p>
        <p class="yhero__meta">
          <v-icon size="15">
            mdi-check-decagram-outline
          </v-icon>
          {{ t('canalesYt.verifiedLabel', { date: VERIFIED_ON }) }}
        </p>
      </div>
    </section>

    <div class="u-container yt__body">
      <!-- Cifras de la propia tabla -->
      <StatBand
        :columns="3"
        :items="[
          { value: CHANNELS.length, label: t('canalesYt.statVerified') },
          { value: activeChannels.length, label: t('canalesYt.statActive') },
          { value: REJECTED.length, label: t('canalesYt.statRejected') },
        ]"
      />

      <!-- Qué no hace la página. Arriba, no al pie. -->
      <section class="block">
        <v-card
          class="disc"
          border
          rounded="lg"
        >
          <p class="disc__badge">
            <v-icon size="15">
              mdi-alert-circle-outline
            </v-icon>
            {{ t('canalesYt.limitsTitle') }}
          </p>
          <ul class="disc__list">
            <li
              v-for="(l, i) in LIMITES"
              :key="i"
            >
              {{ bi(l) }}
            </li>
          </ul>
        </v-card>
      </section>

      <!-- Orientación política: qué hacemos y qué no -->
      <section class="block">
        <h2 class="block__h">
          {{ t('canalesYt.orientationTitle') }}
        </h2>
        <p class="block__help">
          {{ t('canalesYt.orientationHelp') }}
        </p>
        <p class="block__help">
          {{ t('canalesYt.orientationStamp', { date: SAMPLED_ON }) }}
        </p>
      </section>

      <!-- Lo último -->
      <section class="block">
        <div class="block__head">
          <h2 class="block__h">
            {{ t('canalesYt.feedTitle') }}
          </h2>
          <p
            v-if="fetchedAt"
            class="block__stamp"
          >
            {{ t('canalesYt.feedStamp', { date: formatDateTime(fetchedAt) }) }}
          </p>
        </div>
        <p class="block__help">
          {{ t('canalesYt.feedHelp') }}
        </p>

        <div class="ftools">
          <v-switch
            v-model="onlyTopic"
            :label="t('canalesYt.onlyTopic')"
            color="primary"
            density="compact"
            hide-details
            class="ftools__switch"
          />
          <div class="chip-row">
            <v-chip
              v-for="c in categoryChips"
              :key="c.key"
              :variant="categoryFilter === c.key ? 'flat' : 'outlined'"
              :color="categoryFilter === c.key ? 'primary' : undefined"
              size="small"
              @click="categoryFilter = c.key"
            >
              {{ c.label }}
            </v-chip>
          </div>
        </div>

        <p
          v-if="onlyTopic && hiddenByTopic > 0"
          class="ftools__note"
        >
          {{ t('canalesYt.hiddenNote', { n: hiddenByTopic }) }}
        </p>
        <p
          v-if="stale"
          class="ftools__note ftools__note--warn"
        >
          {{ t('canalesYt.staleNote') }}
        </p>

        <div
          v-if="visibleVideos.length"
          class="vgrid"
        >
          <a
            v-for="v in visibleVideos"
            :key="v.videoId"
            class="vcard"
            :href="v.url"
            target="_blank"
            rel="noopener nofollow"
          >
            <img
              class="vcard__thumb"
              :src="v.thumbnail"
              :alt="v.title"
              loading="lazy"
              width="320"
              height="180"
            >
            <div class="vcard__body">
              <p class="vcard__title">{{ v.title }}</p>
              <p class="vcard__meta">
                <span class="vcard__chan">{{ v.channelName }}</span>
                <span class="vcard__sep">·</span>
                <span>{{ formatDate(v.published) }}</span>
              </p>
            </div>
          </a>
        </div>
        <v-card
          v-else
          class="empty"
          border
          rounded="lg"
        >
          {{ t('canalesYt.feedEmpty') }}
        </v-card>
      </section>

      <!-- Orden del directorio -->
      <section class="block">
        <div class="chip-row">
          <span class="sortlabel">{{ t('canalesYt.sortLabel') }}</span>
          <v-chip
            v-for="k in (['tamano', 'gasto'] as const)"
            :key="k"
            :variant="sortBy === k ? 'flat' : 'outlined'"
            :color="sortBy === k ? 'primary' : undefined"
            size="small"
            @click="sortBy = k"
          >
            {{ t(`canalesYt.sort.${k}`) }}
          </v-chip>
        </div>
      </section>

      <!-- El directorio -->
      <section
        v-for="g in groups"
        :key="g.key"
        class="block"
      >
        <div class="block__head">
          <h2 class="block__h">
            {{ t(`canalesYt.cat.${g.key}`) }}
          </h2>
          <p class="block__stamp">
            {{ t('canalesYt.countLabel', { n: g.channels.length }) }}
          </p>
        </div>
        <p class="block__help">
          {{ t(`canalesYt.catHelp.${g.key}`) }}
        </p>

        <div class="cgrid">
          <article
            v-for="c in g.channels"
            :key="c.id"
            class="ccard"
          >
            <header class="ccard__head">
              <NuxtLink
                class="ccard__name"
                :to="localePath(channelPath(c))"
              >
                {{ c.name }}
                <v-icon size="14">
                  mdi-arrow-right
                </v-icon>
              </NuxtLink>
              <p class="ccard__handle">
                {{ c.handle }}
                <span
                  v-if="c.bloc"
                  class="ccard__bloc"
                >· {{ t(`canalesYt.bloc.${c.bloc}`) }}</span>
              </p>
            </header>

            <p class="ccard__what">
              {{ bi(c.what) }}
            </p>
            <p class="ccard__why">
              {{ bi(c.why) }}
            </p>

            <dl class="ccard__facts">
              <div>
                <dt>{{ t('canalesYt.subs') }}</dt>
                <dd>{{ c.subscribers ?? t('canalesYt.notPublished') }}</dd>
              </div>
              <div>
                <dt>{{ t('canalesYt.videos') }}</dt>
                <dd>{{ c.videos ?? '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('canalesYt.lastUpload') }}</dt>
                <dd>{{ c.lastUpload ? formatDate(c.lastUpload) : '—' }}</dd>
              </div>
            </dl>

            <p
              v-if="SAMPLES[c.id] && SAMPLES[c.id]!.n > 0"
              class="ccard__meas"
            >
              {{ t('canalesYt.cardMeasure', { hits: SAMPLES[c.id]!.topicHits, n: SAMPLES[c.id]!.n }) }}
            </p>

            <div class="chip-row ccard__links">
              <span class="proof">
                <v-icon size="13">
                  mdi-shield-check-outline
                </v-icon>
                {{ proofLabel(c) }}
              </span>
              <NuxtLink
                v-if="c.buyerId"
                class="ccard__link"
                :to="localePath(`/buyers/${c.buyerId}`)"
              >
                {{ t('canalesYt.buyerLink') }}
              </NuxtLink>
              <NuxtLink
                v-if="c.related"
                class="ccard__link"
                :to="localePath(c.related.to)"
              >
                {{ bi(c.related.label) }}
              </NuxtLink>
              <a
                class="ccard__link"
                :href="channelUrl(c.id)"
                target="_blank"
                rel="noopener nofollow"
              >
                {{ t('canalesYt.openChannel') }}
              </a>
              <a
                v-if="c.site"
                class="ccard__link"
                :href="c.site"
                target="_blank"
                rel="noopener"
              >
                {{ t('canalesYt.siteLink') }}
              </a>
            </div>
          </article>
        </div>
      </section>

      <!-- Canales que existen y no publican -->
      <section
        v-if="inactiveChannels.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('canalesYt.inactiveTitle') }}
        </h2>
        <p class="block__help">
          {{ t('canalesYt.inactiveHelp') }}
        </p>
        <div class="tablewrap">
          <table class="itable">
            <thead>
              <tr>
                <th>{{ t('canalesYt.channel') }}</th>
                <th>{{ t('canalesYt.cat.header') }}</th>
                <th>{{ t('canalesYt.lastUpload') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in inactiveChannels"
                :key="c.id"
              >
                <td>
                  <NuxtLink :to="localePath(channelPath(c))">
                    {{ c.name }}
                  </NuxtLink>
                </td>
                <td>{{ t(`canalesYt.cat.${c.category}`) }}</td>
                <td class="mono">
                  {{ c.lastUpload ? formatDate(c.lastUpload) : t('canalesYt.noVideos') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Buscados, medidos y descartados -->
      <section class="block">
        <h2 class="block__h">
          {{ t('canalesYt.rejectedTitle') }}
        </h2>
        <p class="block__help">
          {{ t('canalesYt.rejectedHelp') }}
        </p>
        <ul class="rlist">
          <li
            v-for="r in REJECTED"
            :key="r.handle"
          >
            <p class="rlist__name">
              {{ r.name }} <span class="rlist__handle">{{ r.handle }}</span>
            </p>
            <p class="rlist__reason">
              {{ bi(r.reason) }}
            </p>
          </li>
        </ul>
      </section>

      <!-- Lo que no existe -->
      <section class="block">
        <h2 class="block__h">
          {{ t('canalesYt.gapsTitle') }}
        </h2>
        <ul class="plist">
          <li
            v-for="(g, i) in GAPS"
            :key="i"
          >
            {{ bi(g) }}
          </li>
        </ul>
      </section>

      <!-- Método -->
      <section class="block">
        <h2 class="block__h">
          {{ t('canalesYt.methodTitle') }}
        </h2>
        <ol class="plist plist--num">
          <li
            v-for="(m, i) in METODO"
            :key="i"
          >
            {{ bi(m) }}
          </li>
        </ol>
        <p class="block__help mt-4">
          {{ t('canalesYt.methodFoot') }}
          <NuxtLink :to="localePath('/comparativa-transparencia')">
            {{ t('canalesYt.methodLink') }}
          </NuxtLink>
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.yt { padding-bottom: var(--s-8); }

.yhero {
  background:
    radial-gradient(1100px 380px at 85% -20%, color-mix(in srgb, var(--celeste) 18%, transparent), transparent 70%),
    var(--ink);
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}

.yhero__in { padding-block: clamp(var(--s-7), 6vw, var(--s-9)); }
.yhero__eyebrow { color: var(--ink-fg-faint); }

.yhero__title {
  margin: var(--s-3) 0 0;
  max-width: 22ch;
  font-family: var(--font-display);
  font-size: clamp(28px, 5vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.04;
  letter-spacing: -0.02em;
  color: var(--ink-fg-strong);
  text-wrap: balance;
}

.yhero__lead {
  margin: var(--s-4) 0 0;
  max-width: 62ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: var(--ink-fg-dim);
}

.yhero__meta {
  margin: var(--s-4) 0 0;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-fg-faint);
}

.yt__body { padding-block: var(--s-6) 0; }

.block { margin-top: var(--s-7); }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  flex-wrap: wrap;
}

.block__h {
  margin: 0 0 var(--s-2);
  font-family: var(--font-display);
  font-size: var(--t-xl);
  font-stretch: 108%;
  letter-spacing: -0.01em;
}

.block__stamp {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.block__help {
  margin: 0 0 var(--s-4);
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
  color: var(--text-muted);
}

/* Aviso */
.disc { padding: var(--s-4) var(--s-5); background: var(--surface-sunken); }

.disc__badge {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin: 0 0 var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.disc__list {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-2);
  font-size: var(--t-sm);
  line-height: 1.6;
}

/* Filtros del feed */
.ftools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3) var(--s-5);
  margin-bottom: var(--s-3);
}

.ftools__switch { flex: 0 0 auto; }

.ftools__note {
  margin: 0 0 var(--s-3);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ftools__note--warn { color: var(--alerta); }

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  align-items: center;
}

/* Videos */
.vgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: var(--s-4);
}

.vcard {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--surface);
  color: inherit;
  text-decoration: none;
}

.vcard:hover { border-color: var(--rule-strong); }

.vcard__thumb {
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: var(--surface-sunken);
}

.vcard__body { padding: var(--s-3) var(--s-4) var(--s-4); }

.vcard__title {
  margin: 0 0 var(--s-2);
  font-size: var(--t-sm);
  line-height: 1.4;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.vcard__meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.vcard__chan { color: var(--celeste-deep); }
.vcard__sep { opacity: 0.6; }

.empty {
  padding: var(--s-5);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* Directorio */
.cgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: var(--s-4);
}

.ccard {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.ccard__head { margin-bottom: var(--s-1); }

.ccard__name {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 24px;
  font-family: var(--font-display);
  font-size: var(--t-base);
  font-weight: 700;
  color: var(--celeste-deep);
  text-decoration: none;
}

.ccard__name:hover { text-decoration: underline; }

.ccard__handle {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ccard__bloc { color: var(--celeste-deep); }

.ccard__what { margin: 0; font-size: var(--t-sm); line-height: 1.55; }

.ccard__why {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--text-muted);
}

.ccard__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-2);
  margin: var(--s-2) 0 0;
  padding-top: var(--s-3);
  border-top: 1px solid var(--rule);
}

.ccard__facts dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ccard__facts dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-variant-numeric: tabular-nums;
}

.ccard__meas {
  margin: var(--s-2) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.sortlabel {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.ccard__links { margin-top: var(--s-3); }

.proof {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: 2px var(--s-2);
  border-radius: var(--r-sm);
  background: var(--surface-sunken);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ccard__link {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  font-size: var(--t-xs);
  color: var(--celeste-deep);
}

/* Tabla de inactivos */
.tablewrap { overflow-x: auto; }

.itable {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--t-sm);
}

.itable th,
.itable td {
  padding: var(--s-2) var(--s-3);
  text-align: left;
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
}

.itable th {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.itable a { color: var(--celeste-deep); }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

/* Listas */
.rlist { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--s-4); }

.rlist__name {
  margin: 0 0 var(--s-1);
  font-weight: 700;
  font-size: var(--t-sm);
}

.rlist__handle {
  font-family: var(--font-mono);
  font-weight: 400;
  color: var(--text-muted);
}

.rlist__reason {
  margin: 0;
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
  color: var(--text-muted);
}

.plist {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
}

@media (max-width: 600px) {
  .ccard__facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
