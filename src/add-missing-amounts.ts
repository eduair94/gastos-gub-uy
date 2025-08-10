import axios from "axios";
import { connectToDatabase } from "../shared/connection/database";
import { ReleaseModel } from "../shared/models";

// Interface for currency API response
interface CurrencyResponse {
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
interface UYIResponse {
  code: string;
  date: string;
  origin: string;
  type: string;
  buy: number;
  name: string;
  sell: number;
}

// Function to fetch UYI (Unidades Indexadas) exchange rate
async function fetchUYIRate(): Promise<number | null> {
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

// Function to fetch current currency rates
async function fetchCurrencyRates(): Promise<CurrencyResponse | null> {
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
const AMOUNT_CALCULATION_VERSION = 2; // Updated to include currency conversion

const fullQuery = { 
  "awards.items.unit.value.amount": { $exists: true, $ne: null },
  "amount.version": { $ne: AMOUNT_CALCULATION_VERSION } 
};
// Calculate total amounts function (shared logic) with currency conversion
const calculateTotalAmounts = (awards: any[], currencyRates: CurrencyResponse | null, uyiRate: number | null) => {
  const amountsByCurrency: Record<string, number> = {};
  let totalItems = 0;
  let totalUYUAmount = 0; // Total amount converted to UYU

  // Function to convert any currency to UYU
  const convertToUYU = (amount: number, currency: string): number => {
    if (currency === 'UYU' || currency === 'UUYI') {
      return amount;
    }

    // Handle UYI/UI currencies (Unidades Indexadas) with live rate
    if (currency === 'UYI' || currency === 'UI') {
      const rate = uyiRate || FALLBACK_RATES.UYI;
      console.log(`💱 Converting ${amount} ${currency} to UYU using rate: ${rate}`);
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
  };

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
            const uyuAmount = convertToUYU(itemTotal, currency);
            totalUYUAmount += uyuAmount;
          }
        }
      }

      // Also check if award has a direct value field
      if (award.value?.amount && typeof award.value.amount === "number") {
        const currency = award.value.currency || "UYU";
        amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + award.value.amount;

        // Convert to UYU
        const uyuAmount = convertToUYU(award.value.amount, currency);
        totalUYUAmount += uyuAmount;
      }
    }
  }

  return {
    totalAmounts: amountsByCurrency,
    totalItems,
    currencies: Object.keys(amountsByCurrency),
    hasAmounts: Object.keys(amountsByCurrency).length > 0,
    primaryAmount: totalUYUAmount, // Total amount in UYU (converted)
    originalUYUAmount: amountsByCurrency.UYU || 0, // Original UYU amount without conversion
  };
};

