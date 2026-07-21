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
const overflowMenuOpen = ref(false)
const search = ref('')

// The box mirrors the explorer's current term — landing on
// /contracts?search=…, using Back, or searching from the rail should
// all leave the top bar showing what the results actually contain.
watch(() => route.query.search, (q) => {
  search.value = typeof q === 'string' ? q : ''
}, { immediate: true })

const nav = computed(() => [
  { key: 'home', to: localePath('/'), icon: 'mdi-view-dashboard-outline' },
  { key: 'gastos', to: localePath('/gastos'), icon: 'mdi-cash-multiple' },
  // The two dropdowns lead the bar (right after Panel/Gastos) so they stay visible
  // rather than folding into "Más": this site's whole point is the anomaly detection
  // and the investigations, and a dropdown hidden in the overflow defeats its purpose.
  //
  // Análisis: the whole alert/analysis family under one dropdown (parent → /analytics
  // hub). Collapsing these six flat entries is what stops the bar overflowing.
  // startsWith isActive highlights the parent on any child.
  { key: 'analisis', to: localePath('/analytics'), icon: 'mdi-chart-box-outline', children: [
    { key: 'anomalies', to: localePath('/analytics/anomalies'), icon: 'mdi-flag-outline' },
    { key: 'unexplained', to: localePath('/analytics/unexplained'), icon: 'mdi-help-rhombus-outline' },
    { key: 'erroresCarga', to: localePath('/analytics/errores-carga'), icon: 'mdi-database-alert-outline' },
    { key: 'providerAnomalies', to: localePath('/analytics/proveedores-anomalias'), icon: 'mdi-account-alert-outline' },
    { key: 'providerLoadErrors', to: localePath('/analytics/proveedores-errores-carga'), icon: 'mdi-clipboard-alert-outline' },
    { key: 'intendencias', to: localePath('/analytics/intendencias'), icon: 'mdi-city-variant-outline' },
    { key: 'partidos', to: localePath('/analytics/partidos'), icon: 'mdi-vote-outline' },
    { key: 'organismos', to: localePath('/analytics/organismos'), icon: 'mdi-finance' },
    { key: 'mapa', to: localePath('/analytics/mapa'), icon: 'mdi-view-grid-outline' },
    { key: 'anticipacion', to: localePath('/analytics/anticipacion'), icon: 'mdi-crystal-ball' },
  ] },
  // Investigaciones: every investigation reachable directly, without first visiting
  // the hub — TV Ciudad no longer folds into the overflow. Parent → /investigaciones.
  { key: 'investigaciones', to: localePath('/investigaciones'), icon: 'mdi-magnify-scan', children: [
    { key: 'tvciudad', to: localePath('/investigaciones/tv-ciudad'), icon: 'mdi-television-classic' },
    { key: 'invCasinos', to: localePath('/investigaciones/casinos'), icon: 'mdi-slot-machine-outline' },
    { key: 'invCasinosCortesia', to: localePath('/investigaciones/casinos-cortesia'), icon: 'mdi-cards-playing-outline' },
    { key: 'invIm', to: localePath('/investigaciones/intendencia-montevideo'), icon: 'mdi-city-variant-outline' },
    { key: 'invEmpresas', to: localePath('/investigaciones/empresas-senaladas'), icon: 'mdi-domain-off' },
    { key: 'invAsse', to: localePath('/investigaciones/asse-ambulancias'), icon: 'mdi-ambulance' },
    { key: 'invSaturno', to: localePath('/investigaciones/frigorifico-saturno'), icon: 'mdi-cow' },
  ] },
  { key: 'contracts', to: localePath('/contracts'), icon: 'mdi-file-document-outline' },
  { key: 'suppliers', to: localePath('/suppliers'), icon: 'mdi-domain' },
  { key: 'contactos', to: localePath('/proveedores/contactos'), icon: 'mdi-email-outline' },
  { key: 'contactosCompras', to: localePath('/contactos'), icon: 'mdi-card-account-details-outline' },
  { key: 'buyers', to: localePath('/buyers'), icon: 'mdi-bank-outline' },
  { key: 'products', to: localePath('/products'), icon: 'mdi-package-variant-closed' },
  { key: 'recopilatorios', to: localePath('/recopilatorios'), icon: 'mdi-folder-star-outline' },
  { key: 'pauta', to: localePath('/pauta'), icon: 'mdi-bullhorn-variant-outline' },
  { key: 'estadisticas', to: localePath('/estadisticas'), icon: 'mdi-chart-box-outline' },
  { key: 'curros', to: localePath('/curros'), icon: 'mdi-scale-balance' },
  { key: 'llamados', to: localePath('/llamados'), icon: 'mdi-bullhorn-outline' },
  { key: 'comparativa', to: localePath('/comparativa'), icon: 'mdi-compare' },
  // Developer platform front door (a real Nuxt page): quickstart + how to integrate,
  // which then links onward to /docs. Kept next to `docs` so the overflow menu folds
  // the API family together.
  { key: 'developers', to: localePath('/developers'), icon: 'mdi-code-tags' },
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

// A dropdown parent (Análisis, Investigaciones). Its children live under the parent
// route (/analytics/*, /investigaciones/*), so startsWith isActive already reports
// the group as active on any child — no need to scan the children.
interface NavItem { key: string, to: string, icon: string, external?: boolean, children?: NavItem[] }
function hasChildren(n: NavItem): boolean {
  return Array.isArray(n.children) && n.children.length > 0
}
function groupActive(n: NavItem): boolean {
  return isActive(n.to) || (n.children?.some(c => isActive(c.to)) ?? false)
}

// Theme is a preference, so it survives reloads. First visit follows the
// OS rather than assuming light.
const isDark = ref(false)

function applyTheme(dark: boolean) {
  isDark.value = dark
  theme.change(dark ? 'contribuyenteDark' : 'contribuyente')
  if (import.meta.client) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('cltc-theme', dark ? 'dark' : 'light')
  }
}

onMounted(() => {
  const saved = localStorage.getItem('cltc-theme')
  applyTheme(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches)
})

const { track } = useAnalytics()

function toggleTheme() {
  applyTheme(!isDark.value)
  // applyTheme has flipped isDark to the new value already.
  track('theme_toggle', { theme: isDark.value ? 'dark' : 'light' })
}

// One handler for both the top-bar and the drawer form; the caller says which.
function submitSearch(location: 'topbar' | 'drawer' = 'topbar') {
  const q = search.value.trim()
  if (!q) return
  track('search', { search_term: q, location })
  router.push({ path: localePath('/contracts'), query: { search: q } })
  drawer.value = false
}

// Wraps i18n's setLocale so the language switch is measured. Both the top-bar
// and drawer menus route through here.
function changeLocale(code: string) {
  track('locale_change', { locale: code })
  setLocale(code)
}

const otherLocales = computed(() =>
  locales.value.filter(l => l.code !== locale.value),
)

// Auth — the user menu / login control in the top bar and drawer. When Firebase
// isn't configured the auth area is disabled, so the login control is hidden entirely.
const { user, logout } = useAuth()
const authEnabled = useAuthEnabled()
async function onLogout() {
  await logout()
  drawer.value = false
  await navigateTo(localePath('/'))
}

// Close the mobile panel on navigation — leaving it open over the new
// page is the classic drawer bug.
watch(() => route.fullPath, () => {
  drawer.value = false
  overflowMenuOpen.value = false
})

// ---- Priority overflow nav ----
// The bar carries nine sections plus a brand, a search box and the
// account controls; on a laptop the Spanish labels overrun the 1400px
// container and push the whole page into horizontal scroll. Rather than
// hide the search or fall back to the hamburger on every laptop, measure
// what actually fits and fold the remainder into a "Más" menu. A hidden
// rail renders every item at full size so the fit math never depends on
// what is currently collapsed, and reading the live brand/actions widths
// keeps it correct whether or not a login/account control is present.
const topbarInnerEl = ref<HTMLElement | null>(null)
const topnavEl = ref<HTMLElement | null>(null)
const navRailEl = ref<HTMLElement | null>(null)
const visibleCount = ref(nav.value.length)

const visibleNav = computed(() => nav.value.slice(0, visibleCount.value))
const overflowNav = computed(() => nav.value.slice(visibleCount.value))

let rafId = 0
function scheduleRecompute() {
  if (!import.meta.client) return
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(recomputeNav)
}

function recomputeNav() {
  const inner = topbarInnerEl.value
  const bar = topnavEl.value
  const rail = navRailEl.value
  if (!inner || !bar || !rail) return
  // The drawer owns navigation below 900px, where the bar is display:none.
  if (getComputedStyle(bar).display === 'none') return

  const items = Array.from(rail.querySelectorAll<HTMLElement>('.railnav__item'))
  const moreEl = rail.querySelector<HTMLElement>('.railnav__more')
  if (!items.length || !moreEl) return

  const brand = inner.querySelector<HTMLElement>('.brand')
  const actions = inner.querySelector<HTMLElement>('.topbar__actions')
  if (!brand || !actions) return
  // The nav sits between the brand and the actions cluster. Because actions
  // is margin-left:auto its left edge is pinned to the content's right edge
  // regardless of how wide the nav is, so this track is a stable measure of
  // the room the nav has — and it already nets out the container's padding,
  // which clientWidth would have wrongly included.
  const interGap = parseFloat(getComputedStyle(inner).columnGap) || 0
  const marginLeft = parseFloat(getComputedStyle(bar).marginLeft) || 0
  const track = actions.getBoundingClientRect().left - brand.getBoundingClientRect().right
  const SAFETY = 16
  const avail = track - interGap * 2 - marginLeft - SAFETY

  const firstLeft = items[0].getBoundingClientRect().left
  const widthOf = (k: number) =>
    k <= 0 ? 0 : items[k - 1].getBoundingClientRect().right - firstLeft

  if (widthOf(items.length) <= avail) {
    visibleCount.value = items.length
    return
  }
  const railGap = parseFloat(getComputedStyle(rail).columnGap) || 0
  const moreW = moreEl.getBoundingClientRect().width + railGap
  let k = items.length
  while (k > 0 && widthOf(k) + moreW > avail) k--
  visibleCount.value = k
}

onMounted(() => {
  // The first measure waits for the browser to go idle, not just a tick:
  // Vuetify's v-menu activators for the dropdown nav items finish their own
  // post-mount setup asynchronously, and shrinking `visibleNav` (removing a
  // <v-menu> from the DOM) while one is still mid-setup threw "Cannot read
  // properties of null (reading 'ce')" from inside Vue's renderSlot right
  // after hydration — reproduced under CPU throttling (Lighthouse), not a
  // plain-speed browser, so a single nextTick wasn't always enough margin.
  if ('requestIdleCallback' in window) requestIdleCallback(scheduleRecompute, { timeout: 300 })
  else setTimeout(scheduleRecompute, 50)
  window.addEventListener('resize', scheduleRecompute, { passive: true })
  // Labels shift width once the display/body faces finish loading.
  if (document.fonts?.ready) document.fonts.ready.then(scheduleRecompute)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleRecompute)
  cancelAnimationFrame(rafId)
})

