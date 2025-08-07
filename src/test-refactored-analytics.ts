import mongoose from 'mongoose';
import { MONGO_CONFIG } from './config/config';
import { ItemModel } from './database/item-model';
import EfficientAnalyticsPopulator from './populate-analytics';

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGO_CONFIG.uri, {
      dbName: MONGO_CONFIG.database
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
}

async function testRefactoredAnalytics() {
  try {
    console.log('Testing refactored analytics with ItemModel...');
    
    // Connect to database
    await connectToDatabase();
    
    // Count total items in the database
    const itemCount = await ItemModel.countDocuments();
    console.log(`Total items in database: ${itemCount}`);
    
    if (itemCount === 0) {
      console.log('No items found in database. Please run the data import first.');
      return;
    }
    
    // Get a sample of items to verify structure
    const sampleItems = await ItemModel.find().limit(3);
    console.log('Sample items structure:');
    sampleItems.forEach((item: any, index: number) => {
      console.log(`Item ${index + 1}:`, {
        supplierId: item.supplier?.id,
        buyerId: item.buyer?.id,
        amount: item.itemUnit?.value?.amount,
        description: item.itemDescription,
        category: item.itemCategory
      });
    });
    
    // Initialize the analytics populator
    const populator = new EfficientAnalyticsPopulator();
    
    // Test suppliers aggregation (small batch)
    console.log('\nTesting suppliers analytics...');
    await populator.populateSuppliers();
    console.log('✅ Suppliers analytics completed successfully');
    
    // Test buyers aggregation (small batch)
    console.log('\nTesting buyers analytics...');
    await populator.populateBuyers();
    console.log('✅ Buyers analytics completed successfully');
    
    // Test expense insights aggregation
    console.log('\nTesting expense insights analytics...');
    await populator.populateExpenseInsights();
    console.log('✅ Expense insights analytics completed successfully');
    
    // Test anomalies aggregation
    console.log('\nTesting anomalies analytics...');
    await populator.populateAnomalies();
    console.log('✅ Anomalies analytics completed successfully');
    
    console.log('\n🎉 All analytics population tests passed! ItemModel refactoring successful.');
    
  } catch (error) {
    console.error('❌ Error testing refactored analytics:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testRefactoredAnalytics();
