#!/usr/bin/env tsx

import { connectToDatabase } from './app/server/utils/database'
import {
  CategoryDistributionModel,
  DashboardMetricsModel,
  SpendingTrendsModel,
  TopEntitiesModel
} from './app/server/utils/precalculated-models'

async function verifyData() {
  try {
    console.log('🔍 Connecting to database...')
    await connectToDatabase()
    
    console.log('📊 Checking precalculated data...')
    
    const [metrics, trends, entities, categories] = await Promise.all([
      DashboardMetricsModel.countDocuments(),
      SpendingTrendsModel.countDocuments(),
      TopEntitiesModel.countDocuments(),
      CategoryDistributionModel.countDocuments()
    ])
    
    console.log('✅ Data verification:')
    console.log(`   - Dashboard metrics: ${metrics} records`)
    console.log(`   - Spending trends: ${trends} records`)
    console.log(`   - Top entities: ${entities} records`)
    console.log(`   - Category distribution: ${categories} records`)
    
    // Get latest data version
    const latestMetrics = await DashboardMetricsModel.findOne().sort({ calculatedAt: -1 }).lean()
    if (latestMetrics) {
      console.log(`\n📋 Latest data version: ${(latestMetrics as any).dataVersion}`)
      console.log(`📅 Calculated at: ${(latestMetrics as any).calculatedAt}`)
      console.log(`💰 Total spending: $${((latestMetrics as any).totalSpending / 1000000).toFixed(1)}M`)
      console.log(`📄 Total contracts: ${(latestMetrics as any).totalContracts.toLocaleString()}`)
    }
    
    // Check some sample entities
    const topSuppliers = await TopEntitiesModel.find({ entityType: 'supplier' }).sort({ rank: 1 }).limit(3).lean()
    const topBuyers = await TopEntitiesModel.find({ entityType: 'buyer' }).sort({ rank: 1 }).limit(3).lean()
    
    console.log('\n🏆 Top 3 suppliers:')
    topSuppliers.forEach((supplier, i) => {
      console.log(`   ${i + 1}. ${(supplier as any).name} - $${((supplier as any).totalAmount / 1000000).toFixed(1)}M`)
    })
    
    console.log('\n🏛️ Top 3 buyers:')
    topBuyers.forEach((buyer, i) => {
      console.log(`   ${i + 1}. ${(buyer as any).name} - $${((buyer as any).totalAmount / 1000000).toFixed(1)}M`)
    })
    
    // Check categories
    const topCategories = await CategoryDistributionModel.find().sort({ rank: 1 }).limit(5).lean()
    console.log('\n🏷️ Top 5 categories:')
    topCategories.forEach((category, i) => {
      console.log(`   ${i + 1}. ${(category as any).category} - ${((category as any).percentage).toFixed(1)}%`)
    })
    
    console.log('\n✅ Data verification completed successfully!')
    
  } catch (error) {
    console.error('❌ Error verifying data:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  verifyData()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Verification failed:', error)
      process.exit(1)
    })
}
