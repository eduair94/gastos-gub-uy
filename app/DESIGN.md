# Con la tuya, contribuyente — design system

The one-page contract every screen follows. Read this before touching UI.

## The subject

Uruguayan public procurement (OCDS data from Compras Estatales). The
audience is citizens, journalists, watchdogs and suppliers. The job of
every page: **find where public money went, and judge whether it looks
right.** The product name is an Uruguayan idiom — roughly "on your dime,
taxpayer". The register is plain and a little wry, never salesy.

## The one rule: gold is money

`--sol` / `--money` is reserved for peso amounts. **Nothing else on the
site is gold.** Not a CTA, not an icon, not an accent. If it isn't public
money, it isn't gold.

## Signature: the peso magnitude rule

Every amount renders through `<MoneyAmount>`, which draws a hairline gold
bar under the figure. Its length is `log10(amount)` normalised over a
**fixed, site-wide domain** (1e2..1e10 UYU) — see `utils/money.ts`.

The scale is deliberately global: a bar means the same thing on the
dashboard, in the explorer table and on a detail page, so readers learn
to read magnitude before digits. **Never** derive the scale from the max
of the current view — that would make it shift under the reader as they
filter.

```vue
<MoneyAmount :amount="contractAmount(c)" :currency="contractCurrency(c)" compact />
<MoneyAmount :amount="total" size="xl" align="start" />   <!-- headline -->
<MoneyAmount :amount="x" :rule="false" />                 <!-- no siblings to compare -->
```

Never format an amount by hand. Never put a peso figure in a plain `<span>`.

## Tokens — `assets/scss/_tokens.scss`

Use CSS custom properties. Never hardcode a hex value in a component.

| Token | Role |
|---|---|
| `--ink` `#0f2233` | document ink; text, dark surfaces |
| `--paper` `#eef1f2` | official form paper (cool — NOT cream) |
| `--celeste` `#5e93c4` / `--celeste-deep` | structure, links, interactive |
| `--sol` `#d9a441` | **money only** |
| `--money` | money as *text* (auto-swaps per theme for contrast) |
| `--alerta` `#b2423b` | anomalies / flags |
| `--verde` `#3f7d62` | active status |
| `--text` `--text-muted` `--rule` `--surface` `--bg` | semantic |

Spacing `--s-1..--s-9`, radius `--r-sm/md/lg/full`, type `--t-xs..--t-3xl`.

## Type

- **Archivo** (`--font-display`) — headings. Wide cut (`font-stretch: 112%`),
  it reads like the title block of an official form. Used with restraint.
- **Public Sans** (`--font-body`) — body. A face designed for public information.
- **IBM Plex Mono** (`--font-mono`) — money, IDs, dates, table labels, eyebrows.
  Always `font-variant-numeric: tabular-nums` for figures.

Utility classes in `main.scss`: `.u-hero .u-eyebrow .u-lead .u-mono .u-muted
.u-container .u-truncate .u-clamp-2 .u-scroll-x .panel .tag .tag--activo
.tag--alerta .tag--celeste .tag--neutral`.

## Structure is information

Eyebrows name a real category of thing. **Do not use numbered markers
(01/02/03)** unless the content genuinely is an ordered sequence — a
timeline of tender→award qualifies; a list of suppliers does not.

## Copy

- Spanish is the source of truth (`i18n/locales/es.json`); `en.json` mirrors it 1:1.
- **Never hardcode a user-facing string.** Always `t('...')`. Add keys to
  BOTH locale files, same key order.
- Plain verbs, sentence case, active voice, no filler. Be specific over clever.
- Errors say what happened and how to fix it. They never apologise, never vague.
- Empty states invite an action.
- Number/date formatting: `formatMoney` `formatNumber` `formatCount`
  `formatDate` `formatDateLong` (all es-UY) from `utils/`.

## Data helpers — `utils/contract.ts`

