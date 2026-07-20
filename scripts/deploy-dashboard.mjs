#!/usr/bin/env node
// Safe, atomic, self-rolling-back deploy for the Nuxt dashboard.
// Cross-platform: runs identically on the Linux prod box (167) and Windows.
// Design: docs/superpowers/specs/2026-07-18-safe-cicd-dashboard-deploy-design.md
//
// Guarantees:
//  - Single-flight: a lockfile mutex stops two deploys/builds overlapping and
//    corrupting .output (the incident's ↺20 crash storm).
//  - The build runs on a Nuxt-supported Node (18/20/22); it refuses/relocates
//    off Node >=23 (the original outage trigger).
//  - A failed or broken build NEVER touches the live .output — the site stays up.
//  - Every swap/rollback restores a serving .output if any single step fails.
//  - After the swap the site is health-checked; a bad deploy auto-rolls-back.
//
// Usage:
//   node scripts/deploy-dashboard.mjs            # full deploy
//   node scripts/deploy-dashboard.mjs --dry-run  # build+verify+smoke only

import { spawnSync, spawn } from 'node:child_process'
import {
  existsSync, openSync, closeSync, writeSync, readFileSync,
  rmSync, renameSync, unlinkSync, readdirSync, statSync,
} from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform, homedir, hostname, totalmem } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const APP = join(REPO, 'app')
const OUTPUT = join(APP, '.output')
const NEXT = join(APP, '.output-next')
const PREV = join(APP, '.output-prev')
const FAILED = join(APP, '.output-failed')
const NUXT_CACHE = join(APP, '.nuxt')
const LOCK = join(APP, '.deploy.lock')
const ENV_FILE = join(APP, '.env')
const NUXT_BIN = join(APP, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs')
const ECOSYSTEM = join(REPO, 'ecosystem.config.js')

const PM2_APP = 'gastos-gub-dashboard'
const PORT = Number(process.env.DASHBOARD_PORT || 3600)
const SMOKE_PORT = Number(process.env.SMOKE_PORT || 3799)
const HEALTH_PATH = '/api/contracts?limit=1&hasAmount=true'
const BUILD_RETRIES = 5
const HEALTH_TIMEOUT_MS = 30_000
const SMOKE_TIMEOUT_MS = 30_000
const STALE_LOCK_MS = 30 * 60 * 1000

const IS_WIN = platform() === 'win32'
const DRY_RUN = process.argv.includes('--dry-run')

function log(m) { console.log(`[deploy] ${m}`) }
function warn(m) { console.warn(`[deploy] WARN: ${m}`) }
function die(m, code = 1) { console.error(`[deploy] ERROR: ${m}`); process.exit(code) }

// Synchronous sleep (no deps). Only used on synchronous swap/lock paths where no
// async work is pending — never inside an async loop (that would stall fetch).
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function mtimeOf(p) { try { return statSync(p).mtimeMs } catch { return 0 } }
function rmrf(dir) { try { rmSync(dir, { recursive: true, force: true }) } catch (e) { warn(`rm ${dir}: ${e.message}`) } }

// ---------------------------------------------------------------- lock (mutex)
function pidAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false
  try { process.kill(pid, 0); return true }
  catch (e) { return e.code === 'EPERM' } // exists but not ours
}

function readLock() {
  try {
    const txt = readFileSync(LOCK, 'utf8')
    if (!txt.trim()) return null
    return JSON.parse(txt)
  }
  catch { return null }
}

function lockIsStale(info) {
  if (!info) return true
  const age = Date.now() - (info.startedAt || 0)
  // Only a same-host pid can be validated locally; a dead holder → steal now.
  if (info.host === hostname() && !pidAlive(info.pid)) return true
  // Backstop: a lock older than STALE is assumed hung (deploys take ~minutes).
  return age > STALE_LOCK_MS
}

function acquireLock() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(LOCK, 'wx') // atomic create-if-absent
      try { writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), startedAt: Date.now() })) }
      finally { closeSync(fd) }
      return
    }
    catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
    // Lock present. A just-created lock can be momentarily empty (writer hasn't
    // written the JSON yet) — grace + re-read so we never steal a lock that is
    // being legitimately acquired.
    let info = readLock()
    if (info === null) { sleep(200); info = readLock() }
    if (info !== null && !lockIsStale(info)) {
      die(`another deploy is in progress (pid ${info.pid} on ${info.host}, started ${new Date(info.startedAt).toISOString()}). Aborting.`)
    }
    warn(`stealing ${info ? `stale lock (pid ${info.pid}, host ${info.host})` : 'corrupt lock'}`)
    try { unlinkSync(LOCK) } catch { /* raced with another stealer */ }
    // loop retries openSync('wx') — atomic, so only one stealer wins the re-create
  }
  die('could not acquire deploy lock after retries')
}

