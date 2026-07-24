/**
 * Structural regression test for dashboard availability controls.
 *
 * Run: npx tsx tests/unit/test-dashboard-resilience.ts
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const require = createRequire(import.meta.url)

const ecosystem = require(join(root, 'ecosystem.config.js'))
const dashboard = ecosystem.apps.find((app: { name?: string }) => app.name === 'gastos-gub-dashboard')

assert.ok(dashboard, 'dashboard pm2 definition must exist')
assert.equal(dashboard.instances, 2, 'dashboard must retain two redundant workers')

const deploy = readFileSync(join(root, 'scripts/deploy-dashboard.mjs'), 'utf8')
assert.match(deploy, /pm2\(\['reload', PM2_APP\]\)/, 'deploy must use pm2 rolling reload')
assert.doesNotMatch(deploy, /pm2\(\['stop', PM2_APP\]/, 'deploy must never stop every dashboard worker')
assert.match(
  deploy,
  /failed rolling reload must trigger rollback/,
  'a failed rolling reload must not fall through to a blind restart',
)
assert.match(deploy, /mergePreviousBuildFallbacks\(\)/, 'deploy must preserve old hashed chunks during overlap')
assert.match(deploy, /__deploy_health=/, 'deploy health probes must bypass old Redis entries')

const nuxt = readFileSync(join(root, 'app/nuxt.config.ts'), 'utf8')
assert.match(nuxt, /driver: 'redis'/, 'production Nitro cache must use Redis')
assert.match(nuxt, /driver: 'memory'/, 'development cache must retain a dependency-free fallback')
assert.match(nuxt, /base: 'apiCache'/, 'cached routes must use the Redis-backed mount')
assert.match(
  nuxt,
  /'\/api\/analytics\/anomalies': apiCache\(2 \* 60, \['cookie', 'authorization', 'x-api-key'\]\)/,
  'personalized anomaly responses must vary by every auth input',
)
assert.equal(
  existsSync(join(root, 'app/server/middleware/cache.ts')),
  false,
  'the incomplete unbounded in-process cache must not return',
)

console.log('dashboard resilience config: OK')
