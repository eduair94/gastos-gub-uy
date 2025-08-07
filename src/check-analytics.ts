import { MongoClient } from 'mongodb';

async function checkAnalytics() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db('argentina_transparency');
    
    const supplierCount = await db.collection('supplierpatterns').countDocuments();
    const buyerCount = await db.collection('buyerpatterns').countDocuments();
    const expenseCount = await db.collection('expenseinsights').countDocuments();
    const anomalyCount = await db.collection('anomalies').countDocuments();
    
    console.log('\n📊 Analytics Collection Status:');
    console.log(`  • SupplierPatterns: ${supplierCount.toLocaleString()}`);
    console.log(`  • BuyerPatterns: ${buyerCount.toLocaleString()}`);
    console.log(`  • ExpenseInsights: ${expenseCount.toLocaleString()}`);
    console.log(`  • Anomalies: ${anomalyCount.toLocaleString()}`);
    
    if (supplierCount > 0) {
      const topSupplier = await db.collection('supplierpatterns')
        .findOne({}, { sort: { totalAmount: -1 } });
      console.log(`\n🔝 Top Supplier: ${topSupplier?.name || 'N/A'} (${(topSupplier?.totalAmount || 0).toLocaleString()} UYU)`);
    }
    
    if (buyerCount > 0) {
      const topBuyer = await db.collection('buyerpatterns')
        .findOne({}, { sort: { totalAmount: -1 } });
      console.log(`🔝 Top Buyer: ${topBuyer?.name || 'N/A'} (${(topBuyer?.totalAmount || 0).toLocaleString()} UYU)`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkAnalytics();
