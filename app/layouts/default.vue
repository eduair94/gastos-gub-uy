<script setup lang="ts">
import { useTheme } from 'vuetify'

// `<component :is="'NuxtLink'">` does NOT resolve a string to a globally
// registered component — it emits a literal <nuxtlink> element with no
// href, which is why every top-bar link was unclickable. Resolve the
// component object once and switch on that instead.
const NuxtLinkC = resolveComponent('NuxtLink')

const { t, locale, locales, setLocale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const theme = useTheme()

const drawer = ref(false)
const search = ref('')

const nav = computed(() => [
  { key: 'home', to: localePath('/'), icon: 'mdi-view-dashboard-outline' },
  { key: 'contracts', to: localePath('/contracts'), icon: 'mdi-file-document-outline' },
  { key: 'suppliers', to: localePath('/suppliers'), icon: 'mdi-domain' },
  { key: 'buyers', to: localePath('/buyers'), icon: 'mdi-bank-outline' },
  { key: 'anomalies', to: localePath('/analytics/anomalies'), icon: 'mdi-flag-outline' },
  // The API reference is a Nitro server route (server/routes/docs.get.ts), not a Nuxt page, so it
  // must be a real anchor: vue-router resolves /docs to zero matched routes and throws its own 404
  // without ever issuing a request. It would still work when pasted into the address bar, which
  // makes the broken in-app case easy to miss. Not localePath'd — the page is served in one form.
  { key: 'docs', to: '/docs', icon: 'mdi-api', external: true },
])

function isActive(to: string) {
  if (to === localePath('/')) return route.path === to
  return route.path.startsWith(to)
}

// Theme is a preference, so it survives reloads. First visit follows the
// OS rather than assuming light.
const isDark = ref(false)

function applyTheme(dark: boolean) {
  isDark.value = dark
  theme.global.name.value = dark ? 'contribuyenteDark' : 'contribuyente'
  if (import.meta.client) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('cltc-theme', dark ? 'dark' : 'light')
  }
}

onMounted(() => {
  const saved = localStorage.getItem('cltc-theme')
  applyTheme(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches)
})

function toggleTheme() {
  applyTheme(!isDark.value)
}

function submitSearch() {
  const q = search.value.trim()
  if (!q) return
  router.push({ path: localePath('/contracts'), query: { search: q } })
  drawer.value = false
}

const otherLocales = computed(() =>
  (locales.value as { code: string, name: string }[]).filter(l => l.code !== locale.value),
)

// Close the mobile panel on navigation — leaving it open over the new
// page is the classic drawer bug.
watch(() => route.fullPath, () => {
  drawer.value = false
})
</script>