async function addMissingAmounts() {
  try {
    console.log("🔌 Connecting to database...");
    await connectToDatabase();
    console.log("✅ Connected to database");

    // Fetch current currency exchange rates
    const currencyRates = await fetchCurrencyRates();
    
    // Fetch current UYI (Unidades Indexadas) exchange rate
    const uyiRate = await fetchUYIRate();

    // Find releases that don't have the amount field or have outdated version
    console.log("🔍 Finding releases without amount field or outdated version...");
    console.log(`📋 Current amount calculation version: ${AMOUNT_CALCULATION_VERSION}`);
    
    const releasesWithoutAmount = await ReleaseModel.countDocuments(fullQuery);
    
    // Get version statistics
    const totalReleasesCount = await ReleaseModel.countDocuments();
    const releasesWithCurrentVersion = await ReleaseModel.countDocuments({ 
      "amount.version": AMOUNT_CALCULATION_VERSION 
    });
    const releasesWithOldVersion = await ReleaseModel.countDocuments({ 
      "amount.version": { $exists: true, $ne: AMOUNT_CALCULATION_VERSION } 
    });
    const releasesWithoutVersion = await ReleaseModel.countDocuments({ 
      "amount.version": { $exists: false } 
    });

    console.log(`📊 Version statistics:`);
    console.log(`   Total releases: ${totalReleasesCount}`);
    console.log(`   Releases with current version (${AMOUNT_CALCULATION_VERSION}): ${releasesWithCurrentVersion}`);
    console.log(`   Releases with old version: ${releasesWithOldVersion}`);
    console.log(`   Releases without version: ${releasesWithoutVersion}`);
    console.log(`   Releases needing update: ${releasesWithoutAmount}`);

    if (releasesWithoutAmount === 0) {
      console.log("✅ All releases already have amount field");
      return;
    }

    // Process releases in batches to avoid memory issues
    const BATCH_SIZE = 1000;
    let processedCount = 0;
    let updatedCount = 0;

    console.log(`🚀 Starting to process releases in batches of ${BATCH_SIZE}...`);

    while (processedCount < releasesWithoutAmount) {
      console.log(`\n📦 Processing batch starting at ${processedCount}...`);

      // Get a batch of releases without amount field
      const releases = await ReleaseModel.find(fullQuery)
        .limit(BATCH_SIZE)
        .lean();

      if (releases.length === 0) {
        break;
      }

      console.log(`   Found ${releases.length} releases to process`);

      // Prepare bulk operations
      const bulkOps: any[] = [];

      for (const release of releases) {
        try {
          const amountData = calculateTotalAmounts(release.awards || [], currencyRates, uyiRate);
          
          // Check if this is a version update
          const isVersionUpdate = release.amount && (release.amount as any).version !== AMOUNT_CALCULATION_VERSION;
          const hadPreviousAmount = release.amount && (release.amount as any).primaryAmount;

          // Create amount object
          const amountField = {
            totalAmounts: amountData.totalAmounts,
            totalItems: amountData.totalItems,
            currencies: amountData.currencies,
            hasAmounts: amountData.hasAmounts,
            // Primary amount in UYU (converted from all currencies)
            primaryAmount: amountData.primaryAmount,
            primaryCurrency: "UYU",
            // Keep track of original UYU amount vs converted amount
            originalUYUAmount: amountData.originalUYUAmount,
            // Store exchange rate info for reference
            exchangeRateDate: currencyRates?.last_update || new Date().toISOString(),
            uyiExchangeRate: uyiRate, // Store UYI rate for reference
            hasConvertedAmounts: amountData.primaryAmount > amountData.originalUYUAmount,
            // Version tracking for future updates
            version: AMOUNT_CALCULATION_VERSION,
            updatedAt: new Date().toISOString(),
            // Track if this was a version update
            wasVersionUpdate: isVersionUpdate,
            previousAmount: hadPreviousAmount || null,
          };

          bulkOps.push({
            updateOne: {
              filter: { _id: release._id },
              update: { $set: { amount: amountField } },
            },
          });
        } catch (error) {
          console.error(`❌ Error processing release ${release.id}:`, error);
        }
      }

      if (bulkOps.length > 0) {
        try {
          console.log(`   Executing ${bulkOps.length} updates...`);
          const result = await ReleaseModel.bulkWrite(bulkOps, { ordered: false });

          const updated = result.modifiedCount || 0;
          updatedCount += updated;

          console.log(`   ✅ Updated ${updated} releases`);

          // Show sample of calculated amounts
          if (releases.length > 0) {
            const sampleRelease = releases[0];
            const sampleAmountData = calculateTotalAmounts(sampleRelease.awards || [], currencyRates, uyiRate);
            console.log(`   💰 Sample amount calculation:`);
            console.log(`      Original currencies: ${JSON.stringify(sampleAmountData.totalAmounts)}`);
            console.log(`      Total items: ${sampleAmountData.totalItems}`);
            console.log(`      Primary amount (UYU converted): ${Math.round(sampleAmountData.primaryAmount)}`);
            console.log(`      Original UYU amount: ${Math.round(sampleAmountData.originalUYUAmount)}`);
            if (sampleAmountData.primaryAmount > sampleAmountData.originalUYUAmount) {
              console.log(`      💱 Currency conversion applied`);
            }
          }
        } catch (error) {
          console.error(`❌ Error executing bulk write:`, error);
        }
      }

      processedCount += releases.length;
      console.log(`📈 Progress: ${processedCount}/${releasesWithoutAmount} (${Math.round((processedCount / releasesWithoutAmount) * 100)}%)`);
    }

    console.log(`\n🎉 Migration complete!`);
    console.log(`📊 Total processed: ${processedCount} releases`);
    console.log(`✅ Total updated: ${updatedCount} releases`);

    // Verify the migration
    console.log("\n🔍 Verifying migration...");
    const remainingWithoutAmount = await ReleaseModel.countDocuments({
      $or: [{ amount: { $exists: false } }, { amount: null }, { "amount.totalAmounts": { $exists: false } }],
    });

    console.log(`📊 Releases still without amount field: ${remainingWithoutAmount}`);

    if (remainingWithoutAmount === 0) {
      console.log("✅ All releases now have amount field!");
    }

    // Show some statistics about currency conversions
    const totalReleases = await ReleaseModel.countDocuments();
    const releasesWithAmounts = await ReleaseModel.countDocuments({ "amount.hasAmounts": true });
    const releasesWithUYU = await ReleaseModel.countDocuments({ "amount.totalAmounts.UYU": { $gt: 0 } });
    const releasesWithConversions = await ReleaseModel.countDocuments({ "amount.hasConvertedAmounts": true });

    console.log(`\n📈 Final statistics:`);
    console.log(`   Total releases: ${totalReleases}`);
    console.log(`   Releases with calculated amounts: ${releasesWithAmounts}`);
    console.log(`   Releases with UYU amounts: ${releasesWithUYU}`);
    console.log(`   Releases with currency conversions: ${releasesWithConversions}`);
    
    // Sample some converted amounts
    const sampleConverted = await ReleaseModel.findOne(
      { "amount.hasConvertedAmounts": true },
      { amount: 1, id: 1 }
    ).lean();
    
    if (sampleConverted && sampleConverted.amount) {
      console.log(`\n💱 Sample currency conversion:`);
      console.log(`   Release ID: ${sampleConverted.id}`);
      console.log(`   Original currencies: ${JSON.stringify(sampleConverted.amount.totalAmounts)}`);
      console.log(`   Converted total (UYU): ${Math.round(sampleConverted.amount.primaryAmount)}`);
      console.log(`   Version: ${(sampleConverted.amount as any).version || 'N/A'}`);
      console.log(`   Exchange rate date: ${(sampleConverted.amount as any).exchangeRateDate || 'N/A'}`);
    }
  } catch (error) {
    console.error("❌ Error in migration script:", error);
    process.exit(1);
  }
}

// Run the script
addMissingAmounts()
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
