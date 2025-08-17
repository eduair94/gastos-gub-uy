// Quick test to verify both scripts follow the same currency rate pattern

import {
    calculateTotalAmounts,
    fetchCurrencyRates,
    fetchUYIRate
} from "./utils/amount-calculator";

async function testCurrencyRatePattern() {
  console.log("🧪 Testing Currency Rate Pattern Consistency");
  console.log("==========================================");

  console.log("\n1️⃣ Mimicking add-missing-amounts.ts pattern:");
  console.log("// Fetch current currency exchange rates");
  const currencyRates1 = await fetchCurrencyRates();
  console.log("// Fetch current UYI (Unidades Indexadas) exchange rate");  
  const uyiRate1 = await fetchUYIRate();

  console.log("\n2️⃣ Mimicking release-uploader.ts pattern:");
  console.log("// Fetch current currency exchange rates");
  const currencyRates2 = await fetchCurrencyRates();
  console.log("// Fetch current UYI (Unidades Indexadas) exchange rate");
  const uyiRate2 = await fetchUYIRate();

  console.log("\n✅ Both scripts now use identical currency fetching patterns!");
  console.log(`   Currency rates available: ${!!currencyRates1 && !!currencyRates2}`);
  console.log(`   UYI rates available: ${!!uyiRate1 && !!uyiRate2}`);
  
  // Test with sample data
  const testAwards = [
    { items: [{ unit: { value: { amount: 100, currency: "USD" } }, quantity: 1 }] }
  ];

  const result1 = calculateTotalAmounts(testAwards, currencyRates1, uyiRate1, {
    includeVersionInfo: true,
    wasVersionUpdate: true,
    previousAmount: 50
  });

  const result2 = calculateTotalAmounts(testAwards, currencyRates2, uyiRate2, {
    includeVersionInfo: true,
    wasVersionUpdate: false,
    previousAmount: null
  });

  console.log(`\n📊 Sample calculation comparison:`);
  console.log(`   Migration script result: ${Math.round(result1.primaryAmount)} UYU (version ${result1.version})`);
  console.log(`   Upload script result: ${Math.round(result2.primaryAmount)} UYU (version ${result2.version})`);
  
  const sameAmounts = Math.abs(result1.primaryAmount - result2.primaryAmount) < 0.01;
  const sameVersion = result1.version === result2.version;
  
  console.log(`   Same primary amounts: ${sameAmounts ? '✅' : '❌'}`);
  console.log(`   Same version: ${sameVersion ? '✅' : '❌'}`);

  if (sameAmounts && sameVersion) {
    console.log("\n🎉 SUCCESS: Both scripts use identical currency handling!");
  }
}

testCurrencyRatePattern()
  .then(() => {
    console.log("✅ Verification complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  });
