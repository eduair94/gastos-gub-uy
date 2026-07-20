# Directorio de contactos de proveedores — design

**Date:** 2026-07-20
**Status:** approved, implementing

## Goal

A public page that lists procurement providers **with contact data** (email, website, phone,
rubro, location), filterable/segmentable, with a one-click **download of the full filtered set**
in **CSV, XLSX, JSON and vCard**. Purpose: cold-email / B2B marketing campaigns and outreach.

The enrichment data already exists in the `supplier_contacts` collection (built by
`src/jobs/enrich-supplier-contacts.ts`). **No endpoint reads it yet** — this feature adds the first.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Access | **Public** page + public download. |
| Row scope (default) | **Valid email only** — `status='enriched'` AND ≥1 email with `mxValid && status='valid'`. A `verified=0` toggle widens to any email. |
| Formats | **CSV, XLSX, JSON, vCard** — all four. |
| Export scope | **Full filtered set** (not just the on-screen page), server-generated + streamed. Hard cap 50 000. |
| Filters | rubro (industry), departamento, DEI + size, plus search + contact-quality toggles. |
| SEO indexing | **noindex** the page — public but not surfaced to crawlers as a harvestable email list. |
| XLSX generation | `exceljs` (server-only dependency; never bundled to the client). |

## Compliance guardrails (baked in, not optional)

- **Google-Maps-sourced fields are ToS-restricted (embed-only).** Any field whose provenance is
  `googleMaps` is **stripped** before display *and* export: `phone` when `phoneSource==='googleMaps'`;
  `address/locality/lat/lng/mapsUrl/placeId` when `placeSource==='googleMaps'`. Only DEI open-data,
  provider-website, and OCDS-derived fields are shareable. This is enforced by one `sanitizeContact()`
  used by every read path, so it can never be bypassed by one endpoint.
- **Ley 18.331 (Uruguay data protection):** the page carries a source note and an opt-out line
  (“solicitá la baja de tus datos”) with a contact address.
- **Rate limiting:** the export route falls under the strict `exportLimiter` (5/min/IP). The limiter
  matcher is widened to treat any route ending in `/export` as an export route (today it only matches
  `/api/export*`).

## Architecture

```
supplier_contacts (Mongo)
        │
 app/server/utils/contacts.ts   ── buildContactFilter(query)  (shared, async; DEI cross-ref)
        │                        ── sanitizeContact(doc)       (ToS strip)
        │                        ── contactColumns / row mappers (csv/xlsx/json/vcf)
        ├── GET /api/contacts            → paginated table JSON (+ DEI badge)
        ├── GET /api/contacts/export     → full filtered set, format=csv|xlsx|json|vcf, attachment
        └── GET /api/contacts/rubros     → rubro facet (top rubros + counts) for the filter select
                                          │
                      app/pages/proveedores/contactos.vue (public, noindex)
                        DataTable + PaginatedList + filter bar + 4 download buttons
```

### Shared filter — `buildContactFilter(query)`

Returns `{ filter }` or `{ empty: true }` (when a DEI filter resolves to zero RUTs). Rules:

- base: `status: 'enriched'`.
- `verified !== '0'` (default): `emails: { $elemMatch: { mxValid: true, status: 'valid' } }`.
  `verified === '0'`: `'emails.0': { $exists: true }` (any email candidate).
- `search`: `name: { $regex, $options: 'i' }`.
- `rubro`: `'rubros.classificationId': rubro`.
- `hasPhone === '1'`: `phone: { $nin: [null, ''] }`. `hasWebsite === '1'`: `website: { $nin: [null, ''] }`.
- `dei/tamano/departamento`: resolve matching RUTs from `dei_companies` (same `TAMANO_RX` +
  `departamento` regex as `/api/suppliers`), then `supplierId: { $in: candidateIds(ruts) }`.
  **Caveat:** departamento/size therefore only match DEI-registered rows (~2.4k). Non-DEI rows carry
  freeform `locality` only. Same limitation the existing `/suppliers` page has; stated in the UI.

