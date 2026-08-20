<script setup lang="ts">
/**
 * Qué se dijo en el Parlamento, sesión por sesión.
 *
 * La página existe porque el Parlamento publica el insumo y no el resumen: la
 * versión taquigráfica es un PDF que llega semanas después, y el video de la
 * sesión dura seis horas. Nadie que trabaje mira seis horas de Senado.
 *
 * QUÉ SE PUBLICA Y QUÉ NO. El resumen sale de los subtítulos AUTOMÁTICOS del
 * video: una máquina escucha y otra resume. Por eso la prosa de un tema no trae
 * cifras exactas ni citas textuales, y por eso cada uno lleva el minuto del
 * video. La prueba es el video, no nuestro texto — el aviso va arriba, no al pie.
 *
 * El RESULTADO de cada tema es otra cosa y por eso se muestra acá: sale del
 * recuento que canta la presidencia, no del resumen. Las cifras y el detalle de
 * cada votación viven en la ficha de la sesión.
 */
import { formatTimestamp } from '#shared/parlamento/summary'

/** La lista sólo trae el título, el minuto y el resultado de cada tema. */
interface Topic { title: string, t: number, outcome: 'aprobado' | 'rechazado' | 'mixto' | 'sin-votacion' }
interface SessionRow {
  videoId: string
  chamber: string
  videoTitle: string
  sessionDate: string
  durationSeconds: number
  headline: string
  summary: string
  topics: Topic[]
  topicCount: number
  /** Votaciones de la sesión, sin contar la marcha de la sesión. */
  voteCount: number
  transcriptWords: number
}

const { t } = useI18n()
const localePath = useLocalePath()

const chamber = ref<'todas' | 'senadores' | 'representantes'>('todas')

const { data: res } = await useFetch<{ success: boolean, data: { sessions: SessionRow[], byChamber: Record<string, number>, total: number } }>(
  '/api/parlamento',
  { query: { limit: 30 } },
)

const sessions = computed(() => res.value?.data?.sessions ?? [])
const byChamber = computed(() => res.value?.data?.byChamber ?? {})
const visible = computed(() =>
  chamber.value === 'todas' ? sessions.value : sessions.value.filter(s => s.chamber === chamber.value),
)

const hours = computed(() =>
  Math.round(sessions.value.reduce((a, s) => a + (s.durationSeconds || 0), 0) / 3600),
)

const chips = computed(() => [
  { key: 'todas' as const, label: t('parl.filterAll') },
  { key: 'senadores' as const, label: t('parl.chamber.senadores') },
  { key: 'representantes' as const, label: t('parl.chamber.representantes') },
])

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.parl.title'),
  description: t('seo.parl.description'),
  path: '/parlamento',
  kicker: 'Parlamento',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': t('seo.parl.title'),
    'description': t('seo.parl.description'),
    'isPartOf': orgLd,
  },
}))
</script>

