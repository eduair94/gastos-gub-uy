# crawl4ai-backed supplier website discovery + verification

Date: 2026-07-20 · Status: approved (implement)

## Problem

The supplier enrichment system (`src/jobs/enrich-supplier-contacts.ts`) already discovers
websites, but the `webSearch` resolver does it two weak ways:

1. **Fragile transport** — `backends.ts:search()` scrapes DuckDuckGo's HTML endpoint with a
   brittle `result__a` regex over a plain `axios` fetch. It swallows rate-limits to `[]`, cannot
   render JS pages, and runs from the caller's own IP (which DDG throttles under load).
2. **No verification** — `web-search.ts` takes *the first hit whose page loads* as the supplier's
   `website`. Nothing confirms the domain actually belongs to the supplier, so a directory,
   a competitor, or a namesake can be stored as "the website".

Eduardo runs a **crawl4ai** instance (147 server, `CRAWL4AI_BASE_URL`, v0.8.9) — a headless-browser
crawler. Using it as the fetch/search transport fixes (1); reusing the existing match-score +
Gemini-judge pattern (already proven on Google Maps, 18/18 on the ambiguous band) fixes (2).

## Approach (chosen: robust + verified)

crawl4ai as the transport for `webSearch`/`website`, plus a verification step on the discovered
domain. Everything injectable → unit-testable with no network/DB. Coverage runs on 167/147
(the dev box has no DNS; the MX canary in the orchestrator still gates the run host).

## Components

### 1. `src/jobs/enrich/crawl4ai.ts` (new) — transport

- `crawl4aiBaseUrl(): string | null` — `process.env.CRAWL4AI_BASE_URL`, trimmed, `null` if unset.
- `parseDdgMarkdown(md): SearchHit[]` — **pure**. crawl4ai `/md` on DDG renders results as
  `[title](https://duckduckgo.com/l/?uddg=<ENCODED_REAL_URL>&…)`; decode `uddg`, dedup by URL, cap 5.
- `createCrawl4aiTransport({ baseUrl, minIntervalMs?, fetchImpl? }) → { fetchHtml, search }`
  matching the existing backend signatures, so the resolvers are untouched:
  - `fetchHtml(url)` → POST `/html`, returns cleaned HTML (`j.html`) or `null`. Visible-text emails
    survive (mailto hrefs are stripped by crawl4ai — acceptable; email is a bonus here).
  - `search(query)` → POST `/md` on the DDG HTML endpoint → `parseDdgMarkdown`.
  - **Global pacer**: a shared promise-chain enforces `≥ minIntervalMs` between *all* crawl4ai
    calls (default `CRAWL4AI_MIN_INTERVAL_MS` or 1500 ms) — "ir al ritmo para evitar ratelimit".
  - Same swallow-to-`null`/`[]` contract as the axios backends; 30 s timeout.

### 2. `src/jobs/enrich/website-verify.ts` (new) — verification

- `scoreWebsiteCandidate(name, hit): number` — reuses `match-score.ts` on the supplier name vs the
  candidate's **registrable-domain label** and **page title** (max of the two).
- `isAggregatorHost` / denylist — social, marketplace, business-directory AND contact-data-broker
  domains (facebook, linkedin, mercadolibre, guiaempresas, somosuruguay, **contactout, rocketreach,
  zoominfo, apollo, …**) are never a company's own site → excluded. (The broker set was added after a
  live run showed `contactout.com` scoring 1.0 on a title match.)
- `createWebsiteVerifier({ judge }: { judge: JudgeFn }) → verify(input, hits) → Promise<string|null>`:
  - drop denylisted / non-http candidates and everything below `LOW_SCORE (0.35)`.
  - **strong .uy ownership** (a name token ≥5 chars carried in a `.uy` domain) → accept without a judge
    call, preferring the **canonical** domain (shortest registrable label — `tiendainglesa.com.uy` over
    `paneltiendainglesa.com.uy`), score as tie-break.
  - otherwise the plausible band goes to the injected **Gemini judge** (batched, `match-judge.ts` `JudgeFn`,
    candidate = `domain (host) — title`); accept the highest-confidence match (`conf ≥ 0.5`).
  - **fails closed** — judge empty / no accept → `null`. (A name score alone can't tell a company from a
    foreign namesake, so name-score never auto-accepts on its own; only .uy-ownership does.)

### 3. `web-search.ts` (edit) — wire verification

Add optional `verifyWebsite?(input, hits): Promise<string|null>` to `WebSearchDeps`. When present,
`website` = `verifyWebsite({name,rut}, hits)` over **all** hits (not just the first that loads);
email extraction is unchanged. Absent → current behaviour (backward compatible).

### 4. `enrich-supplier-contacts.ts` (edit) — orchestrator

- If `CRAWL4AI_BASE_URL` set → build `createCrawl4aiTransport` and use its `{fetchHtml, search}` for
  both `webSearch` and `website`; else fall back to the axios backends (warn once).
- If `GEMINI_API_KEY` set → build `createWebsiteVerifier({ judge: createGeminiJudge({apiKey}) })` and
  pass it to `webSearch`; else warn that discovery runs unverified.

## Out of scope (YAGNI)

dei/rupe/impo/google-maps resolvers, hygiene, rubros, the `supplier_contacts` model (verified
web-discovered site keeps `websiteSource = null` → displayable per the existing ToS rule).

## Testing

- `tests/unit/test-crawl4ai-backend.ts` — `parseDdgMarkdown` on a real captured DDG markdown sample;
  `fetchHtml`/`search` over an injected `fetchImpl` (returns `j.html` / parses `/md`); error → `null`/`[]`;
  the pacer spaces two calls by `≥ minIntervalMs`.
- `tests/unit/test-website-verify.ts` — score bands; accept high, reject low, route uncertain to an
  injected judge; fail-closed on empty judge; denylist exclusion.
- Coverage (real crawl + DB writes) runs on **167** with `CRAWL4AI_BASE_URL` + `GEMINI_API_KEY`.

## Risks

- DDG may rate-limit crawl4ai → mitigated by the global pacer (tunable) + crawl4ai's own cache.
- crawl4ai `/html` strips `mailto:` → mailto-only emails are lost; visible-text emails (the majority)
  survive. Email is a bonus; the goal is the verified website.
