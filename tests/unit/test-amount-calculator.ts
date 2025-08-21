import { AMOUNT_CALCULATION_VERSION, calculateSimpleTotalAmounts, calculateTotalAmounts, fetchCurrencyRates, fetchUYIRate } from "../../src/utils/amount-calculator";

// Test data
const testAwards = [
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
];

async function testAmountCalculator() {
  console.log("🧪 Testing Amount Calculator");
  console.log("================================");

  // Test simple calculation (no currency conversion)
  console.log("\n📊 Testing Simple Calculation:");
  const simpleResult = calculateSimpleTotalAmounts(testAwards);
  console.log("Simple result:", {
    totalAmounts: simpleResult.totalAmounts,
    totalItems: simpleResult.totalItems,
    primaryAmount: simpleResult.primaryAmount,
    version: simpleResult.version,
  });

  // Test advanced calculation (with currency conversion)
  console.log("\n💱 Testing Advanced Calculation:");
  const currencyRates = await fetchCurrencyRates();
  const uyiRate = await fetchUYIRate();

  const advancedResult = calculateTotalAmounts(testAwards, currencyRates, uyiRate, {
    includeVersionInfo: true,
    wasVersionUpdate: false,
    previousAmount: null,
  });

  console.log("Advanced result:", {
    totalAmounts: advancedResult.totalAmounts,
    totalItems: advancedResult.totalItems,
    primaryAmount: Math.round(advancedResult.primaryAmount),
    originalUYUAmount: advancedResult.originalUYUAmount,
    hasConvertedAmounts: advancedResult.hasConvertedAmounts,
    version: advancedResult.version,
    exchangeRateDate: advancedResult.exchangeRateDate,
    uyiExchangeRate: advancedResult.uyiExchangeRate,
  });

  console.log(`\n✅ Current version: ${AMOUNT_CALCULATION_VERSION}`);
  console.log("✅ Amount calculator test completed!");
}

// Run the test
testAmountCalculator()
  .then(() => {
    console.log("🎉 All tests passed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
