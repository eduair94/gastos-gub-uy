import { ExchangeRateModel } from './models'
import type { RateTable } from '../../../shared/utils/real-value'

/**
 * The monthly BCU rate table (exchange_rates), loaded once and cached.
 *
 * It is tiny (a few dozen months) and changes at most once a day when the
 * refresh job runs, so a 1-hour in-process cache means the real-value figures
 * cost one small query per hour per server, not one per request.
 */
let cache: { table: RateTable, at: number } | null = null
const TTL_MS = 60 * 60 * 1000

export async function loadRateTable(): Promise<RateTable> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.table

  const rows = await ExchangeRateModel
    .find({}, { month: 1, usd: 1, eur: 1, ui: 1 })
    .lean()
    .catch(() => [] as Array<{ month: string, usd?: number, eur?: number, ui?: number }>)

  const byMonth: RateTable['byMonth'] = {}
  let latestUi: number | null = null
  let latestUiMonth = ''
  for (const r of rows as Array<{ month: string, usd?: number, eur?: number, ui?: number }>) {
    byMonth[r.month] = { usd: r.usd, eur: r.eur, ui: r.ui }
    if (typeof r.ui === 'number' && r.ui > 0 && r.month > latestUiMonth) {
      latestUiMonth = r.month
      latestUi = r.ui
    }
  }

  const table: RateTable = { byMonth, latestUi }
  cache = { table, at: Date.now() }
  return table
}
