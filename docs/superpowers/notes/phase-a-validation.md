# Phase A — Validation findings (Task 10)

**Date:** 2026-07-19
**Run environment:** dev workstation (Windows). **DNS is blocked here** — `dns.resolveMx`
returns `ECONNREFUSED` for every domain (even `gmail.com`); MongoDB works only because it
connects to `167.148.41.10:27017` by IP literal.

## What was validated here (in-DB paths only)

Ran `enrich-supplier-contacts.ts --limit=25 --sources=dei --dry-run` against the **live** DB:

- ✅ End-to-end wiring executes: connect → select suppliers by spend priority → DEI resolver
  → rubro derivation → merge/pick → (dry-run) report.
- ✅ DEI resolver extracts emails (several top suppliers showed `1 email`).
- ✅ Rubro derivation returns real SICE rubros per supplier (1–5 each).
- ⚠️ `primaryEmail` came back `null` for **all** rows (`with a primary email: 0`). **Root cause:
  DNS blocked** → `mxValid` is false for every candidate → `pickPrimary` filters them out.
  This is an environment artifact, NOT a code defect.

## What could NOT be validated here

Everything that needs hostname resolution: MX validation, the **website**, **web-search**, and
**impo** resolvers. All require DNS and fail with `ECONNREFUSED`/`ENOTFOUND` in this sandbox.

## Measured DEI-source ceiling (DB-only, no DNS)

Direct aggregation (`dei_companies` with email × digits-match to `supplier_patterns.supplierId`):

- **1,824 suppliers** have a usable DEI email. This is the zero-network floor of the recipient
  list; the website/web-search/impo resolvers extend it (unquantified until run on 167).

## RUPE (Task 9)

**Deferred** — see [rupe-viability.md](rupe-viability.md). RUPE's open dataset + public no-login
lookup expose only fiscal-domicile fields; the contact **email is behind the ARCE gestión login**,
out of scope. The richest source is unavailable, so reachable universe = DEI + website + web-search
+ impo.

## Run the real coverage baseline on the 167 server

DNS + outbound HTTP work there (it's the cron box — see the deploy notes). SSH in and run from
the repo root:

```bash
# 1. Build the supplier_contacts indexes (idempotent).
npx tsx scripts/ensure-indexes.ts

# 2. DEI-only baseline (fast, still needs DNS for MX):
npx tsx src/jobs/enrich-supplier-contacts.ts --limit=200 --sources=dei --dry-run

# 3. Full multi-source dry-run on the top 50 (network + throttled):
npx tsx src/jobs/enrich-supplier-contacts.ts --limit=50 --dry-run

# 4. Real write for the top 500, then read the tail line for the coverage number:
npx tsx src/jobs/enrich-supplier-contacts.ts --limit=500
#    → "✅ processed 500; supplier_contacts with a primary email: <N>"
```

Record `<N>` and the DEI-only baseline here — those numbers size the Phase B campaign.

## Design observation for Phase B / follow-up (not fixed in Phase A)

`pickPrimary` hard-gates on `mxValid`. A high-confidence, official **DEI** email (open data,
0.9 confidence) is dropped entirely when MX resolution is merely *unavailable* (transient DNS
outage, blocked resolver), not when it's proven invalid. Consider: treat MX-lookup **failure**
(network/timeout) differently from MX **absence** (domain has no mail records) — e.g. keep a
DEI email as a lower-tier primary on lookup failure — so a flaky resolver can't zero out the
whole list. Deliberately deferred: Phase A chose MX-gating for deliverability hygiene; revisit
when wiring the Phase B send list.
