import axios from "axios";

// Interface for currency API response
export interface CurrencyResponse {
  success: boolean;
  base: string;
  rates: {
    [currencyCode: string]: {
      from: number;
      to: number;
    };
  };
  last_update?: string;
}

// Interface for UYI (Unidades Indexadas) API response
export interface UYIResponse {
  code: string;
  date: string;
  origin: string;
  type: string;
  buy: number;
  name: string;
  sell: number;
}

// Interface for amount calculation result
export interface AmountCalculationResult {
  totalAmounts: Record<string, number>;
  totalItems: number;
  currencies: string[];
  hasAmounts: boolean;
  primaryAmount: number; // Total amount in UYU (converted)
  primaryCurrency: string;
  originalUYUAmount: number; // Original UYU amount without conversion
  exchangeRateDate?: string;
  uyiExchangeRate?: number | null;
  hasConvertedAmounts: boolean;
  version: number;
  updatedAt: string;
  wasVersionUpdate?: boolean | undefined;
  previousAmount?: number | null | undefined;
}

// Fallback exchange rates (approximate)
const FALLBACK_RATES: Record<string, number> = {
  'USD': 40, // 1 USD = 40 UYU (approximate)
  'EUR': 44, // 1 EUR = 44 UYU (approximate)
  'ARS': 0.045, // 1 ARS = 0.045 UYU (approximate)
  'BRL': 8, // 1 BRL = 8 UYU (approximate)
  // UUYI Y UYI son unidades indexadas
  'UUYI': 6.36, // Fallback rate for UYI (approximate)
  'UYI': 6.36, // 1 UYI = 6.36 UYU (approximate, will be updated with live rate)
  'UI': 6.36, // Alternative code for Unidades Indexadas
};

// Current version of the amount calculation logic
export const AMOUNT_CALCULATION_VERSION = 2;

/**
 * Fetch UYI (Unidades Indexadas) exchange rate from BCU API
 */
export async function fetchUYIRate(): Promise<number | null> {
  try {
    console.log("🏦 Fetching UYI (Unidades Indexadas) exchange rate...");
    const response = await axios.get('https://api.cambio-uruguay.com/exchange/bcu/UI', {
      timeout: 10000, // 10 second timeout
    });
    
    const data = response.data as UYIResponse;
    
    if (data.code !== 'UI' || typeof data.buy !== 'number') {
      throw new Error('Invalid UYI API response format');
    }
    
    console.log(`✅ Fetched UYI rate: 1 UYI = ${data.buy} UYU (${data.date})`);
    
    return data.buy; // Return the buy rate (UYI to UYU conversion rate)
  } catch (error) {
    console.error("❌ Error fetching UYI rate:", error);
    console.log("⚠️  Will use fallback UYI rate");
    return null;
  }
}

/**
 * Fetch current currency exchange rates
 */
export async function fetchCurrencyRates(): Promise<CurrencyResponse | null> {
  try {
    console.log("🌍 Fetching current currency exchange rates...");
    const response = await axios.get('https://trustpilot.digitalshopuy.com/currency/all', {
      timeout: 10000, // 10 second timeout
    });
    
    const data = response.data as CurrencyResponse;
    
    if (!data.success) {
      throw new Error('Currency API returned unsuccessful response');
    }
    
    console.log(`✅ Fetched exchange rates (base: ${data.base})`);
    console.log(`💱 Current USD to UYU rate: ${data.rates.UYU?.from || 'N/A'}`);
    
    return data;
  } catch (error) {
    console.error("❌ Error fetching currency rates:", error);
    console.log("⚠️  Will use fallback rates");
    return null;
  }
}

/**
 * Convert any currency to UYU using live or fallback rates
 */
export function convertToUYU(
  amount: number, 
  currency: string, 
  currencyRates: CurrencyResponse | null, 
  uyiRate: number | null
): number {
  if (currency === 'UYU' || currency === 'UUYI') {
    return amount;
  }

  // Handle UYI/UI currencies (Unidades Indexadas) with live rate
  if (currency === 'UYI' || currency === 'UI') {
    const rate = uyiRate || FALLBACK_RATES.UYI;
    return amount * rate;
  }

  // Try to use live rates first
  if (currencyRates?.rates[currency]?.from) {
    const rateToUSD = 1 / currencyRates.rates[currency].from; // Convert to USD first
    const uyuRate = currencyRates.rates.UYU?.from || FALLBACK_RATES.USD;
    return amount * rateToUSD * uyuRate;
  }

  // Use fallback rates
  const fallbackRate = FALLBACK_RATES[currency];
  if (fallbackRate) {
    return amount * fallbackRate;
  }

  // If no rate available, assume it's already in UYU or use 1:1 ratio
  console.warn(`⚠️  No exchange rate found for ${currency}, treating as UYU`);
  return amount;
}

