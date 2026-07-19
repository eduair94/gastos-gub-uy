# Audience Hook — Design

**Date:** 2026-07-18
**Status:** Approved, implementing

## Problem

The AI pliego (bidding-document) summary shown on the open-call detail page
(`PliegoSummary.vue`) is expensive to generate (PDF extraction + Gemini) and not
ready to feature. Its empty state is a dead tombstone ("El resumen del pliego
todavía no está disponible"). That slot — where a user is already looking at a
specific open tender — is high-intent real estate wasted.

We want to (1) defer the AI summary behind a "Coming soon" state, and (2) turn
that slot plus the `/llamados` index into an **audience-segmented hook** that
converts three distinct visitors:

- **Empresas / bidders** — companies deciding whether and at what price to bid.
- **Ciudadanos / prensa** — citizens and journalists following public spending.

The site already owns assets that map to each audience:
- Bidders → historical award prices (benchmarks), tender alerts, deadline reminders.
- Citizens/press → anomaly/overprice detection, spending explorers.

## Decisions

- **Scope:** detail-page slot **+** a hook band above the `/llamados` grid.
- **Segmentation:** by audience, via a toggle (`Empresa` | `Ciudadano / Prensa`).
- **AI summary:** universally gated OFF behind a `AI_SUMMARY_ENABLED = false`
  constant for consistent UX. Existing render kept intact for a one-line flip
  later. No endpoint/cron changes.

## Components

### `app/composables/useAudience.ts`
Persisted segment selection so the toggle stays consistent across the índice band,
the detail slot, and navigation.
- Backed by `useState<'empresa' | 'ciudadano'>('audience', ...)`.
- Hydrates from / writes to `localStorage` (key `gg.audience`) on the client.
- Default: `empresa` (someone on an open tender is usually a bidder).

### `app/components/AudienceHook.vue`
Pure segmented value + CTAs. No "coming soon" text of its own (reused in a general
band context).
- Props: `variant: 'slot' | 'band'`, `compraId?: string`.
- Renders the segment toggle (chips) bound to `useAudience()`.
- Per segment: 2–3 value lines + contextual CTA(s).

**Content**

| Segment | Value lines | CTAs |
|---|---|---|
| Empresa | · Alerta apenas abre un llamado de tu rubro · Mirá a cuánto adjudicó el Estado antes de cotizar | → Crear alerta (band: prefill current search `q`) · → Ver precios históricos (slot: `#benchmarks` anchor; band: analytics) |
| Ciudadano / Prensa | · Seguí la plata: quién compra, a quién, a cuánto · Sobreprecios y anomalías detectadas automáticamente | → Ver anomalías (`/analytics/anomalies`) · → Explorar el gasto (`/analytics/organismos`) |

- The "Crear alerta" CTA respects `useAuthEnabled()`. When auth is off, the empresa
  CTA falls back to the benchmarks/explore link — no dead buttons.
- Alert link reuses the existing `createAlertTo` shape: `/app/alertas?new=1&keyword=<q>`.

### `app/components/PliegoSummary.vue` (modify)
- Add `const AI_SUMMARY_ENABLED = false`.
- When disabled: keep header `Resumen del pliego (IA)`, show a `Próximamente` pill
  ("resumen con IA en camino"), then `<AudienceHook variant="slot" :compra-id />`.
- When enabled: existing available/summary render (unchanged), untouched.

### `app/pages/llamados/index.vue` (modify)
- Mount `<AudienceHook variant="band" />` above the results grid. The band reads the
  current `q` for the alert prefill.

### `app/pages/llamados/[compraId].vue` (modify)
- Add `id="benchmarks"` to the benchmarks `<section>` so the empresa slot CTA can
  scroll to it.

### i18n
- New `hook` namespace in `app/i18n/locales/es.json` and `en.json` (segment labels,
  value lines, CTA labels, "próximamente" copy). es is source of truth; en mirrors.

## Out of scope
- No server/API/cron changes. No homepage/landing changes.
- No new analytics events (can add later).

## Verification
- `tsc` (targeted) passes.
- Drive the two pages in a browser: toggle switches copy, persists across navigation,
  CTAs route correctly, auth-off fallback works, slot shows "Coming soon" pill.