<template>
  <div class="parl">
    <section class="phero">
      <div class="phero__in u-container">
        <p class="u-eyebrow phero__eyebrow">
          {{ t('parl.eyebrow') }}
        </p>
        <h1 class="phero__title">
          {{ t('parl.title') }}
        </h1>
        <p class="phero__lead">
          {{ t('parl.lead') }}
        </p>
      </div>
    </section>

    <div class="u-container parl__body">
      <StatBand
        :columns="3"
        :items="[
          { value: res?.data?.total ?? 0, label: t('parl.statSessions') },
          { value: hours, label: t('parl.statHours') },
          { value: (byChamber.senadores ?? 0) + '/' + (byChamber.representantes ?? 0), label: t('parl.statSplit') },
        ]"
      />

      <!-- Cómo se hace esto. Arriba, no al pie. -->
      <section class="block">
        <v-card
          class="disc"
          border
          rounded="lg"
        >
          <p class="disc__badge">
            <v-icon size="15">
              mdi-robot-outline
            </v-icon>
            {{ t('parl.howTitle') }}
          </p>
          <p class="disc__body">
            {{ t('parl.howBody') }}
          </p>
          <p class="disc__body">
            {{ t('parl.howProof') }}
          </p>
          <NuxtLink
            class="disc__link"
            :to="localePath('/canales-youtube')"
          >
            {{ t('parl.sourceChannels') }}
          </NuxtLink>
        </v-card>
      </section>

      <section class="block">
        <div class="chip-row">
          <v-chip
            v-for="c in chips"
            :key="c.key"
            :variant="chamber === c.key ? 'flat' : 'outlined'"
            :color="chamber === c.key ? 'primary' : undefined"
            size="small"
            @click="chamber = c.key"
          >
            {{ c.label }}
          </v-chip>
        </div>
      </section>

      <section
        v-if="visible.length"
        class="block"
      >
        <article
          v-for="s in visible"
          :key="s.videoId"
          class="scard"
        >
          <header class="scard__head">
            <p class="scard__meta">
              <span class="scard__chamber">{{ t(`parl.chamber.${s.chamber}`) }}</span>
              <span class="scard__sep">·</span>
              <span>{{ formatDate(s.sessionDate) }}</span>
              <span class="scard__sep">·</span>
              <span>{{ t('parl.duration', { h: Math.round(s.durationSeconds / 3600) }) }}</span>
              <template v-if="s.voteCount">
                <span class="scard__sep">·</span>
                <span>{{ s.voteCount === 1 ? t('parl.voteOne') : t('parl.voteCount', { n: s.voteCount }) }}</span>
              </template>
            </p>
            <h2 class="scard__title">
              <NuxtLink :to="localePath(`/parlamento/${s.videoId}`)">
                {{ s.headline }}
              </NuxtLink>
            </h2>
          </header>

          <p class="scard__summary">
            {{ s.summary }}
          </p>

          <ul
            v-if="s.topics.length"
            class="scard__topics"
          >
            <li
              v-for="topic in s.topics"
              :key="topic.t + topic.title"
              class="chip-row"
            >
              <span class="scard__at">{{ formatTimestamp(topic.t) }}</span>
              <span>{{ topic.title }}</span>
              <span
                v-if="topic.outcome && topic.outcome !== 'sin-votacion'"
                class="vchip"
                :class="`vchip--${topic.outcome}`"
              >
                {{ t(`parl.outcome.${topic.outcome}`) }}
              </span>
            </li>
          </ul>

          <NuxtLink
            class="scard__more"
            :to="localePath(`/parlamento/${s.videoId}`)"
          >
            {{ t('parl.seeAll', { n: s.topicCount }) }}
          </NuxtLink>
        </article>
      </section>

      <v-card
        v-else
        class="empty"
        border
        rounded="lg"
      >
        {{ t('parl.empty') }}
      </v-card>
    </div>
  </div>
</template>

<style scoped>
.parl { padding-bottom: var(--s-8); }

.phero {
  background:
    radial-gradient(1100px 380px at 85% -20%, color-mix(in srgb, var(--celeste) 18%, transparent), transparent 70%),
    var(--ink);
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}

.phero__in { padding-block: clamp(var(--s-7), 6vw, var(--s-9)); }
.phero__eyebrow { color: var(--ink-fg-faint); }

.phero__title {
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

.phero__lead {
  margin: var(--s-4) 0 0;
  max-width: 62ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: var(--ink-fg-dim);
}

.parl__body { padding-block: var(--s-6) 0; }
.block { margin-top: var(--s-7); }

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

.disc__body {
  margin: 0 0 var(--s-2);
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
}

.disc__body:last-child { margin-bottom: 0; }

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  align-items: center;
}

.disc__link {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  font-size: var(--t-sm);
  color: var(--celeste-deep);
}

.scard {
  padding: var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.scard + .scard { margin-top: var(--s-4); }

.scard__meta {
  margin: 0 0 var(--s-2);
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.scard__chamber { color: var(--celeste-deep); }
.scard__sep { opacity: 0.6; }

.scard__title {
  margin: 0 0 var(--s-3);
  font-family: var(--font-display);
  font-size: var(--t-lg);
  font-stretch: 108%;
  line-height: 1.2;
}

.scard__title a { color: inherit; text-decoration: none; }
.scard__title a:hover { text-decoration: underline; }

.scard__summary {
  margin: 0 0 var(--s-3);
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
}

.scard__topics {
  margin: 0 0 var(--s-3);
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--s-2);
  font-size: var(--t-sm);
}

.scard__at {
  display: inline-block;
  min-width: 4.5em;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.scard__topics .chip-row { align-items: baseline; }

/* El color va en el punto: `--verde` y `--alerta` como letra chica no llegan al piso. */
.vchip {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: 1px var(--s-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  white-space: nowrap;
  color: var(--text);
}

.vchip::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: var(--r-full);
  background: var(--text-muted);
}

.vchip--aprobado::before { background: var(--verde); }
.vchip--rechazado::before { background: var(--alerta); }
.vchip--mixto::before { background: var(--celeste); }

.scard__more {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  font-size: var(--t-sm);
  color: var(--celeste-deep);
}

.empty {
  margin-top: var(--s-6);
  padding: var(--s-5);
  font-size: var(--t-sm);
  color: var(--text-muted);
}
</style>