/**
 * Calculate total amounts from awards with full currency conversion support
 */
export function calculateTotalAmounts(
  awards: any[], 
  currencyRates: CurrencyResponse | null = null, 
  uyiRate: number | null = null,
  options: {
    includeVersionInfo?: boolean;
    wasVersionUpdate?: boolean;
    previousAmount?: number | null;
  } = {}
): AmountCalculationResult {
  const amountsByCurrency: Record<string, number> = {};
  let totalItems = 0;
  let totalUYUAmount = 0; // Total amount converted to UYU

  if (awards && Array.isArray(awards)) {
    for (const award of awards) {
      if (award.items && Array.isArray(award.items)) {
        for (const item of award.items) {
          totalItems++;
          if (item.unit?.value?.amount && typeof item.unit.value.amount === "number") {
            const currency = item.unit.value.currency || "UYU"; // Default to UYU if no currency
            const quantity = item.quantity || 1;
            const itemTotal = item.unit.value.amount * quantity;

            // Track original currency amounts
            amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + itemTotal;

            // Convert to UYU for primary amount calculation
            const uyuAmount = convertToUYU(itemTotal, currency, currencyRates, uyiRate);
            totalUYUAmount += uyuAmount;
          }
        }
      }

      // Also check if award has a direct value field
      if (award.value?.amount && typeof award.value.amount === "number") {
        const currency = award.value.currency || "UYU";
        amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + award.value.amount;

        // Convert to UYU
        const uyuAmount = convertToUYU(award.value.amount, currency, currencyRates, uyiRate);
        totalUYUAmount += uyuAmount;
      }
    }
  }

  const originalUYUAmount = amountsByCurrency.UYU || 0;
  const hasConvertedAmounts = totalUYUAmount > originalUYUAmount;

  const result: AmountCalculationResult = {
    totalAmounts: amountsByCurrency,
    totalItems,
    currencies: Object.keys(amountsByCurrency),
    hasAmounts: Object.keys(amountsByCurrency).length > 0,
    primaryAmount: totalUYUAmount, // Total amount in UYU (converted)
    primaryCurrency: "UYU",
    originalUYUAmount, // Original UYU amount without conversion
    hasConvertedAmounts,
    version: AMOUNT_CALCULATION_VERSION,
    updatedAt: new Date().toISOString(),
  };

  // Add optional fields based on options and context
  if (options.includeVersionInfo) {
    result.exchangeRateDate = currencyRates?.last_update || new Date().toISOString();
    result.uyiExchangeRate = uyiRate;
    result.wasVersionUpdate = options.wasVersionUpdate;
    result.previousAmount = options.previousAmount;
  }

  return result;
}

/**
 * Calculate total amounts for simple use cases (without currency conversion)
 * This is useful for initial uploads or when currency conversion is not needed
 */
export function calculateSimpleTotalAmounts(awards: any[]): Omit<AmountCalculationResult, 'exchangeRateDate' | 'uyiExchangeRate' | 'wasVersionUpdate' | 'previousAmount'> {
  const result = calculateTotalAmounts(awards, null, null, { includeVersionInfo: false });
  
  return {
    totalAmounts: result.totalAmounts,
    totalItems: result.totalItems,
    currencies: result.currencies,
    hasAmounts: result.hasAmounts,
    primaryAmount: result.totalAmounts.UYU || 0, // Use original UYU amount for simple calculation
    primaryCurrency: result.primaryCurrency,
    originalUYUAmount: result.originalUYUAmount,
    hasConvertedAmounts: false, // No conversion in simple mode
    version: 1, // Use version 1 for simple calculations
    updatedAt: result.updatedAt,
  };
}

/**
 * Create a database query to find releases that need amount field updates
 */
export function createAmountUpdateQuery(version: number = AMOUNT_CALCULATION_VERSION) {
  return {
    "awards.items.unit.value.amount": { $exists: true, $ne: null },
    "amount.version": { $ne: version }
  };
}

/**
 * Validate if a release needs amount calculation update
 */
export function needsAmountUpdate(release: any, targetVersion: number = AMOUNT_CALCULATION_VERSION): boolean {
  // Check if release has awards with amounts
  const hasAmountData = release?.awards?.some((award: any) => 
    award?.items?.some((item: any) => item?.unit?.value?.amount) ||
    award?.value?.amount
  );

  if (!hasAmountData) {
    return false;
  }

  // Check if amount field is missing or outdated
  return !release?.amount || 
         !release.amount.version || 
         release.amount.version !== targetVersion;
}
