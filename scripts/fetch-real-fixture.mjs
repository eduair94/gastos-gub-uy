#!/usr/bin/env node
/**
 * Downloads a sample of REAL award releases from the public API into
 * `scripts/fixtures/real-releases.json`, for `seed-dev-db.ts` to insert
 * alongside its synthetic ones.
 *
 * Why real records at all: the synthetic generator draws items from a
 * 10-entry catalogue, so its shapes are too tidy to catch what real data
 * does — packed `submissionMethodDetails`, `bidders`/`callBidders`, `tcr`,
 * scraped `características`, and above all several award lines sharing one
 * `classification.id` at DIFFERENT unit prices (39% of real multi-item
 * awards, measured over this same API). The contract detail page's price
 * comparison is per line precisely because of that case, and only real
 * records exercise it.
 *
 * These are public procurement records already published by the Uruguayan
 * state and re-served by this project's own public API — no credentials, and
 * nothing here that /contracts/<id> does not already show anyone.
 *
 * Re-run only when the fixture needs refreshing; the output is committed so a
 * clean checkout seeds offline:
 *   node scripts/fetch-real-fixture.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = process.env.FIXTURE_API ?? 'https://conlatuya.checkleaked.cc'
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'real-releases.json')

/** Pinned so the fixture always demonstrates the two-lines-one-code case the
 *  merged price comparison exists for: 26627 at $628.585 and at $111.754,
 *  which fall on either side of that code's p75 and so carry DIFFERENT
 *  verdicts. The old per-code table showed only the first of the two. */
const PINNED = ['adjudicacion-1349468']

/** Enough pages that popular catalogue codes clear the 5-observation floor
 *  `detect-anomalies` needs before it will publish a baseline — without a
 *  baseline the comparison column correctly renders "sin comparables". */
const PAGES = 15
const LIMIT = 200

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  const body = await res.json()
  if (body?.error) throw new Error(`${body.message} — ${url}`)
  return body
}

/** The detail endpoint decorates a release with fields that are COMPUTED per
 *  request (`itemBaselines` is a live lookup into `item_price_baselines`) or
 *  are Mongo's own. Storing either would either go stale or collide, and the
 *  local job chain rebuilds the derived ones anyway. */
function stripComputed(doc) {
  const { _id, __v, itemBaselines, ...rest } = doc
  return rest
}

async function main() {
  const byId = new Map()

  for (let page = 1; page <= PAGES; page++) {
    const url = `${API}/api/contracts?tag=award&hasAmount=true&minItems=2&limit=${LIMIT}&page=${page}&count=false`
    let body
    try {
      body = await getJson(url)
    }
    catch (err) {
      // A page failing is survivable — the fixture is smaller, not wrong.
      console.warn(`[fixture] page ${page} failed, continuing: ${err.message}`)
      continue
    }
    const rows = body?.data?.contracts ?? []
    if (!rows.length) break
    for (const c of rows) if (c?.id) byId.set(c.id, stripComputed(c))
    console.log(`[fixture] page ${page}: ${rows.length} rows (total ${byId.size})`)
  }

  // Pinned records go through the DETAIL endpoint: the list response omits
  // fields the contract page reads (parties[].contactPoint, tender.documents).
  for (const id of PINNED) {
    const body = await getJson(`${API}/api/contracts/${encodeURIComponent(id)}`)
    if (body?.data?.id) {
      byId.set(body.data.id, stripComputed(body.data))
      console.log(`[fixture] pinned ${id}`)
    }
  }

  const docs = [...byId.values()]
  if (!docs.length) throw new Error('fetched nothing — refusing to write an empty fixture')

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, `${JSON.stringify(docs)}\n`)
  const lines = docs.reduce((n, d) => n + (d.awards ?? []).reduce((m, a) => m + (a.items ?? []).length, 0), 0)
  console.log(`[fixture] wrote ${docs.length} releases (${lines} award lines) → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
