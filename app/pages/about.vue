<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

const personLd = usePersonLd()
const orgLd = useOrgLd()

useSeo(() => ({
  title: t('about.title'),
  description: t('about.sourceBody').slice(0, 155),
  path: '/about',
  type: 'article',
  article: { section: 'About' },
  kicker: 'Quién está detrás',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      'name': t('about.title'),
      'description': t('about.sourceBody').slice(0, 155),
      'about': personLd,
      'mainEntity': personLd,
    },
    { '@context': 'https://schema.org', ...personLd },
    { '@context': 'https://schema.org', ...orgLd },
  ],
}))

// The scale is easier to trust once you've seen it work. These are the
// real orders of magnitude in the dataset, from a typical maintenance
// order to the largest awards on record.
const examples = [
  { label: 'Service de aire acondicionado', amount: 3940 },
  { label: 'Insumos de oficina', amount: 128_500 },
  { label: 'Obra vial menor', amount: 4_664_147 },
  { label: 'Equipamiento hospitalario', amount: 92_000_000 },
  { label: 'Infraestructura mayor', amount: 2_400_000_000 },
]

// The index and the sections below are driven by the same list: the `id`
// here is the id rendered on each <section>, so a renamed heading can
// never leave the index pointing at nothing.
const sections = [
  { id: 'fuente', key: 'about.sourceTitle' },
  { id: 'escala', key: 'about.scaleTitle' },
  { id: 'total', key: 'about.totalTitle' },
  { id: 'limites', key: 'about.limitsTitle' },
  { id: 'verificar', key: 'about.linkTitle' },
  { id: 'autor', key: 'about.authorTitle' },
] as const

// Which section the reader is in. Purely an affordance for the index —
// the page reads identically if the observer never runs (SSR, no IO).
const activeId = ref<string>(sections[0].id)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  // The band is the strip just under the sticky header: a heading becomes
  // "current" when it reaches it, and stays current until the next one does.
  observer = new IntersectionObserver(
    (entries) => {
      const hit = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (hit?.target.id) activeId.value = hit.target.id
    },
    { rootMargin: '-72px 0px -70% 0px', threshold: 0 },
  )
  for (const s of sections) {
    const el = document.getElementById(s.id)
    if (el) observer.observe(el)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div class="u-container page">
    <header class="head">
      <p class="u-eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('about.title') }}</h1>
      <p class="u-lead">
        {{ t('about.lead') }}
      </p>
    </header>

    <!-- The section index. On the wide grid it owns the right rail and
         sticks; below it, it collapses to a wrapping row of links under
         the lead. It is never hidden — a six-section document earns a map
         on every screen. -->
    <nav
      class="toc"
      :aria-label="t('about.toc')"
    >
      <p class="toc__h u-eyebrow">
        {{ t('about.toc') }}
      </p>
      <ul class="toc__list">
        <li
          v-for="s in sections"
          :key="s.id"
        >
          <a
            :href="`#${s.id}`"
            class="toc__link"
            :class="{ 'is-current': activeId === s.id }"
            :aria-current="activeId === s.id ? 'true' : undefined"
          >
            {{ t(s.key) }}
          </a>
        </li>
      </ul>
    </nav>

    <div class="prose">
      <section
        id="fuente"
        class="sec"
      >
        <h2>{{ t('about.sourceTitle') }}</h2>
        <p>{{ t('about.sourceBody') }}</p>
      </section>

      <!-- The signature, explained. Showing the scale beats describing it. -->
      <section
        id="escala"
        class="sec"
      >
        <h2>{{ t('about.scaleTitle') }}</h2>
        <p>{{ t('about.scaleBody') }}</p>
        <ul class="scale">
          <li
            v-for="e in examples"
            :key="e.amount"
            class="scale__row"
          >
            <span class="scale__label">{{ e.label }}</span>
            <MoneyAmount
              :amount="e.amount"
              compact
            />
          </li>
        </ul>
      </section>

      <!-- The site's most important admission about its own data. It
           belongs above the general caveats, not buried under them. -->
      <section
        id="total"
        class="sec"
      >
        <h2>{{ t('about.totalTitle') }}</h2>
        <p>{{ t('about.totalBody') }}</p>
        <p class="sec__p">
          {{ t('about.totalBody2') }}
        </p>
        <p class="sec__p">
          {{ t('about.totalBody3') }}
        </p>
        <NuxtLink
          :to="localePath('/contracts?amountFrom=100000000000&sort=amountDesc')"
          class="inline"
        >
          {{ t('about.totalCta') }}
          <v-icon size="15">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
      </section>

      <section
        id="limites"
        class="sec"
      >
        <h2>{{ t('about.limitsTitle') }}</h2>
        <p>{{ t('about.limitsBody') }}</p>
      </section>

      <section
        id="verificar"
        class="sec"
      >
        <h2>{{ t('about.linkTitle') }}</h2>
        <p>{{ t('about.linkBody') }}</p>
        <p class="links">
          <a
            href="https://www.comprasestatales.gub.uy"
            target="_blank"
            rel="noopener external"
          >
            comprasestatales.gub.uy
            <v-icon size="14">mdi-open-in-new</v-icon>
          </a>
          <a
            href="https://catalogodatos.gub.uy"
            target="_blank"
            rel="noopener external"
          >
            catalogodatos.gub.uy
            <v-icon size="14">mdi-open-in-new</v-icon>
          </a>
          <a href="/docs">{{ t('footer.api') }}</a>
        </p>
      </section>

      <!-- Who is behind this. An independent project earns more trust when it
           says who built it than when it hides — and it's an E-E-A-T signal. -->
      <section
        id="autor"
        class="sec"
      >
        <h2>{{ t('about.authorTitle') }}</h2>
        <p>{{ t('about.authorBody') }}</p>
        <p class="links">
          <a
            href="https://www.linkedin.com/in/eduardo-airaudo/"
            target="_blank"
            rel="noopener external"
          >
            <v-icon size="15">mdi-linkedin</v-icon>
            LinkedIn
          </a>
          <a
            href="https://github.com/eduair94/gastos-gub-uy"
            target="_blank"
            rel="noopener external"
          >
            <v-icon size="15">mdi-github</v-icon>
            GitHub
          </a>
          <a href="mailto:shellixs750@gmail.com">
            <v-icon size="15">mdi-email-outline</v-icon>
            {{ t('about.authorContact') }}
          </a>
        </p>
      </section>

      <NuxtLink
        :to="localePath('/contracts')"
        class="cta"
      >
        {{ t('home.exploreCta') }}
        <v-icon size="18">
          mdi-arrow-right
        </v-icon>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* Layout. The page is a two-track grid: a bounded article rail and, from
   the wide breakpoint up, a sticky index flush with the header's right
   edge. Only the TEXT LINES carry a `ch` cap (see `.sec p`, `.sec h2`);
   the rail itself is bounded in px. Capping the wrapping block in `ch` is what
   previously squeezed the table, the link rows and the CTA into a 550px
   column pinned to the left of a 1400px container. */
.page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    "head"
    "toc"
    "body";
  padding-block: var(--s-7) var(--s-8);
}

