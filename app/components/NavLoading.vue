<script setup lang="ts">
// Navigation feedback for the slow case. `<NuxtLoadingIndicator>` in the
// layout gives an instant top bar; this is the second tier: when a
// navigation blocks on data for more than a beat, a dim overlay makes
// clear the click was received and the page is on its way. Without it,
// pressing a row or a nav link and then waiting several seconds for an
// SSR fetch reads as "nothing happened".
const nuxtApp = useNuxtApp()
const { t } = useI18n()

// Fast SPA transitions finish under this threshold and never flash the
// overlay; only genuinely slow navigations surface it.
const DELAY = 220
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function start() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    visible.value = true
  }, DELAY)
}

function stop() {
  clearTimeout(timer)
  visible.value = false
}

// page:loading:start / :end are emitted by Nuxt's router plugin on every
// navigation, independent of the built-in indicator — so subscribing here
// covers every <NuxtLink> and router.push, not just pages that opt in.
const offStart = nuxtApp.hook('page:loading:start', start)
const offEnd = nuxtApp.hook('page:loading:end', stop)

onBeforeUnmount(() => {
  clearTimeout(timer)
  offStart()
  offEnd()
})
</script>

<template>
  <Transition name="navload">
    <div
      v-if="visible"
      class="navload"
      role="status"
      aria-live="polite"
    >
      <div class="navload__card">
        <BrandMark
          :size="34"
          class="navload__mark"
        />
        <!-- Spinner is celeste, never gold: gold is reserved for money. -->
        <span
          class="navload__spinner"
          aria-hidden="true"
        />
        <span class="navload__text">{{ t('common.loading') }}…</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.navload {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: grid;
  place-items: center;
  /* Dims the page without hiding it, so the destination composes in
     behind the card rather than blanking to nothing. */
  background: color-mix(in srgb, var(--bg) 62%, transparent);
  backdrop-filter: blur(2px);
}

.navload__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-6) var(--s-7);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-3);
}

.navload__mark { opacity: 0.9; }

.navload__spinner {
  width: 26px;
  height: 26px;
  border-radius: var(--r-full);
  border: 2.5px solid var(--surface-sunken);
  border-top-color: var(--celeste);
  /* The global prefers-reduced-motion rule in main.scss freezes this
     animation, leaving a static ring + label — still clear feedback. */
  animation: navload-spin 720ms linear infinite;
}

.navload__text {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

@keyframes navload-spin {
  to { transform: rotate(360deg); }
}

.navload-enter-active,
.navload-leave-active {
  transition: opacity 160ms var(--ease);
}

.navload-enter-from,
.navload-leave-to {
  opacity: 0;
}
</style>
