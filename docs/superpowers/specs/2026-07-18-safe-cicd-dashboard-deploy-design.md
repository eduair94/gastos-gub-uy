# Safe CI/CD dashboard deploy — design

**Date:** 2026-07-18
**Status:** approved

## Problem

On 2026-07-18 the public dashboard went down (503, "no data on load"). Root
cause chain:

1. The build Node was switched to **v24** (unsupported by Nuxt 3.x — 18/20/22
   only). `nuxt build` then failed **nondeterministically** (Windows FS races:
   `writeManifest`/`#shared`/renderer-chunk ENOENTs, silent crashes).
2. Dependencies **floated** — `app/package-lock.json` is gitignored, so the
   `^3.13.0` caret pulled a newer, broken Nuxt.
3. `nuxt build` writes **in place** to `.output`, clearing it first. A failed or
   partial build left `.output/server` empty while `.output/public` looked built.
4. pm2 crash-looped the missing server bundle → stopped → **503**.
5. A **concurrent** manual `nuxt build` also rewrote `.output` under the live
   process mid-serve (`renderer.mjs` ENOENT, ↺20 restart storm).

Prod (167.148.41.10) is a locked-down Linux server: only outbound reachable
(SSH/80/443 closed), runs the dashboard under **pm2 + node**, Mongo local.

## Goal

Auto-deploy on push to `master`, executed **on 167**, such that:

- A failed/broken build can **never** take the live site down.
- Two builds can **never** run at once (CI vs CI, or CI vs manual).
- The build always runs on a **supported Node (18/20/22)**.
- Dependencies can't silently drift.
- A bad deploy **auto-rolls-back**.

## Architecture

### 1. `scripts/deploy-dashboard.mjs` (cross-platform Node ESM, no deps)

Runs the same on 167 (Linux) and the Windows box. Sequence:

1. **Lock (mutex):** `app/.deploy.lock` created with `O_EXCL` (pid + host +
   startedAt). Held → abort. Stale (age > 30 min or dead pid) → steal. This is
   the single-flight guarantee that stops overlapping builds corrupting `.output`.
2. **Node enforce:** if `process` Node major ∈ {18,20,22} build with it; else
   locate a Node 22 (`DEPLOY_NODE` env override, else nvm dir scan) and run the
   build with that binary; none found → abort with install instructions.
3. **Build → staging:** `NITRO_OUTPUT_DIR=app/.output-next nuxt build`, **retry
   ≤5×** (clears `.output-next` + `.nuxt` each try). The live `.output` is never
   touched during build.
4. **Verify:** `.output-next/server/index.mjs` exists **and** a smoke-boot of it
   on a temp port (loading `app/.env`) returns HTTP 200 with real data from
   `/api/contracts?limit=1` (≥1 contract). Catches broken-but-present builds.
5. **Atomic swap:** `pm2 stop` → `mv .output → .output-prev` →
   `mv .output-next → .output` → `pm2 restart` (fallback `pm2 start ecosystem
   --only`) → `pm2 save`. Rename-with-retry for transient Windows locks.
6. **Health + auto-rollback:** poll `:3600/api/contracts?limit=1` for 200+data
   ≤30 s. Fail → swap `.output-prev` back, restart, exit non-zero "ROLLED BACK".
7. Any **pre-swap** failure → live `.output` and running process untouched,
   exit non-zero.

Flags: `--dry-run` (build + verify + smoke only, no swap/pm2 — for testing).

### 2. `.github/workflows/deploy.yml`

```yaml
on: { push: { branches: [master] } }
concurrency: { group: deploy-dashboard-167, cancel-in-progress: false }  # serialize
jobs:
  deploy:
    runs-on: [self-hosted, gastos-167]
    steps:
      - uses: actions/checkout@v4
      - run: printf '%s' "${{ secrets.DASHBOARD_ENV }}" > app/.env
      - run: npm --prefix app ci
      - run: node scripts/deploy-dashboard.mjs
```

- Self-hosted runner on 167 dials out to GitHub (works through the firewall).
- `concurrency` queues overlapping pushes; the script lock also blocks
  manual-vs-CI overlap. Two layers of single-flight.
- The runner workspace **is** the prod serving dir; pm2 on 167 is repointed once
  to serve `<workspace>/app/.output/server/index.mjs`.

### 3. Drift prevention

- `app/.nvmrc` = `22`.
- **Un-gitignore + commit `app/package-lock.json`** (stops caret float; the
  workflow uses `npm ci`).
- `app/package.json` `engines.node` = `>=18 <23`; `scripts/check-node.mjs` run on
  `prebuild` hard-fails on Node ≥23.

### 4. Secrets

`.env` (Mongo + Firebase) → GitHub repo secret `DASHBOARD_ENV`, materialized at
deploy time. No secrets committed.

### 5. `nuxt.config.ts`

`nitro.output.dir` honors `NITRO_OUTPUT_DIR` when set (enables staging builds).

## Operator setup on 167 (documented in `docs/RUNNER-SETUP-167.md`)

1. Install + register the GitHub Actions self-hosted runner (label `gastos-167`),
   as a service so it survives reboot.
2. Repoint pm2 to serve `.output` from the runner workspace (or set a fixed prod
   path and pass it to the script).
3. Add GitHub secret `DASHBOARD_ENV` = 167's `.env`.
4. Confirm 167's public ingress (its own cloudflared tunnel) for the eventual
   hostname cutover from the Windows box.

## Out of scope (flagged, not fixed here)

- Cronserver `spawn npx` ENOENT bug and the ecosystem tsx path.
- Migrating the public hostname from the Windows box to 167 (operator cutover).
