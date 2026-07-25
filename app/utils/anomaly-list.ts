export const ANOMALY_DEFAULT_SORT = 'recent'
export const ANOMALY_RECENT_SORT_FIELD = 'sourceDate'

/**
 * Procurement source dates are wall-clock dates stamped as UTC. Read their UTC
 * calendar parts so midnight does not roll back to the previous day in Uruguay.
 */
export function formatAnomalySourceDate(value?: Date | string | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getUTCFullYear()}`
}