<template>
  <v-app>
    <a
      class="u-skip"
      href="#contenido"
    >{{ t('nav.skip') }}</a>

    <header class="topbar">
      <div class="topbar__inner u-container">
        <!-- Leads the bar on small screens: the drawer opens from the
             left, so its trigger belongs on the left. Hidden ≥900px,
             where the horizontal nav takes over. -->
        <button
          class="iconbtn iconbtn--menu"
          :aria-label="t('nav.menu')"
          :aria-expanded="drawer"
          aria-controls="mobile-drawer"
          @click="drawer = !drawer"
        >
          <v-icon size="22">
            mdi-menu
          </v-icon>
        </button>

        <NuxtLink
          :to="localePath('/')"
          class="brand"
        >
          <BrandMark :size="30" />
          <span class="brand__text">
            <span class="brand__name">{{ t('brand.name') }}</span>
            <span class="brand__tag">{{ t('brand.tagline') }}</span>
          </span>
        </NuxtLink>

        <nav
          class="topnav"
          :aria-label="t('nav.sections')"
        >
          <component
            :is="n.external ? 'a' : NuxtLinkC"
            v-for="n in nav"
            :key="n.key"
            :to="n.external ? undefined : n.to"
            :href="n.external ? n.to : undefined"
            :target="n.external ? '_blank' : undefined"
            :rel="n.external ? 'noopener' : undefined"
            class="topnav__link"
            :class="{ 'topnav__link--active': !n.external && isActive(n.to) }"
            :aria-current="!n.external && isActive(n.to) ? 'page' : undefined"
          >
            {{ t(`nav.${n.key}`) }}
          </component>
        </nav>

        <div class="topbar__actions">
          <form
            class="topsearch"
            role="search"
            @submit.prevent="submitSearch"
          >
            <label
              class="u-sr-only"
              for="topsearch"
            >{{ t('common.search') }}</label>
            <v-icon
              size="18"
              class="topsearch__icon"
            >
              mdi-magnify
            </v-icon>
            <input
              id="topsearch"
              v-model="search"
              class="topsearch__input"
              type="search"
              :placeholder="t('common.searchPlaceholder')"
            >
          </form>

          <v-menu>
            <template #activator="{ props }">
              <button
                v-bind="props"
                class="iconbtn"
                :aria-label="t('nav.language')"
              >
                <span class="iconbtn__label">{{ locale.toUpperCase() }}</span>
              </button>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="l in otherLocales"
                :key="l.code"
                :title="l.name"
                @click="setLocale(l.code)"
              />
            </v-list>
          </v-menu>

          <button
            class="iconbtn"
            :aria-label="isDark ? t('nav.themeLight') : t('nav.themeDark')"
            @click="toggleTheme"
          >
            <v-icon size="19">
              {{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}
            </v-icon>
          </button>
        </div>
      </div>
    </header>

    <!-- Mobile navigation: a real side drawer, off-canvas with a scrim.
         It sits outside <header> so the sticky bar's stacking context
         cannot trap the overlay behind the page. -->
    <v-navigation-drawer
      v-model="drawer"
      temporary
      location="left"
      width="288"
      class="drawer"
      :scrim="true"
    >
      <div class="drawer__head">
        <NuxtLink
          :to="localePath('/')"
          class="drawer__brand"
          @click="drawer = false"
        >
          <BrandMark :size="26" />
          <span class="drawer__name">{{ t('brand.name') }}</span>
        </NuxtLink>
        <button
          class="drawer__x"
          type="button"
          :aria-label="t('nav.close')"
          @click="drawer = false"
        >
          <v-icon size="22">
            mdi-close
          </v-icon>
        </button>
      </div>

      <form
        class="drawer__search"
        role="search"
        @submit.prevent="submitSearch"
      >
        <label
          class="u-sr-only"
          for="drawersearch"
        >{{ t('common.search') }}</label>
        <v-icon
          size="18"
          class="drawer__searchicon"
        >
          mdi-magnify
        </v-icon>
        <input
          id="drawersearch"
          v-model="search"
          class="drawer__searchinput"
          type="search"
          :placeholder="t('common.searchPlaceholder')"
        >
      </form>

      <nav
        class="drawer__nav"
        :aria-label="t('nav.sections')"
      >
        <component
          :is="n.external ? 'a' : NuxtLinkC"
          v-for="n in nav"
          :key="n.key"
          :to="n.external ? undefined : n.to"
          :href="n.external ? n.to : undefined"
          :target="n.external ? '_blank' : undefined"
          :rel="n.external ? 'noopener' : undefined"
          class="drawer__link"
          :class="{ 'drawer__link--active': !n.external && isActive(n.to) }"
          @click="drawer = false"
        >
          <v-icon size="20">
            {{ n.icon }}
          </v-icon>
          <span>{{ t(`nav.${n.key}`) }}</span>
          <v-icon
            v-if="n.external"
            size="14"
            class="drawer__ext"
          >
            mdi-open-in-new
          </v-icon>
        </component>
      </nav>

      <div class="drawer__foot">
        <NuxtLink
          :to="localePath('/about')"
          class="drawer__sub"
          @click="drawer = false"
        >
          {{ t('nav.about') }}
        </NuxtLink>
        <div class="drawer__prefs">
          <button
            class="drawer__pref"
            type="button"
            @click="toggleTheme"
          >
            <v-icon size="18">
              {{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}
            </v-icon>
            {{ isDark ? t('nav.themeLight') : t('nav.themeDark') }}
          </button>
          <button
            v-for="l in otherLocales"
            :key="l.code"
            class="drawer__pref"
            type="button"
            @click="setLocale(l.code)"
          >
            <v-icon size="18">
              mdi-translate
            </v-icon>
            {{ l.name }}
          </button>
        </div>
      </div>
    </v-navigation-drawer>

    <v-main>
      <div id="contenido">
        <slot />
      </div>
    </v-main>

    <footer class="foot">
      <div class="foot__inner u-container">
        <div class="foot__block">
          <BrandMark :size="22" />
          <p class="foot__note">
            {{ t('footer.source') }}
          </p>
        </div>
        <p class="foot__disclaimer">
          {{ t('footer.disclaimer') }}
        </p>
        <nav
          class="foot__links"
          :aria-label="t('nav.sections')"
        >
          <NuxtLink :to="localePath('/about')">
            {{ t('nav.about') }}
          </NuxtLink>
          <a href="/docs">{{ t('footer.api') }}</a>
          <a
            href="https://www.comprasestatales.gub.uy"
            rel="noopener external"
            target="_blank"
          >
            Compras Estatales
          </a>
        </nav>
      </div>
    </footer>
  </v-app>
</template>

<style scoped>
.u-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ---- Top bar ---- */
.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--rule);
}

.topbar__inner {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  min-height: 62px;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  text-decoration: none;
  color: var(--text);
  flex: none;
}

.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand__name {
  font-family: var(--font-display);
  font-weight: 800;
  font-stretch: 118%;
  font-size: 0.9375rem;
  letter-spacing: -0.025em;
  white-space: nowrap;
}

