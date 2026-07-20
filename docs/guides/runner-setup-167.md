# CI/CD setup on the 167 prod server

One-time operator steps to activate auto-deploy (push to `master` → deploy on
167). The workflow (`.github/workflows/deploy.yml`) and deploy script
(`scripts/deploy-dashboard.mjs`) are already in the repo. You run these on 167
because it is firewalled (no inbound SSH from here).

## 0. Prerequisites on 167

- **Node 22** available (Nuxt 3.x does not support Node ≥23):
  ```bash
  nvm install 22 && nvm alias default 22
  # or set DEPLOY_NODE=/path/to/node22 in the runner env
  ```
- **pm2** installed globally, running the dashboard as `gastos-gub-dashboard`.
- The repo cloned once (the runner will manage it thereafter).

## 1. Install the self-hosted runner

GitHub → repo **Settings → Actions → Runners → New self-hosted runner → Linux**.
Copy the commands it shows (they include a short-lived token), then:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner.tar.gz -L <URL_FROM_GITHUB>
tar xzf actions-runner.tar.gz
./config.sh --url https://github.com/eduair94/gastos-gub-uy \
            --token <TOKEN_FROM_GITHUB> \
            --labels gastos-167 \
            --name 167-prod --unattended
```

The `gastos-167` label must match `runs-on: [self-hosted, gastos-167]` in the
workflow.

## 2. Run it as a service (survives reboot)

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

## 3. Point pm2 at the runner workspace

The runner checks the repo out to
`~/actions-runner/_work/gastos-gub-uy/gastos-gub-uy`. The dashboard must serve
`.output` from **that** path so each deploy's atomic swap takes effect:

```bash
WORK=~/actions-runner/_work/gastos-gub-uy/gastos-gub-uy
pm2 delete gastos-gub-dashboard
cd "$WORK"
# first build so .output exists:
node scripts/deploy-dashboard.mjs   # or: npm --prefix app ci && node scripts/deploy-dashboard.mjs
pm2 save
```

`ecosystem.config.js` uses `cwd: './app'` and `script: './.output/server/index.mjs'`,
so starting pm2 from `$WORK` serves the runner-managed build. If you prefer a
fixed prod path instead of the runner workspace, set the runner's work dir to it
(`Runner._work` via `.runner`/config) — the script is path-relative either way.

## 4. Add the deploy secret

GitHub → repo **Settings → Secrets and variables → Actions → New repository
secret**:

- Name: `DASHBOARD_ENV`
- Value: the full contents of 167's `app/.env` (Mongo URI + Firebase vars).

The workflow writes this to `app/.env` before building. Nothing secret is
committed.

## 5. Verify

Push a trivial commit to `master` (or use **Actions → Deploy dashboard (167) →
Run workflow**). Watch the run: it should build (Node 22, retry-guarded),
smoke-boot, atomically swap `.output`, restart pm2, and health-check. A failed
build leaves the live site up; a bad deploy auto-rolls-back.

Manual deploy on the box any time (same safety, same lock):
```bash
cd "$WORK" && node scripts/deploy-dashboard.mjs
```

## 6. Public traffic cutover (when ready)

167 reaches the internet via its own outbound tunnel (its :80/:443/:22 are
closed inbound). Once 167 serves data reliably, point the `conlatuya…` Cloudflare
hostname at 167's tunnel instead of the Windows box. Until then the Windows box
keeps serving the public URL.

## Notes

- **Never two builds at once:** the workflow `concurrency` group serializes CI
  runs; the deploy script's `app/.deploy.lock` also blocks a manual build from
  colliding with a CI deploy (the failure mode that caused the 2026-07-18 restart
  storm).
- **Rollback window:** the previous build is kept as `.output-prev` only during
  the health check, then removed. If a deploy is rolled back, investigate before
  re-pushing.
