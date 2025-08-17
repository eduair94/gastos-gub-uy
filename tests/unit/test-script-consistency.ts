import {
    AMOUNT_CALCULATION_VERSION,
    calculateTotalAmounts,
    fetchCurrencyRates,
    fetchUYIRate
} from "../../src/utils/amount-calculator";

async function testIdenticalOutput() {
  console.log("🔍 Testing Identical Output Between Scripts");
  console.log("==========================================");

  const testAwards = [
    {
      items: [
        { unit: { value: { amount: 1000, currency: "USD" } }, quantity: 1 },
        { unit: { value: { amount: 500, currency: "UYU" } }, quantity: 2 }
      ]
    }
  ];

  const currencyRates = await fetchCurrencyRates();
  const uyiRate = await fetchUYIRate();

  // Simulate release uploader creating a new record
  const uploaderAmount = calculateTotalAmounts(testAwards, currencyRates, uyiRate, {
    includeVersionInfo: true,
    wasVersionUpdate: false,
    previousAmount: null,
  });

  // Simulate migration script processing the same data
  const migrationAmount = calculateTotalAmounts(testAwards, currencyRates, uyiRate, {
    includeVersionInfo: true,
    wasVersionUpdate: false, // Set to false to match uploader
    previousAmount: null,
  });

  // Compare all fields
  console.log("\n📊 Field Comparison:");
  let allMatch = true;
  
  const versionMatch = uploaderAmount.version === migrationAmount.version;
  console.log(`   version: ${versionMatch ? '✅' : '❌'} (Uploader: ${uploaderAmount.version}, Migration: ${migrationAmount.version})`);
  if (!versionMatch) allMatch = false;

  const primaryAmountMatch = Math.abs(uploaderAmount.primaryAmount - migrationAmount.primaryAmount) < 0.01;
  console.log(`   primaryAmount: ${primaryAmountMatch ? '✅' : '❌'} (Uploader: ${uploaderAmount.primaryAmount}, Migration: ${migrationAmount.primaryAmount})`);
  if (!primaryAmountMatch) allMatch = false;

  const originalUYUMatch = uploaderAmount.originalUYUAmount === migrationAmount.originalUYUAmount;
  console.log(`   originalUYUAmount: ${originalUYUMatch ? '✅' : '❌'} (Uploader: ${uploaderAmount.originalUYUAmount}, Migration: ${migrationAmount.originalUYUAmount})`);
  if (!originalUYUMatch) allMatch = false;

  const hasConvertedMatch = uploaderAmount.hasConvertedAmounts === migrationAmount.hasConvertedAmounts;
  console.log(`   hasConvertedAmounts: ${hasConvertedMatch ? '✅' : '❌'} (Uploader: ${uploaderAmount.hasConvertedAmounts}, Migration: ${migrationAmount.hasConvertedAmounts})`);
  if (!hasConvertedMatch) allMatch = false;

  const totalItemsMatch = uploaderAmount.totalItems === migrationAmount.totalItems;
  console.log(`   totalItems: ${totalItemsMatch ? '✅' : '❌'} (Uploader: ${uploaderAmount.totalItems}, Migration: ${migrationAmount.totalItems})`);
  if (!totalItemsMatch) allMatch = false;

  const hasAmountsMatch = uploaderAmount.hasAmounts === migrationAmount.hasAmounts;
  console.log(`   hasAmounts: ${hasAmountsMatch ? '✅' : '❌'} (Uploader: ${uploaderAmount.hasAmounts}, Migration: ${migrationAmount.hasAmounts})`);
  if (!hasAmountsMatch) allMatch = false;

  // Compare totalAmounts object
  const totalAmountsMatch = JSON.stringify(uploaderAmount.totalAmounts) === JSON.stringify(migrationAmount.totalAmounts);
  console.log(`   totalAmounts: ${totalAmountsMatch ? '✅' : '❌'}`);
  if (!totalAmountsMatch) allMatch = false;

  // Compare currencies array
  const currenciesMatch = JSON.stringify(uploaderAmount.currencies.sort()) === JSON.stringify(migrationAmount.currencies.sort());
  console.log(`   currencies: ${currenciesMatch ? '✅' : '❌'}`);
  if (!currenciesMatch) allMatch = false;

  console.log(`\n🎯 Final Result: ${allMatch ? '✅ IDENTICAL' : '❌ DIFFERENT'}`);
  
  if (allMatch) {
    console.log("🎉 SUCCESS: Both scripts will create identical amount fields!");
    console.log(`📋 Version: ${AMOUNT_CALCULATION_VERSION}`);
    console.log(`💰 Primary Amount: ${Math.round(uploaderAmount.primaryAmount)} UYU`);
    console.log(`🔄 Currencies: ${uploaderAmount.currencies.join(', ')}`);
  } else {
    console.log("❌ ERROR: Scripts create different amount structures!");
  }

  return allMatch;
}

testIdenticalOutput()
  .then((success) => {
    if (success) {
      console.log("\n✅ All tests passed! Scripts are now consistent.");
      process.exit(0);
    } else {
      console.log("\n❌ Tests failed! Scripts are inconsistent.");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("❌ Test error:", error);
    process.exit(1);
  });
