export const formatTotalAmount = (contract: Record<string, unknown>): string => {
  if (!contract.awards || !Array.isArray(contract.awards) || contract.awards.length === 0) {
    // Fallback to tender value if no awards
    const tender = contract.tender as Record<string, unknown>
    const tenderValue = tender?.value as Record<string, unknown>
    if (tenderValue?.amount && tenderValue?.currency) {
      return formatCurrency(tenderValue.amount as number, tenderValue.currency as string)
    }
    return 'No disponible'
  }

  // Calculate total amount and collect all items to check for mixed currencies
  let total = 0
  const allItems: Record<string, unknown>[] = []

  for (const award of contract.awards) {
    if (award.items && Array.isArray(award.items)) {
      for (const awardItem of award.items) {
        total += awardItem.unit?.value?.amount || 0
        allItems.push(awardItem)
      }
    }
  }

  // Use the mixed currency formatter to handle different currencies
  return formatCurrencyWithMixed(total, allItems)
}

export const formatAwardAmount = (award: Record<string, unknown>): string => {
  if (!award.items || !Array.isArray(award.items)) return 'No disponible'

  let total = 0
  for (const item of award.items) {
    total += item.unit?.value?.amount || 0
  }

  return formatCurrencyWithMixed(total, award.items)
}

export const formatMoney = (amount: number, currency = 'USD', locale = 'en-US') => {
  const hasDecimal = amount % 1 !== 0
  return new Intl.NumberFormat(locale, {
    style: 'decimal',
    currency: currency,
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export const formatCurrency = (amount: number, currency?: string): string => {
  const currencyCode = currency || 'USD' // Default to USD if currency is null/undefined

  // Use appropriate locale based on currency
  const locale = currency === 'UYU' ? 'es-UY' : 'en-US'

  return `${formatMoney(amount, currencyCode, locale)} ${currencyCode}`
}

export const formatCurrencyWithMixed = (amount: number, items: Record<string, unknown>[]): string => {
  // Group items by currency and calculate totals for each
  const currencyTotals: Record<string, number> = {}

  for (const item of items) {
    const unit = item.unit as Record<string, unknown>
    const value = unit?.value as Record<string, unknown>
    const currency = (value?.currency as string) || 'USD'
    const itemAmount = (value?.amount as number) || 0
    currencyTotals[currency] = (currencyTotals[currency] || 0) + itemAmount
  }

  const currencies = Object.keys(currencyTotals)

  if (currencies.length === 1) {
    // All items have the same currency
    return formatCurrency(currencyTotals[currencies[0]], currencies[0])
  }

  // Multiple currencies - show each currency total separately
  const formattedAmounts = currencies
    .sort() // Sort currencies for consistent display
    .map(currency => formatCurrency(currencyTotals[currency], currency))
    .join(' + ')

  return formattedAmounts
}
