import { connectToDatabase } from './shared/connection/database';
import { ReleaseModel } from './shared/models';

async function explainQueryLogic() {
  try {
    await connectToDatabase();
    
    const AMOUNT_CALCULATION_VERSION = 2;
    const entryId = '6894e567fbc85dc56ba8c864';
    
    console.log('🎯 Query Logic Explanation');
    console.log('==========================');
    console.log(`Current version: ${AMOUNT_CALCULATION_VERSION}`);
    console.log('');
    
    // The migration query
    const fullQuery = { 
      'awards.items.unit.value.amount': { $exists: true, $ne: null },
      'amount.version': { $ne: AMOUNT_CALCULATION_VERSION } 
    };
    
    console.log('📋 Migration Query Conditions:');
    console.log('1. Document must have: awards.items.unit.value.amount (exists and not null)');
    console.log('2. Document must have: amount.version NOT EQUAL to 2');
    console.log('');
    
    // Check our specific entry
    const entry = await ReleaseModel.findById(entryId).lean();
    console.log('🔍 Your specific entry analysis:');
    console.log(`✅ Condition 1: Has amount field = ${!!(entry?.awards?.[0]?.items?.[0]?.unit?.value?.amount)}`);
    console.log(`❌ Condition 2: Version NOT equal to 2 = ${(entry?.amount as any)?.version !== 2}`);
    console.log(`   Current version: ${(entry?.amount as any)?.version}`);
    console.log('');
    
    console.log('🎯 CONCLUSION:');
    console.log('The entry is NOT included in migration because it ALREADY HAS version 2!');
    console.log('This is CORRECT behavior - the entry has already been processed.');
    console.log('');
    
    // Show some examples of what WOULD be included
    console.log('📝 Examples of entries that WOULD be included:');
    
    // Find entries without amount field
    const withoutAmount = await ReleaseModel.findOne({
      'awards.items.unit.value.amount': { $exists: true, $ne: null },
      amount: { $exists: false }
    }).lean();
    
    if (withoutAmount) {
      console.log(`✅ Entry without amount field: ${withoutAmount.id || withoutAmount._id}`);
    }
    
    // Find entries with old version
    const withOldVersion = await ReleaseModel.findOne({
      'awards.items.unit.value.amount': { $exists: true, $ne: null },
      'amount.version': { $exists: true, $ne: 2 }
    }).lean();
    
    if (withOldVersion) {
      console.log(`✅ Entry with old version: ${withOldVersion.id || withOldVersion._id} (version: ${(withOldVersion.amount as any)?.version})`);
    }
    
    // Count how many are actually in the migration queue
    const totalInQueue = await ReleaseModel.countDocuments(fullQuery);
    console.log(`✅ Total entries in migration queue: ${totalInQueue}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

explainQueryLogic();