The OCDS shape is deep and inconsistent. Never re-improvise extraction:
`contractTitle` `contractAmount` `contractCurrency` `contractSuppliers`
`contractDate` `contractYear` `contractItems` `isMixedCurrency`
`statusTagClass` `govSourceUrl`.

## Data truths (verified against the live DB — do not contradict these)

- **The dev server reads `app/.env`, not the repo-root `.env`.** `app/.env`
  points at `mongodb://localhost:27017` — a stale ~1.89M-doc local copy.
  The live DB is in the root `.env`. To verify against real data, override:
  `MONGODB_URI=<root value> npm run dev`. Anyone testing from `app/` is
  otherwise testing the wrong database.
- `releases` holds **2,171,928** docs (live). `date` is a real **BSON Date**
  — the schema comments it out and it survives via `strict:false`, but a
  `migrate-dates.ts` run already converted it (`$type:'string'` matches 0).
  No `$dateFromString` needed.
- Money lives at `awards[].items[].unit.value.amount`; pre-normalised to UYU
  at `amount.primaryAmount` = **unit price × quantity**.
- **Never show an all-time grand total.** A handful of source records carry
  corrupt quantities: `adjudicacion-1318822` multiplies USD 519,788.85 by a
  quantity of 1,200,007 generators → USD 623bn, ~8× Uruguay's GDP, in one
  contract. **3 records = 86% of the 30.9T sum; 13 records = 92.8%.**
  Excluding them the real total is ~2.24T UYU, and the median contract is
  **16,680 UYU**. Use the median (`stats.medianValue`) for headline money.
  Do NOT hide the outliers from filtered views — the source's number is the
  source's number, and the page links to the official PDF.
- **`tender.status` is null on 91.56%** of docs. Never present it as a
  primary filter or imply coverage it doesn't have.
- **`tender.procurementMethodDetails`** carries the real Spanish procedure
  names (Compra Directa, Licitación Abreviada, Concurso de Precios, Compra
  por Excepción, Licitación Pública). It is null on 69.31%.
  `tender.procurementMethod` is only the English OCDS enum — don't show it.
- **All 964 anomalies are `price_spike`.** The other enum types are never
  generated. Don't build UI for types that don't exist.
- `dashboard_metrics` is a **stale snapshot** (says 1.89M vs 2.17M actual,
  and `currentYearGrowth: -100` is garbage). Never render `currentYearGrowth`.
  Label totals with `calculatedAt`.
- Every release links to its official **public page**:
  `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/{id_compra}`
  where `id_compra` is the **ocid** with `ocds-<prefix>-` stripped. Use the API's
  `sourceUrl` field, or `govSourceUrl(ocid)`. **Every detail page must link to the source.**
  - **Derive from `ocid`, NEVER from `id`.** They differ on adjustment/cancellation
    releases and `id` lands on an unrelated contract: `ajuste_llamado-47064` has ocid
    `ocds-yfs5dr-1356289` → `/id/1356289` is Compra Directa 1240/2026, while `/id/47064`
    is Compra Directa 1023/2005. Verified for numeric, legacy `a100` and `i455643` ocids.
  - `/ocds/release/{id}` is the raw OCDS **JSON API**, not a human page — that's
    `ocdsJsonUrl(id)`, a secondary link at most.

## Quality floor (non-negotiable)

- Responsive to 360px. Wide content scrolls in its own `.u-scroll-x`; the
  page body never scrolls sideways.
- Visible keyboard focus (handled globally — don't remove outlines).
- `prefers-reduced-motion` respected (handled globally).
- Every page calls `useSeo({ title, description, path })` with its own copy.
  Detail pages add JSON-LD. Never ship the same title on two routes.
- SSR: use `useFetch` (not client-only fetch) so content is in the HTML.
- Vuetify defaults are set in `plugins/vuetify.ts`; don't re-style per page.

## Motion

Restrained. Hover/focus transitions and one page-load reveal at most.
Scattered animation is what makes a page read as machine-made.
