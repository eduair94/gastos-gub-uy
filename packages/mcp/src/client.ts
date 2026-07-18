export interface GastosClientOptions {
  apiKey?: string
  baseUrl?: string
}

/**
 * Thin HTTP client for the gastos.gub.uy public API. Reads the key/base URL from
 * the constructor or the GASTOS_GUB_API_KEY / GASTOS_GUB_BASE_URL env vars. The
 * key is optional for reads (it raises the rate limit) and required with the
 * `write` scope for account tools.
 */
export class GastosClient {
  private apiKey: string | undefined
  private baseUrl: string

  constructor(opts: GastosClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.GASTOS_GUB_API_KEY
    this.baseUrl = (opts.baseUrl ?? process.env.GASTOS_GUB_BASE_URL ?? 'https://gastos.gub.uy').replace(/\/$/, '')
  }

  async request(method: string, path: string, params?: Record<string, unknown>, body?: unknown): Promise<unknown> {
    const url = new URL(this.baseUrl + path)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue
        if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, String(x)))
        else url.searchParams.set(k, String(v))
      }
    }
    const headers: Record<string, string> = { accept: 'application/json' }
    if (this.apiKey) headers['x-api-key'] = this.apiKey
    if (body !== undefined) headers['content-type'] = 'application/json'

    const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${method} ${path}: ${text.slice(0, 400)}`)
    }
    try {
      return JSON.parse(text)
    }
    catch {
      return text
    }
  }

  get(path: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.request('GET', path, params)
  }

  post(path: string, body?: unknown): Promise<unknown> {
    return this.request('POST', path, undefined, body)
  }
}
