<script setup lang="ts">
/**
 * Ficha de un canal del directorio.
 *
 * Tres capas, y ninguna se disfraza de otra:
 *
 *   1. Lo VERIFICADO — las pruebas de identidad y las cifras del canal, medidas el día
 *      que se armó la tabla.
 *   2. Lo que el canal DICE DE SÍ MISMO — su descripción en YouTube, textual y entre
 *      comillas.
 *   3. Lo MEDIDO sobre lo que publica — cuántos de sus últimos títulos tocan gasto o
 *      política, y a qué partidos nombra. No es una etiqueta de sesgo, y la ficha lo
 *      dice con esas palabras.
 *
 * A los medios no se les pone orientación política. A los partidos sí se les pone si
 * están en el gobierno o en la oposición, que es un hecho institucional.
 */
import {
  CHANNELS, channelPath, channelUrl, getChannelBySlug, isActive, matchesTopic,
  type Channel,
} from '~/data/canales-youtube'

interface FeedVideo {
  videoId: string
  title: string
  published: string
  channelId: string
  channelName: string
  url: string
  thumbnail: string
}

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()

const slug = computed(() => String(route.params.slug ?? ''))
const channel = computed<Channel | undefined>(() => getChannelBySlug(slug.value))

// Un slug inexistente es un 404 de verdad, no una ficha vacía.
if (!channel.value) {
  throw createError({ statusCode: 404, statusMessage: 'Canal no encontrado', fatal: true })
}

const ch = computed(() => channel.value as Channel)

type L = 'es' | 'en'
function bi(x: { es: string, en: string }): string {
  return x[locale.value as L] ?? x.es
}

const { data: feedRes } = await useFetch<{ success: boolean, data: { videos: FeedVideo[], fetchedAt: string }, stale: boolean }>(
  '/api/canales-youtube',
  { query: { channel: ch.value.id }, key: `yt-${ch.value.id}` },
)

const videos = computed<FeedVideo[]>(() => feedRes.value?.data?.videos ?? [])
const topicVideos = computed(() => videos.value.filter(v => matchesTopic(v.title)))
const otherVideos = computed(() => videos.value.filter(v => !matchesTopic(v.title)))
const fetchedAt = computed(() => feedRes.value?.data?.fetchedAt ?? null)

// Cifras vivas del job nocturno; si todavía no pasó por este canal, las curadas.
const { resolve, bySize } = useChannelStats()
const stat = computed(() => resolve(ch.value))
const sample = computed(() => stat.value.sample)
const mentions = computed(() => {
  const m = sample.value?.mentions ?? {}
  return (Object.entries(m) as [string, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
})
const topicShare = computed(() => {
  const s = sample.value
  if (!s || s.n === 0) return null
  return Math.round((s.topicHits / s.n) * 100)
})

const active = computed(() => isActive({ ...ch.value, lastUpload: stat.value.lastUpload }, new Date()))

// Vecinos de la misma categoría, para seguir mirando sin volver al índice.
const siblings = computed(() =>
  CHANNELS
    .filter(c => c.category === ch.value.category && c.id !== ch.value.id)
    .sort(bySize)
    .slice(0, 6),
)

function proofLabel(c: Channel): string {
  if (c.proofs.length === 2) return t('canalesYt.proof.both')
  return c.proofs[0] === 'sitio' ? t('canalesYt.proof.site') : t('canalesYt.proof.country')
}

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.canalYt.title', { name: ch.value.name }),
  description: t('seo.canalYt.description', { name: ch.value.name, what: bi(ch.value.what) }),
  path: channelPath(ch.value),
  kicker: t(`canalesYt.cat.${ch.value.category}`),
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    'name': ch.value.name,
    'description': bi(ch.value.what),
    'mainEntity': {
      '@type': 'Organization',
      'name': ch.value.name,
      'url': channelUrl(ch.value.id),
      ...(ch.value.site ? { sameAs: [ch.value.site] } : {}),
    },
    'isPartOf': orgLd,
  },
}))
</script>

