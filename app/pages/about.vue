<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

useSeo(() => ({
  title: t('about.title'),
  description: t('about.sourceBody').slice(0, 155),
  path: '/about',
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

    <div class="prose">
      <section class="sec">
        <h2>{{ t('about.sourceTitle') }}</h2>
        <p>{{ t('about.sourceBody') }}</p>
      </section>

      <!-- The signature, explained. Showing the scale beats describing it. -->
      <section class="sec">
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
      <section class="sec">
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

      <section class="sec">
        <h2>{{ t('about.limitsTitle') }}</h2>
        <p>{{ t('about.limitsBody') }}</p>
      </section>

      <section class="sec">
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
      <section class="sec">
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
.page { padding-block: var(--s-7) var(--s-8); }

.head {
  max-width: 62ch;
  margin-bottom: var(--s-7);
}

.head h1 { margin: var(--s-2) 0 var(--s-3); }

.prose { max-width: 68ch; }

.sec + .sec {
  margin-top: var(--s-6);
  padding-top: var(--s-6);
  border-top: 1px solid var(--rule);
}

.sec h2 { margin: 0 0 var(--s-3); }

.sec p {
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
