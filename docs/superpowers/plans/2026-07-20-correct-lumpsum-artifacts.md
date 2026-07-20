# Correct Lump-Sum-in-Unit-Price Artifacts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find releases whose stored total was inflated by multiplying a lump-sum contract value by a large quantity, verify the real total against the official comprasestatales page, and write it back at the correct historical BCU rate behind a flag every other amount-writing path respects.

**Architecture:** Four independent pure modules (`bcu-historical-rates`, `comprasestatales-total`, `lumpsum-candidates`, `verified-override`) plus two thin jobs that wire them to Mongo. Historical FX is **not** new conversion code — it seeds the existing `exchange_rates` table that `shared/utils/real-value.ts` already reads.

**Tech Stack:** TypeScript, `tsx` (no build step for jobs), Mongoose 4.4-compatible aggregations, Nuxt 3 + Vuetify for the badge, `node:assert` test scripts.

**Spec:** `docs/superpowers/specs/2026-07-20-correct-lumpsum-artifacts-design.md`

## Global Constraints

- **MongoDB 4.4 standalone.** No `$percentile`/`$median`/`$sortArray`/`$topN`, no multi-document transactions, 100MB per-stage limit — every aggregate passes `allowDiskUse`.
- **Never `git add -A`.** Multiple sessions share this working tree; stage explicit paths only. Branch: `fix/lumpsum-amount-artifacts`.
- **Jobs are dry-run by default**; writing requires an explicit `--commit` flag.
- **Never fabricate a number.** Any unresolved rate, unparseable page, or ambiguous total → skip the release and log it. No fallback to today's FX rate.
- **Run DB-touching jobs on the 167 server** (`ssh build`); prod Mongo is firewalled to an allowlist.
- Test scripts live at `tests/unit/test-*.ts`, use `node:assert`, and end with `console.log("ok: <name>")`. Run with `npx tsx tests/unit/<file>.ts`.
- Verified constants (do not re-derive): BCU currency codes **USD=2225, EUR=1111, UI=9800**; BCU endpoint `https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones`, SOAPAction `Cotizaaction/AWSBCUCOTIZACIONES.Execute`; official-total label **`Monto Total de la Compra:`**.
- Fixtures already saved: `tests/fixtures/comprasestatales-53193.html`, `tests/fixtures/bcu-cotizaciones-2005-06-28.xml`.

---

### Task 1: `verifiedOverride` type + guard helper

**Files:**
- Create: `shared/utils/verified-override.ts`
- Modify: `shared/types/database.ts:382-388` (the `amount?:` block)
- Modify: `shared/models/release.ts:137-145` (the `amount` schema block)
- Test: `tests/unit/test-lumpsum-artifacts.ts`

**Interfaces:**
- Produces: `VerifiedOverride` interface; `hasVerifiedOverride(doc: unknown): boolean` — used by Task 2 (guards) and Task 7 (the job).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test-lumpsum-artifacts.ts`:

```ts
// tests/unit/test-lumpsum-artifacts.ts
import assert from "node:assert";
import { hasVerifiedOverride } from "../../shared/utils/verified-override";

// hasVerifiedOverride: only true when the audit sub-object is actually present.
assert.equal(hasVerifiedOverride(null), false);
assert.equal(hasVerifiedOverride(undefined), false);
assert.equal(hasVerifiedOverride({}), false);
assert.equal(hasVerifiedOverride({ amount: {} }), false);
assert.equal(hasVerifiedOverride({ amount: { primaryAmount: 100 } }), false);
assert.equal(hasVerifiedOverride({ amount: { verifiedOverride: null } }), false);
assert.equal(
  hasVerifiedOverride({ amount: { verifiedOverride: { source: "comprasestatales" } } }),
  true,
);

console.log("ok: lumpsum artifacts");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-lumpsum-artifacts.ts`
Expected: FAIL — `Cannot find module '../../shared/utils/verified-override'`

- [ ] **Step 3: Write the implementation**

Create `shared/utils/verified-override.ts`:

```ts
/**
 * A release amount that was corrected against the official government record.
 *
 * Some OCDS items carry a contract LUMP SUM in `unit.value.amount`; multiplying
 * it by quantity (src/utils/amount-calculator.ts) inflates the stored total by
 * orders of magnitude. When a correction job has verified the real figure on
 * comprasestatales, it stamps this object on `amount` so that:
 *   1. every path that recomputes `amount` leaves the release alone, and
 *   2. the UI can show where the number came from.
 */
export interface VerifiedOverride {
  source: "comprasestatales";
  /** The government page the total was read from. */
  sourceUrl: string;
  /** "Monto Total de la Compra" as published, in its own currency. */
  officialTotal: number;
  officialCurrency: string;
  /** `YYYY-MM` whose BCU rate converted officialTotal to UYU. */
  rateMonth: string;
  /** What we replaced, for audit/rollback. */
  previousPrimaryAmount: number | null;
  previousComputedTotal: number | null;
  verifiedAt: Date;
  reason: "lumpsum-in-unit-price";
}

/**
 * True when a release carries a verified override. Every job that writes
 * `amount` MUST check this and skip, or a routine re-sync silently restores the
 * inflated figure.
 */
