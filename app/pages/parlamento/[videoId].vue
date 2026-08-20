<script setup lang="ts">
/**
 * Una sesión del Parlamento, tema por tema, con el minuto de cada uno.
 *
 * El minuto es la pieza que hace publicable la página: cada tema abre el video
 * justo donde se habló de eso, así el lector verifica en diez segundos lo que
 * una máquina resumió de lo que otra máquina escuchó.
 *
 * Por eso el aviso va arriba y no al pie.
 *
 * LAS TRES CAPAS NO SE MEZCLAN, y cada una tiene su bloque:
 *
 *   1. La PROSA del tema no lleva cifras: el portón de `shared/parlamento/summary`
 *      las saca antes de guardar, porque el subtitulado las cambia.
 *   2. Las CIFRAS que sacó viven en su propio bloque, con su aviso. Un lector las
 *      pidió: un resumen sin ningún número obliga a mirar seis horas de video.
 *   3. Las VOTACIONES vienen del recuento cantado, no del resumen. Cada una abre
 *      el video en el segundo donde se cantó.
 */
import { formatTimestamp, youtubeAt } from '#shared/parlamento/summary'

interface Vote {
  t: number
  inFavor: number
  present: number
  result: 'afirmativa' | 'negativa'
  majority: 'unanimidad' | 'dos-tercios' | 'simple'
  subject: string
  scope: 'general' | 'parcial' | 'tramite'
}
interface Figure { value: string, sentence: string }
interface Topic {
  title: string
  explanation: string
  whyItMatters: string
  t: number
  votes?: Vote[]
  outcome?: 'aprobado' | 'rechazado' | 'mixto' | 'sin-votacion'
  figures?: Figure[]
}
interface Term { term: string, meaning: string }
interface Session {
  videoId: string
  chamber: string
  videoTitle: string
  sessionDate: string
  durationSeconds: number
  headline: string
  summary: string
  topics: Topic[]
  votes?: Vote[]
  glossary: Term[]
  transcriptWords: number
  summarizedAt: string
  model: string
}
interface Neighbour { videoId: string, headline: string, sessionDate: string }

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()

const videoId = computed(() => String(route.params.videoId ?? ''))

const { data: res, error } = await useFetch<{ success: boolean, data: { session: Session, prev: Neighbour | null, next: Neighbour | null } }>(
  () => `/api/parlamento/${videoId.value}`,
)

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Sesión no encontrada', fatal: true })
}

const session = computed(() => res.value?.data?.session)
const prev = computed(() => res.value?.data?.prev ?? null)
const next = computed(() => res.value?.data?.next ?? null)

/** Las votaciones que dicen qué se resolvió. La marcha de la sesión no cuenta. */
const substantiveVotes = computed(() =>
  (session.value?.votes ?? []).filter(v => v.scope !== 'tramite' && v.subject.trim()),
)
/** Las de trámite se cuentan y no se listan: son licencias y cuartos intermedios. */
const proceduralVotes = computed(() =>
  (session.value?.votes ?? []).length - substantiveVotes.value.length,
)

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.parlSession.title', { headline: session.value?.headline ?? '', date: session.value ? formatDate(session.value.sessionDate) : '' }),
  description: (session.value?.summary ?? '').slice(0, 300),
  path: `/parlamento/${videoId.value}`,
  kicker: session.value ? t(`parl.chamber.${session.value.chamber}`) : 'Parlamento',
  type: 'article',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': session.value?.headline ?? '',
    'datePublished': session.value?.sessionDate ?? undefined,
    'isPartOf': orgLd,
  },
}))
</script>

