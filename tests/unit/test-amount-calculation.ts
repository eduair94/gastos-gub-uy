// Test script to validate the amount calculation functionality

// Mock test data to validate amount calculation logic
const testRelease = {
  id: "test-release-001",
  initiationType: "tender",
  tag: ["award"],
  date: new Date(),
  ocid: "ocds-test-001",
  parties: [],
  awards: [
    {
      id: "award-1",
      title: "Test Award 1",
      date: new Date(),
      status: "active",
      items: [
        {
          id: 1,
          quantity: 2,
          classification: {
            id: "123",
            description: "Test Item",
            scheme: "test"
          },
          unit: {
            id: "1",
            name: "UNIT",
            value: {
              amount: 1000,
              currency: "UYU"
            }
          }
        },
        {
          id: 2,
          quantity: 1,
          classification: {
            id: "124",
            description: "Test Item USD",
            scheme: "test"
          },
          unit: {
            id: "2",
            name: "UNIT",
            value: {
              amount: 500,
              currency: "USD"
            }
          }
        }
      ],
      suppliers: [],
      documents: []
    },
    {
      id: "award-2",
      title: "Test Award 2",
      date: new Date(),
      status: "active",
      value: {
        amount: 3000,
        currency: "UYU"
      },
      items: [
        {
          id: 3,
          quantity: 3,
          classification: {
            id: "125",
            description: "Another Test Item",
            scheme: "test"
          },
          unit: {
            id: "3",
            name: "UNIT",
            value: {
              amount: 750,
              currency: "UYU"
            }
          }
        }
      ],
      suppliers: [],
      documents: []
    }
  ]
};

// Test the amount calculation logic
function testAmountCalculation() {
  console.log('Testing amount calculation...');
  
  const calculateTotalAmounts = (awards: any[]) => {
    const amountsByCurrency: Record<string, number> = {};
    let totalItems = 0;
    
    if (awards && Array.isArray(awards)) {
      for (const award of awards) {
        if (award.items && Array.isArray(award.items)) {
          for (const item of award.items) {
            totalItems++;
            if (item.unit?.value?.amount && typeof item.unit.value.amount === 'number') {
              const currency = item.unit.value.currency || 'UYU';
              const quantity = item.quantity || 1;
              const itemTotal = item.unit.value.amount * quantity;
              
              amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + itemTotal;
            }
          }
        }
        
        // Also check if award has a direct value field
        if (award.value?.amount && typeof award.value.amount === 'number') {
          const currency = award.value.currency || 'UYU';
          amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + award.value.amount;
        }
      }
    }
    
    return {
      totalAmounts: amountsByCurrency,
      totalItems,
      currencies: Object.keys(amountsByCurrency),
      hasAmounts: Object.keys(amountsByCurrency).length > 0
    };
  };

  const result = calculateTotalAmounts(testRelease.awards || []);
  
  console.log('Test Release Awards:', JSON.stringify(testRelease.awards, null, 2));
  console.log('Calculated Amount Data:', JSON.stringify(result, null, 2));
  
  // Expected results:
  // - UYU: 2000 (2*1000) + 2250 (3*750) + 3000 (direct award value) = 7250
  // - USD: 500 (1*500) = 500
  // - Total items: 3
  
  const expectedUYU = 7250; // 2000 + 2250 + 3000
  const expectedUSD = 500;
  const expectedTotalItems = 3;
  
  console.log('\n=== VALIDATION ===');
  console.log(`Expected UYU: ${expectedUYU}, Actual: ${result.totalAmounts.UYU || 0}`);
  console.log(`Expected USD: ${expectedUSD}, Actual: ${result.totalAmounts.USD || 0}`);
  console.log(`Expected Total Items: ${expectedTotalItems}, Actual: ${result.totalItems}`);
  
  const isValid = (
    result.totalAmounts.UYU === expectedUYU &&
    result.totalAmounts.USD === expectedUSD &&
    result.totalItems === expectedTotalItems &&
    result.currencies.includes('UYU') &&
    result.currencies.includes('USD') &&
    result.hasAmounts === true
  );
  
  console.log(`\n✅ Amount calculation test: ${isValid ? 'PASSED' : 'FAILED'}`);
  
  if (!isValid) {
    console.error('❌ Test failed - calculation logic needs review');
    process.exit(1);
  }
  
  return result;
}

// Run the test
testAmountCalculation();

console.log('\n🎉 All tests passed! The amount calculation logic is working correctly.');