### `GET /api/contacts`

Params: `page=1, limit=25, search, rubro, dei, tamano, departamento, verified=1, hasPhone, hasWebsite,
sortBy=priority, sortOrder=desc`. Sort: `priority` → `priorityScore` (indexed via `{status,priorityScore}`),
or `name`. Projects curated fields, `sanitizeContact`s each row, attaches DEI badge (`attachDei`, page
rows only), returns `{ success, data: { contacts, pagination } }`. `limit=1` is used by the page to get
the unfiltered directory total for the lead.

### `GET /api/contacts/export`

Same filter params + `format`. No pagination; `.limit(CAP+1)` (CAP=50 000) to detect truncation,
sort `priorityScore` desc. `sanitizeContact` every row. Emits:

- **csv** — RFC-4180 quoted. Columns: `name, rut, email, emails, website, phone, localidad, rubro, id`.
- **xlsx** — `exceljs`, sheet “Contactos”, bold frozen header, typed columns, autofilter.
- **json** — curated records incl. `emails[]` and `rubros[]`.
- **vcf** — one VCARD per row (`FN/ORG/EMAIL/URL/TEL/ADR/NOTE`).

Headers: correct `content-type`, `content-disposition: attachment; filename="contactos-proveedores-YYYY-MM-DD.<ext>"`.
If truncated: `X-Export-Truncated: <cap>` header + `console.warn` (no silent cap).

### `GET /api/contacts/rubros`

Aggregate: match base scope (enriched + valid email), unwind `rubros`, group by `classificationId`
(count suppliers, keep a label), sort desc, limit 150 → `[{ classificationId, label, count }]`.

### Page — `app/pages/proveedores/contactos.vue`

- All filter state mirrored to the URL query (like `/suppliers`); search debounced 350 ms.
- Fetches: list (`/api/contacts`), unfiltered total (`limit=1`), rubro facet (`/api/contacts/rubros`).
- `DataTable` columns: **name** (primary, links to supplier detail via the encoded catch-all path),
  **rubro** (top label), **localidad**, **email** (mailto), **website** (link), **phone**.
- Filter bar: search · rubro `<select>` · departamento `<select>` · DEI checkbox · size `<select>` ·
  toggles verified-only / has-phone / has-website. Clear-filters button.
- Download row: 4 buttons, each an `<a :href>` to `/api/contacts/export?<current filters>&format=…`
  so the download always respects the active filter. Label shows the live filtered count.
  `useAnalytics().track('contact_export', { format })`.
- Compliance strip (source + Ley 18.331 opt-out). `useSeo({ noindex: true, kicker: 'Proveedores' })`.

### Wiring

- `shared/models/index.ts`: add `export * from './supplier_contacts'` so the model reaches the server
  via the `app/server/utils/models.ts` barrel.
- `app/layouts/default.vue`: add `{ key: 'contactos', to: localePath('/proveedores/contactos'),
  icon: 'mdi-email-outline' }` after the `suppliers` nav item.
- i18n: `contacts.*`, `seo.contacts.*`, `nav.contactos` in **both** `es.json` and `en.json`.
- `app/server/middleware/rateLimit.ts`: `getRateLimiter` returns `exportLimiter` for any route ending
  in `/export`.

## Non-goals (YAGNI)

- No sending/mailing here — Phase B (the actual cold-email send) is separate and out of scope.
- No auth/gating (public was chosen).
- No new enrichment — reads the existing `supplier_contacts` only.

## Verification

- Root typecheck `npx tsc --noEmit`; lint `npx eslint app/server`.
- `npm --prefix app run dev` → curl `/api/contacts`, `/api/contacts/rubros`,
  `/api/contacts/export?format=csv|xlsx|json|vcf`; load `/proveedores/contactos`.
- Confirm googleMaps-sourced phone/address never appear in any output.
