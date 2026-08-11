<script setup lang="ts">
/**
 * Credits — the people who built the site, the registries it lives on, and the
 * software it runs on.
 *
 * Everything on this page comes from `app/data/contributors.json`; adding a
 * contributor is an edit to that one file, in both languages, and a push. The
 * page itself holds no names. See
 * docs/superpowers/specs/2026-08-10-colaboradores-design.md.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()

const orgLd = useOrgLd()

const REPO = 'https://github.com/eduair94/gastos-gub-uy'

useSeo(() => ({
  title: t('colaboradores.title'),
  description: t('colaboradores.lead'),
  path: '/colaboradores',
  type: 'article',
  article: { section: 'About' },
  kicker: t('colaboradores.eyebrow'),
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      'name': t('colaboradores.title'),
      'description': t('colaboradores.lead'),
      // Each contributor as a Person, so the credit is machine-readable and not
      // only a rendered card.
      'contributor': people.map(p => ({
        '@type': 'Person',
        'name': p.name,
        'url': `https://github.com/${p.github}`,
      })),
    },
    { '@context': 'https://schema.org', ...orgLd },
  ],
}))
</script>

<template>
  <div class="u-container page">
    <header class="head">
      <p class="u-eyebrow">
        {{ t('colaboradores.eyebrow') }}
      </p>
      <h1>{{ t('colaboradores.title') }}</h1>
      <p class="u-lead">
        {{ t('colaboradores.lead') }}
      </p>
    </header>

    <!-- People. The reason the page exists, so it gets the cards; the two
         reference lists below deliberately stay plain. -->
    <section
      class="sec"
      aria-labelledby="personas"
    >
      <h2
        id="personas"
        class="sec__h"
      >
        {{ t('colaboradores.peopleTitle') }}
      </h2>

      <ul class="people">
        <li
          v-for="p in people"
          :key="p.github"
          class="card"
        >
          <ContributorMonogram
            :name="p.name"
            :handle="p.github"
          />
          <div class="card__body">
            <p class="card__name">
              {{ p.name }}
            </p>
            <p class="card__meta u-mono">
              <span class="card__role">{{ t(`colaboradores.role.${p.role}`) }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ t('colaboradores.since', { date: p.since }) }}</span>
            </p>
            <p class="card__blurb">
              {{ bi(p.blurb, locale) }}
            </p>
            <a
              class="card__gh"
              :href="`https://github.com/${p.github}`"
              rel="noopener external"
              target="_blank"
            >
              <v-icon size="16">mdi-github</v-icon>
              <span>{{ p.github }}</span>
            </a>
          </div>
        </li>
      </ul>

      <!-- Stated here rather than left to the git history: most commits in this
           repo carry a Co-Authored-By trailer, and a credits page that omitted
           it would be the one page on the site contradicting its own subject. -->
      <p class="note">
        {{ t('colaboradores.aiNote') }}
      </p>
    </section>

    <!-- Data sources. A definition list, not cards: reference material that
         should not compete with the people above. -->
    <section
      class="sec"
      aria-labelledby="datos"
    >
      <h2
        id="datos"
        class="sec__h"
      >
        {{ t('colaboradores.dataTitle') }}
      </h2>
      <p class="sec__dek">
        {{ t('colaboradores.dataDek') }}
      </p>
      <dl class="defs">
        <div
          v-for="s in credits.dataSources"
          :key="s.name"
          class="defs__row"
        >
          <dt>
            <a
              :href="s.url"
              rel="noopener external"
              target="_blank"
            >{{ s.name }}</a>
            <span
              v-if="s.license"
              class="defs__lic u-mono"
            >{{ s.license }}</span>
          </dt>
          <dd>{{ bi(s.note, locale) }}</dd>
        </div>
      </dl>
    </section>

    <section
      class="sec"
      aria-labelledby="software"
    >
      <h2
        id="software"
        class="sec__h"
      >
        {{ t('colaboradores.softwareTitle') }}
      </h2>
      <p class="sec__dek">
        {{ t('colaboradores.softwareDek') }}
      </p>
      <ul class="libs">
        <li
          v-for="s in credits.software"
          :key="s.name"
          class="libs__item"
        >
          <a
            :href="s.url"
            rel="noopener external"
            target="_blank"
          >{{ s.name }}</a>
          <span class="libs__lic u-mono">{{ s.license }}</span>
        </li>
      </ul>
    </section>

    <section
      class="sec join"
      aria-labelledby="colaborar"
    >
      <h2
        id="colaborar"
        class="sec__h"
      >
        {{ t('colaboradores.joinTitle') }}
      </h2>
      <p class="join__body">
        {{ t('colaboradores.joinBody') }}
      </p>
      <div class="join__links">
        <a
          class="join__cta"
          :href="REPO"
          rel="noopener external"
          target="_blank"
        >
          <v-icon size="18">mdi-github</v-icon>
          {{ t('colaboradores.joinRepo') }}
        </a>
        <a
          :href="`${REPO}/issues`"
          rel="noopener external"
          target="_blank"
        >{{ t('colaboradores.joinIssues') }}</a>
        <NuxtLink :to="localePath('/about')">
          {{ t('nav.about') }}
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  padding-block: var(--s-7) var(--s-8);
  /* One reading column. The lists are short rows, not tables, so the page never
     needs the full 1400px container the data surfaces use. */
  max-width: 860px;
}