function releaseLock() {
  // Never delete a lock we do not own (ours may have been stolen after a hang).
  const info = readLock()
  if (info && info.pid === process.pid && info.host === hostname()) {
    try { unlinkSync(LOCK) } catch { /* already gone */ }
  }
}

// --------------------------------------------------------------- node resolver
function resolveBuildNode() {
  const major = Number(process.versions.node.split('.')[0])
  if (major >= 18 && major <= 22) return process.execPath

  warn(`current Node ${process.versions.node} is unsupported by Nuxt 3.x (needs 18/20/22). Locating Node 22…`)
  if (process.env.DEPLOY_NODE && existsSync(process.env.DEPLOY_NODE)) {
    log(`using DEPLOY_NODE=${process.env.DEPLOY_NODE}`)
    return process.env.DEPLOY_NODE
  }
  const found = findNvmNode22()
  if (found) { log(`using Node 22 at ${found}`); return found }
  die('no Node 22 found. Install it (nvm install 22) or set DEPLOY_NODE to a node 22 binary.')
}

// Scan known version-manager stores for the highest v22.x node binary.
function findNvmNode22() {
  const roots = []
  if (process.env.NVM_HOME) roots.push(process.env.NVM_HOME)                       // nvm-windows (custom path)
  if (process.env.NVM_DIR) roots.push(join(process.env.NVM_DIR, 'versions', 'node')) // nvm (posix, custom)
  if (IS_WIN) roots.push(join(homedir(), 'AppData', 'Roaming', 'nvm'))
  else roots.push(join(homedir(), '.nvm', 'versions', 'node'), '/usr/local/n/versions/node')

  const hits = []
  for (const root of roots) {
    if (!root || !existsSync(root)) continue
    let entries
    try { entries = readdirSync(root) } catch { continue }
    for (const name of entries) {
      const m = /^v?(22)\.(\d+)\.(\d+)$/.exec(name)
      if (!m) continue
      const bin = IS_WIN ? join(root, name, 'node.exe') : join(root, name, 'bin', 'node')
      if (existsSync(bin)) hits.push({ minor: Number(m[2]), patch: Number(m[3]), bin })
    }
  }
  hits.sort((a, b) => (b.minor - a.minor) || (b.patch - a.patch))
  return hits[0]?.bin || null
}

// ----------------------------------------------------------------------- pm2
function pm2(args, { check = false } = {}) {
  const bin = IS_WIN ? 'pm2.cmd' : 'pm2'
  const r = spawnSync(bin, args, { cwd: REPO, encoding: 'utf8', shell: IS_WIN })
  if (check && r.status !== 0) warn(`pm2 ${args.join(' ')} exited ${r.status}: ${(r.stderr || '').trim()}`)
  return r
}

function pm2StartOrRestart() {
  // Plain restart (NOT --update-env): reuse the launch env so the ecosystem
  // env_file '.env' (Mongo/Firebase) is preserved. --update-env would overlay
  // the caller's shell env and could drop those vars.
  const r = pm2(['restart', PM2_APP])
  if (r.status === 0) return
  warn('pm2 restart failed (process may not exist); starting from ecosystem')
  pm2(['start', ECOSYSTEM, '--only', PM2_APP], { check: true })
}

// --------------------------------------------------------------- env for smoke
function parseEnvFile(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    out[line.slice(0, eq).trim()] = val
  }
  return out
}

