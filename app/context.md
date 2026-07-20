# app/ — Nuxt 3 dashboard (frontend)

The public + signed-in web UI of "Con la tuya, contribuyente": Nuxt 3.19.3 SSR (Vue 3, Vuetify 4, Pinia, `@nuxtjs/i18n` es/en) rendering Uruguayan OCDS procurement data — explorers, anomaly/analytics surfaces, long-form investigations, an open-call ("llamados") monitor, and an authenticated `/app` area. SSR-first on purpose: public pages fetch with `useFetch` in setup so numbers land in crawlable HTML, and every page declares its own SEO via `useSeo()`. Much of [nuxt.config.ts](nuxt.config.ts) is deliberate performance surgery (Vuetify tree-shaking, MDI/utility CSS subsets, `inlineStyles: false`, lazy Firebase/driver.js) — read the inline comments before "simplifying". This file covers `app/` **minus** `app/server/` (the Nitro API), which has its own context.

## Map

| Path | Purpose |
| --- | --- |
| [nuxt.config.ts](nuxt.config.ts) | The whole build contract: modules, `#shared` alias, css subsets, Vuetify tree-shake hook, i18n, sitemap/robots, PWA, gtag, `runtimeConfig.public`, `app.head`, nitro. Every block carries a load-bearing comment. `devServer.port` 3600 (:373). |
| [DESIGN.md](DESIGN.md) | Binding design contract — read before ANY UI change: gold=money, peso magnitude rule, tokens, CellLink/ChartBlock/StatusChip rules, copy rules, data truths. |
| [app.vue](app.vue) | Root: `NuxtLayout`+`NuxtPage`, `useLocaleHead`, titleTemplate fallback, `<ConsentBanner>` mounted outside the page tree. |
| [error.vue](error.vue) | 404/500 page. Renders outside the page tree so it calls `useSeo({ noindex: true })` itself. |
| [layouts/default.vue](layouts/default.vue) | The ONLY layout (~1450 lines). Top bar + priority-overflow nav (hidden measuring rail + "Más" menu), Análisis/Investigaciones dropdowns, search, locale/theme toggles, TourLauncher, DonationLauncher, NotificationBell, account menu, mobile drawer, footer, `<DonationCard>`, `<TourHost>`. Add a nav section by editing `nav` (:26). |
| [pages/index.vue](pages/index.vue) | Home/dashboard. 7 parallel `useFetch` in ONE `Promise.all` (sequential awaits cost ~2.5s TTFB) + WebSite JSON-LD/SearchAction. |
| [pages/gastos.vue](pages/gastos.vue) | "A dónde va tu plata" — single scrollable narrative, all SSR. |
| [pages/estadisticas.vue](pages/estadisticas.vue) | Statistics led by spend-by-supplier-TYPE (the AI enrichment lens the explorer can't give). |
| [pages/contracts/index.vue](pages/contracts/index.vue) | Contract explorer: FilterRail + KPIs + DataTable + PaginatedList; tour anchors `explorer-filters`/`kpis`/`table`; noindex on filtered permutations. |
| [pages/contracts/[id].vue](pages/contracts/[id].vue) | Contract detail — largest page in the repo. `useLazyFetch`, `#shared/utils/units`, ContractTimeline/Parties/Documents/AwardsDialog/RawDataDialog, MandateChip, gov source links. |
| [pages/suppliers/index.vue](pages/suppliers/index.vue), [`[...id].vue`](pages/suppliers/[...id].vue) | Supplier directory + profile (DEI panel/chip/map, anomalies, mandate context). Catch-all route because supplier ids contain slashes. |
| [pages/buyers/](pages/buyers) | `index.vue` + `[id].vue` — public-body directory and profile. |
| [pages/products/](pages/products) | `index.vue` + `[code].vue` — what the state buys by SICE catalogue code over precomputed `product_analytics`; `[code]` adds price dispersion + variants. |
| [pages/analytics/](pages/analytics) | Detection/analysis family, hub at `index.vue`: `anomalies.vue`, `unexplained.vue`, `errores-carga.vue` (reportable load errors + ReportErrorDialog), `proveedores-anomalias.vue`, `intendencias.vue`, `organismos.vue`, `partidos.vue` (choropleth), `mapa.vue` (treemap), `como-reportar.vue`. |
| [pages/investigaciones/](pages/investigaciones) | 8 long-form investigations (`index`, `tv-ciudad`, `casinos`, `casinos-cortesia`, `intendencia-montevideo`, `empresas-senaladas`, `asse-ambulancias`, `frigorifico-saturno`). Pure chrome over `app/data/*.ts` — NO API calls. |
| [pages/curros/](pages/curros), [pages/recopilatorios/](pages/recopilatorios) | `index.vue` + `[slug].vue` each. Chrome over `/api/curros` and `/api/recopilatorios`; the case/compilation definitions live server-side. |
| [pages/llamados/](pages/llamados) | `index.vue` (browse) + `[compraId].vue` (detail with PliegoSummary, CallBenchmarks, CallBidEstimate, AudienceHook). "Create alert" CTA hidden when auth is off. |
| [pages/app/](pages/app) | Signed-in area: `index`, `alertas`, `notificaciones`, `calendario`, `cuenta`, `api-keys`, `webhooks`. All `definePageMeta({ middleware: 'auth' })` + `useSeo({ noindex: true })` + `useMonitorApi()`. |
| [pages/login.vue](pages/login.vue), [registro.vue](pages/registro.vue), [recuperar.vue](pages/recuperar.vue), [auth/callback.vue](pages/auth/callback.vue) | Auth pages, `middleware: 'guest'`. `registro.vue` honours `?rubro=` (cold-email pre-created watch via `utils/rubro-watch.ts`). |
| [pages/about.vue](pages/about.vue), [developers.vue](pages/developers.vue), [pauta.vue](pages/pauta.vue), [cookies.vue](pages/cookies.vue), [privacidad.vue](pages/privacidad.vue), [terminos.vue](pages/terminos.vue), [unsubscribe.vue](pages/unsubscribe.vue) | Static/legal + state-advertising spend (`/api/pauta`). The three legal pages render prose from `utils/legal-content.ts` via `<LegalArticle>`. |
| [components/](components) | 53 flat auto-imported `.vue` files (+3 in `charts/`). Load-bearing primitives: `MoneyAmount`, `DataTable`, `PaginatedList`, `DataPager`, `CellLink`, `ChartBlock`, `StatusChip`, `ReportedFigure`, `EntityAutocomplete` (+ Supplier/Product/AnomalyFacet wrappers), `FilterRail`, `MandateChip`/`MandateTimeline`, `MoneyConvert`, `DeiPanel`/`DeiChip`/`DeiMap`/`DeiInsights`, `WatchForm`, `TourHost`/`TourLauncher`, `ConsentBanner`. |
| [components/charts/](components/charts) | DEAD — `SpendingChart.vue`, `SpendingTrends.vue`, `CategoryDistribution.vue`. Nothing outside this folder renders them. |
| [composables/](composables) | `useSeo`, `useAuth`, `useAuthEnabled`, `useConsent`, `useAnalytics`, `useTour`, `useMonitorApi`, `useWebPush`, `usePwaInstall`, `useAudience`, `useContractTitle` — plus 4 dead files (see Gotchas). |
| [utils/money.ts](utils/money.ts) | `magnitude`, `formatMoney`, `formatNumber`, `formatCount` + the fixed site-wide gold log domain `MAG_MIN_LOG=2` / `MAG_MAX_LOG=10` (:18-20). |
| [utils/contract.ts](utils/contract.ts) | ALL OCDS extraction: `contractTitle/Amount/Currency/Suppliers/Date/Year/Items`, `contractTags`/`primaryTag`/`isMoneyStage`/`tagTone`, `statusTagClass`, `formatDate/DateLong/DateTime` (UTC on purpose), `govSourceUrl` (:351)/`govAwardUrl`/`ocdsJsonUrl`. |
| [utils/](utils) (rest) | `analytics-events.ts` (typed event union), `tours.ts`, `legal-content.ts`, `party-comparison.ts`, `uruguay-departments.ts`, `rubro-watch.ts`, `auth-error.ts`, `currencyFormatterContract.ts`, `index.ts` (re-exports only `currencyFormatterContract`). Auto-imported by Nuxt. |
| [data/](data) | Static verified investigation datasets + bilingual copy: `investigaciones.ts`, `investigaciones-empresas.ts`, `investigaciones-im.ts`, `investigaciones-tvciudad.ts`. Each exports typed consts + an `xContent(locale)` accessor. |
| [assets/scss/_tokens.scss](assets/scss/_tokens.scss) | Source of truth for colour (`--sol`/`--money`, `--celeste`, `--alerta` + `--alerta-fg`, `--cta-fill` + `--cta-fg`). |
| [assets/scss/main.scss](assets/scss/main.scss) | Vuetify-4 reset restore inside `@layer vuetify-core.reset` (:16), `.u-*` utilities, `.panel`, `.tag--*`, `.cell-link` fix. Plus `_investigaciones.scss`, `_tour.scss`. |
| `assets/scss/{vuetify-base.css, vuetify-utilities-subset.css, mdi-subset.scss}`, `assets/fonts/mdi-subset.woff2` | GENERATED + committed CSS/font subsets. Regenerate with the repo-root builders; `app` prebuild `--check`s them. |
| [assets/geo/uruguay-dept-paths.ts](assets/geo/uruguay-dept-paths.ts) | SVG path per department, keyed by Intendencia `buyer.id` (80-1…98-1). Baked by `npm run build-uruguay-geo`; runtime never fetches geometry. |
| [i18n/locales/es.json](i18n/locales/es.json), [en.json](i18n/locales/en.json) | 52 top-level keys each, verified identical key order. Spanish is the source of truth. |
| [middleware/auth.ts](middleware/auth.ts), [guest.ts](middleware/guest.ts) | Route gates; both bail to `/` when `useAuthEnabled()` is false. |
| [plugins/vuetify.ts](plugins/vuetify.ts) | `createVuetify`: themes `contribuyente`/`contribuyenteDark` (hex mirrors `_tokens.scss`), v3 breakpoint thresholds restored (:82-83), global component defaults. Components deliberately NOT imported here. |
| [plugins/analytics.client.ts](plugins/analytics.client.ts) | GA4: consent gate, manual `page_view`, delegated outbound/document-open listener, SHA-256'd user_id. |
| [plugins/firebase.client.ts](plugins/firebase.client.ts) | Provides `$firebaseAuth` as a LAZY getter (SDK imported on first sign-in call, not at boot). |
| [plugins/auth.server.ts](plugins/auth.server.ts) | Seeds `useState('auth:user')` from `event.context.user` so the first SSR render has correct chrome. |
| [plugins/database.server.ts](plugins/database.server.ts) | No-op that only `console.log`s — disabled on purpose (DB connections happen per API route). |
| [service-worker/sw.ts](service-worker/sw.ts) | `injectManifest` SW: precache hashed assets only (NO runtime caching), push + notificationclick handlers. |
| [public/](public) | favicons, PWA icons, `og-default.png` (built by `npm run build:og-image`), `llms.txt`. |
| [types/index.ts](types/index.ts), [types/database.ts](types/database.ts) | `ApiResponse`/`PaginatedResponse` envelopes + legacy DB types. Mostly consumed by the dead `useApi`/`stores/dashboard.ts` chain. |
| [stores/dashboard.ts](stores/dashboard.ts) | DEAD Pinia store (only `components/charts/SpendingChart.vue` and `composables/useDashboardMetrics.ts` reference it). |
| [tsconfig.json](tsconfig.json) | `verbatimModuleSyntax`, `moduleResolution: bundler`, paths `#shared/*` and `shared/*` → `../shared/*`; `include` pulls in `../shared/**/*`. |
| `server/` | The Nitro API — separate subsystem, not covered here. |

## Entry points / how to run

```bash
cd app && npm run dev            # Nuxt dev server on http://localhost:3600
cd app && npm run build          # prebuild gates (node version + mdi + vuetify subsets), then nuxt build
cd app && npm run preview        # serve the production build
cd app && npm run lint           # eslint .
cd app && npm run lint:fix
cd app && npm run type-check     # nuxt typecheck — see Gotchas, typeCheck is off in the build

# app/.env points at a stale local Mongo; to render real data:
cd app && MONGODB_URI=<root .env value> npm run dev

# Regenerate committed assets (from the REPO ROOT, not app/):
npm run build:mdi-subset ; npm run check:mdi-subset
npm run build:vuetify-utilities ; npm run check:vuetify-utilities
npm run build:og-image
npm run build-uruguay-geo

# Deploy (repo root): atomic swap + health check + rollback
npm run deploy:dashboard:dry
npm run deploy:dashboard
```

## Conventions

| Rule | Cite |
| --- | --- |
| **Money**: never format an amount by hand, never put a peso figure in a plain `<span>`. Use `<MoneyAmount :amount :currency>` (38 call sites). Its gold rule uses the FIXED site-wide log domain — never derive scale from the current view. | [components/MoneyAmount.vue](components/MoneyAmount.vue), [utils/money.ts:18-20](utils/money.ts) |
| **Colour**: no hardcoded hex in a component — use the CSS custom properties. Filled CTAs use the `--cta-fill`/`--cta-fg` pair, alert fills `--alerta`/`--alerta-fg`; both invert in dark mode, so a hardcoded `#fff` label fails contrast. `--sol`/`--money` is reserved for money and nothing else. | [assets/scss/_tokens.scss](assets/scss/_tokens.scss), [DESIGN.md:15](DESIGN.md) |
| The Vuetify theme palette mirrors `_tokens.scss` **by hand** — the two files must move together. | [plugins/vuetify.ts](plugins/vuetify.ts) |
| **Copy**: no hardcoded user-facing strings. `t('...')` only; add the key to BOTH locale files in the SAME position (52 top-level keys, identical order). Spanish is source of truth. | [i18n/locales/es.json](i18n/locales/es.json) |
| **SEO**: every page calls `useSeo({ title, description, path })` with its own copy and a locale-LESS path (`useSeo` runs `localePath()` on it). Detail pages add `jsonLd`; private/derived pages pass `noindex` (8 pass a literal `true`, ~9 more conditionally, e.g. `noindex: notFound.value`). | [composables/useSeo.ts:40,75-82](composables/useSeo.ts) |
| **Fetching**: public pages use `useFetch` in setup (SSR), and INDEPENDENT calls go in one `Promise.all`. Sequential awaits were a measured TTFB regression. | [pages/index.vue](pages/index.vue), [pages/app/index.vue](pages/app/index.vue) |
| Client-side mutations/queries in the signed-in area go through `useMonitorApi()` — a typed `$fetch` facade grouped by resource (watches, openCalls, savedCalls, calendar, feedback, account, notifications, telegram, categories, apiKeys, webhooks). | [composables/useMonitorApi.ts](composables/useMonitorApi.ts) |
| **Auth**: read state via `useAuth()` (facade over `useState('auth:user')` + the SSR session cookie). `firebase/auth` is imported DYNAMICALLY inside each action — never add a static top-level firebase import. | [composables/useAuth.ts](composables/useAuth.ts), [plugins/firebase.client.ts](plugins/firebase.client.ts) |
| Gate every auth-dependent UI on `useAuthEnabled()` (true only when `runtimeConfig.public.firebase.apiKey` is present). | [composables/useAuthEnabled.ts](composables/useAuthEnabled.ts) |
| Protected pages: `definePageMeta({ middleware: 'auth' })` + `useSeo({ noindex: true })`. Auth pages: `middleware: 'guest'`. | [pages/app/alertas.vue](pages/app/alertas.vue), [middleware/guest.ts](middleware/guest.ts) |
| **Analytics**: nothing calls `gtag()` directly. Use `const { track } = useAnalytics()` with a name from the `AnalyticsEvent` union — an unlisted name is a type error. Params carry shape, never identity (a BLOCKED_KEY regex strips email/token/uid). | [utils/analytics-events.ts](utils/analytics-events.ts), [composables/useAnalytics.ts](composables/useAnalytics.ts) |
| **Tables**: `<DataTable>` (one semantic table, reflows to cards, cell content via `#cell:<key>` slots) + `<PaginatedList>` (owns both pagers + scroll-to-top) + `<DataPager>`. Row action links are `<CellLink>`, never a hand-rolled `v-btn` append-icon. | [components/DataTable.vue](components/DataTable.vue), [DESIGN.md](DESIGN.md) |
| **Charts**: always inside `<ChartBlock>`, which owns heading/help/panel AND the overflow (`min-width: 0` at every level; the only scroll container). Never a bare `1fr` grid track around a chart — use `minmax(0, 1fr)`. | [components/ChartBlock.vue](components/ChartBlock.vue), [DESIGN.md:110](DESIGN.md) |
| **Status/claims**: `<StatusChip :status :label>` for fixed-vocabulary legal status; an attributed prose claim goes in `<ReportedFigure>`; quoted press figures stay plain ink — MoneyAmount gold means "derived from this data". | [components/StatusChip.vue](components/StatusChip.vue), [components/ReportedFigure.vue](components/ReportedFigure.vue) |
| **OCDS extraction is never re-improvised** — import from `utils/contract.ts`. | [utils/contract.ts](utils/contract.ts) |
| Government source links derive from `ocid`, NEVER from `id` — they differ on adjustment/cancellation releases and `id` lands on an unrelated real contract. | [utils/contract.ts:351](utils/contract.ts), [DESIGN.md:185-188](DESIGN.md) |
| Autocompletes wrap `<EntityAutocomplete>` (300ms-debounced server typeahead + label cache + synthetic selected items). Concrete wrappers: `SupplierAutocomplete`, `ProductAutocomplete`, `AnomalyFacetAutocomplete`. | [components/EntityAutocomplete.vue](components/EntityAutocomplete.vue) |
| Tour anchors are `data-tour="..."` attributes; step lists live in `utils/tours.ts` and copy under the i18n `tour.*` block. A new step = attribute + step + both locale keys. | [utils/tours.ts](utils/tours.ts) |
| Nav links use `localePath()`. `<component :is="'NuxtLink'">` does NOT resolve a string — resolve the component object once. `/docs` is a Nitro route, so it must be a real `<a>`. | [layouts/default.vue:4-8](layouts/default.vue) |
| A new investigation page = static chrome over a typed module in `data/` (never live queries) + an entry in the `investigaciones` children array. | [layouts/default.vue:48-56](layouts/default.vue) |

## Gotchas

- **DEAD CODE, do not extend** (verified closed loop — nothing outside it imports these): [composables/useApi.ts](composables/useApi.ts), [composables/useOptimizedApi.ts](composables/useOptimizedApi.ts), [stores/dashboard.ts](stores/dashboard.ts), [composables/useDashboardMetrics.ts](composables/useDashboardMetrics.ts), [composables/useAnomalies.ts](composables/useAnomalies.ts), and all three of [components/charts/](components/charts). Replaced by direct `useFetch` in pages + `useMonitorApi()` for mutations. `useApi.ts` even hardcodes `http://localhost:3600` for SSR. Verify with `grep -rln "useApi\b\|useDashboardStore\|SpendingChart" pages components composables stores`.
- **[plugins/database.server.ts](plugins/database.server.ts) is an intentional no-op** that only `console.log`s. Don't "fix" it — DB connections happen per API route.
- **The CSS subsets are generated, committed, and gated.** `nuxt.config.ts` does NOT import `vuetify/styles` or `@mdi/font`; the css[] entries `assets/scss/vuetify-base.css`, `vuetify-utilities-subset.css`, `mdi-subset.scss` are build artifacts. `app/package.json`'s `prebuild` runs `check-node.mjs` + `build-mdi-subset.mjs --check` + `build-vuetify-utilities-subset.mjs --check`. **Using a new `mdi-*` icon or a new Vuetify utility class fails `cd app && npm run build`** until you run `npm run build:mdi-subset` / `npm run build:vuetify-utilities` at the repo root and commit the regenerated files.
- **Never re-add `import * as components from 'vuetify/components'`** to [plugins/vuetify.ts](plugins/vuetify.ts). Components are auto-resolved per template by `vite-plugin-vuetify` ([nuxt.config.ts:108-121](nuxt.config.ts)); the eager import drags ~1MB JS + ~250KB CSS into the entry bundle. Directives stay eager because the resolver can't see them.
- **`features.inlineStyles: false`** ([nuxt.config.ts:88](nuxt.config.ts)) is deliberate — the default inlined ~970KB of CSS into every SSR response (FCP 13s on mobile). Do not re-enable.
- **`sourcemap: { server: false, client: false }`** ([nuxt.config.ts:47](nuxt.config.ts)): server maps race the build on Windows (ENOENT in `.nuxt/dist/server`), and a malformed client map crashed Lighthouse's errors-in-console audit, nulling a whole category.
- **`nitro.compressPublicAssets: false`** ([nuxt.config.ts:291](nuxt.config.ts)): Nitro only writes `.br` above a size threshold but lists every chunk in the manifest → 500s (not 404s) for small chunks after a redeploy, defeating Nuxt's stale-chunk reload.
- **`alias['#shared'] = ../shared`** ([nuxt.config.ts:49-55](nuxt.config.ts)) exists because Nuxt's built-in `#shared` points at `app/shared`, which does not exist. Any PAGE importing `#shared/...` fails the production build without it. Real users: `pages/contracts/[id].vue`, `MandateChip`/`MandateTimeline`, `MoneyConvert`/`ContractPreviewDialog`, `utils/party-comparison.ts`.
- **`typescript.typeCheck: false`** ([nuxt.config.ts:60](nuxt.config.ts)) — vue-tsc chokes on `shared/` models outside `app/`. There are no tests for pages; verify against a running dev server on :3600 (`curl` the route), not `npm run type-check`.
- **Mongo credentials must NOT go in `runtimeConfig`** ([nuxt.config.ts:299 area](nuxt.config.ts)) — a runtimeConfig default is baked into the build output at BUILD time and once leaked the prod DB password into every deploy artifact. Keep secrets in `process.env`, read at runtime.
- **[app/firebase.json](firebase.json) is gitignored and read at BUILD time** ([nuxt.config.ts:12-31](nuxt.config.ts)). If it's absent and `NUXT_PUBLIC_FIREBASE_API_KEY` isn't set, `useAuthEnabled()` is false and the ENTIRE auth surface silently disappears — dev shows the login button, prod may not.
- **GA4 `initMode: 'manual'` + `send_page_view: false`** ([nuxt.config.ts:148-151](nuxt.config.ts)). `page_view` is sent by hand in [plugins/analytics.client.ts](plugins/analytics.client.ts) because SSR + i18n prefix routes + pageTransition make gtag's History listener double-count. On localhost the pipeline is dry-run (console.debug) unless `?ga_debug=1`.
- **Consent lives in a first-party COOKIE (`cltc-consent`), not localStorage** ([composables/useConsent.ts](composables/useConsent.ts)) — specifically so the banner can be server-rendered; localStorage made it slide in after FCP. `denied` means gtag.js is never loaded at all.
- **The PWA has NO runtime caching by design** ([nuxt.config.ts:169-172](nuxt.config.ts), [service-worker/sw.ts](service-worker/sw.ts)): SSR pages and `/api` must never be served stale. The SW is disabled in `nuxt dev` — test installability against a production preview.
- **`i18n.detectBrowserLanguage: false`** ([nuxt.config.ts:235](nuxt.config.ts)) — never let Accept-Language bounce a Uruguayan visitor to `/en`. Strategy is `prefix_except_default` with `defaultLocale: 'es'`.
- Sitemap excludes `/app/**`, `/auth/**`, `/unsubscribe` and robots disallows `/app` + `/auth/` — but `/api/` is deliberately NOT disallowed (blocking it would let a crawler render pages with missing data). See [nuxt.config.ts](nuxt.config.ts) sitemap/robots blocks.
- **Vuetify 4 shrank the breakpoint thresholds**; [plugins/vuetify.ts:82-83](plugins/vuetify.ts) restores v3 values (md 960, lg 1280, xl 1920) and sets `mobileBreakpoint: 'lg'`. Vuetify 4 also dropped the global CSS reset — [assets/scss/main.scss:16](assets/scss/main.scss) re-applies it inside `@layer vuetify-core.reset`; removing it makes 40+ native controls sprout browser chrome.
- **The top-bar overflow nav measures a hidden off-screen rail** ([layouts/default.vue](layouts/default.vue), `navRailEl` :166). It is positioned at `left: -99999px` — never `left: 0`, which would itself scroll the page. Nav spacing must stay constant ≥900px or widening the window can DROP a link into "Más".
- **driver.js (tour) and firebase are both lazily imported on first use** ([composables/useTour.ts](composables/useTour.ts), [plugins/firebase.client.ts](plugins/firebase.client.ts)). Do not hoist either to a static import — both were measured critical-path regressions.
- **Data truths that constrain UI** ([DESIGN.md:167-188](DESIGN.md)): never show an all-time grand total (3 records ≈ 86% of the raw sum — use `stats.medianValue`); `tender.status` is null on 91.56% of docs so it can't be a primary filter; all anomalies are `price_spike`; `dashboard_metrics` is a stale snapshot — label it with `calculatedAt` and never render `currentYearGrowth`.
- **[app/.env](.env) points at a stale local Mongo.** To verify a page against real data run `MONGODB_URI=<root .env value> npm run dev` from `app/` ([DESIGN.md:154](DESIGN.md)).
- Multiple agent sessions share ONE working tree: check the branch first, stage explicit paths, never `git add -A`.

## Related

- [server/context.md](server/context.md) — the Nitro API (`app/server/**`) this UI fetches from. Every `/api/...` string in `pages/` is a file-routed handler there.
- [../shared/context.md](../shared/context.md) — models, connection, and the pure helpers reachable from the UI via the `#shared` alias (`#shared/utils/units`, `#shared/utils/real-value`, `#shared/political-mandates`, `#shared/types`).
- [../src/context.md](../src/context.md) — ingestion + the batch/job layer that writes every precomputed collection these pages read (`product_analytics`, `organism_group_stats`, `dept_indicators`, `anomalies`, `dashboard_metrics`, …).
- [../scripts/context.md](../scripts/context.md) — the asset builders gated in `app` prebuild, plus `deploy-dashboard.mjs`.
- [../CLAUDE.md](../CLAUDE.md) — repo-wide instructions.
- [DESIGN.md](DESIGN.md) — the binding design contract; read it before any UI change.
