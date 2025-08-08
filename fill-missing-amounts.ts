import { connectToDatabase } from './app/server/utils/database'
import { ReleaseModel } from './shared/models'

// Calculate total amounts function (shared logic)
const calculateTotalAmounts = (awards: any[]) => {
  const amountsByCurrency: Record<string, number> = {}
  let totalItems = 0
  
  if (awards && Array.isArray(awards)) {
    for (const award of awards) {
      if (award.items && Array.isArray(award.items)) {
        for (const item of award.items) {
          totalItems++
          if (item.unit?.value?.amount && typeof item.unit.value.amount === 'number') {
            const currency = item.unit.value.currency || 'UYU' // Default to UYU if no currency
            const quantity = item.quantity || 1
            const itemTotal = item.unit.value.amount * quantity
            
            amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + itemTotal
          }
        }
      }
      
      // Also check if award has a direct value field
      if (award.value?.amount && typeof award.value.amount === 'number') {
        const currency = award.value.currency || 'UYU'
        amountsByCurrency[currency] = (amountsByCurrency[currency] || 0) + award.value.amount
      }
    }
  }
  
  return {
    totalAmounts: amountsByCurrency,
    totalItems,
    currencies: Object.keys(amountsByCurrency),
    hasAmounts: Object.keys(amountsByCurrency).length > 0
  }
}

async function fillMissingAmounts() {
  try {
    console.log('🔌 Connecting to database...')
    await connectToDatabase()
    console.log('✅ Connected to database')

    // Get the total count first
    const totalReleases = await ReleaseModel.countDocuments()
    console.log(`📊 Total releases in database: ${totalReleases}`)

    // Find releases that don't have the amount field
    console.log('🔍 Finding releases without amount field...')
    const releasesWithoutAmountCount = await ReleaseModel.countDocuments({
      $or: [
        { amount: { $exists: false } },
        { amount: null },
        { 'amount.totalAmounts': { $exists: false } }
      ]
    })

    console.log(`📊 Found ${releasesWithoutAmountCount} releases without amount field`)

    if (releasesWithoutAmountCount === 0) {
      console.log('✅ All releases already have amount field')
      return
    }

    const BATCH_SIZE = 1000
    let totalUpdated = 0

    console.log(`🚀 Starting to process ${releasesWithoutAmountCount} releases in batches of ${BATCH_SIZE}...`)

    // Process in a single pass using cursor to avoid reprocessing
    const cursor = ReleaseModel.find({
      $or: [
        { amount: { $exists: false } },
        { amount: null },
        { 'amount.totalAmounts': { $exists: false } }
      ]
    })
      .select('_id awards')
      .lean()
      .cursor()

    let batch: any[] = []
    let processedInBatch = 0

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      try {
        const amountData = calculateTotalAmounts(doc.awards || [])

        const amountField = {
          totalAmounts: amountData.totalAmounts,
          totalItems: amountData.totalItems,
          currencies: amountData.currencies,
          hasAmounts: amountData.hasAmounts,
          primaryAmount: amountData.totalAmounts.UYU || 0,
          primaryCurrency: 'UYU'
        }

        batch.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { amount: amountField } }
          }
        })

        processedInBatch++

        // Execute batch when it's full
        if (batch.length >= BATCH_SIZE) {
          console.log(`📦 Executing batch of ${batch.length} updates...`)
          const result = await ReleaseModel.bulkWrite(batch, { ordered: false })
          const updated = result.modifiedCount || 0
          totalUpdated += updated
          
          console.log(`   ✅ Updated ${updated} releases`)
          console.log(`📈 Progress: ${totalUpdated}/${releasesWithoutAmountCount} (${Math.round(totalUpdated / releasesWithoutAmountCount * 100)}%)`)
          
          // Show sample calculation
          if (batch.length > 0) {
            const sampleDoc = await ReleaseModel.findById(batch[0].updateOne.filter._id).select('amount').lean()
            if (sampleDoc?.amount) {
              console.log(`   💰 Sample: ${JSON.stringify(sampleDoc.amount.totalAmounts)} (${sampleDoc.amount.totalItems} items)`)
            }
          }
          
          batch = []
        }
      } catch (error) {
        console.error(`❌ Error processing release ${doc._id}:`, error)
      }
    }

    // Execute remaining batch
    if (batch.length > 0) {
      console.log(`📦 Executing final batch of ${batch.length} updates...`)
      const result = await ReleaseModel.bulkWrite(batch, { ordered: false })
      const updated = result.modifiedCount || 0
      totalUpdated += updated
      console.log(`   ✅ Updated ${updated} releases`)
    }

    console.log(`\n🎉 Migration complete!`)
    console.log(`✅ Total updated: ${totalUpdated} releases`)

    // Final verification
    console.log('\n🔍 Final verification...')
    const remainingWithoutAmount = await ReleaseModel.countDocuments({
      $or: [
        { amount: { $exists: false } },
        { amount: null },
        { 'amount.totalAmounts': { $exists: false } }
      ]
    })
    
    console.log(`📊 Releases still without amount field: ${remainingWithoutAmount}`)
    
    const releasesWithAmounts = await ReleaseModel.countDocuments({ 'amount.hasAmounts': true })
    const releasesWithUYU = await ReleaseModel.countDocuments({ 'amount.totalAmounts.UYU': { $gt: 0 } })
    const releasesWithUSD = await ReleaseModel.countDocuments({ 'amount.totalAmounts.USD': { $gt: 0 } })
    
    console.log(`\n📈 Final statistics:`)
    console.log(`   Total releases: ${totalReleases}`)
    console.log(`   Releases with calculated amounts: ${releasesWithAmounts}`)
    console.log(`   Releases with UYU amounts: ${releasesWithUYU}`)
    console.log(`   Releases with USD amounts: ${releasesWithUSD}`)

  } catch (error) {
    console.error('❌ Error in migration script:', error)
    process.exit(1)
  }
}

// Run the script
fillMissingAmounts()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
