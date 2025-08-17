import { connectToDatabase } from '../../app/server/utils/database'
import { ReleaseModel } from '../../shared/models'

async function testSupplierIds() {
  try {
    await connectToDatabase()
    
    // Find a few releases with suppliers to check their ID format
    const samples = await ReleaseModel.find({
      'awards.suppliers': { $exists: true, $ne: [] }
    })
      .select('awards.suppliers')
      .limit(5)
      .lean()

    console.log('Sample supplier IDs from releases:')
    samples.forEach((release, releaseIndex) => {
      console.log(`\nRelease ${releaseIndex + 1}:`)
      release.awards?.forEach((award, awardIndex) => {
        console.log(`  Award ${awardIndex + 1}:`)
        award.suppliers?.forEach((supplier, supplierIndex) => {
          console.log(`    Supplier ${supplierIndex + 1}: ID="${supplier.id}", Name="${supplier.name}"`)
        })
      })
    })

  } catch (error) {
    console.error('Error testing supplier IDs:', error)
  }
}

testSupplierIds()
