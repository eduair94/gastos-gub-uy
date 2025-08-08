import { connectToDatabase } from "../shared/connection/database";
import { ReleaseModel } from "../shared/models";

// Calculate total amounts function (shared logic)
const calculateTotalAmounts = (awards: any[]) => {
  const amountsByCurrency: Record<string, number> = {};
  let totalItems = 0;

  if (awards && Array.isArray(awards)) {
    for (const award of awards) {
      if (award.items && Array.isArray(award.items)) {
        for (const item of award.items) {
          totalItems++;
          if (item.unit?.value?.amount && typeof item.unit.value.amount === "number") {
            const currency = item.unit.value.currency || "UYU"; // Default to UYU if no currency
            const quantity = item.quantity || 1;
            const itemTotal = item.unit.value.amount * quantity;

            amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + itemTotal;
          }
        }
      }

      // Also check if award has a direct value field
      if (award.value?.amount && typeof award.value.amount === "number") {
        const currency = award.value.currency || "UYU";
        amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + award.value.amount;
      }
    }
  }

  return {
    totalAmounts: amountsByCurrency,
    totalItems,
    currencies: Object.keys(amountsByCurrency),
    hasAmounts: Object.keys(amountsByCurrency).length > 0,
  };
};

async function addMissingAmounts() {
  try {
    console.log("🔌 Connecting to database...");
    await connectToDatabase();
    console.log("✅ Connected to database");

    // Find releases that don't have the amount field
    console.log("🔍 Finding releases without amount field...");
    const releasesWithoutAmount = await ReleaseModel.countDocuments({ $and: [{ "awards.items.unit.value.amount": { $exists: true, $ne: null } }, { $or: [{ amount: { $exists: false } }, { amount: null }, { "amount.totalAmounts": { $exists: false } }] }] });

    console.log(`📊 Found ${releasesWithoutAmount} releases without amount field`);

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
      const releases = await ReleaseModel.find({
        $and: [{ "awards.items.unit.value.amount": { $exists: true, $ne: null } }, { $or: [{ amount: { $exists: false } }, { amount: null }, { "amount.totalAmounts": { $exists: false } }] }],
      })
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
          const amountData = calculateTotalAmounts(release.awards || []);

          // Create amount object
          const amountField = {
            totalAmounts: amountData.totalAmounts,
            totalItems: amountData.totalItems,
            currencies: amountData.currencies,
            hasAmounts: amountData.hasAmounts,
            // Add primary amount in UYU for easy sorting/filtering
            primaryAmount: amountData.totalAmounts.UYU || 0,
            primaryCurrency: "UYU",
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
            const sampleAmountData = calculateTotalAmounts(sampleRelease.awards || []);
            console.log(`   💰 Sample amount calculation:`);
            console.log(`      Currencies: ${JSON.stringify(sampleAmountData.totalAmounts)}`);
            console.log(`      Total items: ${sampleAmountData.totalItems}`);
            console.log(`      Primary amount (UYU): ${sampleAmountData.totalAmounts.UYU || 0}`);
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

    // Show some statistics
    const totalReleases = await ReleaseModel.countDocuments();
    const releasesWithAmounts = await ReleaseModel.countDocuments({ "amount.hasAmounts": true });
    const releasesWithUYU = await ReleaseModel.countDocuments({ "amount.totalAmounts.UYU": { $gt: 0 } });

    console.log(`\n📈 Final statistics:`);
    console.log(`   Total releases: ${totalReleases}`);
    console.log(`   Releases with calculated amounts: ${releasesWithAmounts}`);
    console.log(`   Releases with UYU amounts: ${releasesWithUYU}`);
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