export function hasVerifiedOverride(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const amount = (doc as { amount?: unknown }).amount;
  if (!amount || typeof amount !== "object") return false;
  const override = (amount as { verifiedOverride?: unknown }).verifiedOverride;
  return !!override && typeof override === "object";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-lumpsum-artifacts.ts`
Expected: PASS — prints `ok: lumpsum artifacts`

- [ ] **Step 5: Add the field to the schema and the type**

In `shared/models/release.ts`, inside the `amount` block (currently ending `primaryCurrency: { type: String }`), add:

```ts
      primaryCurrency: { type: String },
      // Set only by src/jobs/correct-lumpsum-artifacts.ts. Its presence means the
      // total was verified against the government page and must NOT be recomputed
      // (see shared/utils/verified-override.ts).
      verifiedOverride: { type: Schema.Types.Mixed }
```

In `shared/types/database.ts`, inside the `amount?:` block (after `primaryAmount`), add:

```ts
    /** Present when the total was verified against comprasestatales — do not recompute. */
    verifiedOverride?: import('../utils/verified-override').VerifiedOverride
```

Note: `ReleaseSchema` is `{ strict: false }`, so this is documentation + type-safety rather than a
gate — the guards in Task 2 are what actually protect the value.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no new errors mentioning `verified-override`, `release.ts`, or `database.ts`.

- [ ] **Step 7: Commit**

```bash
git add shared/utils/verified-override.ts shared/models/release.ts shared/types/database.ts tests/unit/test-lumpsum-artifacts.ts
git commit -m "feat(amounts): add verifiedOverride marker + guard helper"
```

---

### Task 2: Guard every path that recomputes `amount`

**Files:**
- Modify: `src/uploaders/release-uploader-new.ts:413-443` and `:717-762`
- Modify: `src/uploaders/release-uploader.ts:148`
- Modify: `src/add-missing-amounts.ts:79-106`
- Modify: `src/jobs/reconcile-award-amendments.ts:346-409`
- Test: `tests/unit/test-lumpsum-artifacts.ts` (extend)

**Interfaces:**
- Consumes: `hasVerifiedOverride` from Task 1.
- Produces: nothing new — behavioural guarantee only.

This is the **hard prerequisite** for Task 7. Without it the first re-sync re-inflates every
correction.

- [ ] **Step 1: Guard `add-missing-amounts.ts` (simplest — the stored doc is in hand)**

In `src/add-missing-amounts.ts`, import the helper at the top:

```ts
import { hasVerifiedOverride } from "../shared/utils/verified-override";
```

Then inside `for (const release of releases) {`, as the first statement of the `try` block (before
`const isVersionUpdate = ...`):

```ts
          // A total verified against the government page outranks anything we can
          // recompute from the feed — never overwrite it.
          if (hasVerifiedOverride(release)) {
            continue;
          }
```

- [ ] **Step 2: Guard `reconcile-award-amendments.ts` (with documented precedence)**

In `src/jobs/reconcile-award-amendments.ts`, add the import next to the existing
`amount-calculator` import:

```ts
import { hasVerifiedOverride } from "../../shared/utils/verified-override";
```

Then inside `for (const base of bases) {`, immediately after `basesChecked++;`:

```ts
        // PRECEDENCE: a government-published amendment is newer ground truth than our
        // page verification, so it is allowed to win — but only by REPLACING the
        // override, never by silently recomputing around it. We skip here and require
        // a deliberate re-run of correct-lumpsum-artifacts to re-verify, because the
        // merged item math is exactly the quantity x lump-sum trap this guards.
        if (hasVerifiedOverride(base)) {
          skippedVerified++;
          continue;
        }
```

Declare the counter next to the other counters in the same function (near `let skippedAmbiguous = 0;`):

```ts
    let skippedVerified = 0;
```

And add it to the run summary, next to where `skippedAmbiguous` is logged:

```ts
    if (skippedVerified) console.log(`   skipped (verified override): ${skippedVerified}`);
```

- [ ] **Step 3: Guard `release-uploader.ts`**

In `src/uploaders/release-uploader.ts`, add the import:

```ts
import { hasVerifiedOverride } from "../../shared/utils/verified-override";
```

Locate the loop containing line 148's `calculateTotalAmounts(` call. Before that call, add a skip on
the release currently being processed (use whatever the loop variable is named — the stored document
if available, otherwise the prepared release):

```ts
        if (hasVerifiedOverride(release)) {
          continue;
        }
```

- [ ] **Step 4: Guard `release-uploader-new.ts` — reconcile site (line ~730)**

Here the stored document IS available as `result.candidate`. Add the import at the top:

```ts
import { hasVerifiedOverride } from "../../shared/utils/verified-override";
```

Then immediately after the `if (!ocdsRelease || !ocdsRelease.id) { failed++; continue; }` block:

```ts
            // Never let a re-sync recompute a page-verified total.
            if (hasVerifiedOverride(result.candidate)) {
              continue;
            }
```

- [ ] **Step 5: Guard `release-uploader-new.ts` — upload site (line ~413)**

This site has no stored document (it `$set`s a freshly-built object with `upsert: true`, which WOULD
clobber an existing override). Pre-load the protected ids for the batch. Immediately before
`for (const { release, releaseData } of prepared) {`:

```ts
    // This loop $sets a fully-rebuilt document, so a release whose total was verified
    // against the government page would be silently re-inflated. Look up which ids
    // carry an override and omit `amount` from their update.
    const preparedIds = prepared.map((p) => p.release.id).filter(Boolean);
    const protectedIds = new Set<string>(
      preparedIds.length
        ? (
            await ReleaseModel.find(
              { id: { $in: preparedIds }, "amount.verifiedOverride": { $exists: true } },
              { id: 1 }
            ).lean()
          ).map((d: any) => d.id)
        : []
    );
```

Then, inside the loop, replace the construction of `releaseWithMetadata` so `amount` is conditional:

```ts
        const releaseWithMetadata: Record<string, unknown> = {
          ...release,
          sourceFileName: "web", // As requested
          sourceYear: year, // As requested
          amount: amountData, // As requested
          // Additional metadata from web fetch
          webFetchDate: new Date(),
          rssTitle: releaseData.title,
          rssDescription: releaseData.description,
          rssPublishDate: releaseData.publishDate,
          rssLink: releaseData.link,
        };
        // Keep the verified total; everything else about the release still refreshes.
        if (protectedIds.has(release.id)) {
          delete releaseWithMetadata.amount;
        }
```

Confirm `ReleaseModel` is already imported in this file; if not, add it from `../../shared/models`.

- [ ] **Step 6: Extend the test with a guard-contract assertion**

Append to `tests/unit/test-lumpsum-artifacts.ts`, above the final `console.log`:

```ts
// The guard is what protects a correction from a re-sync. Assert the exact shape the
// jobs branch on, including a realistic full override object.
const corrected = {
  id: "adjudicacion-53193",
  amount: {
    primaryAmount: 103_596,
    primaryCurrency: "UYU",
    totalAmounts: { USD: 4201 },
    currencies: ["USD"],
    verifiedOverride: {
      source: "comprasestatales",
      sourceUrl: "https://www.comprasestatales.gub.uy/consultas/detalle/id/53193",
      officialTotal: 4201,
      officialCurrency: "USD",
      rateMonth: "2005-06",
      previousPrimaryAmount: 43_823_788_579.956,
      previousComputedTotal: 1_094_280_000,
      verifiedAt: new Date("2026-07-20T00:00:00Z"),
      reason: "lumpsum-in-unit-price",
    },
  },
};
assert.equal(hasVerifiedOverride(corrected), true);
// An uncorrected release with the same inflated shape must NOT be protected.
assert.equal(
  hasVerifiedOverride({ id: "adjudicacion-31334", amount: { primaryAmount: 40_831_381_689 } }),
  false,
);
```

- [ ] **Step 7: Run the test and typecheck**

Run: `npx tsx tests/unit/test-lumpsum-artifacts.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: prints `ok: lumpsum artifacts`; no new type errors in the four modified files.

- [ ] **Step 8: Verify every call site is guarded**

Run:
```bash
grep -n "calculateTotalAmounts(" src/uploaders/release-uploader-new.ts src/uploaders/release-uploader.ts src/add-missing-amounts.ts src/jobs/reconcile-award-amendments.ts
grep -c "hasVerifiedOverride" src/uploaders/release-uploader-new.ts src/uploaders/release-uploader.ts src/add-missing-amounts.ts src/jobs/reconcile-award-amendments.ts
```
Expected: each file that calls `calculateTotalAmounts` also reports ≥1 `hasVerifiedOverride`
occurrence beyond its import line (`release-uploader-new.ts` must report ≥3: import + 2 sites).

- [ ] **Step 9: Commit**

```bash
git add src/uploaders/release-uploader-new.ts src/uploaders/release-uploader.ts src/add-missing-amounts.ts src/jobs/reconcile-award-amendments.ts tests/unit/test-lumpsum-artifacts.ts
git commit -m "fix(amounts): never recompute a page-verified total"
```

---

### Task 3: BCU historical-rates client

**Files:**
- Create: `src/jobs/lib/bcu-historical-rates.ts`
- Test: `tests/unit/test-bcu-historical-rates.ts`
- Fixture (already saved): `tests/fixtures/bcu-cotizaciones-2005-06-28.xml`

**Interfaces:**
- Produces:
  - `BCU_CODES = { usd: 2225, eur: 1111, ui: 9800 }`
  - `buildCotizacionesEnvelope(codes: number[], from: string, to: string): string`
  - `parseCotizaciones(xml: string): BcuRow[]` where `BcuRow = { date: string; code: number; sell: number }`
  - `monthlyAveragesByCurrency(rows: BcuRow[]): Map<string, { usd?: number; eur?: number; ui?: number }>`
  - `fetchBcuRange(codes: number[], from: string, to: string): Promise<BcuRow[]>`
- Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test-bcu-historical-rates.ts`:

```ts
// tests/unit/test-bcu-historical-rates.ts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BCU_CODES,
  buildCotizacionesEnvelope,
  monthlyAveragesByCurrency,
  parseCotizaciones,
} from "../../src/jobs/lib/bcu-historical-rates";

const xml = readFileSync(
  join(__dirname, "../fixtures/bcu-cotizaciones-2005-06-28.xml"),
  "utf8",
);

// The fixture is a real BCU response for 2005-06-28, EUR + UI.
const rows = parseCotizaciones(xml);
assert.equal(rows.length, 2);

const eur = rows.find(r => r.code === BCU_CODES.eur)!;
assert.equal(eur.date, "2005-06-28");
assert.equal(eur.sell, 29.75748);

const ui = rows.find(r => r.code === BCU_CODES.ui)!;
assert.equal(ui.sell, 1.4624);

// Monthly averaging keys by YYYY-MM and maps codes onto the exchange_rates field names.
const byMonth = monthlyAveragesByCurrency(rows);
const june = byMonth.get("2005-06")!;
assert.equal(june.eur, 29.75748);
assert.equal(june.ui, 1.4624);
assert.equal(june.usd, undefined); // not in this fixture

// Averaging is a real mean across the month's days, not last-wins.
const avg = monthlyAveragesByCurrency([
  { date: "2005-06-01", code: BCU_CODES.usd, sell: 24 },
  { date: "2005-06-02", code: BCU_CODES.usd, sell: 26 },
  { date: "2005-07-01", code: BCU_CODES.usd, sell: 30 },
]);
assert.equal(avg.get("2005-06")!.usd, 25);
assert.equal(avg.get("2005-07")!.usd, 30);

// Garbage in -> no rows, never a NaN written to the DB.
assert.deepEqual(parseCotizaciones("<html>nope</html>"), []);

// The envelope carries every requested code and the date range verbatim.
const env = buildCotizacionesEnvelope([2225, 9800], "2005-01-01", "2005-12-31");
assert.ok(env.includes("<cot:item>2225</cot:item>"));
assert.ok(env.includes("<cot:item>9800</cot:item>"));
assert.ok(env.includes("<cot:FechaDesde>2005-01-01</cot:FechaDesde>"));
assert.ok(env.includes("<cot:FechaHasta>2005-12-31</cot:FechaHasta>"));

console.log("ok: bcu historical rates");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-bcu-historical-rates.ts`
Expected: FAIL — `Cannot find module '../../src/jobs/lib/bcu-historical-rates'`

- [ ] **Step 3: Write the implementation**

Create `src/jobs/lib/bcu-historical-rates.ts`:

```ts
/**
 * BCU historical exchange rates, via the bank's SOAP service.
 *
 * The cambio-uruguay API that feeds src/jobs/refresh-exchange-rates.ts caps its
 * look-back at 60 months (HTTP 400 above that), so it cannot reach the 2000s.
 * The BCU's own service has no such limit — verified returning 2005 rows.
 *
 *   POST https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones
 *   SOAPAction: Cotizaaction/AWSBCUCOTIZACIONES.Execute
 *   -> Salida.datoscotizaciones['datoscotizaciones.dato'][] { Fecha, Moneda, TCC, TCV }
 *
 * We take TCV (venta) to match the `sell` field refresh-exchange-rates.ts averages.
 * The response is a flat list of identical blocks, so a narrow regex parse is
 * enough and avoids adding an XML dependency — but it lives ONLY in this file.
 */

const ENDPOINT = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones";
const SOAP_ACTION = "Cotizaaction/AWSBCUCOTIZACIONES.Execute";

/** Currency ids from the companion awsbcumonedas service. */
export const BCU_CODES = { usd: 2225, eur: 1111, ui: 9800 } as const;

/** Which exchange_rates field each BCU code feeds. */
const FIELD_BY_CODE: Record<number, "usd" | "eur" | "ui"> = {
  [BCU_CODES.usd]: "usd",
  [BCU_CODES.eur]: "eur",
  [BCU_CODES.ui]: "ui",
};

export interface BcuRow {
  /** `YYYY-MM-DD` */
  date: string;
  code: number;
  /** TCV — UYU per unit. */
  sell: number;
}

export interface MonthFields {
  usd?: number;
  eur?: number;
  ui?: number;
}

export function buildCotizacionesEnvelope(codes: number[], from: string, to: string): string {
  const items = codes.map((c) => `<cot:item>${c}</cot:item>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Body>
    <cot:wsbcucotizaciones.Execute>
      <cot:Entrada>
        <cot:Moneda>${items}</cot:Moneda>
        <cot:FechaDesde>${from}</cot:FechaDesde>
        <cot:FechaHasta>${to}</cot:FechaHasta>
        <cot:Grupo>0</cot:Grupo>
      </cot:Entrada>
    </cot:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function parseCotizaciones(xml: string): BcuRow[] {
  const rows: BcuRow[] = [];
  // Each quote is one <datoscotizaciones.dato> block; split and read the fields we need.
  const blocks = xml.split("<datoscotizaciones.dato").slice(1);
  for (const block of blocks) {
    const date = /<Fecha>([^<]+)<\/Fecha>/.exec(block)?.[1];
    const code = Number(/<Moneda>([^<]+)<\/Moneda>/.exec(block)?.[1]);
    const sell = Number(/<TCV>([^<]+)<\/TCV>/.exec(block)?.[1]);
    if (!date || !Number.isFinite(code) || !Number.isFinite(sell) || sell <= 0) continue;
    rows.push({ date: date.slice(0, 10), code, sell });
  }
  return rows;
}

/** Average each currency's daily quotes per calendar month, mirroring refresh-exchange-rates.ts. */
export function monthlyAveragesByCurrency(rows: BcuRow[]): Map<string, MonthFields> {
  // month -> field -> running mean
  const sums = new Map<string, Record<string, { sum: number; n: number }>>();
  for (const row of rows) {
    const field = FIELD_BY_CODE[row.code];
    if (!field) continue;
    const month = row.date.slice(0, 7);
    const perField = sums.get(month) ?? {};
    const acc = perField[field] ?? { sum: 0, n: 0 };
    acc.sum += row.sell;
    acc.n += 1;
    perField[field] = acc;
    sums.set(month, perField);
  }

  const out = new Map<string, MonthFields>();
  for (const [month, perField] of sums) {
    const rec: MonthFields = {};
    for (const [field, acc] of Object.entries(perField)) {
      if (acc.n > 0) rec[field as keyof MonthFields] = Number((acc.sum / acc.n).toFixed(6));
    }
    out.set(month, rec);
  }
  return out;
}

export async function fetchBcuRange(codes: number[], from: string, to: string): Promise<BcuRow[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "soapaction": SOAP_ACTION,
      "user-agent": "conlatuya.checkleaked.cc (datos abiertos)",
    },
    body: buildCotizacionesEnvelope(codes, from, to),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`BCU ${from}..${to}: HTTP ${res.status}`);
  return parseCotizaciones(await res.text());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-bcu-historical-rates.ts`
Expected: PASS — prints `ok: bcu historical rates`

- [ ] **Step 5: Verify against the live service**

Run:
```bash
npx tsx -e "import('./src/jobs/lib/bcu-historical-rates').then(async m => { const r = await m.fetchBcuRange([m.BCU_CODES.usd], '2005-06-27', '2005-06-30'); console.log(r); })"
```
Expected: 4 rows, `2005-06-28` with `sell: 24.66`. If the network is unavailable from this box, defer
this step to the 167 run in Task 4 and note it.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/lib/bcu-historical-rates.ts tests/unit/test-bcu-historical-rates.ts tests/fixtures/bcu-cotizaciones-2005-06-28.xml
git commit -m "feat(rates): BCU SOAP client for pre-2022 historical rates"
```

---

### Task 4: `seed-historical-rates` job

**Files:**
- Create: `src/jobs/seed-historical-rates.ts`

**Interfaces:**
- Consumes: `fetchBcuRange`, `monthlyAveragesByCurrency`, `BCU_CODES` from Task 3.
- Produces: populated `exchange_rates` months back to ~2000 — consumed implicitly by
  `shared/utils/real-value.ts` and by Task 7.

- [ ] **Step 1: Write the job**

Create `src/jobs/seed-historical-rates.ts`:

```ts
#!/usr/bin/env tsx

/**
 * One-time backfill of the monthly BCU rate table (exchange_rates) for the years
 * the nightly refresh cannot reach.
 *
 * src/jobs/refresh-exchange-rates.ts is fed by cambio-uruguay, whose API rejects
 * period > 60 months, so the table starts at 2022-12. Everything older converted
 * at today's rate, which is exactly the error shared/utils/real-value.ts exists to
 * avoid — it simply had no months to work with. That job never deletes months, so
 * a seed loaded once survives every refresh (by design).
 *
 * Source: the BCU SOAP service (src/jobs/lib/bcu-historical-rates.ts).
 *
 * Usage:
 *   npx tsx src/jobs/seed-historical-rates.ts                 # dry-run, 2000-01..2022-11
 *   npx tsx src/jobs/seed-historical-rates.ts --commit
 *   npx tsx src/jobs/seed-historical-rates.ts --from=2004 --to=2006 --commit
 */

import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ExchangeRateModel } from "../../shared/models";
import { BCU_CODES, fetchBcuRange, monthlyAveragesByCurrency } from "./lib/bcu-historical-rates";

const DEFAULT_FROM_YEAR = 2000;
/** The nightly job owns 2022-12 onward; stop just before it. */
const DEFAULT_TO_YEAR = 2022;
const DEFAULT_TO_MONTH = "2022-11";
/** Be a good citizen: the service is a public bank endpoint. */
const DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const fromYear = Number(arg("from") ?? DEFAULT_FROM_YEAR);
  const toYear = Number(arg("to") ?? DEFAULT_TO_YEAR);
  const codes = [BCU_CODES.usd, BCU_CODES.eur, BCU_CODES.ui];

  console.log(`💱 Seeding historical BCU rates ${fromYear}..${toYear}${commit ? "" : "  (DRY RUN)"}`);
  await connectToDatabase();

  const before = await ExchangeRateModel.countDocuments();
  console.log(`   exchange_rates currently holds ${before} months`);

  let upserts = 0;
  let fetched = 0;
  const now = new Date();

  // One request per calendar year — the service returns every daily row in the range.
  for (let year = fromYear; year <= toYear; year++) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    let rows;
    try {
      rows = await fetchBcuRange(codes, from, to);
    } catch (err) {
      console.warn(`   ${year}: fetch failed — ${(err as Error).message}`);
      await sleep(DELAY_MS);
      continue;
    }
    fetched += rows.length;

    const byMonth = monthlyAveragesByCurrency(rows);
    const months = [...byMonth.keys()].sort().filter((m) => m <= DEFAULT_TO_MONTH);
    console.log(`   ${year}: ${rows.length} daily rows -> ${months.length} months`);

    for (const month of months) {
      const rec = byMonth.get(month)!;
      if (rec.usd === undefined && rec.eur === undefined && rec.ui === undefined) continue;
      if (!commit) continue;
      // Only set the fields we actually got, so a missing series never wipes a stored value.
      const $set: Record<string, unknown> = { month, updatedAt: now };
      if (rec.usd !== undefined) $set.usd = rec.usd;
      if (rec.eur !== undefined) $set.eur = rec.eur;
      if (rec.ui !== undefined) $set.ui = rec.ui;
      await ExchangeRateModel.updateOne({ month }, { $set }, { upsert: true });
      upserts += 1;
    }

    await sleep(DELAY_MS);
  }

  const after = await ExchangeRateModel.countDocuments();
  const earliest = await ExchangeRateModel.findOne().sort({ month: 1 }).lean();
  console.log(`   fetched ${fetched} daily rows | upserted ${upserts} months`);
  console.log(`   exchange_rates: ${before} -> ${after} months, earliest now ${earliest?.month}`);
  if (!commit) console.log("   🧪 dry run: nothing written. Re-run with --commit.");
}

if (require.main === module) {
  main()
    .then(async () => {
      await disconnectFromDatabase();
      console.log("✅ Historical rate seed complete");
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("❌ Seed failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Dry-run a narrow range**

Run: `npx tsx src/jobs/seed-historical-rates.ts --from=2005 --to=2005`
Expected: `2005: <N> daily rows -> 12 months`, then `🧪 dry run: nothing written.` and
`exchange_rates: 44 -> 44 months`.

- [ ] **Step 3: Commit the 2005 slice and verify the known value**

Run:
```bash
npx tsx src/jobs/seed-historical-rates.ts --from=2005 --to=2005 --commit
npx tsx -e "import('./shared/connection/database').then(async db => { await db.connectToDatabase(); const { ExchangeRateModel } = await import('./shared/models'); console.log(await ExchangeRateModel.findOne({ month: '2005-06' }).lean()); await db.disconnectFromDatabase(); })"
```
Expected: a `2005-06` document whose `usd` is ~24.6 (**not** ~40) and whose `ui` is ~1.46.

- [ ] **Step 4: Seed the full range**

Run: `npx tsx src/jobs/seed-historical-rates.ts --commit`
Expected: `exchange_rates` grows from 44 to roughly 44 + 275 months; `earliest now 2000-01`
(or the first month BCU actually serves). Note the real earliest month in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/seed-historical-rates.ts
git commit -m "feat(rates): seed exchange_rates back to 2000 from BCU"
```

---

### Task 5: Official-total parser

**Files:**
- Create: `src/jobs/lib/comprasestatales-total.ts`
- Test: `tests/unit/test-comprasestatales-total.ts`
- Fixture (already saved): `tests/fixtures/comprasestatales-53193.html`

**Interfaces:**
- Produces:
  - `parseUyNumber(raw: string): number | null`
  - `parseOfficialTotal(html: string): { amount: number; currency: string } | null`
  - `idCompraFromOcid(ocid: string): string | null`
  - `detalleUrl(idCompra: string): string`
  - `fetchOfficialTotal(idCompra: string): Promise<{ amount: number; currency: string } | null>`
- Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test-comprasestatales-total.ts`:

```ts
// tests/unit/test-comprasestatales-total.ts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detalleUrl,
  idCompraFromOcid,
  parseOfficialTotal,
  parseUyNumber,
} from "../../src/jobs/lib/comprasestatales-total";

// Uruguayan format: dot = thousands, comma = decimals.
assert.equal(parseUyNumber("4.201,00"), 4201);
assert.equal(parseUyNumber("U$S 4.201,00"), 4201);
assert.equal(parseUyNumber("1.094.280.000,50"), 1094280000.5);
assert.equal(parseUyNumber("330.000,00"), 330000);
assert.equal(parseUyNumber("no hay monto"), null);
assert.equal(parseUyNumber(""), null);

// ocid -> the numeric id the detalle page is keyed on.
assert.equal(idCompraFromOcid("ocds-yfs5dr-53193"), "53193");
assert.equal(idCompraFromOcid("ocds-abc123-1307206"), "1307206");
assert.equal(idCompraFromOcid("garbage"), null);
assert.equal(
  detalleUrl("53193"),
  "https://www.comprasestatales.gub.uy/consultas/detalle/id/53193",
);

// The real page for adjudicacion-53193: the government's own total is 4.201 USD,
// even though it labels 3.316,00 a "Precio unitario" for 330.000 units.
const html = readFileSync(join(__dirname, "../fixtures/comprasestatales-53193.html"), "utf8");
const total = parseOfficialTotal(html)!;
assert.equal(total.amount, 4201);
assert.equal(total.currency, "USD");

// A page without the label yields null rather than a wrong number.
assert.equal(parseOfficialTotal("<html><body>nada</body></html>"), null);

console.log("ok: comprasestatales total");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-comprasestatales-total.ts`
Expected: FAIL — `Cannot find module '../../src/jobs/lib/comprasestatales-total'`

- [ ] **Step 3: Write the implementation**

Create `src/jobs/lib/comprasestatales-total.ts`:

```ts
/**
 * Read a purchase's real total off its official comprasestatales page.
 *
 * Ground truth for the lump-sum-in-unit-price correction: the OCDS feed's
 * `unit.value.amount` sometimes holds a contract total, and multiplying it by
 * quantity inflates our stored figure. The government page publishes the actual
 * total, so we take it verbatim rather than trying to infer one.
 *
 * The markup is stable and flat:
 *   <li ...>Monto Total de la Compra:</li><li ...><strong>U$S 4.201,00</strong></li>
 *
 * (On id 53193 the same page labels 3.316,00 "Precio unitario sin impuestos" for
 * 330.000 units — the very mislabel this job corrects.)
 */

const LABEL = "Monto Total de la Compra";
const BASE = "https://www.comprasestatales.gub.uy/consultas/detalle/id";

export interface OfficialTotal {
  amount: number;
  currency: string;
}

/** `4.201,00` -> 4201. Dot groups thousands, comma is the decimal separator. */
export function parseUyNumber(raw: string): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9.,]/g, "");
  if (!/[0-9]/.test(digits)) return null;
  const normalised = digits.replace(/\./g, "").replace(",", ".");
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** `ocds-yfs5dr-53193` -> `53193`. */
export function idCompraFromOcid(ocid: string): string | null {
  if (!ocid) return null;
  const stripped = ocid.replace(/^ocds-[a-z0-9]+-/i, "");
  return /^\d+$/.test(stripped) ? stripped : null;
}

export function detalleUrl(idCompra: string): string {
  return `${BASE}/${idCompra}`;
}

export function parseOfficialTotal(html: string): OfficialTotal | null {
  const at = html.indexOf(LABEL);
  if (at === -1) return null;
  // The value is the first <strong> after the label.
  const window = html.slice(at, at + 400);
  const strong = /<strong>\s*([^<]+?)\s*<\/strong>/.exec(window);
  if (!strong) return null;
  const text = strong[1]!;
  const amount = parseUyNumber(text);
  if (amount === null) return null;
  const currency = /U\$S/i.test(text) ? "USD" : /€|EUR/i.test(text) ? "EUR" : "UYU";
  return { amount, currency };
}

export async function fetchOfficialTotal(idCompra: string): Promise<OfficialTotal | null> {
  const res = await fetch(detalleUrl(idCompra), {
    headers: { "user-agent": "conlatuya.checkleaked.cc (datos abiertos)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`detalle ${idCompra}: HTTP ${res.status}`);
  return parseOfficialTotal(await res.text());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-comprasestatales-total.ts`
Expected: PASS — prints `ok: comprasestatales total`

- [ ] **Step 5: Commit**

```bash
git add src/jobs/lib/comprasestatales-total.ts tests/unit/test-comprasestatales-total.ts tests/fixtures/comprasestatales-53193.html
git commit -m "feat(amounts): parse official purchase total from comprasestatales"
```

---

### Task 6: Candidate predicate

**Files:**
- Create: `src/jobs/lib/lumpsum-candidates.ts`
- Test: `tests/unit/test-lumpsum-artifacts.ts` (extend)

**Interfaces:**
- Produces:
  - `LUMPSUM_DEFAULTS = { qtyThreshold, suspectMinUyu, maxPlausibleUyu, ratioMin }`
  - `candidateMatchStage(o?: Partial<typeof LUMPSUM_DEFAULTS>): Record<string, unknown>` — the Mongo `$match`
  - `isLumpsumSuspect(release, o?): boolean` — the same rule in JS, for tests and for re-checking a fetched doc
  - `isArtifactConfirmed(computedTotal: number, officialTotal: number, o?): boolean`
- Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test-lumpsum-artifacts.ts`, above the final `console.log`:

```ts
import {
  isArtifactConfirmed,
  isLumpsumSuspect,
  LUMPSUM_DEFAULTS,
} from "../../src/jobs/lib/lumpsum-candidates";

// The real SURYPARK shape must be selected.
const suryparkRelease = {
  id: "adjudicacion-53193",
  tag: ["award"],
  amount: { primaryAmount: 43_823_788_579.956 },
  awards: [{
    items: [{
      quantity: 330000,
      classification: { id: "27050" },
      unit: { name: "UNIDAD", value: { amount: 3316, currency: "USD" } },
    }],
  }],
};
assert.equal(isLumpsumSuspect(suryparkRelease), true);

// A large but ordinary UYU contract must NOT be selected (wrong currency, and the
// mislabel we are hunting is concentrated in foreign-currency rows).
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [{ quantity: 330000, unit: { name: "UNIDAD", value: { amount: 3316, currency: "UYU" } } }] }],
}), false);

// Small quantity -> a genuinely expensive unit, not a lump sum.
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [{ quantity: 2, unit: { value: { amount: 3316, currency: "USD" } } }] }],
}), false);

