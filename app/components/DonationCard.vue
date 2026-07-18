<script setup lang="ts">
// Floating "love" card — mirrors cambio-uruguay's DonationCard spec (fixed,
// minimizable pulsing heart, localStorage-persisted state) but themed with the
// gastos-gub design tokens so it adapts to light/dark instead of a hardcoded
// dark surface. Headline action here is a GitHub star (gold = the "sol" money
// accent), with the donate channels kept as the secondary row.
const { t } = useI18n()

const REPO_URL = 'https://github.com/eduair94/gastos-gub-uy'

const isMinimized = ref(false)

function toggleCard() {
  isMinimized.value = !isMinimized.value
  if (import.meta.client) {
    localStorage.setItem('donationCardMinimized', isMinimized.value.toString())
  }
}

// Optional analytics hook — matches the reference so a later gtag drop-in works.
function track(action: string) {
  if (typeof window !== 'undefined' && 'gtag' in window && typeof (window as any).gtag === 'function') {
    ;(window as any).gtag('event', 'support_click', { action })
  }
}

onMounted(() => {
  const saved = localStorage.getItem('donationCardMinimized')
  if (saved !== null) isMinimized.value = saved === 'true'
})
</script>

<template>
  <div
    class="love-card"
    :class="isMinimized ? 'love-card--min' : 'love-card--open'"
  >
    <!-- Minimized: pulsing heart, bottom-right -->
    <button
      v-if="isMinimized"
      type="button"
      class="love-fab"
      :aria-label="t('donation.expand')"
      @click="toggleCard"
    >
      <v-icon size="22">
        mdi-heart
      </v-icon>
    </button>

    <!-- Expanded: bottom-left panel -->
    <div
      v-else
      class="love-panel"
    >
      <div class="love-panel__head">
        <span class="love-panel__title">
          <v-icon
            size="18"
            class="love-panel__heart"
          >
            mdi-heart
          </v-icon>
          {{ t('donation.support') }}
        </span>
        <button
          type="button"
          class="love-panel__x"
          :aria-label="t('donation.close')"
          @click="toggleCard"
        >
          <v-icon size="16">
            mdi-close
          </v-icon>
        </button>
      </div>

      <div class="love-panel__body">
        <p class="love-panel__msg">
          {{ t('donation.help') }}
        </p>

        <!-- Headline action: star on GitHub -->
        <a
          class="love-star"
          :href="REPO_URL"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t('donation.star')"
          @click="track('github-star')"
        >
          <v-icon size="18">
            mdi-github
          </v-icon>
          <span>{{ t('donation.star') }}</span>
          <v-icon
            size="15"
            class="love-star__glint"
          >
            mdi-star
          </v-icon>
        </a>

        <div class="love-or">
          {{ t('donation.or') }}
        </div>

        <!-- Donate channels -->
        <div class="love-donate">
          <a
            class="love-chip love-chip--kofi"
            href="https://ko-fi.com/cambio_uruguay"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t('donation.donatePaypal')"
            @click="track('kofi')"
          >
            <v-icon size="15">
              mdi-currency-usd
            </v-icon>
            PayPal
          </a>
          <a
            class="love-chip love-chip--mp"
            href="https://mpago.la/19j46vX"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t('donation.donateMercadoPago')"
            @click="track('mercadopago')"
          >
            <v-icon size="15">
              mdi-credit-card-outline
            </v-icon>
            MercadoPago
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.love-card {
  position: fixed;
  bottom: 20px;
  z-index: 1000;
}

.love-card--min {
  right: 20px;
}

.love-card--open {
  left: 20px;
  max-width: 288px;
}

/* ---- Minimized heart ---- */
.love-fab {
  display: grid;
  place-items: center;
  width: 50px;
  height: 50px;
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface);
  color: #e5484d;
  box-shadow: var(--shadow-2, 0 6px 20px rgba(0, 0, 0, 0.18));
  cursor: pointer;
  animation: love-pulse 2s ease-in-out infinite;
  transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease);
}

.love-fab:hover {
  transform: scale(1.06);
  border-color: var(--rule-strong);
}

.love-fab:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@keyframes love-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* ---- Expanded panel ---- */
.love-panel {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg, 14px);
  background: var(--surface);
  box-shadow: var(--shadow-2, 0 10px 30px rgba(0, 0, 0, 0.22));
  overflow: hidden;
  animation: love-slide 0.28s ease-out;
}

@keyframes love-slide {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.love-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-3) var(--s-2);
  border-bottom: 1px solid var(--rule);
}

.love-panel__title {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--text);
}

.love-panel__heart { color: #e5484d; }

.love-panel__x {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}

.love-panel__x:hover { color: var(--text); background: var(--surface-sunken); }

.love-panel__body {
  padding: var(--s-3);
}

.love-panel__msg {
  margin: 0 0 var(--s-3);
  font-size: var(--t-sm);
  line-height: 1.4;
  color: var(--text-muted);
}

/* GitHub star — the headline. Gold, because "gold is money" and a star is gold. */
.love-star {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  padding: 9px var(--s-3);
  border-radius: var(--r-md);
  background: var(--sol);
  color: #1a1300;
  font-size: var(--t-sm);
  font-weight: 700;
  text-decoration: none;
  transition: filter var(--dur) var(--ease), transform var(--dur) var(--ease);
}

.love-star:hover { filter: brightness(1.05); transform: translateY(-1px); }

.love-star:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.love-star__glint { opacity: 0.85; }

.love-or {
  margin: var(--s-2) 0;
  font-size: var(--t-xs);
  text-align: center;
  color: var(--text-muted);
  text-transform: lowercase;
}

.love-donate {
  display: flex;
  gap: var(--s-2);
}

.love-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
  padding: 7px var(--s-2);
  border-radius: var(--r-full);
  font-size: var(--t-xs);
  font-weight: 600;
  text-decoration: none;
  color: #fff;
  transition: transform var(--dur) var(--ease), filter var(--dur) var(--ease);
}

.love-chip:hover { transform: translateY(-1px); filter: brightness(1.06); }

.love-chip:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.love-chip--kofi { background: #0070ba; }
.love-chip--mp { background: #0a4a8f; }

/* ---- Responsive ---- */
@media (max-width: 768px) {
  .love-card--open {
    left: 14px;
    right: 14px;
    bottom: 76px;
    max-width: none;
  }
  .love-card--min { right: 14px; }
}

@media print {
  .love-card { display: none !important; }
}
</style>
