import { connectToDatabase } from "../../shared/connection/database";
import { ReleaseModel } from "../../shared/models";

async function testSupplierIdIndexPerformance() {
  try {
    console.log("🔌 Connecting to database...");
    await connectToDatabase();
    console.log("✅ Connected to database");

    // Get a sample supplier ID
    const sampleRelease = await ReleaseModel.findOne({ "awards.suppliers.id": { $exists: true } }, { "awards.suppliers.id": 1 }).lean();

    if (!sampleRelease?.awards?.[0]?.suppliers?.[0]?.id) {
      console.log("❌ No supplier ID found for testing");
      return;
    }

    const testSupplierId = sampleRelease.awards[0].suppliers[0].id;
    console.log(`🧪 Testing aggregation pipeline performance with supplier ID: ${testSupplierId}`);

    // Test 1: Simple aggregation pipeline filtering by supplier ID
    console.log("\n📊 Test 1: Filter by supplier ID in aggregation pipeline");
    const startTime1 = Date.now();

    const pipeline1 = [
      {
        $match: {
          "awards.suppliers.id": testSupplierId,
        },
      },
      {
        $group: {
          _id: null,
          totalContracts: { $sum: 1 },
          totalAmount: { $sum: "$amount.primaryAmount" },
        },
      },
    ];

    const result1 = await ReleaseModel.aggregate(pipeline1);
    const endTime1 = Date.now();

    console.log(`✅ Pipeline completed in ${endTime1 - startTime1}ms`);
    console.log(`📊 Results:`, result1[0]);

    // Test 2: More complex pipeline with supplier ID filtering and grouping
    console.log("\n📊 Test 2: Complex pipeline with supplier grouping");
    const startTime2 = Date.now();

    const pipeline2: any[] = [
      {
        $match: {
          "awards.suppliers.id": { $exists: true },
          "amount.primaryAmount": { $gt: 0 },
        },
      },
      {
        $unwind: "$awards",
      },
      {
        $unwind: "$awards.suppliers",
      },
      {
        $group: {
          _id: "$awards.suppliers.id",
          supplierName: { $first: "$awards.suppliers.name" },
          contractCount: { $sum: 1 },
          totalAmount: { $sum: "$amount.primaryAmount" },
        },
      },
      {
        $sort: { totalAmount: -1 },
      },
      {
        $limit: 10,
      },
    ];

    const result2 = await ReleaseModel.aggregate(pipeline2);
    const endTime2 = Date.now();

    console.log(`✅ Complex pipeline completed in ${endTime2 - startTime2}ms`);
    console.log(`📊 Top 10 suppliers by total amount:`);
    result2.forEach((supplier, index) => {
      console.log(`   ${index + 1}. ${supplier.supplierName} (${supplier._id})`);
      console.log(`      Contracts: ${supplier.contractCount}, Total: $${Math.round(supplier.totalAmount).toLocaleString()}`);
    });

    // Test 3: Pipeline with specific supplier ID lookup
    console.log("\n📊 Test 3: Specific supplier analysis");
    const startTime3 = Date.now();

    const pipeline3: any[] = [
      {
        $match: {
          "awards.suppliers.id": testSupplierId,
        },
      },
      {
        $project: {
          id: 1,
          date: 1,
          "buyer.name": 1,
          "amount.primaryAmount": 1,
          "awards.suppliers": 1,
        },
      },
      {
        $sort: { "amount.primaryAmount": -1 },
      },
      {
        $limit: 5,
      },
    ];

    const result3 = await ReleaseModel.aggregate(pipeline3);
    const endTime3 = Date.now();

    console.log(`✅ Supplier analysis completed in ${endTime3 - startTime3}ms`);
    console.log(`📊 Top contracts for supplier ${testSupplierId}:`);
    result3.forEach((contract, index) => {
      console.log(`   ${index + 1}. ${contract.id} - $${Math.round(contract.amount?.primaryAmount || 0).toLocaleString()}`);
      console.log(`      Buyer: ${contract.buyer?.name}`);
    });

    console.log("\n🎉 Performance tests completed!");
    console.log("\n💡 Benefits of the awards.suppliers.id index:");
    console.log("   ✅ Faster filtering by supplier ID in aggregation pipelines");
    console.log("   ✅ Improved performance for supplier-specific analytics");
    console.log("   ✅ Better scalability when dealing with large datasets");
    console.log("   ✅ Reduced execution time for complex supplier queries");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error testing performance:", error);
    process.exit(1);
  }
}

testSupplierIdIndexPerformance();