// Below the suspect floor -> ordinary spending, leave it alone.
assert.equal(isLumpsumSuspect({ ...suryparkRelease, amount: { primaryAmount: 5_000_000 } }), false);

// Above the plausibility ceiling -> already excluded from aggregates elsewhere.
assert.equal(isLumpsumSuspect({ ...suryparkRelease, amount: { primaryAmount: 60e9 } }), false);

// Many priced lines -> the official single total could not be attributed; skip.
assert.equal(isLumpsumSuspect({
  ...suryparkRelease,
  awards: [{ items: [
    { quantity: 330000, unit: { value: { amount: 3316, currency: "USD" } } },
    { quantity: 330000, unit: { value: { amount: 3316, currency: "USD" } } },
    { quantity: 330000, unit: { value: { amount: 3316, currency: "USD" } } },
  ] }],
}), false);

// Confirmation compares the computed total against the official one.
assert.equal(isArtifactConfirmed(1_094_280_000, 4201), true);  // ~260,000x -> artifact
assert.equal(isArtifactConfirmed(4300, 4201), false);          // agrees -> not an artifact
assert.equal(isArtifactConfirmed(9000, 4201), false);          // ~2x -> below ratioMin, not ours
assert.equal(isArtifactConfirmed(4201, 0), false);             // guard against divide-by-zero
assert.equal(LUMPSUM_DEFAULTS.ratioMin, 5);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-lumpsum-artifacts.ts`
Expected: FAIL — `Cannot find module '../../src/jobs/lib/lumpsum-candidates'`

- [ ] **Step 3: Write the implementation**

Create `src/jobs/lib/lumpsum-candidates.ts`:

```ts
/**
 * Which releases might have a contract LUMP SUM stored in `unit.value.amount`.
 *
 * Worked example — adjudicacion-53193 (Dir. Nacional de Catastro, SURYPARK S.A.,
 * 2005): 330.000 "timbres" x a stored unit price of USD 3.316 = USD 1.094.280.000,
 * against a published total of USD 4.201. The government page itself labels the
 * 3.316 a "Precio unitario sin impuestos", so the feed is faithfully reproducing a
 * mislabelled source field; only the official total can settle it.
 *
 * The selection is deliberately structural (no price baseline needed), because
 * detect-anomalies' isLineTotalArtifact() cannot help here: it needs a baseline for
 * {classificationId, currency, unitName} and only runs over a trailing window,
 * while these records are from 2004-2005 and their article is rarely purchased.
 *
 * The band matters: releases above maxPlausibleUyu are already dropped from
 * aggregates by analytics-pipeline's MAX_PLAUSIBLE_RELEASE_UYU, so the ones that
 * actually distort the public totals are the ones sitting just BELOW that ceiling.
 */