.head h1 { margin-top: var(--s-2); }
.head .u-lead { margin-top: var(--s-3); }

.sec { margin-top: var(--s-8); }

.sec__h {
  padding-bottom: var(--s-2);
  border-bottom: 1px solid var(--rule);
  font-family: var(--font-display);
  font-size: var(--t-lg);
}

.sec__dek {
  margin-top: var(--s-3);
  color: var(--text-muted);
}

/* ---- People ---- */
.people {
  display: grid;
  gap: var(--s-4);
  margin-top: var(--s-5);
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  gap: var(--s-4);
  padding: var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
}

.card__body { min-width: 0; }

.card__name {
  font-family: var(--font-display);
  font-size: var(--t-base);
  font-weight: 600;
}

.card__meta {
  margin-top: var(--s-1);
  color: var(--text-muted);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card__role { color: var(--celeste-deep); }

.card__blurb {
  margin-top: var(--s-3);
  font-size: var(--t-sm);
}

.card__gh {
  display: inline-flex;
  gap: var(--s-2);
  align-items: center;
  margin-top: var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.note {
  margin-top: var(--s-5);
  padding-top: var(--s-3);
  border-top: 1px dashed var(--rule);
  color: var(--text-muted);
  font-size: var(--t-xs);
}

/* ---- Data sources ---- */
.defs {
  margin-top: var(--s-4);
  display: grid;
  gap: var(--s-4);
}

.defs__row {
  display: grid;
  gap: var(--s-1);
}

.defs__row dt {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  align-items: baseline;
  font-weight: 600;
}

.defs__lic,
.libs__lic {
  color: var(--text-muted);
  font-size: var(--t-xs);
  /* The licence is a tag, not prose: let the NAME wrap and keep the licence on
     one line, or "OFL 1.1" breaks across two beside a wrapped font list. */
  white-space: nowrap;
}

.defs__row dd {
  color: var(--text-muted);
  font-size: var(--t-sm);
}

/* ---- Software ---- */
.libs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--s-2) var(--s-5);
  margin-top: var(--s-4);
  padding: 0;
  list-style: none;
}

.libs__item {
  display: flex;
  gap: var(--s-2);
  align-items: baseline;
  justify-content: space-between;
  padding-block: var(--s-1);
  border-bottom: 1px solid var(--rule);
  font-size: var(--t-sm);
}

/* ---- Join ---- */
.join__body {
  margin-top: var(--s-4);
  max-width: 62ch;
}

.join__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-4);
  align-items: center;
  margin-top: var(--s-4);
  font-size: var(--t-sm);
}

.join__cta {
  display: inline-flex;
  gap: var(--s-2);
  align-items: center;
  padding: var(--s-2) var(--s-4);
  border-radius: var(--r-sm);
  background: var(--cta-fill);
  color: var(--cta-fg);
  font-weight: 600;
}

.join__cta:hover { text-decoration: none; }

@media (max-width: 560px) {
  .card { flex-direction: column; }
}
</style>
