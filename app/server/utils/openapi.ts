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

### Rate limits

- **60 requests/minute** per IP for general endpoints.
- **30 requests/minute** per IP for \`/api/search\`.

Exceeding the limit returns **429 Too Many Requests** — please slow down and retry after ~60s.

### Caching

Read endpoints are cached server-side (5–60 min depending on the endpoint). A cached response
includes an \`X-Cache: HIT\` header.
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
          + 'filters. For performance, deep pagination is capped at page 100 and page size at 50.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 25 } },
          { name: 'search', in: 'query', description: 'Free text over titles, descriptions, items, buyer & supplier names.', schema: { type: 'string' }, example: 'relojes' },
          { name: 'year', in: 'query', description: 'Exact source year.', schema: { type: 'integer' }, example: 2026 },
          { name: 'yearFrom', in: 'query', schema: { type: 'integer' } },
          { name: 'yearTo', in: 'query', schema: { type: 'integer' } },
          { name: 'amountFrom', in: 'query', description: 'Min normalized amount (UYU).', schema: { type: 'number' } },
          { name: 'amountTo', in: 'query', description: 'Max normalized amount (UYU).', schema: { type: 'number' } },
          { name: 'status', in: 'query', description: 'Tender status. Repeat for multiple.', schema: { type: 'array', items: { type: 'string', example: 'complete' } }, style: 'form', explode: true },
          { name: 'suppliers', in: 'query', description: 'Supplier id (contains "/") or name. Repeat for multiple.', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'buyers', in: 'query', description: 'Buyer name (regex, case-insensitive). Repeat for multiple.', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'procurementMethod', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
          { name: 'hasAmount', in: 'query', description: 'Only contracts with a calculated amount.', schema: { type: 'boolean' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['date', 'year', 'status', 'ocid', 'title', 'buyer', 'supplier', 'amount', 'totalAmount'], default: 'date' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
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

    '/api/contracts/{id}': {
      get: {
        tags: ['Contracts'],
        summary: 'Get a contract by id',
        description: 'Look up a single contract by its OCDS **release id**, **ocid**, or Mongo **_id**. '
          + 'The response is enriched with computed `totalAmount`, `supplierCount`, `itemCount` and `documentCount`.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'adjudicacion-496833' },
        ],
        responses: {
          200: {
            description: 'The contract.',
            content: { 'application/json': { schema: okWrapper({ $ref: '#/components/schemas/ContractDetail' }) } },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/contracts/filters': {
      get: {
        tags: ['Contracts'],
        summary: 'Available filter options',
        description: 'Pre-computed option lists (with counts) for the contract filters: years, statuses, '
          + 'procurement methods, top suppliers and top buyers. Ideal for building filter UIs.',
        responses: {
          200: {
            description: 'Filter option groups.',
            content: {
              'application/json': {
                schema: okWrapper({
                  type: 'object',
                  properties: {
                    years: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' } },
                    statuses: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' } },
                    procurementMethods: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' } },
                    suppliers: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' } },
                    buyers: { type: 'array', items: { $ref: '#/components/schemas/FilterOption' } },
                  },
                }),
              },
            },
          },
        },
      },
    },

    '/api/search': {
      get: {
        tags: ['Search'],
        summary: 'Search contracts, suppliers and buyers',
        description: 'Case-insensitive search. Use `type` to restrict to one entity. Rate limited to 30 req/min.',
        parameters: [
          { name: 'q', in: 'query', required: true, description: 'Search text.', schema: { type: 'string' }, example: 'puertos' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['all', 'contracts', 'suppliers', 'buyers'], default: 'all' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'Grouped search results.',
            content: {
              'application/json': {
                schema: okWrapper({
                  type: 'object',
                  properties: {
                    contracts: { type: 'array', items: { $ref: '#/components/schemas/Contract' } },
                    suppliers: { type: 'array', items: { $ref: '#/components/schemas/SupplierPattern' } },
                    buyers: { type: 'array', items: { $ref: '#/components/schemas/BuyerPattern' } },
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
        description: 'Calculated, multi-currency-aware totals for a release.',
        properties: {
          version: { type: 'integer', example: 2 },
          totalItems: { type: 'integer', example: 8 },
          currencies: { type: 'array', items: { type: 'string' }, example: ['UYU'] },
          hasAmounts: { type: 'boolean', example: true },
          primaryAmount: { type: 'number', description: 'Normalized total in UYU.', example: 67930 },
          primaryCurrency: { type: 'string', example: 'UYU' },
        },
      },
      Contract: {
        type: 'object',
        description: 'A procurement contract (OCDS release).',
        properties: {
          id: { type: 'string', example: 'adjudicacion-496833' },
          ocid: { type: 'string', example: 'ocds-70d2nz-496833' },
          date: { type: 'string', format: 'date-time', example: '2026-07-15T20:15:00.000Z' },
          tag: { type: 'array', items: { type: 'string' }, example: ['award'] },
          sourceYear: { type: 'integer', example: 2026 },
          buyer: { $ref: '#/components/schemas/Party' },
          tender: {
            type: 'object',
            properties: {
              title: { type: 'string', example: 'Compra de relojes institucionales' },
              description: { type: 'string' },
              status: { type: 'string', example: 'complete' },
              procurementMethod: { type: 'string' },
              procuringEntity: { $ref: '#/components/schemas/Party' },
            },
          },
          awards: { type: 'array', items: { $ref: '#/components/schemas/Award' } },
          amount: { $ref: '#/components/schemas/Amount' },
        },
      },
      ContractDetail: {
        allOf: [
          { $ref: '#/components/schemas/Contract' },
          {
            type: 'object',
            properties: {
              totalAmount: { type: 'number', example: 67930 },
              supplierCount: { type: 'integer', example: 1 },
              itemCount: { type: 'integer', example: 2 },
              documentCount: { type: 'integer', example: 1 },
            },
          },
        ],
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
        properties: {
          value: { oneOf: [{ type: 'string' }, { type: 'number' }] },
          label: { type: 'string' },
          count: { type: 'integer' },
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
        description: 'Lightweight pagination used by /api/contracts (total is not counted for speed).',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 25 },
          hasMore: { type: 'boolean', example: true },
          estimatedTotalPages: { type: 'integer', example: 2 },
          currentCount: { type: 'integer', example: 25 },
        },
      },
      QueryMeta: {
        type: 'object',
        properties: {
          searchPerformed: { type: 'boolean' },
          filtersApplied: { type: 'boolean' },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string' },
          executionTimeMs: { type: 'integer' },
        },
      },
    },
  },
} as const
