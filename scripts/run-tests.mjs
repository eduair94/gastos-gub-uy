#!/usr/bin/env node
/**
 * Minimal test runner for this repo's convention: every test is a standalone `tsx` script that
 * asserts and exits non-zero on failure. There is no framework — this just runs them all in
 * sequence and prints one line per file.
 *
 *   node scripts/run-tests.mjs              # tests/unit (the pure ones — no DB, no network)
 *   node scripts/run-tests.mjs unit
 *   node scripts/run-tests.mjs integration  # needs a live MONGODB_URI
 *   node scripts/run-tests.mjs performance  # needs a live MONGODB_URI, slow
 *   node scripts/run-tests.mjs unit --only lumpsum
 *
 * Exit code is 0 only if every file that ran passed.
 */
import { readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const suite = argv.find((a) => !a.startsWith('--')) ?? 'unit'
const onlyIdx = argv.indexOf('--only')
const only = onlyIdx === -1 ? null : argv[onlyIdx + 1]

// Files under tests/unit that are NOT pure: they need a live DB, a credential or an outbound network
// call, so `run-tests.mjs unit` skips them by default. Run them directly when the env is set up.
// (Also skipped: anything named *.verify.ts — those are live-DB verification scripts, not unit tests.)
const NEEDS_CREDENTIALS = new Set([
  'focus-item.verify.ts', // needs MONGODB_URI — a live-data verification, not a pure unit test
  'test-places-enrichment.ts', // Google Maps proxy + Gemini judge
  'test-contact-resolvers.ts', // outbound HTTP to supplier websites / IMPO
])

const dir = join(ROOT, 'tests', suite)
if (!existsSync(dir)) {
  console.error(`No such suite: tests/${suite} (expected unit | integration | performance)`)
  process.exit(2)
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.ts'))
  .filter((f) => (only ? f.includes(only) : true))
  .filter((f) => (suite === 'unit' && !only ? !NEEDS_CREDENTIALS.has(f) && !f.endsWith('.verify.ts') : true))
  .sort()

if (!files.length) {
  console.error(`No test files matched in tests/${suite}${only ? ` (--only ${only})` : ''}`)
  process.exit(2)
}

let failed = 0
const started = process.hrtime.bigint()

for (const f of files) {
  const rel = `tests/${suite}/${f}`
  const t0 = process.hrtime.bigint()
  const res = spawnSync('npx', ['tsx', rel], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
  const ms = Number((process.hrtime.bigint() - t0) / 1_000_000n)
  const ok = res.status === 0
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${rel}  (${ms}ms)`)
  if (!ok) {
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd()
    console.log(out.split('\n').slice(-25).map((l) => `      ${l}`).join('\n'))
  }
}

const totalMs = Number((process.hrtime.bigint() - started) / 1_000_000n)
console.log(`\n${failed === 0 ? 'OK' : 'FAILED'}: ${files.length - failed}/${files.length} passed in ${totalMs}ms`)
process.exit(failed === 0 ? 0 : 1)
