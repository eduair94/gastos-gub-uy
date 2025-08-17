import { connectToDatabase } from "../shared/connection/database";
import { ReleaseModel } from "../shared/models";
import {
  AMOUNT_CALCULATION_VERSION,
  calculateTotalAmounts,
  createAmountUpdateQuery,
  fetchCurrencyRates,
  fetchUYIRate
} from "./utils/amount-calculator";

const fullQuery = createAmountUpdateQuery(AMOUNT_CALCULATION_VERSION);

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
          // Check if this is a version update
          const isVersionUpdate = !!(release.amount && (release.amount as any).version !== AMOUNT_CALCULATION_VERSION);
          const hadPreviousAmount = release.amount && (release.amount as any).primaryAmount;

          const amountData = calculateTotalAmounts(
            release.awards || [], 
            currencyRates, 
            uyiRate,
            {
              includeVersionInfo: true,
              wasVersionUpdate: isVersionUpdate,
              previousAmount: hadPreviousAmount || null,
            }
          );

          // Create amount object - the calculateTotalAmounts function now returns all needed fields
          const amountField = {
            ...amountData
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
