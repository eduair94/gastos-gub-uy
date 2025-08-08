import { connectToDatabase } from './app/server/utils/database'
import { SupplierPatternModel } from './shared/models'

async function testSupplierPatterns() {
  try {
    await connectToDatabase()
    
    const count = await SupplierPatternModel.countDocuments()
    console.log(`Found ${count} supplier patterns in database`)
    
    if (count > 0) {
      const sample = await SupplierPatternModel.findOne().lean()
      console.log('Sample supplier pattern:', {
        id: sample?.supplierId,
        name: sample?.name,
        totalValue: sample?.totalValue,
        totalContracts: sample?.totalContracts,
      })
    }
  } catch (error) {
    console.error('Error testing supplier patterns:', error)
  }
}

testSupplierPatterns()