<template>
  <div class="ch">
    <section class="chero">
      <div class="chero__in u-container">
        <NuxtLink
          class="chero__back"
          :to="localePath('/canales-youtube')"
        >
          <v-icon size="14">
            mdi-arrow-left
          </v-icon>
          {{ t('canalesYt.backToIndex') }}
        </NuxtLink>
        <p class="u-eyebrow chero__eyebrow">
          {{ t(`canalesYt.cat.${ch.category}`) }}
        </p>
        <h1 class="chero__title">
          {{ ch.name }}
        </h1>
        <p class="chero__handle">
          {{ ch.handle }}
        </p>
        <p class="chero__lead">
          {{ bi(ch.what) }}
        </p>
        <div class="chip-row chero__chips">
          <span class="tag tag--proof">
            <v-icon size="13">
              mdi-shield-check-outline
            </v-icon>
            {{ proofLabel(ch) }}
          </span>
          <span
            v-if="ch.bloc"
            class="tag"
          >{{ t(`canalesYt.bloc.${ch.bloc}`) }}</span>
          <span
            class="tag"
            :class="active ? 'tag--on' : 'tag--off'"
          >{{ active ? t('canalesYt.activeTag') : t('canalesYt.inactiveTag') }}</span>
        </div>
      </div>
    </section>

    <div class="u-container ch__body">
      <!-- Cifras del canal -->
      <StatBand
        :columns="4"
        :items="[
          { value: stat.subscribers ?? '—', label: t('canalesYt.subs') },
          { value: stat.videos ?? '—', label: t('canalesYt.videos') },
          { value: stat.views ?? '—', label: t('canalesYt.views') },
          { value: stat.lastUpload ? formatDate(stat.lastUpload) : '—', label: t('canalesYt.lastUpload') },
        ]"
      />
      <p class="stamp">
        {{ t('canalesYt.factsStamp', { date: stat.measuredOn, joined: stat.joined ?? '—' }) }}
      </p>

      <!-- Por qué está en el directorio -->
      <section class="block">
        <h2 class="block__h">
          {{ t('canalesYt.whyTitle') }}
        </h2>
        <p class="prose">
          {{ bi(ch.why) }}
        </p>
        <ul class="proofs">
          <li v-if="ch.proofs.includes('pais')">
            {{ t('canalesYt.proofCountryLong') }}
          </li>
          <li v-if="ch.proofs.includes('sitio')">
            {{ t('canalesYt.proofSiteLong') }}
            <a
              v-if="ch.proofUrl"
              :href="ch.proofUrl"
              target="_blank"
              rel="noopener"
            >{{ ch.proofUrl }}</a>
          </li>
        </ul>
        <div class="chip-row">
          <a
            class="link"
            :href="channelUrl(ch.id)"
            target="_blank"
            rel="noopener nofollow"
          >
            {{ t('canalesYt.openChannel') }}
            <v-icon size="14">mdi-open-in-new</v-icon>
          </a>
          <a
            v-if="ch.site"
            class="link"
            :href="ch.site"
            target="_blank"
            rel="noopener"
          >{{ t('canalesYt.siteLink') }}</a>
          <NuxtLink
            v-if="ch.buyerId"
            class="link"
            :to="localePath(`/buyers/${ch.buyerId}`)"
          >
            {{ t('canalesYt.buyerLink') }}
          </NuxtLink>
          <NuxtLink
            v-if="ch.related"
            class="link"
            :to="localePath(ch.related.to)"
          >
            {{ bi(ch.related.label) }}
          </NuxtLink>
        </div>
      </section>

      <!-- Lo que el canal dice de sí mismo -->
      <section
        v-if="sample?.selfDescription"
        class="block"
      >
        <h2 class="block__h">
          {{ t('canalesYt.selfTitle') }}
        </h2>
        <blockquote class="quote">
          {{ sample.selfDescription }}
        </blockquote>
        <p class="note">
          {{ t('canalesYt.selfNote') }}
        </p>
      </section>

      <!-- La medición -->
      <section
        v-if="sample && sample.n > 0"
        class="block"
      >
        <h2 class="block__h">
          {{ t('canalesYt.measureTitle') }}
        </h2>
        <p class="block__help">
          {{ t('canalesYt.measureHelp', { n: sample.n, date: stat.measuredOn }) }}
        </p>
        <div class="meas">
          <div class="meas__card">
            <p class="meas__n">
              {{ sample.topicHits }}<span class="meas__of">/{{ sample.n }}</span>
            </p>
            <p class="meas__l">
              {{ t('canalesYt.measureTopic', { pct: topicShare }) }}
            </p>
          </div>
          <div class="meas__card">
            <p
              v-if="mentions.length"
              class="meas__parties"
            >
              <span
                v-for="[key, n] in mentions"
                :key="key"
                class="party"
              >
                {{ t(`canalesYt.party.${key}`) }} <b>{{ n }}</b>
              </span>
            </p>
            <p
              v-else
              class="meas__n meas__n--none"
            >
              0
            </p>
            <p class="meas__l">
              {{ mentions.length ? t('canalesYt.measureMentions') : t('canalesYt.measureNoMentions') }}
            </p>
          </div>
        </div>
        <p class="note note--warn">
          {{ t('canalesYt.measureCaveat') }}
        </p>
      </section>

      <!-- Videos que tocan gasto y política -->
      <section class="block">
        <div class="block__head">
          <h2 class="block__h">
            {{ t('canalesYt.topicVideosTitle') }}
          </h2>
          <p
            v-if="fetchedAt"
            class="stamp stamp--inline"
          >
            {{ t('canalesYt.feedStamp', { date: formatDateTime(fetchedAt) }) }}
          </p>
        </div>
        <p class="block__help">
          {{ t('canalesYt.topicVideosHelp') }}
        </p>
        <div
          v-if="topicVideos.length"
          class="vgrid"
        >
          <a
            v-for="v in topicVideos"
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
              <p class="vcard__meta">{{ formatDate(v.published) }}</p>
            </div>
          </a>
        </div>
        <v-card
          v-else
          class="empty"
          border
          rounded="lg"
        >
          {{ t('canalesYt.topicVideosEmpty') }}
        </v-card>
      </section>

      <!-- El resto de lo último -->
      <section
        v-if="otherVideos.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('canalesYt.otherVideosTitle') }}
        </h2>
        <ul class="vlist">
          <li
            v-for="v in otherVideos"
            :key="v.videoId"
          >
            <a
              :href="v.url"
              target="_blank"
              rel="noopener nofollow"
            >{{ v.title }}</a>
            <span class="vlist__date">{{ formatDate(v.published) }}</span>
          </li>
        </ul>
      </section>

      <!-- Vecinos -->
      <section
        v-if="siblings.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('canalesYt.siblingsTitle') }}
        </h2>
        <div class="chip-row">
          <NuxtLink
            v-for="s in siblings"
            :key="s.id"
            class="sib"
            :to="localePath(channelPath(s))"
          >
            {{ s.name }}
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ch { padding-bottom: var(--s-8); }