<template>
  <div
    v-if="session"
    class="sess"
  >
    <section class="shero">
      <div class="shero__in u-container">
        <NuxtLink
          class="shero__back"
          :to="localePath('/parlamento')"
        >
          <v-icon size="14">
            mdi-arrow-left
          </v-icon>
          {{ t('parl.backToIndex') }}
        </NuxtLink>
        <p class="u-eyebrow shero__eyebrow">
          {{ t(`parl.chamber.${session.chamber}`) }} · {{ formatDate(session.sessionDate) }}
        </p>
        <h1 class="shero__title">
          {{ session.headline }}
        </h1>
        <p class="shero__lead">
          {{ session.summary }}
        </p>
        <p class="shero__meta">
          {{ t('parl.sessionMeta', {
            h: Math.round(session.durationSeconds / 3600),
            words: new Intl.NumberFormat('es-UY').format(session.transcriptWords),
          }) }}
        </p>
      </div>
    </section>

    <div class="u-container sess__body">
      <!-- El aviso, antes del contenido -->
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
          {{ t('parl.votesCaveat') }}
        </p>
        <p class="disc__body">
          {{ t('parl.figuresCaveat') }}
        </p>
        <a
          class="disc__link"
          :href="`https://www.youtube.com/watch?v=${session.videoId}`"
          target="_blank"
          rel="noopener nofollow"
        >
          {{ t('parl.watchFull') }}
          <v-icon size="14">mdi-open-in-new</v-icon>
        </a>
      </v-card>

      <section class="block">
        <h2 class="block__h">
          {{ t('parl.topicsTitle') }}
        </h2>
        <p class="block__help">
          {{ t('parl.topicsHelp') }}
        </p>

        <ol class="topics">
          <li
            v-for="topic in session.topics"
            :key="topic.t + topic.title"
            class="topic"
          >
            <a
              class="topic__at"
              :href="youtubeAt(session.videoId, topic.t)"
              target="_blank"
              rel="noopener nofollow"
            >
              <v-icon size="13">mdi-play-circle-outline</v-icon>
              {{ formatTimestamp(topic.t) }}
            </a>
            <div class="topic__body">
              <div class="chip-row topic__head">
                <h3 class="topic__title">
                  {{ topic.title }}
                </h3>
                <span
                  v-if="topic.outcome && topic.outcome !== 'sin-votacion'"
                  class="vchip"
                  :class="`vchip--${topic.outcome}`"
                >
                  {{ t(`parl.outcome.${topic.outcome}`) }}
                </span>
              </div>
              <p class="topic__text">
                {{ topic.explanation }}
              </p>
              <p
                v-if="topic.whyItMatters"
                class="topic__why"
              >
                <span class="topic__whylabel">{{ t('parl.whyLabel') }}</span>
                {{ topic.whyItMatters }}
              </p>

              <!-- El recuento. Cada uno abre el video donde se cantó. -->
              <div
                v-if="topic.votes?.length"
                class="vbox"
              >
                <p class="vbox__head">
                  {{ t('parl.votesTitle') }}
                  <span class="vbox__tag">{{ t('parl.votesTag') }}</span>
                </p>
                <ul class="vlist">
                  <li
                    v-for="v in topic.votes"
                    :key="v.t"
                    class="vote"
                  >
                    <a
                      class="vote__at"
                      :href="youtubeAt(session.videoId, v.t)"
                      target="_blank"
                      rel="noopener nofollow"
                    >
                      <v-icon size="12">mdi-play-circle-outline</v-icon>
                      {{ formatTimestamp(v.t) }}
                    </a>
                    <span
                      class="vchip"
                      :class="v.result === 'afirmativa' ? 'vchip--aprobado' : 'vchip--rechazado'"
                    >
                      {{ t(`parl.result.${v.result}`) }}
                    </span>
                    <span class="vote__tally">{{ t('parl.voteTally', { inFavor: v.inFavor, present: v.present }) }}</span>
                    <span class="vote__maj">{{ t(`parl.majority.${v.majority}`) }}</span>
                    <span class="vote__subject">{{ v.subject }}</span>
                  </li>
                </ul>
              </div>

              <!-- Las cifras que el portón sacó de la prosa. -->
              <div
                v-if="topic.figures?.length"
                class="figs"
              >
                <p class="figs__head">
                  {{ t('parl.figuresTitle') }}
                  <span class="figs__tag">{{ t('parl.figuresTag') }}</span>
                </p>
                <ul class="figs__list">
                  <li
                    v-for="(f, i) in topic.figures"
                    :key="i"
                  >
                    {{ f.sentence }}
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <section
        v-if="session.votes?.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('parl.votesSessionTitle') }}
        </h2>
        <p class="block__help">
          {{ t('parl.votesHelp') }} {{ t('parl.majorityWarn') }}
        </p>
        <ul
          v-if="substantiveVotes.length"
          class="vlist vlist--session"
        >
          <li
            v-for="v in substantiveVotes"
            :key="v.t"
            class="vote"
          >
            <a
              class="vote__at"
              :href="youtubeAt(session.videoId, v.t)"
              target="_blank"
              rel="noopener nofollow"
            >
              <v-icon size="12">mdi-play-circle-outline</v-icon>
              {{ formatTimestamp(v.t) }}
            </a>
            <span
              class="vchip"
              :class="v.result === 'afirmativa' ? 'vchip--aprobado' : 'vchip--rechazado'"
            >
              {{ t(`parl.result.${v.result}`) }}
            </span>
            <span class="vote__tally">{{ t('parl.voteTally', { inFavor: v.inFavor, present: v.present }) }}</span>
            <span class="vote__maj">{{ t(`parl.majority.${v.majority}`) }}</span>
            <span class="vote__subject">{{ v.subject }}</span>
          </li>
        </ul>
        <p
          v-else
          class="block__help"
        >
          {{ t('parl.votesEmpty') }}
        </p>
        <p
          v-if="proceduralVotes > 0"
          class="vnote"
        >
          {{ t('parl.voteProcedural', { n: proceduralVotes }) }}
        </p>
      </section>

      <section
        v-if="session.glossary.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('parl.glossaryTitle') }}
        </h2>
        <p class="block__help">
          {{ t('parl.glossaryHelp') }}
        </p>
        <dl class="gloss">
          <div
            v-for="g in session.glossary"
            :key="g.term"
            class="gloss__row"
          >
            <dt>{{ g.term }}</dt>
            <dd>{{ g.meaning }}</dd>
          </div>
        </dl>
      </section>

      <section class="block">
        <div class="neigh">
          <NuxtLink
            v-if="prev"
            class="neigh__card"
            :to="localePath(`/parlamento/${prev.videoId}`)"
          >
            <span class="neigh__dir">{{ t('parl.prev') }}</span>
            <span class="neigh__title">{{ prev.headline }}</span>
          </NuxtLink>
          <NuxtLink
            v-if="next"
            class="neigh__card neigh__card--next"
            :to="localePath(`/parlamento/${next.videoId}`)"
          >
            <span class="neigh__dir">{{ t('parl.next') }}</span>
            <span class="neigh__title">{{ next.headline }}</span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sess { padding-bottom: var(--s-8); }