export const LUMPSUM_DEFAULTS = {
  /** A unit price attached to this many units is implausible for a real unit price. */
  qtyThreshold: Number(process.env.LUMPSUM_QTY_THRESHOLD ?? 1000),
  /** Floor: below this a wrong total is not distorting anything. */
  suspectMinUyu: Number(process.env.LUMPSUM_SUSPECT_MIN_UYU ?? 1e9),
  /** Ceiling: matches analytics-pipeline's MAX_PLAUSIBLE_RELEASE_UYU. */
  maxPlausibleUyu: Number(process.env.MAX_PLAUSIBLE_RELEASE_UYU ?? 50e9),
  /** computed/official must exceed this to count as an artifact rather than a rounding gap. */
  ratioMin: Number(process.env.LUMPSUM_RATIO_MIN ?? 5),
  /** More priced lines than this and one official total cannot be attributed. */
  maxPricedItems: Number(process.env.LUMPSUM_MAX_ITEMS ?? 2),
};

export type LumpsumOptions = Partial<typeof LUMPSUM_DEFAULTS>;

const FOREIGN = ["USD", "EUR"];

/** The `$match` for stage 1. Kept in step with isLumpsumSuspect below. */
export function candidateMatchStage(o: LumpsumOptions = {}): Record<string, unknown> {
  const opts = { ...LUMPSUM_DEFAULTS, ...o };
  return {
    tag: "award",
    "amount.primaryAmount": { $gte: opts.suspectMinUyu, $lt: opts.maxPlausibleUyu },
    "amount.verifiedOverride": { $exists: false },
    awards: {
      $elemMatch: {
        items: {
          $elemMatch: {
            quantity: { $gte: opts.qtyThreshold },
            "unit.value.currency": { $in: FOREIGN },
            "unit.value.amount": { $gt: 0 },
          },
        },
      },
    },
  };
}

