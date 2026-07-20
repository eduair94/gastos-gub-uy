# Google Places company enrichment — design

**Date:** 2026-07-19
**Branch:** `feat/supplier-cold-email-campaign`
**Status:** design, pending user review

## Problem

`supplier_patterns` holds 42,510 state suppliers. Only ~2,458 join the DEI industrial
registry (1,824 with a usable email). The other ~40,000 have no structured contact
data. We want to fill in — like the Google knowledge panel shows for a business —
**email, phone, address, lat/lng, website, opening hours, category** so we can:

1. Power the compliant cold-email campaign (Phase B) — needs mainly a valid email + rubro.
2. Render a public "ficha del proveedor" panel on `/suppliers/<RUT>` — address, map,
   phone, website, hours.

Both uses feed off the same enrichment, but **per-field licensing differs** (see ToS).

## Sources evaluated (what actually works)

Measured/probed on 2026-07-19, live, against the real DB and real endpoints.

| Source | Fields | Free | UY coverage | ToS | Verdict |
|---|---|---|---|---|---|
| **Google Maps proxy** (`google-maps-proxy.checkleaked.cc`) | name, address, phone, website, hours, lat/lng, category | **yes** (user's proxy) | **best possible — it is Google** | restrictive on caching/public re-display | **USE — primary new source** |
| DEI (already wired) | email, website, phone, **+ address/lat/lng/depto that resolver discards** | yes, in-Mongo | 2,458 suppliers | official open data, free to display | **USE — rescue discarded fields** |
| DGI "Consulta de datos" / "Constancia" | razón social, domicilio fiscal | — | all | **🔒 login-gated; DGI has no open data** | **SKIP (dead end, verified)** |
| RUPE | — | — | — | 🔒 login (prior finding) | SKIP |
| GLEIF LEI | legal name+address | yes (CC0) | **662 UY entities (~0.34%)** | none | skip (rounding error) |
| OpenCorporates / Wikidata / Crunchbase | firmographics, no email/phone | partial | ~0 UY / 867 / venture-only | copyleft/attribution | skip |
| Hunter/Apollo/Clearbit/PDL/Coresignal/Dropcontact | email/phone | trial only | US/EU-biased, thin UY, no RUT lookup | restrictive | skip (worse + costlier than Places) |
| Web-search APIs (Serper/Brave/Google CSE) | open-web scrape | **no $0 at 40k scale anymore** | good (proxies Google) | gray zone | keep existing free DDG resolver only |

**Conclusion:** the user's Google Maps proxy is the single best free source and beats
every commercial vendor on Uruguay coverage. DGI/RUPE/GLEIF add nothing.

## Empirical evidence (pilot, 2026-07-19)

Pilot resolver run against `supplier_patterns` (80 real suppliers: 40 top-spend + 40 mid-tail).

- **Match rate: 35%** on this deliberately hostile sample (top spenders are foreign oil
  traders — Vitol, Gunvor, Trafigura — and PPP road consortiums with no storefront).
- **Of the matches: 100% had phone, 71–93% had website, 100% had geo, ~90% had hours.**
- **Failure mode identified:** `findPlaceFromText` ALWAYS returns candidates. "Innovaluy
  SRL" returned Italian companies. A crude text matcher both false-positives AND
  false-negatives (it rejected true matches: "AGAM LIMITADA"→"Laboratorio Agam Ltda.",
  "C I E M S A CONSTRUCCIONES…"→"CIEMSA"). **Match validation is the core risk.**
- **LLM judge works:** Gemini 2.5-flash-lite (infra already in `src/jobs/ai/gemini-client.ts`,
  `GEMINI_API_KEY` in `.env`) scored **18/18** on the ambiguous pairs — recovered all 3
  true matches, rejected all 15 false ones. Cost: 2,569 tokens / 18 pairs ≈ **US$1.80 for
  40,000** on flash-lite; likely $0 within the free tier.

## Architecture

A new resolver `googleMaps` plugged into the **existing** resolver pipeline
(`ContactResolver` interface, injected-I/O factory, registered in
`enrich-supplier-contacts.ts`). Two stages inside it:

```
resolve(input) →
  1. backend.findPlace(name, rut)         // proxy: findPlaceFromText, UY location bias
  2. hard filter: address must contain "Uruguay"; drop the rest
  3. fuzzy score(name, candidate.name)    // cheap, local, no cost
        score ≥ HIGH (0.75)  → accept
        score ≤ LOW  (0.35)  → reject
        LOW < score < HIGH   → ask Gemini judge (batched) → accept/reject
  4. backend.placeDetails(place_id, fieldMask)  // only for accepted
  5. return { emails:[], website, phone, place:{ address, lat, lng, hours, mapsUrl, placeId, source:"googleMaps" } }
```

The judge is called **only for the uncertain band**, and **batched** (N pairs per Gemini
call, as the pilot did) to keep cost and latency low. High/low bands never hit the LLM.

### New/changed modules

- `src/jobs/enrich/resolvers/google-maps.ts` — the resolver (factory
  `createGoogleMapsResolver({ findPlace, placeDetails, judge })`, network-free/unit-testable).
- `src/jobs/enrich/backends.ts` — add `findPlace()` + `placeDetails()` (proxy base URL
  from env `MAPS_PROXY_URL`, default the checkleaked host; keep the swallow-to-null contract).
- `src/jobs/enrich/match-judge.ts` — thin wrapper over `callGeminiStructured` doing the
  batched name-vs-candidate verdicts (system prompt tuned as in the pilot; temperature 0).
- `src/jobs/enrich/match-score.ts` — the local fuzzy prefilter (legal-suffix stripping,
  accent fold, token recall/precision) so most decisions never reach the LLM.

### Widening the contact record

`ResolverResult` (`types.ts`) gains an optional `place?` block. `ISupplierContact` +
`SupplierContactSchema` gain — with **per-field provenance** so the ToS display rule can be
enforced:

```
address?:   string | null
locality?:  string | null        // departamento/localidad
lat?:       number | null
lng?:       number | null
hours?:     string | null        // weekday_text joined, or structured
mapsUrl?:   string | null        // maps.google.com/?cid=…  (safe to store/link)
placeId?:   string | null        // Google place_id — cacheable indefinitely per ToS
placeSource?: "dei" | "googleMaps" | null   // provenance gate for public display
phoneSource?: "dei" | "googleMaps" | null
```

Orchestrator loop (`enrich-supplier-contacts.ts:96-120`): add a `place` accumulator next to
the existing `website`/`phone` first-non-null pattern, and add the new fields to the `$set`.
Because **DEI runs first and is official**, DEI-sourced address/geo/phone win and are tagged
`source:"dei"`; `googleMaps` only fills gaps and is tagged `source:"googleMaps"`.

### Zero-cost DEI backfill (bundled)

The DEI resolver (`resolvers/dei.ts:21`) projects only `email,sitioWeb,telefono` and
**throws away** `direccion,lat,lng,departamento,localidad` that are already in the same
`dei_companies` Mongo doc. Widen the projection and return them in the new `place` block —
free address+geo for the 2,458 DEI suppliers, no network, `placeSource:"dei"` (freely
displayable).

## ToS / legal (the display rule)

Google Places content carries caching/redistribution restrictions (`place_id` may be stored
indefinitely; other place fields should not be baked into a public DB for indefinite
re-display). We are calling through the user's own proxy, not a Google key, but we respect
the intent to stay safe:

- **`placeSource:"googleMaps"` fields** → used freely for the **internal** cold-email
  campaign (low exposure), but on the **public ficha** rendered via a live re-fetch
  (store `placeId`, fetch details on view) or a Google-attributed maps embed — **not**
  served from our own persisted copy.
- **`placeSource:"dei"` fields** → official open data, freely displayable and persistable.
- **Ley 18.331:** enrichment output is personal data; the campaign already carries opt-out
  (Phase B). Enrichment adds no new obligation beyond what Phase B handles.

## Testing / validation gate

- Unit tests (node:assert, repo convention): `match-score` (recall/precision, legal-suffix
  cases), `match-judge` (mocked Gemini), `google-maps` resolver (fake backends, the
  accept/reject/uncertain paths, empty-result path).
- **Pilot gate before any full run:** run on ~200 suppliers sampled from the *real target
  segment* (mid/small SRL + unipersonales, not top-spend). **Success = ≥60% match with
  ≥95% judge precision** (manually spot-check 30 accepted matches). If precision < 95%,
  raise `HIGH` / widen the judge band before scaling.
- Full runs happen on the **167 server** (dev box has no reliable DNS — measured today:
  intermittent `000` on many hosts).

## Out of scope (YAGNI)

- No commercial enrichment vendor (all worse for UY + cost + ToS).
- No DGI/RUPE scraping (login-gated, verified dead ends).
- No new web-search provider (keep the existing free DDG resolver; don't pay Serper yet).
- No social-profile capture (separate future resolver if ever needed).

## Open follow-ups

- The e-factura anonymous "Consulta de RUT" (CFE emitter validation) is GXportal/viewstate;
  only returns razón social (we already have the name) — not worth reverse-engineering.
- If public-ficha ToS turns out too restrictive in practice, fall back to DEI-only fields
  on the public panel and keep Places strictly internal.