.shero {
  background:
    radial-gradient(900px 320px at 85% -20%, color-mix(in srgb, var(--celeste) 18%, transparent), transparent 70%),
    var(--ink);
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}

.shero__in { padding-block: clamp(var(--s-6), 5vw, var(--s-8)); }

.shero__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 24px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-link);
  text-decoration: none;
}

.shero__back:hover { text-decoration: underline; }
.shero__eyebrow { margin-top: var(--s-4); color: var(--ink-fg-faint); }

.shero__title {
  margin: var(--s-2) 0 0;
  max-width: 26ch;
  font-family: var(--font-display);
  font-size: clamp(26px, 4.4vw, var(--t-2xl));
  font-stretch: 112%;
  line-height: 1.08;
  letter-spacing: -0.02em;
  color: var(--ink-fg-strong);
  text-wrap: balance;
}

.shero__lead {
  margin: var(--s-4) 0 0;
  max-width: 62ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: var(--ink-fg-dim);
}

.shero__meta {
  margin: var(--s-4) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-fg-faint);
}

.sess__body { padding-block: var(--s-6) 0; }
.block { margin-top: var(--s-7); }

.block__h {
  margin: 0 0 var(--s-2);
  font-family: var(--font-display);
  font-size: var(--t-lg);
  font-stretch: 108%;
}