interface AnyItem {
  quantity?: unknown;
  unit?: { value?: { amount?: unknown; currency?: unknown } };
}
interface AnyAward { items?: AnyItem[] }
interface AnyRelease { amount?: { primaryAmount?: unknown }; awards?: AnyAward[] }

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The same rule as candidateMatchStage, applied to a document in hand. */
export function isLumpsumSuspect(release: AnyRelease, o: LumpsumOptions = {}): boolean {
  const opts = { ...LUMPSUM_DEFAULTS, ...o };
  const primary = num(release?.amount?.primaryAmount);
  if (primary === null || primary < opts.suspectMinUyu || primary >= opts.maxPlausibleUyu) {
    return false;
  }
  const awards = Array.isArray(release?.awards) ? release.awards : [];
  const priced = awards
    .flatMap((a) => (Array.isArray(a?.items) ? a.items : []))
    .filter((i) => (num(i?.unit?.value?.amount) ?? 0) > 0);
  if (priced.length === 0 || priced.length > opts.maxPricedItems) return false;

  return priced.some((i) => {
    const qty = num(i?.quantity);
    const currency = typeof i?.unit?.value?.currency === "string" ? i.unit!.value!.currency : "";
    return qty !== null && qty >= opts.qtyThreshold && FOREIGN.includes(currency.toUpperCase());
  });
}

