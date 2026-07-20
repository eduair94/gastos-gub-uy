# Amount Calculator Refactoring

## Overview
This refactoring creates a shared utility for calculating monetary amounts from contract awards, consolidating logic that was previously duplicated between `add-missing-amounts.ts` and `release-uploader.ts`.

## Files Created/Modified

### 1. New File: `src/utils/amount-calculator.ts`
This is the new shared utility that contains:

- **Interfaces**: `CurrencyResponse`, `UYIResponse`, `AmountCalculationResult`
- **Constants**: `AMOUNT_CALCULATION_VERSION`, fallback exchange rates
- **Functions**:
  - `fetchCurrencyRates()`: Fetches live exchange rates from external API
  - `fetchUYIRate()`: Fetches UYI (Unidades Indexadas) rates from BCU API
  - `convertToUYU()`: Converts any currency to UYU using live or fallback rates
  - `calculateTotalAmounts()`: Full-featured calculation with currency conversion
  - `calculateSimpleTotalAmounts()`: Simple calculation for initial uploads
  - `createAmountUpdateQuery()`: Database query helper
  - `needsAmountUpdate()`: Validation helper

### 2. Updated: `src/add-missing-amounts.ts`
- **Removed**: Duplicate interfaces and functions
- **Added**: Import from shared utility
- **Updated**: Function calls to use new shared interface with options parameter

### 3. Updated: `src/uploaders/release-uploader.ts`
- **Removed**: Inline `calculateTotalAmounts` function
- **Added**: Import from shared utility and currency rate fetching
- **Updated**: Uses `calculateTotalAmounts()` with full currency conversion (version 2)
- **Enhanced**: Now creates the same amount structure as migration script

### 4. Test File: `src/test-amount-calculator.ts`
A test script to verify the functionality works correctly.

## Key Features

### Currency Conversion
- **Live Rates**: Fetches current exchange rates from external APIs
- **UYI Support**: Special handling for Uruguay's Unidades Indexadas
- **Fallback Rates**: Approximate rates when APIs are unavailable
- **Multi-currency**: Supports USD, EUR, ARS, BRL, UYI, and UYU

### Versioning System
- **Version 2**: Advanced calculation with currency conversion (used by both scripts)
- **Consistency**: Both upload and migration scripts use the same version and structure
- **Upgradeable**: Easy to add new versions in the future

### Flexible Usage
- **Consistent Structure**: Both scripts create identical amount field structures
- **Currency Conversion**: Both scripts support full multi-currency conversion
- **Options**: Configurable metadata inclusion and version tracking

## Migration Process

1. **Initial Upload** (`release-uploader.ts`):
   - Uses `calculateTotalAmounts()` with full currency conversion
   - Version 2, with complete currency conversion support
   - Primary amount = converted total in UYU
   - **Same structure and version as migration script**

2. **Migration Script** (`add-missing-amounts.ts`):
   - Uses `calculateTotalAmounts()` with full options
   - Version 2, with currency conversion
   - Primary amount = converted total in UYU
   - Updates existing releases to current version

## Usage Examples

### Release Uploader (Initial Upload)
```typescript
import { calculateTotalAmounts, fetchCurrencyRates, fetchUYIRate } from "./utils/amount-calculator";

const currencyRates = await fetchCurrencyRates();
const uyiRate = await fetchUYIRate();

const result = calculateTotalAmounts(awards, currencyRates, uyiRate, {
  includeVersionInfo: true,
  wasVersionUpdate: false, // Initial upload
  previousAmount: null
});
// Returns full amount info with currency conversion (Version 2)
```

### Migration Script (Updating Existing Records)
```typescript
import { calculateTotalAmounts, fetchCurrencyRates, fetchUYIRate } from "./utils/amount-calculator";

const currencyRates = await fetchCurrencyRates();
const uyiRate = await fetchUYIRate();

const result = calculateTotalAmounts(awards, currencyRates, uyiRate, {
  includeVersionInfo: true,
  wasVersionUpdate: true, // This is an update
  previousAmount: existingAmount
});
// Returns full amount info with currency conversion (Version 2)
```

## Database Schema

The amount field structure:
```typescript
{
  totalAmounts: { [currency: string]: number }, // Original amounts by currency
  totalItems: number,
  currencies: string[],
  hasAmounts: boolean,
  primaryAmount: number, // Total converted to UYU
  primaryCurrency: "UYU",
  originalUYUAmount: number, // Original UYU without conversion
  hasConvertedAmounts: boolean,
  version: number, // Calculation version
  updatedAt: string, // ISO date string
  // Optional fields (version 2+)
  exchangeRateDate?: string,
  uyiExchangeRate?: number,
  wasVersionUpdate?: boolean,
  previousAmount?: number
}
```

## Benefits

1. **DRY Principle**: No code duplication
2. **Maintainability**: Single source of truth for amount calculations
3. **Testability**: Easy to unit test the shared logic
4. **Extensibility**: Easy to add new currencies or calculation methods
5. **Version Control**: Built-in versioning for future migrations
6. **Flexibility**: Different calculation modes for different use cases

## Testing

Run the test script to verify functionality:
```bash
npx tsx src/test-amount-calculator.ts
```

The test verifies:
- Simple calculations work correctly
- Advanced calculations with currency conversion work
- API calls succeed (with fallback on failure)
- Version tracking works properly
