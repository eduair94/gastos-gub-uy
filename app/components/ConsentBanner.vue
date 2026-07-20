<script setup lang="ts">
// Cookie notice. Shown once, on the first visit, until the reader decides.
// Refusing is exactly as easy as accepting — a "reject" hidden behind a
// settings screen is not consent, and the site works identically either way.
//
// The state machine (and what each choice actually does to GA) lives in
// composables/useConsent.ts; this component only presents the choice.
const { t } = useI18n()
const localePath = useLocalePath()
const { showBanner, accept, reject } = useConsent()
</script>

<template>
  <Transition name="consent">
    <div
      v-if="showBanner"
      class="consent"
      role="region"
      :aria-label="t('consent.aria')"
    >
      <div class="consent__inner u-container">
        <p class="consent__text">
          {{ t('consent.text') }}
          <NuxtLink
            class="consent__link"
            :to="localePath('/cookies')"
          >
            {{ t('consent.more') }}
          </NuxtLink>
        </p>
        <div class="consent__actions">
          <button
            type="button"
            class="consent__btn consent__btn--ghost"
            @click="reject"
          >
            {{ t('consent.reject') }}
          </button>
          <button
            type="button"
            class="consent__btn consent__btn--solid"
            @click="accept"
          >
            {{ t('consent.accept') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.consent {
  position: fixed;
  inset: auto 0 0 0;
  // Above the floating donation card, below Vuetify overlays (2400+).
  z-index: 2000;
  background: var(--surface);
  border-top: 1px solid var(--rule);
  box-shadow: 0 -8px 24px rgb(15 34 51 / 12%);
  padding: var(--s-3) 0 calc(var(--s-3) + env(safe-area-inset-bottom));
}

.consent__inner {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  flex-wrap: wrap;
}

.consent__text {
  flex: 1 1 22rem;
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text);
  line-height: 1.5;
}

.consent__link {
  color: var(--celeste-deep);
  text-decoration: underline;
  white-space: nowrap;
}

.consent__actions {
  display: flex;
  gap: var(--s-2);
  flex: 0 0 auto;
  margin-left: auto;
}

.consent__btn {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.02em;
  padding: var(--s-2) var(--s-4);
  border-radius: var(--r-sm);
  border: 1px solid var(--rule);
  cursor: pointer;
  background: transparent;
  color: var(--text);
  transition: background-color 0.15s ease, border-color 0.15s ease;

  &:hover { border-color: var(--celeste); }
  &:focus-visible { outline: 2px solid var(--celeste); outline-offset: 2px; }
}

.consent__btn--solid {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);

  &:hover { background: var(--celeste-deep); border-color: var(--celeste-deep); }
}

.consent-enter-active,
.consent-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }

.consent-enter-from,
.consent-leave-to { transform: translateY(100%); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .consent-enter-active,
  .consent-leave-active { transition: none; }
}

@media (width <= 620px) {
  .consent__actions { margin-left: 0; width: 100%; }
  .consent__btn { flex: 1; }
}
</style>
