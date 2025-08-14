import type { IAward, IRelease } from '#shared/types'

export const formatTotalAmountAward = (award: IAward): string => {
  if (!award.items || !Array.isArray(award.items) || award.items.length === 0) {
    return 'No disponible'
  }

  // Group items by currency and calculate totals for each
  const currencyTotals: Record<string, number> = {}

  for (const item of award.items) {
    if (item.unit?.value?.amount && typeof item.unit.value.amount === 'number') {
      const currency = item.unit.value.currency || 'USD'
      const quantity = item.quantity || 1
      const itemTotal = item.unit.value.amount * quantity

      currencyTotals[currency] = (currencyTotals[currency] || 0) + itemTotal
    }
  }

  const currencies = Object.keys(currencyTotals)

  if (currencies.length === 0) {
    return 'No disponible'
  }

  if (currencies.length === 1) {
    // Single currency
    const currency = currencies[0]
    return formatCurrency(currencyTotals[currency], currency)
  }

  // Multiple currencies - show each currency total separately
  const formattedAmounts = currencies
    .sort() // Sort currencies for consistent display
    .map(currency => formatCurrency(currencyTotals[currency], currency))
    .join(' + ')

  return formattedAmounts
}

export const formatTotalAmount = (contract: IRelease): string => {
  // First check if we have the pre-calculated amount field
  if (contract.amount && contract.amount.hasAmounts) {
    const { totalAmounts, currencies } = contract.amount

    if (currencies.length === 1) {
      // Single currency
      const currency = currencies[0]
      return formatCurrency(totalAmounts[currency], currency)
    }

    if (currencies.length > 1) {
      // Multiple currencies - show each currency total separately
      const formattedAmounts = currencies
        .sort() // Sort currencies for consistent display
        .map(currency => formatCurrency(totalAmounts[currency], currency))
        .join(' + ')
      return formattedAmounts
    }
  }

  // Fallback to legacy calculation if amount field is not available
  if (!contract.awards || !Array.isArray(contract.awards) || contract.awards.length === 0) {
    // No tender value available in current schema, return no available
    return 'No disponible'
  }

  // Legacy calculation - collect all items to check for mixed currencies
  const allItems: any[] = []
  for (const award of contract.awards) {
    if (award.items && Array.isArray(award.items)) {
      allItems.push(...award.items)
    }
  }

  // Use the mixed currency formatter to handle different currencies
  return formatCurrencyWithMixed(0, allItems)
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
  if (amount > 1500) amount = Math.round(amount)

  return `${formatMoney(amount, currencyCode, locale)} ${currencyCode}`
}

export const getContractName = (item: IRelease) => {
  if (!item) return 'S/N'
  if (item.tender?.title) {
    // Check if title needs truncation
    if (item.tender.title.length > 50) {
      return `${item.tender.title.slice(0, 50)}...`
    }
    return item.tender.title
  }
  // No tender title, format the name based on the awards items description.
  // Example: Excavación, Obras Civiles, etc. Cut it off at 50 characters
  const awardDescriptions = item.awards?.flatMap(award => award.items.map(item => item.classification?.description as string)) || []
  if (!awardDescriptions.length) {
    return item.id
  }
  const fullDescription = awardDescriptions.join(', ')
  if (fullDescription.length > 50) {
    return `${fullDescription.slice(0, 50)}...`
  }
  return fullDescription
}

export const formatCurrencyWithMixed = (amount: number, items: Record<string, unknown>[]): string => {
  // Group items by currency and calculate totals for each

  if (!items.length) return 'No disponible'

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
