# CLAUDE.md — gastos-gub

Root brief for AI agents. Read this first. Then read the `context.md` of the directory you touch.
Every major directory has one. Do not grep the whole tree instead.

## What this repo is

**Con la tuya, contribuyente** (live: [conlatuya.checkleaked.cc](https://conlatuya.checkleaked.cc),
canonical `gastos.gub.uy`) is a transparency platform over Uruguay's public-procurement open data (OCDS).

It ingests ~2.17M contract records since 2002 into MongoDB. It normalises amounts across currencies.
It reconciles government corrections. It screens for price anomalies with statistics plus an LLM
second stage. It cross-references several external registries.

It publishes a Nuxt dashboard, a public API, webhooks and an MCP server.

## Two projects, one repo

| | Root package (`package.json`) | `app/` package (`app/package.json`) |
|---|---|---|
| Name | `gastos_gub-scraper` | `gastos_gub-dashboard` |
| Role | Ingestion, batch jobs, cron server, ops | Nuxt 3 dashboard **and** the live API (Nitro) |
| Runtime | `tsx`/`node`, CommonJS | Nuxt 3.19.3, ESM |
| Runs on prod as | PM2 app `gastos-gub-cronserver` | PM2 app `gastos-gub-dashboard` (port 3600) |

Both import [`shared/`](shared/) — the Mongo models + pure cross-layer helpers. `app/server` imports
it by **relative path**. `app/` client code uses the `#shared/*` alias.

```
OCDS feed ──► src/ (ingest) ──► MongoDB `releases` ──► src/jobs/ (rollups + anomalies + AI triage)
                                                             │
                                              precomputed collections
                                                             │
                                              app/server/api/** (Nitro, reads rollups)
                                                             │
                                    Nuxt dashboard · /api/v1 · webhooks · packages/mcp
```

## Directory map → context files

| Directory | Read before working in it |
|---|---|
| [`src/`](src/) — ingestion, services, cron server | [src/context.md](src/context.md) |
| [`src/jobs/`](src/jobs/) — analytical + enrichment jobs | [src/jobs/context.md](src/jobs/context.md) |
| [`shared/`](shared/) — models, connection, pure utils | [shared/context.md](shared/context.md) |
| [`app/`](app/) — Nuxt dashboard (frontend) | [app/context.md](app/context.md) |
| [`app/server/`](app/server/) — Nitro API | [app/server/context.md](app/server/context.md) |
| [`scripts/`](scripts/) — deploy, indexes, build assets | [scripts/context.md](scripts/context.md) |
| [`tests/`](tests/) — assertion scripts (no runner) | [tests/context.md](tests/context.md) |
| [`docs/`](docs/) — guides, specs, plans, screenshots | [docs/context.md](docs/context.md) |
| [`packages/mcp/`](packages/mcp/) — MCP server | [packages/mcp/README.md](packages/mcp/README.md) |
| UI design contract | [app/DESIGN.md](app/DESIGN.md) — **read before any UI change** |

## Commands

```bash
# Dashboard (dev, http://localhost:3600)
npm --prefix app run dev
npm --prefix app run build          # prebuild enforces Node 18/20/22 + asset subsets

# From a clean checkout with NO database (bash + docker; needs `just`)
just run                            # local Mongo container + synthetic fixture + dev server
just dev                            # dashboard only, against whatever .env already says
npm run seed:dev                    # reseed the local fixture — WIPES releases; refuses a remote URI

# Batch jobs (root) — `npm run` with no args lists them all
npm run detect-anomalies            # price screening
npm run reconcile-amendments        # fold gov corrections into base awards
npm run refresh-analytics           # supplier/buyer/insight/dashboard rollups
npm run ensure-indexes              # THE only thing that builds indexes (autoIndex is off)

# Tests — no framework; each file is a tsx program that exits non-zero on failure
npm test                            # tests/unit, pure only (skips *.verify.ts + credentialed)
npx tsx tests/unit/test-matcher.ts  # or run one directly
npm run test:integration            # needs a live MONGODB_URI

# Screenshots for docs/README (Playwright installed ad hoc — see the script header)
npm run screenshots
```

## How to write (repo-wide, binding)

Write every prose artifact in **ASD-STE100 applied to Spanish** — Simplified Technical Spanish. This
covers code comments, docblocks, `context.md` files, commit messages, PR bodies, specs, memory files
and agent prompts. The goal is one thing: **no redundant text**. A sentence that repeats what the
previous one said is a defect, the same as dead code.

The rules, in order of how often they are broken here:

1. **One idea per sentence.** Split anything with two clauses joined by "y" that could stand alone.
2. **Short sentences.** Max 20 words when you instruct, max 25 when you describe.
3. **Short paragraphs.** Max 6 sentences when you instruct, max 5 when you describe.
4. **One term per concept, always the same term.** Never rotate synonyms for variety. If it is
   `adjudicación` in line 1, it is `adjudicación` in line 40 — not `compra`, not `contrato`.
5. **Active voice, present tense.** `El job escribe X`, not `X es escrito por el job`.
6. **Say what to do.** Reserve the negative form for warnings and traps, where it is the point.
7. **Cut empty verbs.** `Corré el job`, not `procedé a llevar a cabo la ejecución del job`.
8. **No noun stacks over three words.** Break them with prepositions.
9. **No gerund chains.** One gerund per sentence at most.
10. **Warnings first, as an order.** The trap goes before the explanation, not after it.

**The one carve-out, and it is deliberate.** The site's published copy — investigation prose, page
deks, disclaimers — keeps the voice [PRODUCT.md](PRODUCT.md) defines: "plain, precise and
occasionally wry". Rules 1, 4, 5, 7 and 10 apply there too and improve it. Rules 2, 3 and 6 do not:
a piece that explains why a figure cannot be published needs a sentence long enough to hold the
reason. Published prose is edited for a reader, not for a technician. Everything else on this list
is edited for whoever maintains the code, and that reader wants it shorter.

## Conventions (repo-wide)

- **Money:** every amount is `amount.primaryAmount` (UYU-normalised, `AMOUNT_CALCULATION_VERSION`).
  Never re-sum `awards.items.unit.value.amount` raw — that is the pre-normalisation number, and the
  bug behind the legacy `precalculate-dashboard`/`populate-analytics` path. Cross-currency and
  cross-year comparisons go through [shared/utils/real-value.ts](shared/utils/real-value.ts).
- **Gov links** always come from `ocid` via [shared/utils/ocid.ts](shared/utils/ocid.ts), never from
  a release `id` (ids diverge on aclaración/ajuste records).
- **New Mongoose models** use the guarded form (`mongoose.models.X || mongoose.model('X', S)`) and an
  explicit `{ collection }`. Add every field to **both** the interface and the Schema.
- **Indexes** exist only if [scripts/ensure-indexes.ts](scripts/ensure-indexes.ts) builds them —
  `autoIndex` is off. A `Schema.index()` alone does nothing.
- **Optional TS props** are written `?: T | undefined` (root tsconfig sets `exactOptionalPropertyTypes`).
- **UI:** gold = money, one logarithmic magnitude scale site-wide, es/en via i18n.
  [app/DESIGN.md](app/DESIGN.md) holds the full contract and is binding. Mobile layout is part of that
  contract. `npm run check:layout` enforces the four rules that have shipped broken (see below).
- **File references in Markdown** use relative links so they stay clickable.

## Traps that cost a cycle

- **Concurrent sessions share one working tree.** Branches switch under you. A broad `git add` sweeps
  another session's uncommitted files. Check the branch, stage explicit paths, never `git add -A`.
- **Node 23+ breaks the Nuxt build** nondeterministically. Use 18/20/22 (`app/.nvmrc`);
  [scripts/check-node.mjs](scripts/check-node.mjs) hard-fails otherwise.
- **`.env` wins over shell env** — importing any model runs `dotenv config({ override: true })`. A
  stale shell var will not override `.env`; edit `.env`.
- **Long jobs must raise `MONGO_SOCKET_TIMEOUT_MS` before `connectToDatabase()`** or the 45s default
  kills the aggregation mid-flight.
- **Anomalies:** sort on `severityRank`, not the `severity` string; "recent" means `firstDetectedAt`,
  not `detectedAt` (which is restamped every run).
- **Never restore an inflated lump-sum total:** any job writing `release.amount` must check
  `hasVerifiedOverride()` and skip. See [line-total artifact](docs/superpowers/specs/).
- **Mobile layout breaks silently — nothing in the build sees it.** Four defects have shipped to
  production this way, all invisible above ~640px:
  1. A `padding` shorthand on an element that also carries `.u-container` outranks the container's
     `padding-inline`. A `0` in the inline slot flushes the page against the phone's edge.
  2. `var(--s-10)`+ is off a scale that stops at `--s-9`. The browser drops the whole declaration as
     invalid.
  3. Vue condenses the newline between two sibling tags, so a chip welds to the name. Wrap them in
     `.chip-row`.
  4. `<v-pagination>` needs 432px and pushes the document sideways — use `<DataPager>`.

  `npm run check:layout` ([scripts/check-layout-guards.mjs](scripts/check-layout-guards.mjs)) fails on
  all four. It runs in `app`'s `prebuild`, so a regression fails the deploy build. It is a text scan.
  For anything subtler use the 360px check in [Verifying work](#verifying-work-in-a-test-less-repo).
- **No `npm test` framework.** List `tests/` to discover the standalone `tsx` scripts.
- The Express API under `src/api/**` and the `precalculate-dashboard`/`populate-analytics` scripts are
  **legacy/dead** — the live API is `app/server/api/**` and the live rollups are `src/jobs/refresh-*`.
- Contact-directory exports deliberately use Mongo cursors, 250-row serializers and one shared heavy
  export slot per dashboard worker ([app/server/utils/heavy-export.ts](app/server/utils/heavy-export.ts)).
  Do not restore a 50k-document `.lean()` array or ExcelJS `writeBuffer()` on a request path.

## Deploy

Push to `master`. GitHub Actions then runs on a self-hosted runner **on the prod box**.
[scripts/deploy-dashboard.mjs](scripts/deploy-dashboard.mjs) builds to staging, health-checks, and
swaps atomically. It rolling-reloads two pm2 workers. It auto-rolls-back on failure. Full story:
[docs/context.md](docs/context.md) and [docs/guides/](docs/guides/).

## Verifying work in a test-less repo

- Root typecheck: `npx tsc --noEmit` (compiles `src/` + `shared/`).
- Lint the non-Nuxt half: `npx eslint src shared scripts tests` (config at `eslint.config.mjs`).
- Behaviour: add/run a `tsx` assertion script under `tests/unit/`.
- Live checks: `curl` the dev server on `:3600` (typecheck/build env can be broken while the server runs).
- UI: `npm run check:layout`, then load the changed route in a browser at **360px**. The page is
  verified once `document.documentElement.scrollWidth <= innerWidth` and no content box sits at `x = 0`.
