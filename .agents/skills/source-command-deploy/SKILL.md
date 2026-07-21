---
name: "source-command-deploy"
description: "Deploy the Nuxt dashboard to prod (167) via the push-to-master CI runner"
---

# source-command-deploy

Use this skill when the user asks to run the migrated source command `deploy`.

## Command Template

# /deploy — ship to production (167)

Deploy is **push-triggered CI**, not a manual ssh. `.github/workflows/deploy.yml`
fires `on: push: branches:[master]`, runs on a **self-hosted runner installed on
the 167 box** (`runs-on: [self-hosted, gastos-167]`), and executes
`node scripts/deploy-dashboard.mjs` there — atomic swap, health-check, and
auto-rollback on failure. `concurrency: deploy-dashboard-167` serializes deploys.

**Therefore: a push to `origin/master` IS a production deploy.** They are the same
event. There is no "merge now, deploy later" once it reaches `origin/master`.
Manual re-deploy of the current master is possible via the Actions tab
(`workflow_dispatch`) or `gh workflow run deploy.yml`.

## Do this when invoked

**1. Confirm exactly what will ship — never push blind.**
```bash
git fetch origin
git log --oneline origin/master..HEAD        # the commits this deploy adds
git diff --stat origin/master..HEAD          # the files it changes
```
Read the list. It must contain ONLY intended, reviewed commits. This repo's
branch (`fix/lumpsum-amount-artifacts`) has carried 100s of unrelated multi-feature
commits and a stale/diverged local `master` — do not assume "the branch" == your
feature. If unsure, STOP and show the user the list before pushing.

**2. Precondition gates (all must hold):**
- `git merge-base --is-ancestor origin/master HEAD` → the push **fast-forwards**
  origin/master. If it does NOT (origin diverged), STOP — never `--force` a
  production branch. Reconcile first (rebase your feature onto a fresh
  `origin/master`, or open a PR and let the merge land there).
- `app/data` is committed if it changed — it is gitignored in places and a missing
  data file breaks the built site (known trap).
- Verification is green: `npx tsc --noEmit -p tsconfig.json` clean for touched
  files, the feature's `tests/unit/*.ts` pass, and — for app changes — the app
  builds. Do not deploy on red.
- The `gastos-gub-cronserver` pm2 process runs `tsx` on source, so it picks up new
  code on the box's pull; the deploy script handles the `gastos-gub-dashboard`
  build+swap. No separate compile step is needed.

**3. Ship (this is the deploy):**
```bash
git push origin HEAD:master     # or: git push origin master  (if HEAD is master)
```

**4. Watch it land — do not walk away until it's green:**
```bash
gh run list --workflow=deploy.yml -L 1
gh run watch                    # follow the self-hosted run to completion
```
The script self-rolls-back a failed/broken build (the live `.output` is never
touched by a bad build). If the run fails, read its logs; the site stays up on the
previous build. Report the outcome (deployed / rolled-back) to the user.

## Never
- `git push --force` / `--force-with-lease` to `origin/master` — it is production.
- Push a diverged or unreviewed `master`. Push == deploy; a mixed push deploys the mix.
- Deploy on failing verification, or with an uncommitted `app/data` change.
