import type { GastosClient } from './client.js'

export interface ToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  run: (client: GastosClient, args: Record<string, any>) => Promise<unknown>
}

const str = { type: 'string' }
const num = { type: 'number' }
const int = { type: 'integer' }
const strArr = { type: 'array', items: { type: 'string' } }

// Read tools work with any key (or none); account tools need a write-scoped key.
export const tools: ToolDef[] = [
  {
    name: 'search_tenders',
    description: 'Search live government tenders (llamados / open calls) currently receiving offers. Filter by keyword, SICE category id, buyer id and status.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { ...str, description: 'Free-text keyword.' },
        category: { ...strArr, description: 'SICE/OCDS classification ids.' },
        buyer: { ...strArr, description: 'Buyer ids.' },
        status: { ...strArr, description: 'open | clarification | amended | all.' },
        limit: { ...int, description: '1–50, default 24.' },
        sort: { type: 'string', enum: ['deadline', 'newest'] },
      },
    },
    run: (c, a) => c.get('/api/open-calls', a),
  },
  {
    name: 'get_tender',
    description: 'Get one open tender by its compraId.',
    inputSchema: { type: 'object', properties: { compraId: str }, required: ['compraId'] },
    run: (c, a) => c.get(`/api/open-calls/${encodeURIComponent(a.compraId)}`),
  },
  {
    name: 'get_tender_summary',
    description: 'Get the AI summary of a tender pliego (objeto, requirements, deadlines, guarantees). Advisory only.',
    inputSchema: { type: 'object', properties: { compraId: str }, required: ['compraId'] },
    run: (c, a) => c.get(`/api/open-calls/${encodeURIComponent(a.compraId)}/summary`),
  },
  {
    name: 'get_tender_benchmarks',
    description: 'Get historical award-price percentiles per rubro for the items in a tender.',
    inputSchema: { type: 'object', properties: { compraId: str }, required: ['compraId'] },
    run: (c, a) => c.get(`/api/open-calls/${encodeURIComponent(a.compraId)}/benchmarks`),
  },
  {
    name: 'list_contracts',
    description: 'List/search awarded contracts (OCDS releases). Filter by text, year, buyer, supplier, amount range, currency and procedure.',
    inputSchema: {
      type: 'object',
      properties: {
        search: str,
        year: int,
        buyers: strArr,
        supplierIds: strArr,
        procurementMethodDetails: strArr,
        currency: strArr,
        amountFrom: num,
        amountTo: num,
        limit: { ...int, description: '1–50, default 25.' },
        sortBy: { type: 'string', enum: ['date', 'amount', 'relevance'] },
      },
    },
    run: (c, a) => c.get('/api/contracts', a),
  },
  {
    name: 'get_contract',
    description: 'Get one contract by its OCDS release id, ocid or Mongo _id.',
    inputSchema: { type: 'object', properties: { id: str }, required: ['id'] },
    run: (c, a) => c.get(`/api/contracts/${encodeURIComponent(a.id)}`),
  },
  {
    name: 'get_supplier',
    description: 'Get a supplier profile (RUT-based id) plus recent contracts.',
    inputSchema: { type: 'object', properties: { id: str }, required: ['id'] },
    run: (c, a) => c.get(`/api/suppliers/${encodeURIComponent(a.id)}`),
  },
  {
    name: 'get_buyer',
    description: 'Get a buyer (government entity) profile with headline analytics.',
    inputSchema: { type: 'object', properties: { id: str }, required: ['id'] },
    run: (c, a) => c.get(`/api/buyers/${encodeURIComponent(a.id)}`),
  },
  {
    name: 'list_anomalies',
    description: 'List detected price/supplier anomalies. Filter by type and severity.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['price_spike', 'unusual_supplier', 'high_frequency', 'suspicious_amount', 'outlier_quantity'] },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        limit: int,
      },
    },
    run: (c, a) => c.get('/api/analytics/anomalies', a),
  },
  {
    name: 'get_provider_anomalies',
    description: 'Providers ranked by concentration of unexplained anomaly flags (overprice, captive-buyer signal).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: int,
        sortBy: { type: 'string', enum: ['flagCount', 'overprice', 'worstZ'] },
      },
    },
    run: (c, a) => c.get('/api/analytics/provider-anomalies', a),
  },
  {
    name: 'get_category_distribution',
    description: 'Government spending distribution by category.',
    inputSchema: { type: 'object', properties: { year: int, limit: int } },
    run: (c, a) => c.get('/api/analytics/category-distribution', a),
  },
  {
    name: 'list_my_watches',
    description: 'List the alerts (watches) on the authenticated account. Requires a write-scoped API key.',
    inputSchema: { type: 'object', properties: {} },
    run: c => c.get('/api/watches'),
  },
  {
    name: 'create_watch',
    description: 'Create an alert (watch) on the authenticated account. Requires a write-scoped API key. categories (SICE ids) and keywords are OR-triggers; buyers and value range are AND-refinements.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str,
        categories: strArr,
        keywords: strArr,
        keywordMode: { type: 'string', enum: ['any', 'all'] },
        buyers: strArr,
        minValue: num,
        maxValue: num,
      },
      required: ['name'],
    },
    run: (c, a) => c.post('/api/watches', a),
  },
  {
    name: 'list_saved_calls',
    description: 'List the bookmarked calls on the authenticated account. Requires a write-scoped API key.',
    inputSchema: { type: 'object', properties: {} },
    run: c => c.get('/api/saved-calls'),
  },
  {
    name: 'get_calendar',
    description: 'Upcoming tender deadlines for the authenticated account (saved calls + calls matching active alerts). Requires a write-scoped API key.',
    inputSchema: { type: 'object', properties: {} },
    run: c => c.get('/api/calendar'),
  },
]
