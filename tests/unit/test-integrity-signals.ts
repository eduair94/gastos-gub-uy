/**
 * Unit tests for the señales-de-gestión classifier (shared/integrity-signals.ts).
 *
 * Pure functions only — no database, no network, no env. Run with:
 *   npx tsx tests/unit/test-integrity-signals.ts
 */

import {
  BURST_COUNT_FLOOR,
  classifyOrganism,
  CONCENTRATION_FLOOR,
  deriveCutoffs,
  DIRECT_SHARE_FLOOR,
  measureOrganism,
  MIN_CONTRACTS_FOR_SIGNALS,
  MIN_METHOD_KNOWN,
  MIN_POPULATION_FOR_PERCENTILES,
  MIN_SUPPLIERS_FOR_CONCENTRATION,
  OrganismMeasurement,
  percentile,
  percentileRank,
  SIGNAL_KEYS,
  SignalCutoffs,
  signalWeight,
  UNEXPLAINED_FLOOR,
} from '../../shared/integrity-signals'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  }
  else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` -> ${detail}` : ''}`)
  }
}

/** A healthy, well-behaved organism. Individual tests move one field at a time. */
function organism(over: Partial<OrganismMeasurement> = {}): OrganismMeasurement {
  return {
    buyerId: '10-1',
    buyerName: 'Organismo de prueba',
    contracts: 200,
    totalUyu: 1_000_000,
    supplierCount: 40,
    topSupplierName: 'PROVEEDOR A',
    topSupplierUyu: 100_000,
    burstCount: 0,
    burstWorstAwards: 0,
    methodKnown: 100,
    directCount: 50,
    callsWithWindow: 100,
    expressCalls: 2,
    unexplainedFlags: 0,
    ...over,
  }
}

/** Cutoffs low enough that only the absolute floors can hold a signal back. */
const LOW_CUTOFFS: SignalCutoffs = {
  concentration: { watch: 0.1, high: 0.2, population: 100 },
  bursts: { watch: 1, high: 2, population: 100 },
  directAward: { watch: 0.1, high: 0.2, population: 100 },
  expressWindow: { watch: 0.01, high: 0.02, population: 100 },
  unexplainedPrices: { watch: 1, high: 2, population: 100 },
}

console.log('🧪 Señales de gestión')
console.log('=====================')

// --- percentile helpers ----------------------------------------------------
console.log('\n📊 percentile / percentileRank')
{
  const values = [1, 2, 3, 4, 5]
  check('median of 1..5 = 3', percentile(values, 0.5) === 3)
  check('p0 = min', percentile(values, 0) === 1)
  check('p100 = max', percentile(values, 1) === 5)
  check('empty -> null', percentile([], 0.5) === null)
  check('single element -> itself', percentile([7], 0.9) === 7)
  check('q is clamped', percentile(values, 5) === 5 && percentile(values, -1) === 1)

  check('rank of the max = 1', percentileRank(values, 5) === 1)
  check('rank of the min = 0.2', Math.abs((percentileRank(values, 1) ?? 0) - 0.2) < 1e-9)
  check('rank below everything = 0', percentileRank(values, 0) === 0)
  check('rank on empty -> null', percentileRank([], 3) === null)
}

// --- eligibility -----------------------------------------------------------
console.log('\n📊 eligibility')
{
  const tiny = measureOrganism(organism({ contracts: MIN_CONTRACTS_FOR_SIGNALS - 1 }))
  check('below the contract floor every value is null (not zero)', SIGNAL_KEYS.every(k => tiny[k] === null))

  // "Cannot say" and "measured, fine" must never render the same.
  const ok = measureOrganism(organism())
  check('an eligible organism measures a real concentration', typeof ok.concentration === 'number')
  check('…and a real direct share', ok.directAward === 0.5, String(ok.directAward))

  const thinRoster = measureOrganism(organism({ supplierCount: MIN_SUPPLIERS_FOR_CONCENTRATION - 1 }))
  check('concentration is null on a roster too thin to mean anything', thinRoster.concentration === null)

  const thinMethod = measureOrganism(organism({ methodKnown: MIN_METHOD_KNOWN - 1 }))
  check('direct share is null when too few awards resolve a method', thinMethod.directAward === null)
}

// --- the absolute floors ---------------------------------------------------
console.log('\n📊 absolute floors override a high percentile')
{
  // Every cutoff here is trivially low, so ONLY the floor can keep a signal down.
  const justUnder = organism({
    topSupplierUyu: (CONCENTRATION_FLOOR - 0.01) * 1_000_000,
    burstCount: BURST_COUNT_FLOOR - 1,
    directCount: Math.floor((DIRECT_SHARE_FLOOR - 0.01) * 100),
    expressCalls: 9, // 9% — under the 10% floor
    unexplainedFlags: UNEXPLAINED_FLOOR - 1,
  })
  const under = classifyOrganism(justUnder, LOW_CUTOFFS)
  for (const s of under) {
    check(`${s.key}: below its floor -> none despite a low cutoff`, s.level === 'none', `${s.value}`)
  }

  const justOver = organism({
    topSupplierUyu: (CONCENTRATION_FLOOR + 0.01) * 1_000_000,
    burstCount: BURST_COUNT_FLOOR,
    directCount: Math.ceil((DIRECT_SHARE_FLOOR + 0.01) * 100),
    expressCalls: 11,
    unexplainedFlags: UNEXPLAINED_FLOOR,
  })
  const over = classifyOrganism(justOver, LOW_CUTOFFS)
  for (const s of over) {
    check(`${s.key}: above its floor and its cutoff -> raised`, s.level !== 'none', `${s.value}`)
  }
}

// --- no cutoffs, no levels -------------------------------------------------
console.log('\n📊 missing cutoffs raise nothing')
{
  const extreme = organism({ topSupplierUyu: 1_000_000, burstCount: 30, directCount: 100, expressCalls: 90, unexplainedFlags: 50 })
  const signals = classifyOrganism(extreme, {})
  check('an extreme organism with no population cutoffs stays unraised', signals.every(s => s.level === 'none'))
  check('…but its VALUES are still published', signals.every(s => s.value !== null))
}

// --- deriveCutoffs ---------------------------------------------------------
console.log('\n📊 deriveCutoffs')
{
  const population = Array.from({ length: 100 }, (_, i) =>
    measureOrganism(organism({ topSupplierUyu: i * 10_000, directCount: i, methodKnown: 100 })))
  const cutoffs = deriveCutoffs(population)
  check('concentration cutoffs derived from 100 organisms', cutoffs.concentration?.population === 100)
  check('p90 < p97', (cutoffs.concentration?.watch ?? 1) < (cutoffs.concentration?.high ?? 0))
  check('p90 of a 0..0.99 ramp is ~0.89', Math.abs((cutoffs.concentration?.watch ?? 0) - 0.891) < 0.01, String(cutoffs.concentration?.watch))

  const tinyPopulation = population.slice(0, MIN_POPULATION_FOR_PERCENTILES - 1)
  check('a population under the minimum yields no cutoffs at all', Object.keys(deriveCutoffs(tinyPopulation)).length === 0)

  // Nulls must not be counted as zeros — that would drag every percentile down.
  const withNulls = [
    ...Array.from({ length: 40 }, () => measureOrganism(organism({ topSupplierUyu: 900_000 }))),
    ...Array.from({ length: 60 }, () => measureOrganism(organism({ contracts: 1 }))),
  ]
  const nullCutoffs = deriveCutoffs(withNulls)
  check('unmeasurable organisms are excluded from the population', nullCutoffs.concentration?.population === 40, String(nullCutoffs.concentration?.population))
  check('…so the cutoff reflects only the measured ones', Math.abs((nullCutoffs.concentration?.watch ?? 0) - 0.9) < 1e-9)
}

// --- percentile reporting --------------------------------------------------
console.log('\n📊 populationPercentile is reported for the page')
{
  const sorted = { concentration: [0.1, 0.2, 0.3, 0.4, 0.9] }
  const signals = classifyOrganism(organism({ topSupplierUyu: 900_000 }), LOW_CUTOFFS, sorted)
  const concentration = signals.find(s => s.key === 'concentration')!
  check('the top value ranks at 1.0', concentration.populationPercentile === 1)
  check('percentile is null without a sorted population', classifyOrganism(organism(), LOW_CUTOFFS).every(s => s.populationPercentile === null))
}

// --- weight ----------------------------------------------------------------
console.log('\n📊 signalWeight (ordering only, never a score)')
{
  check('nothing raised weighs 0', signalWeight(classifyOrganism(organism(), LOW_CUTOFFS)) === 0)
  const both = [
    { key: 'concentration' as const, level: 'high' as const, value: 1, basis: 1, populationPercentile: null },
    { key: 'bursts' as const, level: 'watch' as const, value: 1, basis: 1, populationPercentile: null },
    { key: 'directAward' as const, level: 'none' as const, value: 0, basis: 1, populationPercentile: null },
  ]
  check('high counts double, watch once, none zero', signalWeight(both) === 3)
}

// --- shape -----------------------------------------------------------------
console.log('\n📊 output shape')
{
  const signals = classifyOrganism(organism(), LOW_CUTOFFS)
  check('one entry per signal key, in order', signals.length === SIGNAL_KEYS.length && signals.every((s, i) => s.key === SIGNAL_KEYS[i]))
  check('every entry carries a basis (the denominator the page shows)', signals.every(s => typeof s.basis === 'number'))
}

console.log('\n=====================')
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
