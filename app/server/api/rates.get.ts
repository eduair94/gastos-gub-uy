import { defineEventHandler } from 'h3'
import { connectToDatabase } from '../utils/database'
import { loadRateTable } from '../utils/rates'

/**
 * The monthly BCU rate table (exchange_rates), for the client.
 *
 * The contract explorer's preview popup restates each amount in nominal UYU
 * (foreign amounts at the BCU rate of the contract's month) and in today's
 * pesos (deflated by the Unidad Indexada) — the same two conversions the
 * detail page does server-side. Rather than round-trip the detail endpoint per
 * preview, the client loads this table ONCE and computes both with the shared
 * pure functions in `#shared/utils/real-value`.
 *
 * The table is tiny (a few hundred months × 3 numbers) and changes at most once
 * a day, so it is cached server-side (see loadRateTable) and is a good fit for
 * an immutable-ish client fetch.
 */
export default defineEventHandler(async () => {
  await connectToDatabase()
  const table = await loadRateTable()
  return { success: true, data: table }
})