// Locale swaps every label and logging in/out adds or removes the account
// control — both change the fit, so re-measure once the DOM has settled.
// (authEnabled is a constant per load, so the mount-time measure covers it.)
watch([locale, user], () => nextTick(scheduleRecompute))
</script>

<template>
  <v-app>
    <!-- Two-tier navigation feedback: an instant top bar for every route
         change, and a dim overlay (NavLoading) that only appears when a
         navigation blocks on data long enough to feel unresponsive. -->
    <NuxtLoadingIndicator
      color="var(--celeste)"
      :height="3"
    />
    <NavLoading />

    <a
      class="u-skip"
      href="#contenido"
    >{{ t('nav.skip') }}</a>

    <header class="topbar">
      <div
        ref="topbarInnerEl"
        class="topbar__inner u-container"
      >
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
          :aria-label="t('brand.name')"
        >
          <BrandMark :size="30" />
          <span class="brand__text">
            <span class="brand__name">{{ t('brand.name') }}</span>
            <span class="brand__tag">{{ t('brand.tagline') }}</span>
          </span>
        </NuxtLink>

        <nav
          ref="topnavEl"
          class="topnav"
          :aria-label="t('nav.sections')"
        >
          <template
            v-for="n in visibleNav"
            :key="n.key"
          >
            <!-- Grouped section (Análisis, Investigaciones): a hover/click dropdown.
                 The parent's own route (the hub) leads the list, then the children. -->
            <v-menu
              v-if="hasChildren(n)"
              open-on-hover
            >
              <template #activator="{ props }">
                <button
                  v-bind="props"
                  type="button"
                  class="topnav__link topnav__more"
                  :class="{ 'topnav__link--active': groupActive(n) }"
                >
                  {{ t(`nav.${n.key}`) }}
                  <v-icon size="16">
                    mdi-chevron-down
                  </v-icon>
                </button>
              </template>
              <v-list
                class="navmenu"
                density="compact"
                min-width="230"
              >
                <v-list-item
                  :to="n.to"
                  :prepend-icon="n.icon"
                  :title="t('nav.viewAll')"
                  :active="isActive(n.to)"
                />
                <v-divider />
                <v-list-item
                  v-for="c in n.children"
                  :key="c.key"
                  :to="c.to"
                  :prepend-icon="c.icon"
                  :title="t(`nav.${c.key}`)"
                  :active="isActive(c.to)"
                />
              </v-list>
            </v-menu>

            <!-- Plain section link -->
            <component
              :is="n.external ? 'a' : NuxtLinkC"
              v-else
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
          </template>

          <!-- Sections that don't fit fold in here rather than overflowing
               the bar. Active state bubbles up so the menu is highlighted
               when the current page lives inside it. -->
          <v-menu
            v-if="overflowNav.length"
            v-model="overflowMenuOpen"
            :close-on-content-click="false"
          >
            <template #activator="{ props }">
              <button
                v-bind="props"
                type="button"
                class="topnav__link topnav__more"
                :class="{ 'topnav__link--active': overflowNav.some(n => !n.external && isActive(n.to)) }"
              >
                {{ t('nav.more') }}
                <v-icon size="16">
                  mdi-chevron-down
                </v-icon>
              </button>
            </template>
            <v-list
              class="navmenu"
              density="compact"
              min-width="220"
            >
              <template
                v-for="n in overflowNav"
                :key="n.key"
              >
                <!-- A grouped section that folded into "Más": an expandable sub-list. -->
                <v-list-group
                  v-if="hasChildren(n)"
                  :value="n.key"
                >
                  <template #activator="{ props }">
                    <v-list-item
                      v-bind="props"
                      :prepend-icon="n.icon"
                      :title="t(`nav.${n.key}`)"
                    />
                  </template>
                  <v-list-item
                    :to="n.to"
                    :title="t('nav.viewAll')"
                    :active="isActive(n.to)"
                    @click="overflowMenuOpen = false"
                  />
                  <v-list-item
                    v-for="c in n.children"
                    :key="c.key"
                    :to="c.to"
                    :prepend-icon="c.icon"
                    :title="t(`nav.${c.key}`)"
                    :active="isActive(c.to)"
                    @click="overflowMenuOpen = false"
                  />
                </v-list-group>

                <v-list-item
                  v-else
                  :to="n.external ? undefined : n.to"
                  :href="n.external ? n.to : undefined"
                  :target="n.external ? '_blank' : undefined"
                  :rel="n.external ? 'noopener' : undefined"
                  :prepend-icon="n.icon"
                  :title="t(`nav.${n.key}`)"
                  :active="!n.external && isActive(n.to)"
                  @click="overflowMenuOpen = false"
                />
              </template>
            </v-list>
          </v-menu>
        </nav>

        <!-- Off-screen measuring rail: every section plus the "Más" chip at
             full size, so the fit math stays independent of what's currently
             collapsed. Hidden from view and from the a11y tree. -->
        <nav
          ref="navRailEl"
          class="topnav railnav"
          aria-hidden="true"
        >
          <span
            v-for="n in nav"
            :key="n.key"
            class="topnav__link railnav__item"
            :class="{ topnav__more: hasChildren(n) }"
          >{{ t(`nav.${n.key}`) }}<v-icon
            v-if="hasChildren(n)"
            size="16"
          >mdi-chevron-down</v-icon></span>
          <span class="topnav__link topnav__more railnav__more">
            {{ t('nav.more') }}
            <v-icon size="16">
              mdi-chevron-down
            </v-icon>
          </span>
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
            <v-list
              class="navmenu"
              density="compact"
            >
              <v-list-item
                v-for="l in otherLocales"
                :key="l.code"
                :title="l.name"
                @click="changeLocale(l.code)"
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

          <TourLauncher variant="icon" />
          <DonationLauncher variant="icon" />

          <ClientOnly>
            <NotificationBell v-if="user" />
          </ClientOnly>

          <v-menu v-if="user">
            <template #activator="{ props }">
              <button
                v-bind="props"
                class="iconbtn"
                :aria-label="t('nav.account')"
              >
                <v-icon size="20">
                  mdi-account-circle-outline
                </v-icon>
              </button>
            </template>
            <v-list
              class="navmenu"
              density="compact"
              min-width="200"
            >
              <v-list-item
                :to="localePath('/app')"
                prepend-icon="mdi-view-dashboard-outline"
                :title="t('dashboard.title')"
              />
              <v-list-item
                :to="localePath('/app/alertas')"
                prepend-icon="mdi-bell-outline"
                :title="t('alerts.title')"
              />
              <v-list-item
                :to="localePath('/app/notificaciones')"
                prepend-icon="mdi-bell-ring-outline"
                :title="t('inbox.title')"
              />
              <v-list-item
                :to="localePath('/app/calendario')"
                prepend-icon="mdi-calendar-outline"
                :title="t('calendar.title')"
              />
              <v-list-item
                :to="localePath('/app/cuenta')"
                prepend-icon="mdi-cog-outline"
                :title="t('accountPage.title')"
              />
              <v-list-item
                :to="localePath('/app/api-keys')"
                prepend-icon="mdi-key-variant"
                :title="t('apiKeys.title')"
              />
              <v-list-item
                :to="localePath('/app/webhooks')"
                prepend-icon="mdi-webhook"
                :title="t('webhooks.title')"
              />
              <v-divider />
              <v-list-item
                prepend-icon="mdi-logout"
                :title="t('auth.logout')"
                @click="onLogout"
              />
            </v-list>
          </v-menu>
          <NuxtLink
            v-else-if="authEnabled"
            :to="localePath('/login')"
            class="loginbtn"
          >
            {{ t('nav.login') }}
          </NuxtLink>
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

      <!-- Mobile has no room for the top-bar action icons, so the two opt-in
           features (guided tour, support the project) surface here at the top
           of the drawer rather than being buried below the long nav list. -->
      <div class="drawer__quick">
        <DonationLauncher
          variant="drawer"
          @activate="drawer = false"
        />
        <TourLauncher
          variant="drawer"
          @activate="drawer = false"
        />
      </div>

      <form
        class="drawer__search"
        role="search"
        @submit.prevent="submitSearch('drawer')"
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
        <template
          v-for="n in nav"
          :key="n.key"
        >
          <!-- Grouped section: a native disclosure so the children are one tap away
               without leaving the drawer. Open by default when a child is active. -->
          <details
            v-if="hasChildren(n)"
            class="drawer__group"
            :open="groupActive(n)"
          >
            <summary class="drawer__link drawer__summary">
              <v-icon size="20">
                {{ n.icon }}
              </v-icon>
              <span>{{ t(`nav.${n.key}`) }}</span>
              <v-icon
                size="18"
                class="drawer__caret"
              >
                mdi-chevron-down
              </v-icon>
            </summary>
            <div class="drawer__children">
              <NuxtLink
                :to="n.to"
                class="drawer__link drawer__child"
                :class="{ 'drawer__link--active': isActive(n.to) }"
                @click="drawer = false"
              >
                <v-icon size="18">
                  mdi-dots-horizontal
                </v-icon>
                <span>{{ t('nav.viewAll') }}</span>
              </NuxtLink>
              <NuxtLink
                v-for="c in n.children"
                :key="c.key"
                :to="c.to"
                class="drawer__link drawer__child"
                :class="{ 'drawer__link--active': isActive(c.to) }"
                @click="drawer = false"
              >
                <v-icon size="18">
                  {{ c.icon }}
                </v-icon>
                <span>{{ t(`nav.${c.key}`) }}</span>
              </NuxtLink>
            </div>
          </details>

          <!-- Plain section link -->
          <component
            :is="n.external ? 'a' : NuxtLinkC"
            v-else
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
        </template>
      </nav>

      <div class="drawer__foot">
        <NuxtLink
          :to="localePath('/about')"
          class="drawer__sub"
          @click="drawer = false"
        >
          {{ t('nav.about') }}
        </NuxtLink>
        <template v-if="user">
          <NuxtLink
            :to="localePath('/app')"
            class="drawer__sub"
            @click="drawer = false"
          >
            {{ t('dashboard.title') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/app/alertas')"
            class="drawer__sub"
            @click="drawer = false"
          >
            {{ t('alerts.title') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/app/notificaciones')"
            class="drawer__sub"
            @click="drawer = false"
          >
            {{ t('inbox.title') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/app/calendario')"
            class="drawer__sub"
            @click="drawer = false"
          >
            {{ t('calendar.title') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/app/cuenta')"
            class="drawer__sub"
            @click="drawer = false"
          >
            {{ t('accountPage.title') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/app/api-keys')"
            class="drawer__sub"
            @click="drawer = false"
          >
            {{ t('apiKeys.title') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/app/webhooks')"
            class="drawer__sub"
            @click="drawer = false"
          >
            {{ t('webhooks.title') }}
          </NuxtLink>
          <button
            type="button"
            class="drawer__sub drawer__sub--btn"
            @click="onLogout"
          >
            {{ t('auth.logout') }}
          </button>
        </template>
        <NuxtLink
          v-else-if="authEnabled"
          :to="localePath('/login')"
          class="drawer__sub"
          @click="drawer = false"
        >
          {{ t('nav.login') }}
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
          <NuxtLink :to="localePath('/developers')">
            {{ t('footer.developers') }}
          </NuxtLink>
          <a href="/docs">{{ t('footer.api') }}</a>
          <a
            href="https://github.com/eduair94/gastos-gub-uy"
            rel="noopener external"
            target="_blank"
            class="foot__gh"
          >
            <v-icon size="16">mdi-github</v-icon>
            {{ t('footer.github') }}
          </a>
          <a
            href="https://www.comprasestatales.gub.uy"
            rel="noopener external"
            target="_blank"
          >
            Compras Estatales
          </a>
        </nav>
        <nav
          class="foot__legal"
          :aria-label="t('footer.legal')"
        >
          <NuxtLink :to="localePath('/privacidad')">
            {{ t('footer.privacy') }}
          </NuxtLink>
          <NuxtLink :to="localePath('/terminos')">
            {{ t('footer.terms') }}
          </NuxtLink>
          <NuxtLink :to="localePath('/cookies')">
            {{ t('footer.cookies') }}
          </NuxtLink>
        </nav>
      </div>
    </footer>

    <!-- Floating "love" card: star on GitHub or donate. Fixed-positioned,
         self-contained, persists its own minimized state. -->
    <DonationCard />
    <TourHost />
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
  /* Safety net before hydration measures: clip an overrunning bar instead
     of letting it scroll the page. JS folds the tail into the "Más" menu. */
  min-width: 0;
  overflow: hidden;
}

/* Same footprint as a link so it measures identically on the rail. Only the
   button's UA font-family needs resetting — .topnav__link supplies the rest. */
.topnav__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}

/* Measuring rail: laid out like the real nav but removed from flow and
   from view. overflow is re-opened so nothing is clipped while measuring. */
.railnav {
  position: absolute;
  top: 0;
  /* Off to the left, never the right — a wide rail at left:0 would extend
     past the viewport edge and scroll the page it exists to prevent. */
  left: -99999px;
  margin: 0;
  overflow: visible;
  white-space: nowrap;
  visibility: hidden;
  pointer-events: none;
}

.topnav__link {
  position: relative;
  padding: var(--s-2);
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
  left: var(--s-2);
  right: var(--s-2);
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
  width: clamp(150px, 18vw, 200px);
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

.loginbtn {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 var(--s-4);
  border-radius: var(--r-md);
  background: var(--cta-fill);
  color: var(--cta-fg);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: filter var(--dur) var(--ease);
}

.loginbtn:hover { filter: brightness(1.06); }

.drawer__sub--btn {
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

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

/* Grouped sections in the drawer: a native <details> disclosure. */
.drawer__group { border-radius: var(--r-md); }

.drawer__summary {
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.drawer__summary::-webkit-details-marker { display: none; }

.drawer__caret {
  margin-left: auto;
  color: var(--text-muted);
  transition: transform var(--dur) var(--ease);
}

.drawer__group[open] > .drawer__summary .drawer__caret { transform: rotate(180deg); }

.drawer__children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 var(--s-2) var(--s-4);
  padding-left: var(--s-2);
  border-left: 1px solid var(--rule);
}

.drawer__child { font-size: var(--t-sm); }

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

/* Opt-in actions pinned to the top of the drawer (tour, support). Boxed so
   they read as actions, not nav, and stay reachable without scrolling the
   long section list below. */
.drawer__quick {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: var(--s-3) var(--s-4) 0;
  padding: var(--s-1) var(--s-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
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

/* A quieter legal row on its own line, so it reads as fine print rather than
   competing with the primary footer nav. */
.foot__legal {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-4);
  width: 100%;
  margin-top: var(--s-3);
  padding-top: var(--s-3);
  border-top: 1px solid var(--rule);
}

.foot__legal a {
  font-size: var(--t-xs);
  color: var(--text-muted);
  text-decoration: none;
}

.foot__legal a:hover { color: var(--celeste-deep); text-decoration: underline; }

.foot__gh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* ---- Responsive ---- */
/* Nav spacing and the search width are held constant across every width
   where the horizontal bar shows (≥900px). A spacing *step* inside that
   range would make widening the window drop a section into the "Más" menu
   — a bigger screen showing fewer links. Uniform metrics keep the overflow
   count strictly monotonic in width. */

@media (max-width: 900px) {
  .topnav { display: none; }
  .iconbtn--menu { display: grid; }
  /* Brand width stays constant above 900px (keeps the fit monotonic); the
     tagline only drops once the drawer, not the bar, owns navigation. */
  .brand__tag { display: none; }
}

@media (max-width: 620px) {
  .topsearch { display: none; }
  .brand__name { font-size: 0.875rem; }
  .brand { flex: 1 1 auto; }
  .brand, .brand__text { min-width: 0; }
  .brand__name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .foot__links { margin-left: 0; }

  /* 96px above the footer plus the page's own bottom padding left a
     ~160px void on phones. Halve the footer's own contribution. */
  .foot { margin-top: var(--s-6); }
  .foot__inner { padding-block: var(--s-5); }

  /* The drawer carries the theme and language controls on a phone, so
     the bar keeps only the brand and the menu. This is also what was
     pushing 27px of horizontal overflow at 360px. */
  .topbar__actions .iconbtn:not(.iconbtn--menu) { display: none; }
  .topbar__inner { gap: var(--s-2); }
}

@media (max-width: 340px) {
  /* Keep the menu, brand mark and account action inside the narrowest
     supported viewport. The link keeps its accessible name via aria-label. */
  .brand__text { display: none; }
}
</style>

<!-- Top-bar dropdowns (overflow "Más", account, language) teleport to the overlay
     container, outside this component's scoped styles — so this block is global.
     Vuetify's list default renders item text at 16px, a size jump over the 13px
     bar links; pin them to --t-sm so an opened menu reads as one system with the
     bar it drops from. -->
<style>
.navmenu .v-list-item-title {
  font-size: var(--t-sm);
  font-weight: 500;
  letter-spacing: normal;
}

.navmenu .v-list-item {
  min-height: 38px;
  padding: var(--s-1) var(--s-4);
}

.navmenu .v-list-item__prepend > .v-icon {
  font-size: 20px;
  opacity: 0.85;
  margin-inline-end: 0;
}

/* Vuetify reserves a 40px spacer after a prepend icon. Together with the
   previous icon margin this left a 40px visual hole before every label.
   Keep the framework's prepend slot, but size its spacer to our rhythm. */
.navmenu .v-list-item__prepend > .v-list-item__spacer {
  width: var(--s-3);
}
</style>