.head { grid-area: head; }
.toc { grid-area: toc; }
.prose { grid-area: body; }

/* 1280px is where 780 + s-8 gutter + 240 rail still clears the container
   padding. Below it the index rides above the article as a link row. */
@media (min-width: 1280px) {
  .page {
    grid-template-columns: minmax(0, 1fr) 240px;
    grid-template-areas:
      "head toc"
      "body toc";
    column-gap: var(--s-8);
    align-items: start;
  }

  .prose { max-width: 780px; }
}

/* This is a page to be read, not scanned: the article sets one step up
   from the site's control-sized body, so 68ch of measure is physically
   wide enough to sit comfortably inside the rail's rules. */
.prose {
  font-size: var(--t-md);
}

.head {
  max-width: 62ch;
  margin-bottom: var(--s-7);
}

.head h1 { margin: var(--s-2) 0 var(--s-3); }

/* Index ------------------------------------------------------------- */

/* Below the wide breakpoint the index is a band between the lead and the
   article, ruled top and bottom so a row of links cannot be mistaken for
   the first paragraph. */
.toc {
  margin-bottom: var(--s-6);
  padding-block: var(--s-4);
  border-block: 1px solid var(--rule);
}

.toc__h {
  margin: 0 0 var(--s-3);
}

.toc__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.toc__link {
  display: block;
  padding-block: var(--s-1);
  color: var(--text-muted);
  font-size: var(--t-sm);
  line-height: 1.4;
  text-decoration: none;
  transition: color var(--dur) var(--ease);
}

.toc__link:hover { color: var(--celeste-deep); }

/* In the band layout the links are the only touch targets on the page
   that sit next to each other, so they get a real target height. */
@media (pointer: coarse) and (max-width: 1279px) {
  .toc__link {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding-block: 0;
  }
}

.toc__link.is-current {
  color: var(--text);
  font-weight: 600;
}

@media (min-width: 1280px) {
  .toc {
    position: sticky;
    top: calc(var(--header-h) + var(--s-6));
    margin-bottom: 0;
    padding-block: 0;
    border-block: 0;
  }

  .toc__list {
    display: block;
    border-left: 1px solid var(--rule);
  }

  .toc__link {
    padding: var(--s-2) 0 var(--s-2) var(--s-4);
    margin-left: -1px;
    border-left: 1px solid transparent;
  }

  .toc__link.is-current { border-left-color: var(--celeste-deep); }
}

/* Article ----------------------------------------------------------- */

.sec + .sec {
  margin-top: var(--s-6);
  padding-top: var(--s-6);
  border-top: 1px solid var(--rule);
}

.sec {
  scroll-margin-top: calc(var(--header-h) + var(--s-5));
}

.sec h2 {
  max-width: 34ch;
  margin: 0 0 var(--s-3);
}

.sec p {
  max-width: 68ch;
  margin: 0;
  color: var(--text-muted);
  line-height: 1.65;
}

.sec__p { margin-top: var(--s-3) !important; }

.scale {
  margin: var(--s-5) 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.scale__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
}

.scale__row + .scale__row { border-top: 1px solid var(--rule); }

.scale__label {
  font-size: var(--t-sm);
  color: var(--text-muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-4);
  margin-top: var(--s-4) !important;
}

.links a {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.links a:hover { text-decoration: underline; }

.cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-7);
  padding: var(--s-3) var(--s-5);
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  font-weight: 600;
  font-size: var(--t-sm);
  text-decoration: none;
}

.cta:hover { background: var(--ink-3); }
</style>