// ---------------------------------------------------------------------- http
async function probe(port, path) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) })
    if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}` }
    const json = await res.json().catch(() => null)
    const contracts = json?.data?.contracts
    if (!Array.isArray(contracts) || contracts.length < 1) return { ok: false, reason: 'no data rows' }
    return { ok: true }
  }
  catch (e) { return { ok: false, reason: e.message } }
}

async function waitHealthy(port, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let last = 'no attempt'
  while (Date.now() < deadline) {
    const r = await probe(port, HEALTH_PATH)
    if (r.ok) return true
    last = r.reason
    await new Promise(res => setTimeout(res, 2000))
  }
  warn(`${label}: not healthy within ${timeoutMs / 1000}s (last: ${last})`)
  return false
}

// -------------------------------------------------------------------- fs swap
function safeRename(from, to) {
  for (let i = 0; i < 5; i++) {
    try { renameSync(from, to); return }
    catch (e) {
      if (i === 4) throw e
      warn(`rename ${from} -> ${to} failed (${e.code}); retrying`)
      sleep(1000)
    }
  }
}

// V8's default old-space ceiling (~2GB on the 167 box, independent of the box's
// actual 11GB) OOM-killed the Nitro server build outright — attempt 5/5, staging
// bundle missing, live site untouched by the guarantee above but no deploy went
// out either. Give the build half the machine's RAM, capped so a small dev box
// doesn't get told to reserve more than it has; 2048 MB is the floor a build has
// ever needed here. An operator's own NODE_OPTIONS (if it already sets
// --max-old-space-size) wins — this only fills the gap when nothing was asked for.
function buildHeapMb() {
  const halfSystemMb = Math.floor(totalmem() / 1024 / 1024 / 2)
  return Math.max(2048, Math.min(6144, halfSystemMb))
}

function buildEnv() {
  const existing = process.env.NODE_OPTIONS || ''
  if (existing.includes('max-old-space-size')) return { ...process.env, NITRO_OUTPUT_DIR: NEXT }
  const heapMb = buildHeapMb()
  log(`build heap: --max-old-space-size=${heapMb} (no NODE_OPTIONS override set)`)
  return {
    ...process.env,
    NITRO_OUTPUT_DIR: NEXT,
    NODE_OPTIONS: `${existing} --max-old-space-size=${heapMb}`.trim(),
  }
}

// -------------------------------------------------------------------- build
function build(buildNode) {
  const liveEntry = join(OUTPUT, 'server', 'index.mjs')
  const liveMtimeBefore = mtimeOf(liveEntry)
  for (let attempt = 1; attempt <= BUILD_RETRIES; attempt++) {
    log(`build attempt ${attempt}/${BUILD_RETRIES} (node ${buildNode === process.execPath ? process.versions.node : buildNode})`)
    rmrf(NEXT)
    rmrf(NUXT_CACHE)
    const r = spawnSync(buildNode, [NUXT_BIN, 'build'], {
      cwd: APP,
      stdio: 'inherit',
      env: buildEnv(),
    })
    const nextOk = existsSync(join(NEXT, 'server', 'index.mjs'))
    if (r.status === 0 && nextOk) { log(`build succeeded on attempt ${attempt}`); return true }
    // Guard: if staging stayed empty but the LIVE .output changed, NITRO_OUTPUT_DIR
    // is not being honored — the build wrote over live. Bail before serving it.
    if (!nextOk && mtimeOf(liveEntry) !== liveMtimeBefore) {
      die('NITRO_OUTPUT_DIR not honored: staging empty but live .output changed during build. Aborting (build-config regression).', 4)
    }
    warn(`build attempt ${attempt} failed (exit ${r.status}, staging bundle ${nextOk ? 'present' : 'MISSING'})`)
  }
  return false
}

// -------------------------------------------------------------- smoke (verify)
async function smoke(dir) {
  const entry = join(dir, 'server', 'index.mjs')
  if (!existsSync(entry)) return { ok: false, reason: 'server/index.mjs missing' }
  // Deploy .env is authoritative for app vars (Mongo/Firebase) over a possibly
  // stale shell env, so smoke validates the DB pm2 will actually use.
  const env = {
    ...process.env,
    ...parseEnvFile(ENV_FILE),
    NODE_ENV: 'production',
    PORT: String(SMOKE_PORT),
    NITRO_PORT: String(SMOKE_PORT),
    HOST: '127.0.0.1',
  }
  const child = spawn(process.execPath, [entry], { env, stdio: 'ignore' })
  try {
    const deadline = Date.now() + SMOKE_TIMEOUT_MS
    let last = 'no attempt'
    while (Date.now() < deadline) {
      if (child.exitCode !== null) return { ok: false, reason: `smoke server exited early (code ${child.exitCode})` }
      const r = await probe(SMOKE_PORT, HEALTH_PATH)
      if (r.ok) return { ok: true }
      last = r.reason
      await new Promise(res => setTimeout(res, 2000))
    }
    return { ok: false, reason: `not healthy within ${SMOKE_TIMEOUT_MS / 1000}s (last: ${last})` }
  }
  finally {
    if (child.exitCode === null) {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
      // Wait for the OS to reap it (and release any handles on the staging dir)
      // before the caller renames NEXT.
      await new Promise((res) => { child.once('exit', res); setTimeout(res, 3000) })
    }
  }
}

// -------------------------------------------------------------- swap / rollback
// Precondition: pm2 stopped. Moves NEXT into OUTPUT, keeping the old build at
// PREV. On ANY partial failure it restores a serving OUTPUT and throws, so the
// caller can bring the previous build back up — the live dir is never left gone.
function swapInPlace() {
  if (existsSync(PREV)) {
    rmrf(PREV)
    if (existsSync(PREV)) throw new Error(`cannot clear ${PREV}; aborting swap (live .output untouched)`)
  }
  const hadOutput = existsSync(OUTPUT)
  if (hadOutput) safeRename(OUTPUT, PREV) // step A
  try {
    safeRename(NEXT, OUTPUT) // step B
  }
  catch (e) {
    if (hadOutput && !existsSync(OUTPUT) && existsSync(PREV)) {
      warn(`swap step B failed (${e.message}); restoring previous .output`)
      try { safeRename(PREV, OUTPUT) }
      catch (e2) { throw new Error(`swap failed AND restore failed: ${e2.message}. MANUAL INTERVENTION NEEDED.`) }
    }
    throw e
  }
}

function rollback() {
  warn('ROLLING BACK to previous build')
  if (!existsSync(PREV)) die('rollback impossible: no .output-prev. Investigate manually.', 2)
  pm2(['stop', PM2_APP], { check: true })
  // Move the bad build aside (do not delete before the good one is restored).
  rmrf(FAILED)
  if (existsSync(OUTPUT)) { try { safeRename(OUTPUT, FAILED) } catch { rmrf(OUTPUT) } }
  try { safeRename(PREV, OUTPUT) }
  catch (e) {
    if (!existsSync(OUTPUT) && existsSync(FAILED)) { try { safeRename(FAILED, OUTPUT) } catch { /* nothing left to try */ } }
    pm2StartOrRestart()
    die(`rollback rename failed: ${e.message}. MANUAL INTERVENTION NEEDED.`, 2)
  }
  rmrf(FAILED)
  pm2StartOrRestart()
  pm2(['save'])
}

// ---------------------------------------------------------------------- main
async function main() {
  log(`repo=${REPO} dryRun=${DRY_RUN} os=${platform()} node=${process.versions.node}`)
  acquireLock()
  // die() calls process.exit(), which bypasses the promise .finally below, so
  // release the (ownership-checked) lock synchronously on any exit path.
  process.on('exit', releaseLock)

  const buildNode = resolveBuildNode()

  if (!build(buildNode)) die(`build failed after ${BUILD_RETRIES} attempts. Live site untouched.`)

  log('smoke-booting staged build…')
  const s = await smoke(NEXT)
  if (!s.ok) die(`staged build failed verification: ${s.reason}. Live site untouched.`)
  log('staged build serves data ✓')

  if (DRY_RUN) { log('dry-run: skipping swap + pm2. Staged build is at .output-next.'); return }

  // ---- swap (with restore-on-failure) ----
  log('swapping .output …')
  pm2(['stop', PM2_APP], { check: true })
  try {
    swapInPlace()
  }
  catch (e) {
    // swapInPlace restored the previous .output (when one existed); bring it up.
    pm2StartOrRestart()
    pm2(['save'])
    die(`swap failed: ${e.message}. Restored previous build.`, 3)
  }
  pm2StartOrRestart()
  pm2(['save'])

  // ---- health + auto-rollback ----
  log(`health-checking :${PORT} …`)
  if (!await waitHealthy(PORT, HEALTH_TIMEOUT_MS, 'post-deploy')) {
    rollback()
    const back = await waitHealthy(PORT, HEALTH_TIMEOUT_MS, 'post-rollback')
    die(`deploy unhealthy — rolled back (rollback healthy: ${back}).`, 3)
  }

  rmrf(PREV) // clean; PREV only needed during the health window
  log('deploy OK — site healthy ✓')
}

main()
  .catch(e => die(`unexpected: ${e?.stack || e}`))
  .finally(releaseLock)
