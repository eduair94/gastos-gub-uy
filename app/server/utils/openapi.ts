/**
 * OpenAPI 3.1 specification for the public Gastos Gub API.
 *
 * This documents the real, deployed Nitro endpoints under `/api`. It is served as JSON at
 * `/openapi.json` and rendered with Scalar at `/docs`.
 *
 * Keep this in sync when adding or changing endpoints in `server/api/**`.
 */

const APP_NAME = 'Con la tuya contribuyente'

const DESCRIPTION = `
Public, **no-authentication-required** API for exploring **Uruguay government procurement data**
(contracts, suppliers, buyers and spending analytics), sourced from
[comprasestatales.gub.uy](https://www.comprasestatales.gub.uy) OCDS releases.

Use it freely to build dashboards, run research, or check public spending. 💛

### Quick start

\`\`\`bash
# Latest contracts (newest first)
curl "https://gastos.gub.uy/api/contracts?limit=5"

# Summary statistics for a filter set
curl "https://gastos.gub.uy/api/contracts/stats?year=2024&procurementMethodDetails=Compra%20Directa"

# Full-text search across contracts, suppliers and buyers
curl "https://gastos.gub.uy/api/search?q=relojes&type=all"

# One contract by its OCDS id / release id
curl "https://gastos.gub.uy/api/contracts/adjudicacion-496833"
\`\`\`

### Conventions

- **Base path:** every endpoint lives under \`/api\`.
- **Responses:** JSON. Most look like \`{ "success": true, "data": ... }\`.
- **Errors:** non-2xx responses carry a \`statusMessage\` describing what went wrong.
- **Money:** amounts are in the contract's original currency; \`amount.primaryAmount\` is a
  normalized value in **UYU** (Uruguayan pesos) for cross-currency sorting and filtering.
- **Dates:** ISO-8601 strings.
- **Provenance:** every contract carries a \`sourceUrl\` pointing at the canonical public record
  on comprasestatales.gub.uy, so any number here can be checked against the source.

### Data quality — please read before quoting totals

This API republishes source data as-is. Three things matter if you plan to compute or cite figures:

- **A few records carry corrupt quantities.** 13 releases report \`amount.primaryAmount\` >= 1e11 UYU
  and between them account for ~93% of the entire sum; the top 3 alone are ~86%. These are
  arithmetic artefacts, not spending — e.g. \`adjudicacion-1318822\` multiplies a unit price of
  519,788.85 USD by a quantity of 1,200,007, yielding a figure several times Uruguay's GDP for a
  single contract. The bad value is the **quantity**, and it comes from the source.
  Consequence: **sums and means over this data are not robust.** Prefer \`medianValue\` from
  \`/api/contracts/stats\`. Filtered totals deliberately still include these records — if you filter
  to that agency you must see what the source actually published.
- **\`tender.status\` is absent from ~91.6% of releases** (populated on 183,329 of 2,171,928) and only
  ever holds \`active\` or \`cancelled\`. It is a weak filter; do not read a missing status as "unknown
  outcome".
- **\`tender.procurementMethod\` only carries the English OCDS enum** (\`open\`/\`direct\`/\`limited\`).
  The field with real, useful values is \`tender.procurementMethodDetails\` (\`Compra Directa\`,
  \`Licitación Abreviada\`, …). It is null on ~69.3% of releases.

### Rate limits

- **60 requests/minute** per IP across \`/api\`.
- **30 requests/minute** per IP for \`/api/contracts\`, enforced by that endpoint on top of the
  global limit.

Exceeding the limit returns **429 Too Many Requests** — please slow down and retry after ~60s.
Limits are held in memory per server process, so the effective ceiling scales with the number of
processes serving traffic.

### Caching

\`/api/contracts/filters\` answers from an in-process cache: \`filter_data\`-backed facets for 15 min,
the derived \`procurementMethodDetails\` and \`currencies\` facets refreshed by a background scan every
6h, and \`amountBounds\` for 15 min. Every other endpoint queries the database on each request.
`

const okWrapper = (dataRef: object) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataRef,
  },
})

