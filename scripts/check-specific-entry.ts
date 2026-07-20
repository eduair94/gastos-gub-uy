import { connectToDatabase } from './shared/connection/database';
import { ReleaseModel } from './shared/models';

async function checkSpecificEntry() {
  try {
    await connectToDatabase();
    
    const entryId = '6894e567fbc85dc56ba8c864';
    console.log('🔍 Checking specific entry:', entryId);
    
    // Check if the entry exists
    const entry = await ReleaseModel.findById(entryId).lean();
    if (!entry) {
      console.log('❌ Entry not found');
      return;
    }
    
    console.log('✅ Entry found');
    console.log('Entry has awards.items.unit.value.amount:', !!(entry.awards?.[0]?.items?.[0]?.unit?.value?.amount));
    console.log('Amount value:', entry.awards?.[0]?.items?.[0]?.unit?.value?.amount);
    console.log('Entry has amount field:', !!entry.amount);
    console.log('Amount version:', (entry.amount as any)?.version);
    
    // Test the exact query conditions
    const AMOUNT_CALCULATION_VERSION = 2;
    const fullQuery = { 
      'awards.items.unit.value.amount': { $exists: true, $ne: null },
      'amount.version': { $ne: AMOUNT_CALCULATION_VERSION } 
    };
    
    console.log('\n🔍 Testing query conditions:');
    
    // Test condition 1: has awards.items.unit.value.amount
    const hasAmount = await ReleaseModel.findOne({
      _id: entryId,
      'awards.items.unit.value.amount': { $exists: true, $ne: null }
    }).lean();
    console.log('Matches amount condition:', !!hasAmount);
    
    // Test condition 2: version check
    const hasWrongVersion = await ReleaseModel.findOne({
      _id: entryId,
      'amount.version': { $ne: AMOUNT_CALCULATION_VERSION }
    }).lean();
    console.log('Matches version condition:', !!hasWrongVersion);
    
    // Test full query
    const matchesFullQuery = await ReleaseModel.findOne({
      _id: entryId,
      ...fullQuery
    }).lean();
    console.log('Matches full query:', !!matchesFullQuery);
    
    // Show current amount field if exists
    if (entry.amount) {
      console.log('\n📊 Current amount field:');
      console.log(JSON.stringify(entry.amount, null, 2));
    } else {
      console.log('\n📊 No amount field exists');
    }

    // Check what the document looks like in terms of the query
    console.log('\n🔬 Detailed analysis:');
    console.log('- Has awards array:', !!entry.awards);
    console.log('- Awards length:', entry.awards?.length || 0);
    if (entry.awards?.[0]) {
      console.log('- First award has items:', !!entry.awards[0].items);
      console.log('- Items length:', entry.awards[0].items?.length || 0);
      if (entry.awards[0].items?.[0]) {
        console.log('- First item has unit:', !!entry.awards[0].items[0].unit);
        console.log('- Unit has value:', !!entry.awards[0].items[0].unit?.value);
        console.log('- Value has amount:', !!entry.awards[0].items[0].unit?.value?.amount);
        console.log('- Amount is not null:', entry.awards[0].items[0].unit?.value?.amount !== null);
        console.log('- Amount value type:', typeof entry.awards[0].items[0].unit?.value?.amount);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSpecificEntry();