.chero {
  background:
    radial-gradient(900px 320px at 85% -20%, color-mix(in srgb, var(--celeste) 18%, transparent), transparent 70%),
    var(--ink);
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}

.chero__in { padding-block: clamp(var(--s-6), 5vw, var(--s-8)); }

.chero__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 24px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-link);
  text-decoration: none;
}

.chero__back:hover { text-decoration: underline; }
.chero__eyebrow { margin-top: var(--s-4); color: var(--ink-fg-faint); }

.chero__title {
  margin: var(--s-2) 0 0;
  max-width: 24ch;
  font-family: var(--font-display);
  font-size: clamp(26px, 4.4vw, var(--t-2xl));
  font-stretch: 112%;
  line-height: 1.06;
  letter-spacing: -0.02em;
  color: var(--ink-fg-strong);
  text-wrap: balance;
}

.chero__handle {
  margin: var(--s-2) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-fg-faint);
}

.chero__lead {
  margin: var(--s-3) 0 0;
  max-width: 62ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: var(--ink-fg-dim);
}

.chero__chips { margin-top: var(--s-4); }

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: 3px var(--s-3);
  border: 1px solid var(--ink-rule);
  border-radius: var(--r-full);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-fg);
}

.tag--proof { background: var(--ink-fill); }
.tag--on { color: var(--ink-fg); border-color: var(--ink-rule); }
.tag--off { color: var(--ink-flag); border-color: var(--ink-flag); }

.ch__body { padding-block: var(--s-6) 0; }

.stamp {
  margin: var(--s-3) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.stamp--inline { margin: 0; }

.block { margin-top: var(--s-7); }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  flex-wrap: wrap;
}

.block__h {
  margin: 0 0 var(--s-3);
  font-family: var(--font-display);
  font-size: var(--t-lg);
  font-stretch: 108%;
}

.block__help,
.prose {
  margin: 0 0 var(--s-4);
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
}

.block__help { color: var(--text-muted); }

.proofs {
  margin: 0 0 var(--s-4);
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-2);
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--text-muted);
}

.proofs a { word-break: break-all; }

.link {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 24px;
  font-size: var(--t-sm);
  color: var(--celeste-deep);
}

.quote {
  margin: 0;
  padding: var(--s-4) var(--s-5);
  border-left: 3px solid var(--rule-strong);
  background: var(--surface-sunken);
  border-radius: 0 var(--r-md) var(--r-md) 0;
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
}

.note {
  margin: var(--s-2) 0 0;
  max-width: 74ch;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.note--warn { margin-top: var(--s-3); }

.meas {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4);
}

.meas__card {
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.meas__n {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.meas__n--none { color: var(--text-muted); }
.meas__of { font-size: var(--t-md); color: var(--text-muted); }

.meas__l {
  margin: var(--s-2) 0 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.meas__parties {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.party {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: 2px var(--s-2);
  border-radius: var(--r-sm);
  background: var(--surface-sunken);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.vgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
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
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.vlist {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--s-2);
  max-width: 80ch;
}

.vlist li {
  display: flex;
  justify-content: space-between;
  gap: var(--s-4);
  padding-bottom: var(--s-2);
  border-bottom: 1px solid var(--rule);
  font-size: var(--t-sm);
}

.vlist a { color: var(--celeste-deep); }

.vlist__date {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-4);
  align-items: center;
}

.sib {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  text-decoration: none;
}

.sib:hover { border-color: var(--rule-strong); }

.empty {
  padding: var(--s-5);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .meas { grid-template-columns: minmax(0, 1fr); }
  .vlist li { flex-direction: column; gap: var(--s-1); }
}
</style>