/** True when the computed total is so far above the published one that it is an artifact. */
export function isArtifactConfirmed(
  computedTotal: number,
  officialTotal: number,
  o: LumpsumOptions = {},
): boolean {
  const opts = { ...LUMPSUM_DEFAULTS, ...o };
  if (!Number.isFinite(computedTotal) || !Number.isFinite(officialTotal)) return false;
  if (officialTotal <= 0 || computedTotal <= 0) return false;
  return computedTotal / officialTotal >= opts.ratioMin;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-lumpsum-artifacts.ts`
Expected: PASS — prints `ok: lumpsum artifacts`

- [ ] **Step 5: Sanity-check the candidate pool size on the live DB**

Run:
```bash
npx tsx -e "import('./shared/connection/database').then(async db => { await db.connectToDatabase(); const { ReleaseModel } = await import('./shared/models'); const { candidateMatchStage } = await import('./src/jobs/lib/lumpsum-candidates'); const m = candidateMatchStage(); console.log('candidates:', await ReleaseModel.countDocuments(m)); console.log(await ReleaseModel.find(m, { id: 1, 'amount.primaryAmount': 1 }).sort({ 'amount.primaryAmount': -1 }).limit(10).lean()); await db.disconnectFromDatabase(); })"
```
Expected: a bounded pool (tens–hundreds) that **includes `adjudicacion-53193` and
`adjudicacion-31334`**. If the count is in the thousands, raise `qtyThreshold` or
`suspectMinUyu` and re-run before proceeding — do not scrape thousands of pages.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/lib/lumpsum-candidates.ts tests/unit/test-lumpsum-artifacts.ts
git commit -m "feat(amounts): structural predicate for lump-sum total artifacts"
```

---

### Task 7: The correction job

**Files:**
- Create: `src/jobs/correct-lumpsum-artifacts.ts`

**Interfaces:**
- Consumes: `hasVerifiedOverride` (T1), `candidateMatchStage`/`isArtifactConfirmed` (T6),
  `fetchOfficialTotal`/`idCompraFromOcid`/`detalleUrl` (T5), `toNominalUyu`/`monthKey`
  (`shared/utils/real-value.ts`), `ExchangeRateModel` (seeded in T4).

- [ ] **Step 1: Write the job**

Create `src/jobs/correct-lumpsum-artifacts.ts`:

```ts
#!/usr/bin/env tsx

/**
 * Correct releases whose stored total was inflated by multiplying a contract LUMP
 * SUM by a quantity (see src/jobs/lib/lumpsum-candidates.ts for the worked case).
 *
 * For each structural candidate we read the real "Monto Total de la Compra" off the
 * government page and, only when it is smaller by a wide margin, rewrite `amount`
 * from that verified figure — converted at the BCU rate of the release's OWN month
 * via shared/utils/real-value.ts, never today's.
 *
 * The raw `awards[].items[]` are left untouched: they faithfully mirror the feed,
 * and the UI badge explains why the line figures overstate the header total.
 *
 * Anything uncertain is SKIPPED and logged. Nothing is ever estimated.
 *
 * Usage:
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts                    # dry run
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts --commit
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts --release=adjudicacion-53193 --commit
 *   npx tsx src/jobs/correct-lumpsum-artifacts.ts --limit=50
 */

import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ExchangeRateModel, ReleaseModel } from "../../shared/models";
import { monthKey, toNominalUyu, type RateTable } from "../../shared/utils/real-value";
import { hasVerifiedOverride, type VerifiedOverride } from "../../shared/utils/verified-override";
import {
  detalleUrl,
  fetchOfficialTotal,
  idCompraFromOcid,
} from "./lib/comprasestatales-total";
import { candidateMatchStage, isArtifactConfirmed } from "./lib/lumpsum-candidates";

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

/** Same shape app/server/utils/rates.ts builds, loaded once for the run. */
async function loadRateTable(): Promise<RateTable> {
  const rows = await ExchangeRateModel.find({}, { month: 1, usd: 1, eur: 1, ui: 1 }).lean();
  const byMonth: RateTable["byMonth"] = {};
  let latestUi: number | null = null;
  let latestUiMonth = "";
  for (const r of rows as Array<{ month: string; usd?: number; eur?: number; ui?: number }>) {
    byMonth[r.month] = { usd: r.usd, eur: r.eur, ui: r.ui };
    if (typeof r.ui === "number" && r.ui > 0 && r.month > latestUiMonth) {
      latestUiMonth = r.month;
      latestUi = r.ui;
    }
  }
  return { byMonth, latestUi };
}

/** The feed-derived total in the item currency — what the inflated figure came from. */
function computedTotalIn(release: any, currency: string): number | null {
  const stored = release?.amount?.totalAmounts;
  // totalAmounts is a Map in Mongoose but a plain object via .lean().
  const value = stored instanceof Map ? stored.get(currency) : stored?.[currency];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const only = arg("release");
  const limit = Number(arg("limit") ?? 0);

  console.log(`🧾 Correcting lump-sum total artifacts${commit ? "" : "  (DRY RUN)"}`);
  await connectToDatabase();

  const filter: Record<string, unknown> = only ? { id: only } : candidateMatchStage();
  let query = ReleaseModel.find(filter).sort({ "amount.primaryAmount": -1 });
  if (limit > 0) query = query.limit(limit);
  const candidates = await query.lean();
  console.log(`   candidates: ${candidates.length}`);

  const rateTable = await loadRateTable();
  console.log(`   rate table: ${Object.keys(rateTable.byMonth).length} months`);

  let corrected = 0, notArtifact = 0, unverified = 0, noRate = 0, skipped = 0;

  for (const release of candidates as any[]) {
    const id = release.id;

    if (hasVerifiedOverride(release)) { skipped++; continue; }

    const idCompra = idCompraFromOcid(release.ocid ?? "");
    if (!idCompra) {
      console.warn(`   ? ${id}: no id_compra from ocid ${release.ocid}`);
      unverified++;
      continue;
    }

    let official;
    try {
      official = await fetchOfficialTotal(idCompra);
    } catch (err) {
      console.warn(`   ? ${id}: ${(err as Error).message}`);
      unverified++;
      await sleep(DELAY_MS);
      continue;
    }
    if (!official) {
      console.warn(`   ? ${id}: no total on the official page`);
      unverified++;
      await sleep(DELAY_MS);
      continue;
    }

    const computed = computedTotalIn(release, official.currency);
    if (computed === null) {
      console.warn(`   ? ${id}: no stored ${official.currency} total to compare`);
      unverified++;
      await sleep(DELAY_MS);
      continue;
    }

    if (!isArtifactConfirmed(computed, official.amount)) {
      notArtifact++;
      await sleep(DELAY_MS);
      continue;
    }

    const rateMonth = monthKey(release.date);
    const primaryAmount = rateMonth
      ? toNominalUyu(official.amount, official.currency, rateMonth, rateTable)
      : null;
    if (primaryAmount === null) {
      console.warn(`   ? ${id}: no BCU rate for ${official.currency} in ${rateMonth} — run seed-historical-rates`);
      noRate++;
      await sleep(DELAY_MS);
      continue;
    }

    const previousPrimaryAmount =
      typeof release.amount?.primaryAmount === "number" ? release.amount.primaryAmount : null;

    const override: VerifiedOverride = {
      source: "comprasestatales",
      sourceUrl: detalleUrl(idCompra),
      officialTotal: official.amount,
      officialCurrency: official.currency,
      rateMonth: rateMonth!,
      previousPrimaryAmount,
      previousComputedTotal: computed,
      verifiedAt: new Date(),
      reason: "lumpsum-in-unit-price",
    };

    const amount = {
      ...release.amount,
      totalAmounts: { [official.currency]: official.amount },
      // [id].get.ts derives the native currency from this list; a stale multi-entry
      // list would make it fall back to the nominal figure.
      currencies: [official.currency],
      hasAmounts: true,
      primaryAmount,
      primaryCurrency: "UYU",
      verifiedOverride: override,
    };

    console.log(
      `   ✎ ${id}  ${Math.round(previousPrimaryAmount ?? 0).toLocaleString()} -> ${Math.round(primaryAmount).toLocaleString()} UYU` +
      `   (${official.currency} ${computed.toLocaleString()} -> ${official.amount.toLocaleString()} @ ${rateMonth})`
    );

    if (commit) {
      await ReleaseModel.updateOne({ _id: release._id }, { $set: { amount } });
    }
    corrected++;
    await sleep(DELAY_MS);
  }

  console.log(`\n   corrected     : ${corrected}`);
  console.log(`   not artifact  : ${notArtifact} (official total agrees — left alone)`);
  console.log(`   unverified    : ${unverified} (page missing/unparseable)`);
  console.log(`   no rate       : ${noRate} (seed exchange_rates for those months)`);
  console.log(`   already done  : ${skipped}`);
  if (!commit) console.log("   🧪 dry run: nothing written. Re-run with --commit.");
  else if (corrected) console.log("   ➜ run refresh-analytics to propagate into the rollups.");
}

if (require.main === module) {
  main()
    .then(async () => {
      await disconnectFromDatabase();
      console.log("✅ Done");
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("❌ Failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Dry-run the known case**

Run: `npx tsx src/jobs/correct-lumpsum-artifacts.ts --release=adjudicacion-53193`
Expected exactly one `✎` line reading roughly:
`✎ adjudicacion-53193  43,823,788,580 -> 103,596 UYU   (USD 1,094,280,000 -> 4,201 @ 2005-06)`
then `corrected: 1` and the dry-run notice. If it reports `no rate`, Task 4's seed did not cover
2005-06 — fix that first.

- [ ] **Step 3: Commit the single release and verify the write**

Run:
```bash
npx tsx src/jobs/correct-lumpsum-artifacts.ts --release=adjudicacion-53193 --commit
npx tsx -e "import('./shared/connection/database').then(async db => { await db.connectToDatabase(); const { ReleaseModel } = await import('./shared/models'); const r = await ReleaseModel.findOne({ id: 'adjudicacion-53193' }, { amount: 1 }).lean(); console.dir(r, { depth: 5 }); await db.disconnectFromDatabase(); })"
```
Expected: `amount.primaryAmount` ≈ 103 596, `amount.totalAmounts.USD` = 4201,
`amount.currencies` = `["USD"]`, and a populated `amount.verifiedOverride`.

- [ ] **Step 4: Prove the guard works (the regression that would undo everything)**

Run: `npx tsx src/jobs/correct-lumpsum-artifacts.ts --release=adjudicacion-53193`
Expected: `already done: 1`, `corrected: 0` — the override is respected on re-run.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/correct-lumpsum-artifacts.ts
git commit -m "feat(amounts): correct lump-sum total artifacts against official source"
```

---

### Task 8: "Verified" badge on the contract page

**Files:**
- Modify: `app/utils/contract.ts` (near `contractAmount()`, ~line 124)
- Modify: `app/pages/contracts/[id].vue` (header area, near the amount display at ~line 57)
- Modify: `app/i18n/locales/es.json`, `app/i18n/locales/en.json`

**Interfaces:**
- Consumes: `amount.verifiedOverride` written by Task 7.
- Produces: `contractVerifiedOverride(contract): VerifiedOverride | null` in `app/utils/contract.ts`.

- [ ] **Step 1: Add the accessor**

In `app/utils/contract.ts`, next to `contractAmount()`:

```ts
/**
 * The audit record left when a total was corrected against the government page
 * (see src/jobs/correct-lumpsum-artifacts.ts). Present only on corrected releases.
 */
export function contractVerifiedOverride(c: any): {
  sourceUrl: string
  officialTotal: number
  officialCurrency: string
  previousPrimaryAmount: number | null
} | null {
  const v = c?.amount?.verifiedOverride
  if (!v || typeof v !== 'object' || typeof v.sourceUrl !== 'string') return null
  return {
    sourceUrl: v.sourceUrl,
    officialTotal: Number(v.officialTotal),
    officialCurrency: String(v.officialCurrency ?? ''),
    previousPrimaryAmount:
      typeof v.previousPrimaryAmount === 'number' ? v.previousPrimaryAmount : null,
  }
}
```

- [ ] **Step 2: Add the i18n strings**

In `app/i18n/locales/es.json`, in the same object that holds `officialSourceHelp`:

```json
    "verifiedTotalBadge": "Monto verificado con la fuente oficial",
    "verifiedTotalHelp": "El dato original del feed multiplicaba la cantidad por un valor que en realidad era el monto total del contrato. Corregimos el total contra la ficha oficial; las líneas de abajo muestran el dato crudo del feed.",
    "verifiedTotalSource": "Ver ficha oficial"
```

In `app/i18n/locales/en.json`, the same keys:

```json
    "verifiedTotalBadge": "Total verified against the official record",
    "verifiedTotalHelp": "The raw feed multiplied the quantity by a value that was actually the contract's total amount. We corrected the total against the official record; the lines below show the raw feed data.",
    "verifiedTotalSource": "View official record"
```

- [ ] **Step 3: Render the badge**

In `app/pages/contracts/[id].vue`, add next to the existing `amount` computed (~line 57):

```ts
const verifiedOverride = computed(() => contractVerifiedOverride(contract.value))
```

and in the template, directly beneath the header total:

```vue
<div v-if="verifiedOverride" class="mt-2">
  <v-chip color="success" size="small" variant="tonal" prepend-icon="mdi-check-decagram">
    {{ $t('contract.verifiedTotalBadge') }}
  </v-chip>
  <div class="text-caption text-medium-emphasis mt-1">
    {{ $t('contract.verifiedTotalHelp') }}
    <a :href="verifiedOverride.sourceUrl" target="_blank" rel="noopener">
      {{ $t('contract.verifiedTotalSource') }}
    </a>
  </div>
</div>
```

Confirm the `contract.` i18n prefix matches where you placed the keys (the file already uses
`officialSourceHelp` — put the new keys in that same block and use that same prefix). Import
`contractVerifiedOverride` alongside the existing `contractAmount` import.

- [ ] **Step 4: Verify in the running app**

Run the dev server and load the corrected contract:
```bash
npm run dev   # port 3600 per project notes
```
Open `http://localhost:3600/contracts/adjudicacion-53193`.
Expected: the header shows ~US$ 4.201 / ~$ 103.596 (not 1.094.280.000), the green badge renders, and
the link opens the official page. Per the Nuxt/Vuetify notes, if the page looks stale, restart the
dev server rather than trusting a cached 200.

- [ ] **Step 5: Commit**

```bash
git add app/utils/contract.ts app/pages/contracts/[id].vue app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "feat(ui): badge contracts whose total was verified against the source"
```

---

### Task 9: Full run and rollup propagation

**Files:** none (operational)

- [ ] **Step 1: Full dry run on 167**

```bash
ssh build
cd <repo> && git pull && git checkout fix/lumpsum-amount-artifacts
npx tsx src/jobs/correct-lumpsum-artifacts.ts 2>&1 | tee /tmp/lumpsum-dry.log
```
Read every `✎` line. Expected: each correction reduces the total, and each `not artifact` skip is a
contract whose official total genuinely matches. **If any line raises a total, stop** — that is not
this bug.

- [ ] **Step 2: Commit the corrections**

```bash
npx tsx src/jobs/correct-lumpsum-artifacts.ts --commit 2>&1 | tee /tmp/lumpsum-commit.log
```

- [ ] **Step 3: Propagate into the rollups**

```bash
npx tsx src/jobs/refresh-analytics.ts
```

- [ ] **Step 4: Verify the public numbers moved**

```bash
npx tsx -e "import('./shared/connection/database').then(async db => { await db.connectToDatabase(); const { default: m } = await import('mongoose'); const te = m.connection.collection('top_entities'); console.log(await te.find({ entityId: 'R/213815180017' }).toArray()); console.log(await m.connection.collection('dashboard_metrics').findOne({})); await db.disconnectFromDatabase(); })"
```
Expected: SURYPARK S.A. is no longer the #1 all-time supplier, its `totalAmount` drops by ~84.6B, and
`dashboard_metrics.totalSpending` falls by roughly the same amount (~4.3%).

- [ ] **Step 5: Record the outcome**

Append the before/after totals to the spec's Problem section (or a short
`docs/superpowers/notes/` entry) so the numbers quoted in this plan stay traceable, and update the
memory file `gastos-gub-linetotal-artifact-uncorrected.md` to reflect that the bug is now corrected
rather than merely documented.

---

## Self-Review

**Spec coverage:** Stage 1 → T6; Stage 2 → T5; Stage 3 → T3+T4; Stage 4 → T7; Stage 5 → T1+T2;
Display → T8; Rollups → T9; Testing → tests in T1/T3/T5/T6 plus T9's live checks. Non-goals are
respected (no per-item splitting, no detect-anomalies change, no platform-wide FX re-derivation).

**Known deviations from the spec, deliberate:**
- The spec suggested extending `tests/unit/test-amount-calculator.ts`; no task changes
  `amount-calculator.ts` (the guards live in its callers), so that file is left alone.
- `hasVerifiedOverride` went to `shared/utils/` rather than `src/utils/amount-calculator.ts` so the
  Nuxt app can import it too.

**Open risk carried into execution:** T6 Step 5 measures the real candidate-pool size for the first
time. If it is far larger than expected, tighten the thresholds before T9 rather than scraping
thousands of government pages.
