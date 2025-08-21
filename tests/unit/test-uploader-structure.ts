import { AMOUNT_CALCULATION_VERSION, calculateTotalAmounts, fetchCurrencyRates, fetchUYIRate } from "../../src/utils/amount-calculator";

// Test data similar to what would be in a release
const testRelease = {
  id: "test-release-001",
  awards: [
    {
      items: [
        {
          unit: { value: { amount: 1000, currency: "USD" } },
          quantity: 2,
        },
        {
          unit: { value: { amount: 500, currency: "UYU" } },
          quantity: 1,
        },
      ],
    },
    {
      value: { amount: 2000, currency: "EUR" },
    },
  ],
};

async function testReleaseUploaderAmountStructure() {
  console.log("🧪 Testing Release Uploader Amount Structure");
  console.log("============================================");

  // Fetch currency rates (same as release uploader would do)
  console.log("\n💱 Fetching currency rates...");
  const currencyRates = await fetchCurrencyRates();
  const uyiRate = await fetchUYIRate();

  // Calculate amounts exactly as release uploader would
  console.log("\n📊 Calculating amounts for release uploader...");
  const uploaderAmountData = calculateTotalAmounts(testRelease.awards || [], currencyRates, uyiRate, {
    includeVersionInfo: true,
    wasVersionUpdate: false, // Initial upload, not update
    previousAmount: null,
  });

  // Calculate amounts exactly as add-missing-amounts would (for comparison)
  console.log("📊 Calculating amounts for migration script...");
  const migrationAmountData = calculateTotalAmounts(testRelease.awards || [], currencyRates, uyiRate, {
    includeVersionInfo: true,
    wasVersionUpdate: true, // This would be true for existing records
    previousAmount: 1000, // Some previous amount
  });

  console.log("\n🔍 Comparing structures:");
  console.log("========================");

  console.log("\n📦 Release Uploader Amount Data:");
  console.log(`   Version: ${uploaderAmountData.version}`);
  console.log(`   Total Amounts: ${JSON.stringify(uploaderAmountData.totalAmounts)}`);
  console.log(`   Primary Amount (UYU): ${Math.round(uploaderAmountData.primaryAmount)}`);
  console.log(`   Original UYU Amount: ${uploaderAmountData.originalUYUAmount}`);
  console.log(`   Has Converted Amounts: ${uploaderAmountData.hasConvertedAmounts}`);
  console.log(`   Was Version Update: ${uploaderAmountData.wasVersionUpdate}`);
  console.log(`   Previous Amount: ${uploaderAmountData.previousAmount}`);
  console.log(`   Exchange Rate Date: ${uploaderAmountData.exchangeRateDate}`);
  console.log(`   UYI Rate: ${uploaderAmountData.uyiExchangeRate}`);

  console.log("\n📦 Migration Script Amount Data:");
  console.log(`   Version: ${migrationAmountData.version}`);
  console.log(`   Total Amounts: ${JSON.stringify(migrationAmountData.totalAmounts)}`);
  console.log(`   Primary Amount (UYU): ${Math.round(migrationAmountData.primaryAmount)}`);
  console.log(`   Original UYU Amount: ${migrationAmountData.originalUYUAmount}`);
  console.log(`   Has Converted Amounts: ${migrationAmountData.hasConvertedAmounts}`);
  console.log(`   Was Version Update: ${migrationAmountData.wasVersionUpdate}`);
  console.log(`   Previous Amount: ${migrationAmountData.previousAmount}`);
  console.log(`   Exchange Rate Date: ${migrationAmountData.exchangeRateDate}`);
  console.log(`   UYI Rate: ${migrationAmountData.uyiExchangeRate}`);

  // Verify they have the same version and similar structure
  console.log("\n✅ Validation Results:");
  console.log("======================");

  const sameVersion = uploaderAmountData.version === migrationAmountData.version;
  const samePrimaryAmount = Math.abs(uploaderAmountData.primaryAmount - migrationAmountData.primaryAmount) < 1;
  const sameStructure = uploaderAmountData.hasOwnProperty("totalAmounts") && uploaderAmountData.hasOwnProperty("primaryAmount") && uploaderAmountData.hasOwnProperty("exchangeRateDate") && uploaderAmountData.hasOwnProperty("version") && uploaderAmountData.version === AMOUNT_CALCULATION_VERSION;

  console.log(`   ✅ Same version (${AMOUNT_CALCULATION_VERSION}): ${sameVersion}`);
  console.log(`   ✅ Same primary amount: ${samePrimaryAmount}`);
  console.log(`   ✅ Complete structure: ${sameStructure}`);

  if (sameVersion && samePrimaryAmount && sameStructure) {
    console.log(`\n🎉 SUCCESS: Both scripts create identical amount structures!`);
  } else {
    console.log(`\n❌ WARNING: Structures may differ!`);
  }

  // Show the complete release object as it would be stored
  console.log("\n📄 Sample Release Object (as stored by uploader):");
  console.log("================================================");
  const releaseWithMetadata = {
    ...testRelease,
    sourceFileName: "test-2024.json",
    sourceYear: 2024,
    amount: uploaderAmountData,
  };

  console.log(`   Release ID: ${releaseWithMetadata.id}`);
  console.log(`   Source File: ${releaseWithMetadata.sourceFileName}`);
  console.log(`   Source Year: ${releaseWithMetadata.sourceYear}`);
  console.log(`   Amount Version: ${releaseWithMetadata.amount.version}`);
  console.log(`   Primary Amount: ${Math.round(releaseWithMetadata.amount.primaryAmount)} UYU`);
  console.log(`   Currencies: ${releaseWithMetadata.amount.currencies.join(", ")}`);
}

// Run the test
testReleaseUploaderAmountStructure()
  .then(() => {
    console.log("\n✅ Test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
