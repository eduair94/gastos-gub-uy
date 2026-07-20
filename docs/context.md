# docs/ — guides, archive, specs and plans

Written memory for the gastos-gub monorepo: 7 current operational guides for the ingestion/cron tier, 8 superseded historical docs kept only for provenance, and `superpowers/` — the dated **spec → plan → notes** artifacts of the agent-driven workflow used for every feature since 2026-07-17. Also holds the 34 README screenshots. Nothing here is imported, built, or served by any code; the only build coupling is `docs/screenshots/` ← `README.md` ← [scripts/capture-screenshots.mjs](../scripts/capture-screenshots.mjs).

When starting a feature, read the matching `superpowers/specs/*-design.md` for *why*, then the `superpowers/plans/*.md` for *how* — the plan's `## Global Constraints` block is the fastest correct summary of this repo's invariants.

## Map

| Path | Purpose |
|---|---|
| [guides/](guides/) | 7 CURRENT operational guides; every subject still exists in `src/`. |
| [guides/cronserver.md](guides/cronserver.md) | PM2 cron app doc for [src/cronserver.ts](../src/cronserver.ts). **STALE** — see Gotchas. |
| [guides/mongodb-ingestion.md](guides/mongodb-ingestion.md) | Schema-analysis + MongoDB ingestion of the legacy zip path (`src/analyzer.ts`, `src/upload-releases.ts`). Partly stale. |
| [guides/rss-fetcher.md](guides/rss-fetcher.md) | The OCDS RSS layer: [src/services/release-rss-fetcher.ts](../src/services/release-rss-fetcher.ts). |
| [guides/web-uploader.md](guides/web-uploader.md) | The LIVE incremental ingest engine: [src/uploaders/release-uploader-new.ts](../src/uploaders/release-uploader-new.ts). |
| [guides/credenciales.md](guides/credenciales.md) | Spanish step-by-step for Firebase + Resend, and the two-`.env` rule (root `.env` = cronserver/scripts; `app/.env` = Nuxt web). §4 "Dónde poner cada variable" is the authority. |
| [guides/runner-setup-167.md](guides/runner-setup-167.md) | One-time operator steps to activate auto-deploy on the 167 prod box: install/label the self-hosted runner, `svc.sh install`, repoint pm2 at the runner workspace, add the `DASHBOARD_ENV` secret, Cloudflare cutover. |
| [guides/anomaly-heuristics-review.md](guides/anomaly-heuristics-review.md) | 7-agent review of [src/jobs/detect-anomalies.ts](../src/jobs/detect-anomalies.ts) + [src/jobs/anomaly-stats.ts](../src/jobs/anomaly-stats.ts). Header records which items SHIPPED (#2 line-total, #3 contamination guard, #5 deviation-from-mode); the rest is the open backlog with mechanisms. |
| [archive/](archive/) | 8 SUPERSEDED docs, no dates in filenames, predate the superpowers workflow. Provenance only — do not follow their instructions. |
| [archive/amount-calculator-refactoring.md](archive/amount-calculator-refactoring.md) | Origin of `src/utils/amount-calculator.ts` as shared code. |
| [archive/express-analytics-api.md](archive/express-analytics-api.md) | The DEAD Express API under `src/api/**`; the live API is `app/server/api/**`. |
| [archive/app-database-integration-plan.md](archive/app-database-integration-plan.md), [-status.md](archive/app-database-integration-status.md), [app-planning.md](archive/app-planning.md), [app-dashboard-refresh.md](archive/app-dashboard-refresh.md) | Earlier Nuxt-dashboard architecture and rollout notes. |
| [archive/buyers-api-optimization.md](archive/buyers-api-optimization.md) | Why `/api/buyers/[id]` was slimmed down. |
| [archive/schema-analysis-implementation.md](archive/schema-analysis-implementation.md) | The original SOLID scraper/schema-analyzer build-out. |
| [superpowers/specs/](superpowers/specs/) | 20 design specs, `YYYY-MM-DD-<topic>-design.md`. The WHAT/WHY: problem, data reality verified against the live DB, locked decisions, non-goals, verification plan. Never step-by-step code. |
| [superpowers/plans/](superpowers/plans/) | 8 implementation plans, `YYYY-MM-DD-<topic>.md` (no `-design`). Goal / Architecture / Tech Stack / Global Constraints / File Structure / numbered TDD tasks. 234–1519 lines. |
| [superpowers/notes/](superpowers/notes/) | 2 spike outputs referenced by plan tasks: [rupe-viability.md](superpowers/notes/rupe-viability.md) (Task 9 — verdict **DEFER**, RUPE exposes no email) and [phase-a-validation.md](superpowers/notes/phase-a-validation.md) (Task 10 — DNS is blocked on the dev box, so MX checks must run on 167). |
| [screenshots/](screenshots/) | 28 PNGs referenced by [README.md](../README.md) lines 16–139. |
| [screenshots/ui-history/](screenshots/ui-history/) | 6 one-off UI-iteration shots, not referenced by the README body. |
| `../.superpowers/sdd/` | UNTRACKED runtime state of executing a plan: `progress.md`, `progress-lumpsum.md`, `task-N-brief.md` / `task-N-report.md`, `review-<sha>..<sha>.diff`, `fix-*.md`. Read this to know what actually shipped. |

## Entry points / how to run

```bash
# Execute a plan (agent workflow) — the plan names its own required sub-skill on line 3
Skill(superpowers:subagent-driven-development)   # or superpowers:executing-plans
# with e.g. docs/superpowers/plans/2026-07-20-correct-lumpsum-artifacts.md

# Regenerate docs/screenshots/ from the LIVE site (Playwright is NOT a repo dep)
npm i -D playwright && npx playwright install chromium
node scripts/capture-screenshots.mjs
node scripts/capture-screenshots.mjs --base https://localhost:3600 --out /tmp/shots

# The test form every plan task uses (no runner exists in this repo)
npx tsx tests/unit/test-lumpsum-artifacts.ts   # exit 0 = pass

# What plans use to verify an endpoint
cd app && npm run dev     # port 3600, then curl localhost:3600/api/...

# Find what actually shipped for a given spec
git log --oneline -- docs/superpowers/plans/2026-07-19-supplier-contact-enrichment.md
ls .superpowers/sdd/
```

## Conventions

| Convention | Cite |
|---|---|
| Specs end in `-design.md`; plans do **not**. Both are prefixed with the ISO date they were written. One spec may spawn several plans (tender-anticipation → `-fase1-recurrence` + `-fase2-alerts`; cold-email → `supplier-contact-enrichment` (Phase A) + `cold-email-campaign-phase-b`). | [specs/2026-07-19-tender-anticipation-design.md](superpowers/specs/2026-07-19-tender-anticipation-design.md) vs [plans/2026-07-19-tender-anticipation-fase1-recurrence.md](superpowers/plans/2026-07-19-tender-anticipation-fase1-recurrence.md) |
| Every plan opens with the same blockquote naming a REQUIRED SUB-SKILL and uses `- [ ]` checkboxes so a resumed agent can find its place. All 8 plans have it. | [plans/2026-07-20-correct-lumpsum-artifacts.md:3](superpowers/plans/2026-07-20-correct-lumpsum-artifacts.md) |
| Every plan carries `## Global Constraints` restating the repo traps for that feature (Mongo 4.4 standalone / no `$percentile` / `allowDiskUse`, never `git add -A`, dry-run by default, never fabricate a number, run DB jobs on 167). Read it before touching any file the plan names. | [plans/2026-07-20-correct-lumpsum-artifacts.md](superpowers/plans/2026-07-20-correct-lumpsum-artifacts.md) lines 15–24 |
| Plan tasks are strict TDD blocks: write the failing test → run it and state the expected failure → implement → verify → commit. Tests are standalone `node:assert` scripts at `tests/unit/test-*.ts`, run with `npx tsx`, ending in `console.log("ok: <name>")`. Do **not** add jest/vitest. | [plans/2026-07-20-correct-lumpsum-artifacts.md](superpowers/plans/2026-07-20-correct-lumpsum-artifacts.md) Global Constraints; [tests/unit/test-lumpsum-artifacts.ts](../tests/unit/test-lumpsum-artifacts.ts) |
| Specs cite the live code they are changing by `file.ts:line` and quote a confirmed live case with real ids, not a hypothetical. | [specs/2026-07-20-correct-lumpsum-artifacts-design.md](superpowers/specs/2026-07-20-correct-lumpsum-artifacts-design.md) — cites `src/utils/amount-calculator.ts:175` and `adjudicacion-53193` |
| Spanish-language specs/guides keep Spanish section headers (`## Contexto y motivación`, `## Decisiones de diseño (locked)`, `## Honestidad de datos`). Do not translate an existing doc; match its language. | [specs/2026-07-19-tender-anticipation-design.md](superpowers/specs/2026-07-19-tender-anticipation-design.md), [guides/credenciales.md](guides/credenciales.md) |
| A finished review/backlog doc marks shipped items inline with ✅ + `_(SHIPPED)_` and keeps a dated `**Status …**` line at the top with the measured delta. | [guides/anomaly-heuristics-review.md](guides/anomaly-heuristics-review.md) line 5 and the quick-wins table |
| New operational guides go in `guides/` and get a row in the README doc index; superseded ones move to `archive/`, never get deleted. | [README.md](../README.md) lines 307–311 |

## Gotchas

- **`README.md:163` links to `docs/context.md`** — this file. Before it existed the link was broken; keep the filename stable. The real doc index is [README.md](../README.md) lines 307–311.
- **Spec `Status:` headers are written at design time and NEVER updated.** [specs/2026-07-19-anomaly-hub-error-carga-report-design.md:4](superpowers/specs/2026-07-19-anomaly-hub-error-carga-report-design.md) and [specs/2026-07-19-dei-industrial-registry-crossref-design.md:4](superpowers/specs/2026-07-19-dei-industrial-registry-crossref-design.md) both still say "Approved (design), pending implementation plan" although both shipped (the first even has a plan at [plans/2026-07-19-anomaly-hub-errores-carga.md](superpowers/plans/2026-07-19-anomaly-hub-errores-carga.md)). Decide what shipped from `git log` and `.superpowers/sdd/progress*.md`, not the header. Five specs carry no Status line at all.
- **[guides/cronserver.md](guides/cronserver.md) is stale in a way that will mislead you.** It documents ONE job at `0 0 * * *` (daily midnight) on port 3002. Reality: [src/cronserver.ts](../src/cronserver.ts) schedules 13 jobs (ingest hourly at `5 * * * *`, all timezone `America/Montevideo`), and the port is `CRON_SERVER_PORT` — `ecosystem.config.js` says 3002, `cronserver.config.js` says 3902. Trust the code.
- **[guides/mongodb-ingestion.md:40](guides/mongodb-ingestion.md) tells you to run `npm run analyze`** — that script does not exist in the root `package.json`. Its whole subject (the zip → `db/` → `ScraperFactory` path) is the legacy bulk path; the live path is `src/uploaders/release-uploader-new.ts`.
- **`archive/` is explicitly superseded** ([README.md](../README.md) line 310). `archive/express-analytics-api.md` documents `src/api/**`, which nothing starts (`ecosystem.config.js` runs only the Nuxt dashboard and the cronserver). `archive/app-database-integration-plan.md` describes a pre-Nuxt architecture.
- **`.superpowers/sdd/` is untracked** (`git ls-files .superpowers` returns nothing) and holds ~70 files of per-run state. It is the only record of per-task review diffs. Do not assume it survives a clone or a branch switch.
- **Multiple agent sessions share ONE working tree** — encoded in [plans/2026-07-20-correct-lumpsum-artifacts.md](superpowers/plans/2026-07-20-correct-lumpsum-artifacts.md) Global Constraints: never `git add -A`, stage explicit paths, check the branch first. A concurrent session's commit landed mid-plan on `fix/lumpsum-amount-artifacts`; recorded in `.superpowers/sdd/progress-lumpsum.md`.
- **`docs/superpowers/specs/2026-07-20-correct-lumpsum-artifacts-design.md` is currently modified in the working tree** — check `git status` before editing a spec; another session may own it.
- **Playwright is deliberately not a dependency** ([scripts/capture-screenshots.mjs](../scripts/capture-screenshots.mjs) lines 8–11: ~300MB of browsers for a docs-only task). `node scripts/capture-screenshots.mjs` fails until you install it ad hoc.
- **`capture-screenshots.mjs` defaults `--base` to `https://conlatuya.checkleaked.cc`** (the live host), not `gastos.gub.uy` and not localhost — running it captures PRODUCTION, so `docs/screenshots/` is downstream of a deploy, not of your working tree. Default `--out` is `<cwd>/docs/screenshots`, so run it from the repo root.
- **Screenshot counts:** 28 PNGs at `screenshots/` top level, 6 more under `screenshots/ui-history/`. README embeds 18 of them (lines 16–139); adding a screenshot without a README reference leaves it orphaned.
- **`docs/` is 51 tracked files and is not compiled or linted by anything.** Root `tsconfig.json` includes only `src/**` and `shared/**`; there is no `npm test` and `.github/workflows/deploy.yml` runs no doc checks. A wrong path in a doc fails silently forever.
- **[guides/anomaly-heuristics-review.md](guides/anomaly-heuristics-review.md) flags an unresolved conflict** about whether `releases.date` is a real `Date` or an ISO string, and says to verify with a live `$type` check before building date-math heuristics (#12, #17). Do not build on either assumption without checking.
- **[guides/credenciales.md](guides/credenciales.md) §4 is load-bearing:** two `.env` files exist on purpose and `npm run dev` in `app/` reads `app/.env`, not the root one. A credential rotation must update both plus the `DASHBOARD_ENV` GitHub secret.

## Related

| Context | Covers |
|---|---|
| [../CLAUDE.md](../CLAUDE.md) | Root agent instructions. Sibling `context.md` files below are generated per-directory by the same pass as this one — if a link 404s, that directory's file has not been written yet. |
| [../README.md](../README.md) | Public overview + the doc index (lines 307–311) and screenshot gallery. |
| [../src/context.md](../src/context.md) | Ingestion + batch-job layer (the subject of `guides/`). |
| [../src/jobs/context.md](../src/jobs/context.md) | The job layer (`detect-anomalies`, `score-anomalies-ai` — subject of `guides/anomaly-heuristics-review.md`). |
| [../shared/context.md](../shared/context.md) | Models, connection, pure algorithms shared by jobs and the app. |
| [../app/context.md](../app/context.md) | Nuxt frontend. |
| [../app/server/context.md](../app/server/context.md) | Nitro API routes. |
| [../scripts/context.md](../scripts/context.md) | Ops scripts incl. `capture-screenshots.mjs` and `deploy-dashboard.mjs`. |
| [../packages/mcp/README.md](../packages/mcp/README.md) | The `@gastos-gub/mcp` stdio server. |
| [../app/DESIGN.md](../app/DESIGN.md) | Binding UI/design contract referenced by most plans' Global Constraints. |
