// src/jobs/enrich/crawl4ai.ts
//
// crawl4ai (headless-browser crawler, CRAWL4AI_BASE_URL) as the fetch/search
// transport for the enrichment resolvers. It replaces the plain-axios
// backends.ts `fetchHtml`/`search` with a server-side crawler that renders JS,
// survives DuckDuckGo rate-limits better, and runs from the crawl4ai host's IP
// rather than the job's. The resolvers are untouched: this exposes the exact
// same `{ fetchHtml(url), search(query) }` shape and the same swallow-to-
// null/[] contract.
//
// A single GLOBAL PACER serialises every crawl4ai call with a minimum spacing
// (CRAWL4AI_MIN_INTERVAL_MS, default 1500 ms) so a whole enrichment run cannot
// burst the crawler or the search engine behind it — "ir al ritmo para evitar
// ratelimit". The pacer is per-transport-instance; the orchestrator builds one
// instance and shares it across the webSearch and website resolvers.

import type { SearchHit } from "./resolvers/web-search";

/** `process.env.CRAWL4AI_BASE_URL`, trimmed; null when unset/empty. Never hardcode the URL. */
export function crawl4aiBaseUrl(): string | null {
  const raw = (process.env.CRAWL4AI_BASE_URL ?? "").trim();
  return raw.length ? raw.replace(/\/+$/, "") : null;
}

/**
 * Parse crawl4ai's `/md` rendering of the DuckDuckGo HTML endpoint into hits.
 * DDG wraps every result as `[title](https://duckduckgo.com/l/?uddg=<ENCODED
 * REAL URL>&…)`; the real destination lives URL-encoded in `uddg`. Deduped by
 * decoded URL (the same result appears as both a heading and a bare-URL line),
 * order preserved, capped at 5 — the resolver only reads the top few.
 */
export function parseDdgMarkdown(md: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const re = /\[([^\]]*)\]\(https:\/\/duckduckgo\.com\/l\/\?uddg=([^)&]+)[^)]*\)/g;
  for (const m of (md || "").matchAll(re)) {
    let url: string;
    try { url = decodeURIComponent(m[2]!); } catch { continue; }
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const title = m[1]!.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    hits.push({ url, title, snippet: title });
    if (hits.length >= 5) break;
  }
  return hits;
}

/** Minimal fetch shape so tests can inject without pulling in DOM lib types. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export interface Crawl4aiOptions {
  baseUrl: string;
  /** Minimum ms between any two crawl4ai calls. Default CRAWL4AI_MIN_INTERVAL_MS or 1500. */
  minIntervalMs?: number;
  /** Per-request timeout. Default 30 s (crawl4ai renders a page, so it is slow). */
  timeoutMs?: number;
  /** Maximum in-flight crawl4ai calls. Default CRAWL4AI_MAX_CONCURRENCY or 3. */
  maxConcurrency?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
}

export interface Crawl4aiTransport {
  fetchHtml: (url: string) => Promise<string | null>;
  search: (query: string) => Promise<SearchHit[]>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createCrawl4aiTransport(opts: Crawl4aiOptions): Crawl4aiTransport {
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const minIntervalMs = opts.minIntervalMs ?? Number(process.env.CRAWL4AI_MIN_INTERVAL_MS ?? 1500);
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxConcurrency = Math.max(1, opts.maxConcurrency ?? Number(process.env.CRAWL4AI_MAX_CONCURRENCY ?? 3));
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => (globalThis.fetch as any)(url, init));

  // Global start-rate gate + semaphore. The old implementation waited for a
  // render to finish before starting the delay, serialising network/render time.
  // Calls now retain the same minimum spacing between starts while using the
  // bounded concurrency supported by the crawler.
  let active = 0;
  let nextStartAt = 0;
  const slotWaiters: Array<() => void> = [];
  async function acquire(): Promise<void> {
    if (active >= maxConcurrency) {
      await new Promise<void>((resolve) => slotWaiters.push(resolve));
    } else {
      active++;
    }
    const now = Date.now();
    const startAt = Math.max(now, nextStartAt);
    nextStartAt = startAt + Math.max(0, minIntervalMs);
    if (startAt > now) await sleep(startAt - now);
  }
  function release(): void {
    const next = slotWaiters.shift();
    if (next) next(); // transfer the occupied slot directly to the next waiter
    else active--;
  }
  function paced<T>(fn: () => Promise<T>): Promise<T> {
    return acquire().then(async () => {
      try { return await fn(); }
      finally { release(); }
    });
  }

  async function post(path: string, body: Record<string, unknown>): Promise<any | null> {
    try {
      const res = await doFetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  return {
    async fetchHtml(url: string): Promise<string | null> {
      // `/crawl` returns the rendered raw HTML (including href/src attributes),
      // unlike `/html`, whose schema-oriented sanitizer removes social links.
      // Keeping this behind the same transport preserves pacing and lets the
      // resolver extract first-party profiles without a direct-site fallback.
      const j = await paced(() => post("/crawl", { urls: [url] }));
      const result = Array.isArray(j?.results) ? j.results[0] : null;
      return result && typeof result.html === "string" ? result.html : null;
    },
    async search(query: string): Promise<SearchHit[]> {
      const ddg = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const j = await paced(() => post("/md", { url: ddg }));
      const md = j && typeof j.markdown === "string" ? j.markdown : "";
      return parseDdgMarkdown(md);
    },
  };
}
