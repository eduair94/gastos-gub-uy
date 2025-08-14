import { connectToDatabase } from '../shared/connection/database';
import { ReleaseModel } from '../shared/models';

async function createSupplierIdIndex() {
  try {
    console.log('🔌 Connecting to database...');
    await connectToDatabase();
    console.log('✅ Connected to database');

    console.log('📋 Creating index for awards.suppliers.id...');
    
    // Create the index
    const result = await ReleaseModel.collection.createIndex(
      { "awards.suppliers.id": 1 },
      { 
        name: "awards_suppliers_id_1",
        background: true // Create in background to avoid blocking other operations
      }
    );

    console.log('✅ Index created successfully:', result);

    // Verify the index was created
    console.log('🔍 Verifying index creation...');
    const indexes = await ReleaseModel.collection.indexes();
    const supplierIdIndex = indexes.find(idx => idx.name === 'awards_suppliers_id_1');
    
    if (supplierIdIndex) {
      console.log('✅ Index verified:', supplierIdIndex.name);
      console.log('📊 Index details:', {
        name: supplierIdIndex.name,
        key: supplierIdIndex.key,
        background: supplierIdIndex.background
      });
    } else {
      console.log('❌ Index not found in verification');
    }

    // Show all current indexes for reference
    console.log('\n📋 All current indexes:');
    indexes.forEach((idx, i) => {
      console.log(`${i + 1}. ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Test the index performance
    console.log('\n🧪 Testing index performance...');
    
    // Get a sample supplier ID to test with
    const sampleRelease = await ReleaseModel.findOne(
      { "awards.suppliers.id": { $exists: true } },
      { "awards.suppliers.id": 1 }
    ).lean();

    if (sampleRelease?.awards?.[0]?.suppliers?.[0]?.id) {
      const testSupplierId = sampleRelease.awards[0].suppliers[0].id;
      console.log(`🔍 Testing with supplier ID: ${testSupplierId}`);

      // Test query performance
      const startTime = Date.now();
      const count = await ReleaseModel.countDocuments({
        "awards.suppliers.id": testSupplierId
      });
      const endTime = Date.now();

      console.log(`✅ Query completed in ${endTime - startTime}ms`);
      console.log(`📊 Found ${count} releases for supplier ID: ${testSupplierId}`);

      // Show explain plan to verify index usage
      const explainResult = await ReleaseModel.collection
        .find({ "awards.suppliers.id": testSupplierId })
        .explain('executionStats');

      console.log('\n📈 Query execution stats:');
      console.log(`- Index used: ${explainResult.executionStats.executionSuccess}`);
      console.log(`- Execution time: ${explainResult.executionStats.executionTimeMillis}ms`);
      console.log(`- Documents examined: ${explainResult.executionStats.totalDocsExamined}`);
      console.log(`- Documents returned: ${explainResult.executionStats.totalDocsReturned}`);
      
      if (explainResult.executionStats.executionStages?.indexName) {
        console.log(`✅ Index used: ${explainResult.executionStats.executionStages.indexName}`);
      }
    } else {
      console.log('⚠️  No sample supplier ID found for testing');
    }

    console.log('\n🎉 Index creation completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating index:', error);
    process.exit(1);
  }
}

createSupplierIdIndex();