const paginationParams = [
  { name: 'page', in: 'query', description: 'Page number (1-based).', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', description: 'Items per page.', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
]

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: `${APP_NAME} — Uruguay Procurement API`,
    version: '1.0.0',
    summary: 'Open data API for Uruguay government contracts, suppliers, buyers and spending analytics.',
    description: DESCRIPTION,
    contact: { name: 'Government Transparency Initiative', url: 'https://www.comprasestatales.gub.uy' },
    license: { name: 'Open Data', url: 'https://catalogodatos.gub.uy' },
  },
  servers: [
    { url: '/', description: 'This server (relative — works on whatever host serves these docs)' },
  ],
  tags: [
    { name: 'System', description: 'Service health.' },
    { name: 'Contracts', description: 'Procurement contracts / OCDS releases: list, detail and filter options.' },
    { name: 'Search', description: 'Cross-entity full-text search.' },
    { name: 'Suppliers', description: 'Companies awarded government contracts.' },
    { name: 'Buyers', description: 'Government entities that award contracts.' },
    { name: 'Analytics', description: 'Pre-computed rankings, anomalies and distributions.' },
    { name: 'Dashboard', description: 'Headline metrics and spending trends.' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Returns a simple heartbeat so you can verify the API is reachable.',
        responses: {
          200: {
            description: 'Service is up.',
            content: {
              'application/json': {
                example: { success: true, message: 'API is working!', timestamp: '2026-07-15T20:15:00.000Z' },
              },
            },
          },
        },
      },
    },

    '/api/contracts': {
      get: {
        tags: ['Contracts'],
        summary: 'List / search contracts',
        description:
          'Paginated, filterable list of procurement contracts (OCDS releases). Combine `search` with any '
          + 'filters. For performance, deep pagination is capped at page 100 (higher returns **400**) and '
          + 'page size at 50.\n\n'
          + 'Array filters accept either a repeated key (`?buyers=A&buyers=B`) or a comma-separated value '
          + '(`?buyers=A,B`); values within one filter are OR-ed, and different filters are AND-ed.\n\n'
          + '**Name matching:** `buyers`, `suppliers` and `category` match **exactly** by default, because '
          + 'exact values are what `/api/contracts/filters` returns and only they can use an index. '
          + 'Partial matching is opt-in per value via a `*` wildcard: `Ministerio*` anchors at the start, '
          + '`*Ministerio` matches anywhere (slowest — no index). Values are escaped, so regex '
          + 'metacharacters are treated literally.',
        parameters: [
          { name: 'page', in: 'query', description: 'Page number (1-based). Above 100 returns 400.', schema: { type: 'integer', minimum: 1, maximum: 100, default: 1 } },
          { name: 'limit', in: 'query', description: 'Items per page.', schema: { type: 'integer', minimum: 1, maximum: 50, default: 25 } },
          { name: 'search', in: 'query', description: 'Free text over titles, descriptions, items, buyer & supplier names. Trimmed and capped at 120 characters.', schema: { type: 'string', maxLength: 120 }, example: 'relojes' },
          { name: 'year', in: 'query', description: 'Exact source year. Takes precedence over `yearFrom`/`yearTo`.', schema: { type: 'integer' }, example: 2026 },
          { name: 'yearFrom', in: 'query', description: 'Inclusive lower bound on source year. Ignored when `year` is set.', schema: { type: 'integer' } },
          { name: 'yearTo', in: 'query', description: 'Inclusive upper bound on source year. Ignored when `year` is set.', schema: { type: 'integer' } },
          { name: 'amountFrom', in: 'query', description: 'Min normalized amount (UYU), inclusive.', schema: { type: 'number' } },
          { name: 'amountTo', in: 'query', description: 'Max normalized amount (UYU), inclusive.', schema: { type: 'number' } },
          { name: 'status', in: 'query', description: 'Tender status. **Weak filter:** `tender.status` is absent from ~91.6% of releases and only ever holds `active` or `cancelled`. Repeat for multiple.', schema: { type: 'array', items: { type: 'string', enum: ['active', 'cancelled'] } }, style: 'form', explode: true },
          { name: 'suppliers', in: 'query', description: 'Supplier **name**. A value shaped like `R/211203010017` is still routed to the id filter for backward compatibility, but prefer `supplierIds`. Repeat for multiple.', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true, example: ['URBITEL SA'] },
          { name: 'supplierIds', in: 'query', description: 'Supplier id — the explicit, index-backed way to filter by supplier. OR-ed with `suppliers`. Repeat for multiple.', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true, example: ['R/211203010017'] },
          { name: 'buyers', in: 'query', description: 'Buyer name. Repeat for multiple.', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'buyerIds', in: 'query', description: 'Buyer id. OR-ed with `buyers`. Repeat for multiple.', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'procurementMethodDetails', in: 'query', description: 'The real Uruguayan procedure name — **this is the field you want**. Exact match against a closed set; see `/api/contracts/filters` for the full list with counts. Null on ~69.3% of releases. Repeat for multiple.', schema: { type: 'array', items: { type: 'string', examples: ['Compra Directa', 'Licitación Abreviada', 'Concurso de Precios', 'Compra por Excepción', 'Licitación Pública'] } }, style: 'form', explode: true, example: ['Compra Directa'] },
          { name: 'procurementMethod', in: 'query', description: 'Legacy English OCDS enum. Coarse and rarely what you want — prefer `procurementMethodDetails`. Repeat for multiple.', schema: { type: 'array', items: { type: 'string', enum: ['open', 'direct', 'limited', 'selective'] } }, style: 'form', explode: true },
          { name: 'currency', in: 'query', description: 'Currency present on the release (matches `amount.currencies`). Case-insensitive. Repeat for multiple.', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true, example: ['USD'] },
          { name: 'category', in: 'query', description: 'Award item classification description. Not indexed — cheap alongside a year/buyer filter, slow on its own. Repeat for multiple.', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'minItems', in: 'query', description: 'Only releases with at least this many items (`amount.totalItems`).', schema: { type: 'integer', minimum: 1 } },
          { name: 'hasAmount', in: 'query', description: 'Only contracts with a calculated amount.', schema: { type: 'boolean' } },
          { name: 'sortBy', in: 'query', description: '`relevance` sorts by full-text score and only applies when `search` is present; without `search` it silently falls back to `date`. `totalAmount` is an alias for `amount`. An unknown value falls back to `date`.', schema: { type: 'string', enum: ['date', 'year', 'status', 'ocid', 'title', 'buyer', 'supplier', 'amount', 'totalAmount', 'relevance'], default: 'date' } },
          { name: 'sortOrder', in: 'query', description: 'Ignored when `sortBy=relevance` (always highest score first).', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: {
            description: 'A page of contracts.',
            content: {
              'application/json': {
                schema: okWrapper({
                  type: 'object',
                  properties: {
                    contracts: { type: 'array', items: { $ref: '#/components/schemas/Contract' } },
                    pagination: { $ref: '#/components/schemas/CursorPagination' },
                    meta: { $ref: '#/components/schemas/QueryMeta' },
                  },
                }),
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          429: { $ref: '#/components/responses/RateLimited' },
        },
      },
    },

    '/api/contracts/stats': {
      get: {
        tags: ['Contracts'],
        summary: 'Summary statistics for a filter set',
        description:
          'Aggregate summary of the contracts matching a filter set. Accepts **exactly the same filter '
          + 'params as `/api/contracts`** (`search`, `year`, `yearFrom`/`yearTo`, `amountFrom`/`amountTo`, '
          + '`status`, `buyers`, `buyerIds`, `suppliers`, `supplierIds`, `procurementMethod`, '
          + '`procurementMethodDetails`, `currency`, `category`, `minItems`, `hasAmount`) and builds the '
          + 'match with the same code, so this always describes the same contracts the list returns. '
          + 'Pagination and sort params are accepted but ignored.\n\n'
          + '### Read this before using the numbers\n\n'
          + '**Unfiltered requests do not return value aggregates.** With no filters applied, '
          + '`totalValue`, `avgValue`, `currencies`, `topBuyers` and `topSuppliers` are `null`/empty and '
          + '`meta.unbounded` is `true`. This is deliberate, not a bug or a cache miss: the precomputed '
          + 'collections that could answer instantly are computed on a **different basis** than a live sum '
          + '(they disagree by ~100x on total spending, and count awards/items rather than releases). '
          + 'Serving those unfiltered while serving live sums for any filtered request would make the '
          + 'headline value jump ~100x on the first click. Apply at least one filter to get value '
          + 'aggregates. `count`, `byYear` counts and `medianValue` are still returned.\n\n'
          + '**`medianValue` is the figure to quote.** It is the *exact* median (not a sample or an '
          + 'interpolation), obtained by counting the matched set and seeking to the midpoint in '
          + '`amount.primaryAmount` index order. It **excludes amounts >= 1e11 UYU** '
          + '(`meta.medianExcludesAbove`): a handful of source records carry corrupt quantities — one '
          + 'declares 1,200,007 units at 519,788.85 USD — and just 3 records hold ~86% of the total sum. '
          + 'Mean and total are therefore **not robust** on this data; the median is what actually '
          + 'describes a typical purchase. Those records are still counted in `count` and `totalValue`, '
          + 'because a filtered total must show what the source published.\n\n'
          + '**`avgValue` averages only contracts that have an amount** — it is not `totalValue / count`. '
          + 'Compare against `meta.countWithAmount`.\n\n'
          + '**`topSuppliers` values are an upper bound.** A release stores one amount, not one per '
          + 'supplier, so a release with several suppliers contributes its full amount to each of them. '
          + 'The ranking is meaningful; the absolute values are inflated for multi-supplier releases. '
          + '`topBuyers` is not affected.',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 120 }, example: 'relojes' },
          { name: 'year', in: 'query', schema: { type: 'integer' }, example: 2024 },
          { name: 'yearFrom', in: 'query', schema: { type: 'integer' } },
          { name: 'yearTo', in: 'query', schema: { type: 'integer' } },
          { name: 'amountFrom', in: 'query', schema: { type: 'number' } },
          { name: 'amountTo', in: 'query', schema: { type: 'number' } },
          { name: 'status', in: 'query', schema: { type: 'array', items: { type: 'string', enum: ['active', 'cancelled'] } }, style: 'form', explode: true },
          { name: 'suppliers', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'supplierIds', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'buyers', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'buyerIds', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'procurementMethodDetails', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true, example: ['Compra Directa'] },
          { name: 'procurementMethod', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'currency', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'category', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'minItems', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'hasAmount', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: {
            description: 'Summary of the matched contracts.',
            content: {
              'application/json': {
                schema: okWrapper({ $ref: '#/components/schemas/ContractStats' }),
              },
            },
          },
          429: { $ref: '#/components/responses/RateLimited' },
          503: {
            description: 'The filter set was too broad to summarise within the time budget. Narrow the filters and retry.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },

    '/api/contracts/{id}': {
      get: {
        tags: ['Contracts'],
        summary: 'Get a contract by id',
        description: 'Look up a single contract by its OCDS **release id**, **ocid**, or Mongo **_id**. '
          + 'The response is enriched with `sourceUrl` and with computed `totalAmount`, `supplierCount`, '
          + '`itemCount` and `documentCount`.\n\n'
          + 'Note that `totalAmount` here is summed from award item unit values in their **original '
          + 'currencies**, so for a multi-currency release it is not directly comparable to '
          + '`amount.primaryAmount` (which is normalized to UYU). Prefer `amount.primaryAmount` for '
          + 'cross-contract comparison.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'adjudicacion-496833' },
        ],
        responses: {
          200: {
            description: 'The contract.',
            content: { 'application/json': { schema: okWrapper({ $ref: '#/components/schemas/ContractDetail' }) } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/contracts/filters': {
      get: {
        tags: ['Contracts'],
        summary: 'Available filter options',
        description: 'Option lists (with counts) for every contract filter: years, statuses, procurement '
          + 'methods, procurement method details, top buyers, top suppliers, currencies and amount bounds. '
          + 'Ideal for building filter UIs — the `value` of each option is exactly what `/api/contracts` '
          + 'expects back, which is also what lets those filters use an index.\n\n'
          + 'Takes no parameters. Most facets come from the precomputed `filter_data` collection, so counts '
          + 'lag the live collection slightly — `meta.lastUpdated` and `meta.sources` expose how stale each '
          + 'one is. `procurementMethodDetails` and `currencies` are not in `filter_data`; they are derived '
          + 'by a background scan refreshed every 6h (`meta.derivedFacets`), seeded from a 2026-07-17 scan '
          + 'so a cold process still serves correct values.\n\n'
          + '`statuses` covers only ~8.4% of releases — see `meta.statusCoverage`.\n\n'
          + '`amountBounds` is derived from `amount.primaryAmount` via two index seeks and may be `null` if '
          + 'unavailable. **`amountBounds.max` is a genuine data outlier**, not a realistic contract value — '
          + 'it comes from a source record with a corrupt quantity. Using it as the top of a slider will '
          + 'produce a control where essentially every contract sits at the far left; pick a sane ceiling '
          + 'instead.',
        responses: {
          200: {
            description: 'Filter option groups. Each list is `[{ value, label, count }]`; `count` may be `null`.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        years: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' }, description: 'Source years above 2000, newest first.' },
                        statuses: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' }, description: 'Only `active` and `cancelled` exist. Weak filter — populated on ~8.4% of releases.' },
                        procurementMethods: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' }, description: 'Legacy English OCDS enum. Prefer `procurementMethodDetails`.' },
                        procurementMethodDetails: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' }, description: 'The real Uruguayan procedure names, most common first (Compra Directa, Licitación Abreviada, Concurso de Precios, Compra por Excepción, Licitación Pública, …). 22 non-null values.' },
                        buyers: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' }, description: 'Top buyers by contract count.' },
                        suppliers: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' }, description: 'Top suppliers by contract count.' },
                        currencies: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' }, description: 'Currencies actually present in `amount.currencies`, most common first. Dominated by UYU and USD.' },
                        amountBounds: {
                          type: ['object', 'null'],
                          description: 'Min/max of `amount.primaryAmount` (UYU) over releases with an amount > 0. `max` is a known data-quality outlier — do not use it as a UI slider ceiling.',
                          properties: {
                            min: { type: 'number', example: 0.01 },
                            max: { type: 'number', description: 'A corrupt source record, not a real contract value.' },
                          },
                        },
                      },
                    },
                    meta: { $ref: '#/components/schemas/FiltersMeta' },
                  },
                },
              },
            },
          },
          500: { description: 'Failed to fetch filter options.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/api/search': {
      get: {
        tags: ['Search'],
        summary: 'Search contracts, suppliers and buyers',
        description: 'Case-insensitive substring search, built for typeaheads. Use `type` to restrict to '
          + 'one entity.\n\n'
          + '`q` is trimmed, collapsed and capped at **120 characters**, and escaped before it reaches the '
          + 'regex engine, so metacharacters match literally rather than as a pattern.\n\n'
          + 'A `q` shorter than **2 characters** (after trimming) returns **200** with empty result arrays '
          + 'rather than an error — the frontend types into this endpoint keystroke by keystroke and a 400 '
          + 'on the first character would be noise.\n\n'
          + 'Omitting `q` entirely is an error. Be aware that it currently surfaces as **500** '
          + '(`Search failed`) rather than the intended 400: the handler raises a 400 but its own catch-all '
          + 're-wraps it. Treat a 500 from this endpoint as "check you sent `q`" before assuming an '
          + 'outage.\n\n'
          + 'Only the response groups implied by `type` are present: `type=suppliers` returns just '
          + '`suppliers`, and so on. Results are capped per group by `limit` and are not ranked or '
          + 'paginated — this is a lookup, not the way to enumerate contracts. Use `/api/contracts` with '
          + '`search` and `sortBy=relevance` for that.',
        parameters: [
          { name: 'q', in: 'query', required: true, description: 'Search text. Required; under 2 characters yields empty results.', schema: { type: 'string', maxLength: 120 }, example: 'puertos' },
          { name: 'type', in: 'query', description: 'Which entities to search. Any unrecognised value returns an empty object.', schema: { type: 'string', enum: ['all', 'contracts', 'suppliers', 'buyers'], default: 'all' } },
          { name: 'limit', in: 'query', description: 'Max results **per group**. Out-of-range values are clamped.', schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
        ],
        responses: {
          200: {
            description: 'Grouped search results. Groups absent from `type` are omitted; a too-short `q` returns empty arrays.',
            content: {
              'application/json': {
                schema: okWrapper({
                  type: 'object',
                  properties: {
                    contracts: { type: 'array', items: { $ref: '#/components/schemas/SearchContractResult' } },
                    suppliers: { type: 'array', items: { $ref: '#/components/schemas/SupplierPattern' } },
                    buyers: { type: 'array', items: { $ref: '#/components/schemas/BuyerPattern' } },
                  },
                }),
              },
            },
          },
          429: { $ref: '#/components/responses/RateLimited' },
          500: {
            description: 'Search failed — **also what a missing `q` returns today** (the intended 400 is '
              + 're-wrapped by the handler\'s catch-all).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },

    '/api/suppliers': {
      get: {
        tags: ['Suppliers'],
        summary: 'List suppliers',
        description: 'Companies awarded contracts, ranked by total awarded value.',
        parameters: [
          ...paginationParams,
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['totalValue', 'totalContracts', 'name'], default: 'totalValue' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: {
            description: 'A page of suppliers.',
            content: {
              'application/json': {
                schema: okWrapper({
                  type: 'object',
                  properties: {
                    suppliers: { type: 'array', items: { $ref: '#/components/schemas/SupplierPattern' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                }),
              },
            },
          },
        },
      },
    },

    '/api/suppliers/{id}': {
      get: {
        tags: ['Suppliers'],
        summary: 'Get a supplier with recent contracts',
        parameters: [{ name: 'id', in: 'path', required: true, description: 'Supplier id (RUT-based).', schema: { type: 'string' }, example: '217555220017' }],
        responses: {
          200: { description: 'Supplier profile + up to 10 recent contracts.', content: { 'application/json': { schema: okWrapper({ type: 'object', properties: { supplier: { $ref: '#/components/schemas/SupplierPattern' }, recentContracts: { type: 'array', items: { $ref: '#/components/schemas/Contract' } }, meta: { type: 'object' } } }) } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/suppliers/autocomplete': {
      get: {
        tags: ['Suppliers'],
        summary: 'Supplier autocomplete',
        description: 'Lightweight `{ value, label }` list for typeaheads, ordered by total value.',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'Autocomplete suggestions.',
            content: {
              'application/json': {
                schema: okWrapper({ type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' }, meta: { type: 'object' } } } }),
              },
            },
          },
        },
      },
    },

    '/api/buyers': {
      get: {
        tags: ['Buyers'],
        summary: 'List buyers',
        description: 'Government entities, ranked by total spending.',
        parameters: [
          ...paginationParams,
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['totalSpending', 'totalContracts', 'name'], default: 'totalSpending' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: {
            description: 'A page of buyers.',
            content: {
              'application/json': {
                schema: okWrapper({
                  type: 'object',
                  properties: {
                    buyers: { type: 'array', items: { $ref: '#/components/schemas/BuyerPattern' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                }),
              },
            },
          },
        },
      },
    },

    '/api/buyers/{id}': {
      get: {
        tags: ['Buyers'],
        summary: 'Get a buyer profile',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ...paginationParams,
        ],
        responses: {
          200: { description: 'Buyer profile with headline analytics.', content: { 'application/json': { schema: { $ref: '#/components/schemas/BuyerDetail' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/analytics/anomalies': {
      get: {
        tags: ['Analytics'],
        summary: 'List detected anomalies',
        parameters: [
          ...paginationParams,
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['price_spike', 'unusual_supplier', 'high_frequency', 'suspicious_amount', 'outlier_quantity'] } },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'confidence', 'severity'], default: 'createdAt' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: {
            description: 'A page of anomalies.',
            content: {
              'application/json': {
                schema: okWrapper({ type: 'object', properties: { anomalies: { type: 'array', items: { $ref: '#/components/schemas/Anomaly' } }, pagination: { $ref: '#/components/schemas/Pagination' } } }),
              },
            },
          },
        },
      },
    },

    '/api/analytics/anomalies/stats': {
      get: {
        tags: ['Analytics'],
        summary: 'Anomaly statistics',
        description: 'Summary counts, severity/type distributions, 7-day trend and confidence stats.',
        responses: { 200: { description: 'Aggregated anomaly stats.', content: { 'application/json': { schema: okWrapper({ type: 'object' }) } } } },
      },
    },

    '/api/analytics/anomalies/{id}': {
      get: {
        tags: ['Analytics'],
        summary: 'Get an anomaly with context',
        description: 'Returns the anomaly, its related contract, and up to 5 related anomalies.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Anomaly detail.', content: { 'application/json': { schema: okWrapper({ type: 'object', properties: { anomaly: { $ref: '#/components/schemas/Anomaly' }, contract: { $ref: '#/components/schemas/Contract' }, relatedAnomalies: { type: 'array', items: { $ref: '#/components/schemas/Anomaly' } } } }) } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/analytics/category-distribution': {
      get: {
        tags: ['Analytics'],
        summary: 'Spending by category',
        parameters: [
          { name: 'year', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 15 } },
        ],
        responses: { 200: { description: 'Category distribution.', content: { 'application/json': { schema: okWrapper({ type: 'array', items: { $ref: '#/components/schemas/CategoryDistribution' } }) } } } },
      },
    },

    '/api/analytics/top-buyers': {
      get: {
        tags: ['Analytics'],
        summary: 'Top buyers',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'year', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Ranked buyers.', content: { 'application/json': { schema: okWrapper({ type: 'array', items: { $ref: '#/components/schemas/TopEntity' } }) } } } },
      },
    },

    '/api/analytics/top-suppliers': {
      get: {
        tags: ['Analytics'],
        summary: 'Top suppliers',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'year', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Ranked suppliers.', content: { 'application/json': { schema: okWrapper({ type: 'array', items: { $ref: '#/components/schemas/TopEntity' } }) } } } },
      },
    },

    '/api/dashboard/metrics': {
      get: {
        tags: ['Dashboard'],
        summary: 'Headline metrics',
        description: 'Pre-computed totals: contracts, spending, suppliers, buyers, average contract value, '
          + 'year-over-year growth and recent anomalies.',
        responses: { 200: { description: 'Dashboard metrics.', content: { 'application/json': { schema: okWrapper({ $ref: '#/components/schemas/DashboardMetrics' }) } } } },
      },
    },

    '/api/dashboard/spending-trends': {
      get: {
        tags: ['Dashboard'],
        summary: 'Spending over time',
        parameters: [
          { name: 'years', in: 'query', description: 'Year or repeated years to include.', schema: { type: 'array', items: { type: 'integer' } }, style: 'form', explode: true },
          { name: 'groupBy', in: 'query', schema: { type: 'string', enum: ['year', 'month'], default: 'year' } },
        ],
        responses: { 200: { description: 'Time series of spending.', content: { 'application/json': { schema: okWrapper({ type: 'array', items: { $ref: '#/components/schemas/SpendingTrendPoint' } }) } } } },
      },
    },
  },

  components: {
    responses: {
      BadRequest: { description: 'Invalid or missing parameters.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Resource not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      RateLimited: { description: 'Too many requests — slow down and retry after ~60s.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 404 },
          statusMessage: { type: 'string', example: 'Contract not found' },
        },
      },
      Money: {
        type: 'object',
        properties: {
          amount: { type: 'number', example: 6600 },
          currency: { type: 'string', example: 'UYU' },
        },
      },
      Party: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '217555220017' },
          name: { type: 'string', example: 'URBITEL SA' },
          roles: { type: 'array', items: { type: 'string' }, example: ['supplier'] },
        },
      },
      Award: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string', example: 'active' },
          date: { type: 'string', format: 'date-time' },
          suppliers: { type: 'array', items: { $ref: '#/components/schemas/Party' } },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                description: { type: 'string', example: 'Reloj Citizen Quartz BI5051-51A' },
                quantity: { type: 'number', example: 5 },
                unit: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    value: { $ref: '#/components/schemas/Money' },
                  },
                },
              },
            },
          },
        },
      },
      Amount: {
        type: 'object',
        description: 'Calculated, multi-currency-aware totals for a release. Derived at ingest, not part '
          + 'of the source OCDS payload.\n\nOnly the fields below are contractual. Responses also carry '
          + 'assorted bookkeeping left by the amount calculator (`updatedAt`, `exchangeRateDate`, '
          + '`uyiExchangeRate`, `originalUYUAmount`, `hasConvertedAmounts`, `wasVersionUpdate`, '
          + '`previousAmount`); they are internal and may change without notice — do not build on them.',
        properties: {
          version: {
            type: 'integer',
            description: 'Internal bookkeeping: which revision of the amount calculator produced this '
              + 'object. Used by the ingest pipeline to find releases needing recalculation. Not part of '
              + 'the procurement data — ignore it.',
            example: 2,
          },
          totalAmounts: {
            type: 'object',
            description: 'Per-currency totals, keyed by currency code, before UYU normalization.',
            additionalProperties: { type: 'number' },
            example: { UYU: 15000, USD: 500 },
          },
          totalItems: { type: 'integer', example: 8 },
          currencies: { type: 'array', items: { type: 'string' }, description: 'Every currency appearing on the release. Filterable via `currency`.', example: ['UYU'] },
          hasAmounts: { type: 'boolean', description: 'Whether any amount could be calculated at all. Filterable via `hasAmount`.', example: true },
          primaryAmount: {
            type: 'number',
            description: 'Total normalized to UYU — the field used for amount sorting and filtering, and '
              + 'the only one comparable across contracts. On a small number of releases this is a corrupt '
              + 'source figure; see the Data quality note above.',
            example: 67930,
          },
          primaryCurrency: { type: 'string', example: 'UYU' },
        },
      },
      Contract: {
        type: 'object',
        description: 'A procurement contract (OCDS release).',
        properties: {
          id: { type: 'string', example: 'adjudicacion-496833' },
          ocid: { type: 'string', example: 'ocds-70d2nz-496833' },
          sourceUrl: {
            type: ['string', 'null'],
            format: 'uri',
            description: 'Canonical public record for this release on the government site '
              + '(`https://www.comprasestatales.gub.uy/ocds/release/{id}`). Derived from `id` rather than '
              + 'stored, and `null` if the release has no usable id. Link here when displaying a contract '
              + 'so readers can verify any figure against the official source.',
            example: 'https://www.comprasestatales.gub.uy/ocds/release/adjudicacion-496833',
          },
          date: { type: 'string', format: 'date-time', example: '2026-07-15T20:15:00.000Z' },
          tag: { type: 'array', items: { type: 'string' }, example: ['award'] },
          sourceYear: { type: 'integer', description: 'The reliable year field — prefer it over deriving a year from `date`.', example: 2026 },
          buyer: { $ref: '#/components/schemas/Party' },
          tender: {
            type: 'object',
            properties: {
              title: { type: 'string', example: 'Compra de relojes institucionales' },
              description: { type: 'string' },
              status: { type: 'string', description: 'Absent from ~91.6% of releases; only ever `active` or `cancelled`.', enum: ['active', 'cancelled'], example: 'active' },
              procurementMethod: { type: 'string', description: 'Legacy English OCDS enum. Prefer `procurementMethodDetails`.', example: 'direct' },
              procurementMethodDetails: { type: 'string', description: 'The real Uruguayan procedure name. Null on ~69.3% of releases.', example: 'Compra Directa' },
              procuringEntity: { $ref: '#/components/schemas/Party' },
            },
          },
          awards: { type: 'array', items: { $ref: '#/components/schemas/Award' } },
          amount: { $ref: '#/components/schemas/Amount' },
        },
      },
      SearchContractResult: {
        type: 'object',
        description: 'The trimmed contract projection returned by `/api/search` — enough to render a '
          + 'suggestion and link onward. Notably there is **no `amount`**: fetch `/api/contracts/{id}` for '
          + 'the full record.',
        properties: {
          _id: { type: 'string', description: 'Mongo document id. Accepted by `/api/contracts/{id}`.', example: '6894de0cfbc85dc56b8ca856' },
          id: { type: 'string', example: 'adjudicacion-496833' },
          ocid: { type: 'string', example: 'ocds-70d2nz-496833' },
          sourceUrl: { type: ['string', 'null'], format: 'uri', description: 'Canonical public record on comprasestatales.gub.uy.', example: 'https://www.comprasestatales.gub.uy/ocds/release/adjudicacion-496833' },
          date: { type: 'string', format: 'date-time' },
          tender: { type: 'object', properties: { title: { type: 'string' } } },
          buyer: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
      ContractDetail: {
        allOf: [
          { $ref: '#/components/schemas/Contract' },
          {
            type: 'object',
            description: 'Computed on read, only by `/api/contracts/{id}`.',
            properties: {
              totalAmount: {
                type: 'number',
                description: 'Sum of award item unit values in their **original currencies**, with no '
                  + 'conversion. For a single-currency release this matches the visible total; for a '
                  + 'multi-currency one it adds unlike units and is not meaningful. Use '
                  + '`amount.primaryAmount` to compare contracts.',
                example: 67930,
              },
              supplierCount: { type: 'integer', description: 'Total supplier entries across all awards (not de-duplicated).', example: 1 },
              itemCount: { type: 'integer', description: 'Total line items across all awards.', example: 2 },
              documentCount: { type: 'integer', description: 'Tender documents plus award documents.', example: 1 },
            },
          },
        ],
      },
      ContractStats: {
        type: 'object',
        description: 'Summary of the contracts matching a filter set. See the endpoint description for '
          + 'why value aggregates are null when unfiltered, and why `medianValue` is the figure to quote.',
        properties: {
          count: { type: 'integer', description: 'Matching contracts. Unfiltered, this is an estimate read from collection metadata.', example: 172962 },
          totalValue: {
            type: ['number', 'null'],
            description: 'Sum of `amount.primaryAmount` (UYU) over the matched set. **`null` when no '
              + 'filters are applied.** Includes the corrupt outlier records, so it is not robust — a '
              + 'handful of releases dominate any broad total.',
            example: 609352628373,
          },
          avgValue: {
            type: ['number', 'null'],
            description: 'Mean over contracts that **have** an amount — not `totalValue / count`. `null` '
              + 'when unfiltered. Skewed by the same outliers; prefer `medianValue`.',
          },
          medianValue: {
            type: ['number', 'null'],
            description: 'Exact median of `amount.primaryAmount` (UYU) over matched contracts with an '
              + 'amount > 0 and < 1e11, found by index seek. Returned even when unfiltered. `null` if no '
              + 'contract in the set has a usable amount. **This is the honest "typical contract" figure:** '
              + 'half of all matched purchases are smaller than this.\n\nFor scale: across the whole '
              + 'collection the median is ~17,000 UYU. For `year=2024` the median is ~41,113 UYU while '
              + '`avgValue` is ~4,681,926 — the mean is **114x** the median, which is what the outlier '
              + 'records do to it.',
            example: 41113.1,
          },
          byYear: {
            type: 'array',
            description: 'Per-year buckets, ascending. When unfiltered these come from `filter_data` and '
              + 'carry `value: null`.',
            items: {
              type: 'object',
              properties: {
                year: { type: 'integer', example: 2024 },
                count: { type: 'integer', example: 172962 },
                value: { type: ['number', 'null'], description: 'Summed `amount.primaryAmount` for the year; `null` when unfiltered.' },
              },
            },
          },
          currencies: {
            type: 'array',
            description: 'Currency spread across the matched set, most common first (max 20). Empty when unfiltered.',
            items: {
              type: 'object',
              properties: {
                currency: { type: 'string', example: 'UYU' },
                count: { type: 'integer', example: 1294354 },
              },
            },
          },
          topBuyers: {
            type: 'array',
            description: 'Top 5 buyers by summed value. Empty when unfiltered.',
            items: { $ref: '#/components/schemas/NamedBucket' },
          },
          topSuppliers: {
            type: 'array',
            description: 'Top 5 suppliers by summed value. Empty when unfiltered. **`value` is an upper '
              + 'bound:** a release amount is not apportioned across its suppliers, so a multi-supplier '
              + 'release credits its full amount to each one. Ranking is meaningful; absolute values are '
              + 'inflated.',
            items: { $ref: '#/components/schemas/NamedBucket' },
          },
          meta: { $ref: '#/components/schemas/ContractStatsMeta' },
        },
      },
      NamedBucket: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Administración Nacional de Puertos' },
          value: { type: 'number', description: 'Summed `amount.primaryAmount` (UYU).' },
          count: { type: 'integer', description: 'Number of contributing releases.' },
        },
      },
      ContractStatsMeta: {
        type: 'object',
        description: 'Provenance for the numbers above. Which fields are present depends on `unbounded`.',
        properties: {
          unbounded: {
            type: 'boolean',
            description: '`true` when no filter was applied, meaning value aggregates were withheld. Apply '
              + 'a filter to get them.',
            example: false,
          },
          executionTimeMs: { type: 'integer', description: 'Always present.', example: 2900 },
          note: { type: 'string', description: 'Unbounded only — explains why value aggregates are null.' },
          countSource: { type: 'string', description: 'Unbounded only.', enum: ['estimatedDocumentCount'] },
          byYearSource: { type: 'string', description: 'Unbounded only.', enum: ['filter_data'] },
          byYearAsOf: { type: ['string', 'null'], format: 'date-time', description: 'Unbounded only — when the `filter_data` year counts were last refreshed.' },
          medianSource: { type: 'string', description: 'Unbounded only. `exact` means a real median, not a sample.', enum: ['exact'] },
          medianExcludesAbove: {
            type: 'number',
            description: 'Unbounded only. Amounts at or above this UYU threshold were excluded from '
              + '`medianValue` as corrupt source records. The same threshold is applied to the filtered '
              + 'median even though this field is not echoed there.',
            example: 100000000000,
          },
          countWithAmount: { type: 'integer', description: 'Filtered only — how many matched contracts have an amount, i.e. the denominator behind `avgValue`.' },
          avgValueBasis: { type: 'string', description: 'Filtered only.', example: 'contracts with a recorded amount' },
          topSuppliersValueBasis: { type: 'string', description: 'Filtered only.', example: 'upper bound; release amount is not apportioned across suppliers' },
        },
      },
      FiltersMeta: {
        type: 'object',
        description: 'Freshness and provenance for each facet — surfaced so a UI can label counts by age '
          + 'rather than imply they are live.',
        properties: {
          precomputed: { type: 'boolean', example: true },
          lastUpdated: { type: ['integer', 'null'], description: 'Newest `filter_data` refresh across all facets, as an epoch milliseconds value.' },
          statusCoverage: {
            type: 'object',
            description: 'Why `status` is a weak filter.',
            properties: {
              populated: { type: 'integer', example: 183329 },
              total: { type: 'integer', example: 2171928 },
              nullRatio: { type: 'number', example: 0.9156 },
              note: { type: 'string' },
            },
          },
          derivedFacets: {
            type: 'object',
            description: 'State of the background scan behind `procurementMethodDetails` and `currencies`.',
            properties: {
              source: { type: 'string', enum: ['seed', 'live'], description: '`seed` means the point-in-time fallback is being served; a refresh runs behind the request.' },
              computedAt: { type: ['integer', 'null'], description: 'Epoch milliseconds of the last successful refresh, or null if never.' },
              refreshing: { type: 'boolean' },
              note: { type: 'string' },
            },
          },
          amountBoundsNote: { type: 'string', example: 'Derived via index seeks. Max reflects a known data-quality outlier in amount.primaryAmount.' },
          sources: {
            type: 'object',
            description: 'Per-`filter_data`-type freshness, keyed by facet name.',
            additionalProperties: {
              type: 'object',
              properties: {
                lastUpdated: { type: 'string', format: 'date-time' },
                generatedFromReleases: { type: 'integer' },
                optionCount: { type: 'integer' },
              },
            },
          },
          executionTimeMs: { type: 'integer' },
        },
      },
      SupplierPattern: {
        type: 'object',
        properties: {
          supplierId: { type: 'string', example: '217555220017' },
          name: { type: 'string', example: 'URBITEL SA' },
          totalContracts: { type: 'integer', example: 12 },
          totalValue: { type: 'number', example: 4520000 },
          avgContractValue: { type: 'number' },
        },
      },
      BuyerPattern: {
        type: 'object',
        properties: {
          buyerId: { type: 'string' },
          name: { type: 'string', example: 'Administración Nacional de Puertos' },
          totalContracts: { type: 'integer' },
          totalSpending: { type: 'number' },
          avgContractValue: { type: 'number' },
        },
      },
      BuyerDetail: {
        type: 'object',
        properties: {
          buyerId: { type: 'string' },
          name: { type: 'string' },
          totalContracts: { type: 'integer' },
          totalSpending: { type: 'number' },
          avgContractValue: { type: 'number' },
          years: { type: 'array', items: { type: 'integer' } },
          firstContractDate: { type: 'string' },
          lastContractDate: { type: 'string' },
          analytics: { type: 'object' },
        },
      },
      Anomaly: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          releaseId: { type: 'string' },
          type: { type: 'string', example: 'price_spike' },
          severity: { type: 'string', example: 'high' },
          confidence: { type: 'number', example: 0.87 },
          description: { type: 'string' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      TopEntity: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          totalAmount: { type: 'number' },
          totalContracts: { type: 'integer' },
          transactionCount: { type: 'integer' },
          avgContractValue: { type: 'number' },
          rank: { type: 'integer' },
        },
      },
      CategoryDistribution: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          description: { type: 'string' },
          totalAmount: { type: 'number' },
          contractCount: { type: 'integer' },
          percentage: { type: 'number' },
          rank: { type: 'integer' },
        },
      },
      SpendingTrendPoint: {
        type: 'object',
        properties: {
          date: { type: 'string', example: '2026-01-01' },
          value: { type: 'number' },
          count: { type: 'integer' },
        },
      },
      DashboardMetrics: {
        type: 'object',
        properties: {
          totalContracts: { type: 'integer' },
          totalSpending: { type: 'number' },
          totalSuppliers: { type: 'integer' },
          totalBuyers: { type: 'integer' },
          avgContractValue: { type: 'number' },
          currentYearGrowth: { type: 'number' },
          recentAnomalies: { type: 'integer' },
          calculatedAt: { type: 'string', format: 'date-time' },
        },
      },
      FilterOption: {
        type: 'object',
        description: 'One selectable filter value. Send `value` back to `/api/contracts` verbatim — it is '
          + 'the exact stored value, which is what keeps the filter index-backed.',
        properties: {
          value: { oneOf: [{ type: 'string' }, { type: 'number' }] },
          label: { type: 'string', description: 'Display text. Equal to `value` for most facets.' },
          count: { type: ['integer', 'null'], description: 'Matching releases. May lag the live collection — see `meta`. `null` when unknown.' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 1543 },
          totalPages: { type: 'integer', example: 78 },
        },
      },
      CursorPagination: {
        type: 'object',
        description: 'Pagination used by `/api/contracts`. The total is bounded work by design, so read '
          + '`total` together with `totalIsCapped` and be ready for `total: null`.',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 25 },
          total: {
            type: ['integer', 'null'],
            description: 'Matching contracts. With no filters this is an estimate from collection '
              + 'metadata. With filters it is a real count **capped at 10001** — see `totalIsCapped`. '
              + '`null` means the count timed out or failed; fall back to `hasMore` and expect '
              + '`estimatedTotalPages` to be a guess.',
            example: 1543,
          },
          totalIsCapped: {
            type: 'boolean',
            description: 'When `true`, the real total exceeds 10,000 and `total` is only the cap — display '
              + 'it as "10,000+", not as an exact figure. Narrow the filters for an exact count.',
            example: false,
          },
          hasMore: { type: 'boolean', description: 'Whether another page exists. Reliable even when `total` is null.', example: true },
          estimatedTotalPages: { type: 'integer', description: 'Derived from `total`. When `total` is null or capped this is a lower bound, not the truth.', example: 62 },
          currentCount: { type: 'integer', description: 'Contracts in this page.', example: 25 },
        },
      },
      QueryMeta: {
        type: 'object',
        properties: {
          searchPerformed: { type: 'boolean', description: 'Whether `search` was present and survived sanitization.' },
          filtersApplied: { type: 'boolean', description: 'Whether any filter (including `search`) narrowed the collection. `false` means you are seeing the unfiltered collection.' },
          sortBy: { type: 'string', description: 'The sort actually applied, which may differ from what you asked for — `relevance` degrades to `date` without a `search`, as does any unknown value.' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          executionTimeMs: { type: 'integer' },
        },
      },
    },
  },
} as const