.block__help {
  margin: 0 0 var(--s-4);
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
  color: var(--text-muted);
}

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
  margin: 0 0 var(--s-3);
  max-width: 74ch;
  font-size: var(--t-sm);
  line-height: 1.6;
}

.disc__link {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 24px;
  font-size: var(--t-sm);
  color: var(--celeste-deep);
}

.topics { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--s-5); }

.topic {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  gap: var(--s-4);
  padding-bottom: var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.topic:last-child { border-bottom: 0; padding-bottom: 0; }

.topic__at {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  align-self: start;
  min-height: 24px;
  padding: 2px var(--s-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  text-decoration: none;
  font-variant-numeric: tabular-nums;
}

.topic__at:hover { border-color: var(--celeste); }

.topic__head {
  align-items: baseline;
  margin: 0 0 var(--s-2);
}

.topic__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-base);
  font-weight: 700;
}

/*
 * El resultado de la votación. El color va en el punto, nunca en el texto:
 * `--verde` y `--alerta` como letra chica quedan entre 2,6:1 y 4,2:1.
 */
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

.vbox, .figs {
  margin: var(--s-3) 0 0;
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
}

.vbox__head, .figs__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2);
  margin: 0 0 var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

/* El aviso viaja pegado al título del bloque, no al pie de la página. */
.vbox__tag, .figs__tag {
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-muted);
  font-style: italic;
}

.vlist { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--s-2); }
.vlist--session { margin-top: var(--s-4); gap: var(--s-3); }

.vote {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2) var(--s-3);
  font-size: var(--t-sm);
  line-height: 1.5;
}

.vote__at {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 24px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  text-decoration: none;
  font-variant-numeric: tabular-nums;
}

.vote__at:hover { text-decoration: underline; }

.vote__tally {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.vote__maj { font-size: var(--t-xs); color: var(--text-muted); }
.vote__subject { flex: 1 1 18ch; min-width: 0; }

.vnote {
  margin: var(--s-4) 0 0;
  max-width: 74ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.figs__list { margin: 0; padding-left: var(--s-4); display: grid; gap: var(--s-2); }

.figs__list li {
  max-width: 70ch;
  font-size: var(--t-sm);
  line-height: 1.55;
}

.topic__text {
  margin: 0;
  max-width: 70ch;
  font-size: var(--t-sm);
  line-height: 1.6;
}

.topic__why {
  margin: var(--s-2) 0 0;
  max-width: 70ch;
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--text-muted);
}

.topic__whylabel {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-right: var(--s-2);
}

.gloss { margin: 0; display: grid; gap: var(--s-3); max-width: 74ch; }

.gloss__row {
  display: grid;
  grid-template-columns: minmax(0, 13rem) minmax(0, 1fr);
  gap: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--rule);
}

.gloss__row dt { font-weight: 700; font-size: var(--t-sm); }
.gloss__row dd { margin: 0; font-size: var(--t-sm); line-height: 1.55; color: var(--text-muted); }

.neigh {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4);
}

.neigh__card {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
}

.neigh__card:hover { border-color: var(--rule-strong); }
.neigh__card--next { text-align: right; }

.neigh__dir {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.neigh__title { font-size: var(--t-sm); font-weight: 600; line-height: 1.35; }

@media (max-width: 700px) {
  .topic { grid-template-columns: minmax(0, 1fr); gap: var(--s-2); }
  .vbox, .figs { padding: var(--s-3); }
  .vote { gap: var(--s-1) var(--s-2); }
  .gloss__row { grid-template-columns: minmax(0, 1fr); gap: var(--s-1); }
  .neigh { grid-template-columns: minmax(0, 1fr); }
  .neigh__card--next { text-align: left; }
}
</style>
