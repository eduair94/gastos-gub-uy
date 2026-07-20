<script setup lang="ts">
import type { NuxtError } from '#app'

// The site shipped without an error.vue, so a 404 or a thrown error fell through
// to Nuxt's unstyled default page. This keeps the nav, footer and voice intact.
const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const localePath = useLocalePath()

const is404 = computed(() => props.error?.statusCode === 404)
const search = ref('')

function goHome() {
  // clearError with a redirect resets Nuxt's error state as it navigates.
  clearError({ redirect: localePath('/') })
}

function submitSearch() {
  const q = search.value.trim()
  clearError({ redirect: `${localePath('/contracts')}${q ? `?search=${encodeURIComponent(q)}` : ''}` })
}
</script>

<template>
  <NuxtLayout>
    <div class="u-container err">
      <p class="err__code u-mono">
        {{ error?.statusCode || 500 }}
      </p>
      <h1 class="err__title">
        {{ is404 ? t('errorPage.title404') : t('errorPage.titleGeneric') }}
      </h1>
      <p class="err__lead">
        {{ is404 ? t('errorPage.lead404') : t('errorPage.leadGeneric') }}
      </p>

      <form
        class="err__search"
        role="search"
        @submit.prevent="submitSearch"
      >
        <input
          v-model="search"
          type="search"
          class="err__input"
          :placeholder="t('errorPage.searchPlaceholder')"
          :aria-label="t('errorPage.searchPlaceholder')"
        >
        <button
          type="submit"
          class="err__btn err__btn--solid"
        >
          {{ t('errorPage.searchBtn') }}
        </button>
      </form>

      <div class="err__links">
        <button
          type="button"
          class="err__btn"
          @click="goHome"
        >
          {{ t('errorPage.home') }}
        </button>
        <NuxtLink
          :to="localePath('/contracts')"
          class="err__btn"
        >
          {{ t('errorPage.explore') }}
        </NuxtLink>
      </div>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.err {
  max-width: 46rem;
  padding-block: var(--s-8) var(--s-9);
  text-align: center;
}

.err__code {
  margin: 0;
  font-size: var(--t-3xl);
  font-weight: 600;
  color: var(--celeste);
  letter-spacing: 0.04em;
}

.err__title {
  margin: var(--s-3) 0 var(--s-2);
  font-size: var(--t-2xl);
}

.err__lead {
  margin: 0 auto var(--s-6);
  max-width: 40ch;
  color: var(--text-muted);
  line-height: 1.6;
}

.err__search {
  display: flex;
  gap: var(--s-2);
  max-width: 30rem;
  margin: 0 auto var(--s-4);
}

.err__input {
  flex: 1;
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-size: var(--t-sm);
}

.err__input:focus-visible { outline: 2px solid var(--celeste); outline-offset: 1px; }

.err__links {
  display: flex;
  gap: var(--s-2);
  justify-content: center;
  flex-wrap: wrap;
}

.err__btn {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.02em;
  padding: var(--s-3) var(--s-5);
  border-radius: var(--r-md);
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.15s ease;
}

.err__btn:hover { border-color: var(--celeste); }

.err__btn--solid {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);
}

.err__btn--solid:hover { background: var(--celeste-deep); border-color: var(--celeste-deep); }
</style>