.brand__tag {
  font-size: 0.6875rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.topnav {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  margin-left: var(--s-3);
}

.topnav__link {
  position: relative;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  white-space: nowrap;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}

.topnav__link:hover {
  color: var(--text);
  background: var(--surface-sunken);
}

.topnav__link--active {
  color: var(--text);
  font-weight: 600;
}

/* The active marker is a short gold rule — the same vocabulary as the
   magnitude bar, reused for "you are here". */
.topnav__link--active::after {
  content: "";
  position: absolute;
  left: var(--s-3);
  right: var(--s-3);
  bottom: 2px;
  height: 2px;
  border-radius: 1px;
  background: var(--sol);
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-left: auto;
}

.topsearch {
  position: relative;
  display: flex;
  align-items: center;
}

.topsearch__icon {
  position: absolute;
  left: 9px;
  color: var(--text-muted);
  pointer-events: none;
}

.topsearch__input {
  width: clamp(160px, 22vw, 280px);
  padding: 7px var(--s-3) 7px 32px;
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface-sunken);
  color: var(--text);
  font-size: var(--t-sm);
  font-family: var(--font-body);
  transition: border-color var(--dur) var(--ease);
}

.topsearch__input::placeholder { color: var(--text-muted); }

.topsearch__input:focus {
  outline: none;
  border-color: var(--celeste);
  background: var(--surface);
}

.topsearch__input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.iconbtn {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 34px;
  padding: 0 var(--s-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}

.iconbtn:hover {
  color: var(--text);
  border-color: var(--rule-strong);
}

.iconbtn__label {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
}

.iconbtn--menu { display: none; }

/* ---- Mobile drawer ---- */
.drawer {
  background: var(--surface) !important;
  border-left: 1px solid var(--rule) !important;
}

.drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-4);
  border-bottom: 1px solid var(--rule);
}

.drawer__brand {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
  text-decoration: none;
  color: var(--text);
}

.drawer__name {
  font-family: var(--font-display);
  font-weight: 800;
  font-stretch: 118%;
  font-size: 0.875rem;
  letter-spacing: -0.025em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer__x {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.drawer__x:hover { color: var(--text); background: var(--surface-sunken); }

.drawer__search {
  position: relative;
  display: flex;
  align-items: center;
  margin: var(--s-4);
}

.drawer__searchicon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.drawer__searchinput {
  width: 100%;
  padding: 9px var(--s-3) 9px 34px;
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
}

.drawer__searchinput:focus {
  outline: none;
  border-color: var(--celeste);
  background: var(--surface);
}

.drawer__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 var(--s-3);
}

.drawer__link {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3);
  border-radius: var(--r-md);
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 500;
  font-size: var(--t-base);
}

.drawer__link:hover { background: var(--surface-sunken); color: var(--text); }

.drawer__link--active {
  color: var(--text);
  background: var(--surface-sunken);
  box-shadow: inset 3px 0 0 var(--sol);
}

.drawer__ext { margin-left: auto; opacity: 0.6; }

.drawer__foot {
  margin-top: auto;
  padding: var(--s-4);
  border-top: 1px solid var(--rule);
}

.drawer__sub {
  display: block;
  padding: var(--s-2) var(--s-1);
  font-size: var(--t-sm);
  color: var(--celeste-deep);
  text-decoration: none;
}

.drawer__prefs {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin-top: var(--s-2);
}

.drawer__pref {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-1);
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  text-align: left;
  cursor: pointer;
}

.drawer__pref:hover { color: var(--text); }

/* ---- Footer ---- */
.foot {
  margin-top: var(--s-9);
  border-top: 1px solid var(--rule);
  background: var(--surface);
}

.foot__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-4) var(--s-6);
  padding-block: var(--s-6);
}

.foot__block {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.foot__note,
.foot__disclaimer {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.foot__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-4);
  margin-left: auto;
}

.foot__links a {
  font-size: var(--t-sm);
  color: var(--celeste-deep);
  text-decoration: none;
}

.foot__links a:hover { text-decoration: underline; }

/* ---- Responsive ---- */
@media (max-width: 1100px) {
  .brand__tag { display: none; }
  .topnav { gap: 0; }
  .topnav__link { padding-inline: var(--s-2); }
}

@media (max-width: 900px) {
  .topnav { display: none; }
  .iconbtn--menu { display: grid; }
}

@media (max-width: 620px) {
  .topsearch { display: none; }
  .brand__name { font-size: 0.875rem; }
  .foot__links { margin-left: 0; }

  /* The drawer carries the theme and language controls on a phone, so
     the bar keeps only the brand and the menu. This is also what was
     pushing 27px of horizontal overflow at 360px. */
  .topbar__actions .iconbtn:not(.iconbtn--menu) { display: none; }
  .topbar__inner { gap: var(--s-2); }
}
</style>
