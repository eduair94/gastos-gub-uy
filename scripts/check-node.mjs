#!/usr/bin/env node
// Hard-fail the build on a Node version Nuxt 3.x does not support (18/20/22).
// Wired into the app's `prebuild` hook — defense in depth alongside the deploy
// script's own Node enforcement. Building on Node >=23 fails nondeterministically
// (writeManifest / renderer-chunk ENOENTs) and was the 2026-07-18 outage trigger.
const major = Number(process.versions.node.split('.')[0])
if (major < 18 || major >= 23) {
  console.error(`\n[check-node] Node ${process.versions.node} is unsupported by Nuxt 3.x.`)
  console.error('[check-node] Use Node 18, 20, or 22 (see app/.nvmrc: `nvm use`).')
  process.exit(1)
}
