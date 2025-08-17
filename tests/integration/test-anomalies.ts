#!/usr/bin/env tsx

import { connectToDatabase } from '../../shared/connection/database'
import { AnomalyModel } from '../../shared/models/anomaly'

async function testAnomalies() {
  console.log('🔗 Connecting to database...')
  await connectToDatabase()

  console.log('📊 Checking existing anomalies...')
  
  const totalCount = await AnomalyModel.countDocuments()
  console.log(`Total anomalies: ${totalCount}`)
  
  if (totalCount === 0) {
    console.log('❌ No anomalies found in database')
    return
  }

  // Get sample anomalies
  const sampleAnomalies = await AnomalyModel.find({})
    .limit(5)
    .lean()

  console.log('\n📋 Sample anomalies:')
  sampleAnomalies.forEach((anomaly, index) => {
    console.log(`${index + 1}. ${anomaly.type} (${anomaly.severity})`)
    console.log(`   Description: ${anomaly.description}`)
    console.log(`   Detected Value: ${anomaly.detectedValue}`)
    console.log(`   Confidence: ${(anomaly.confidence * 100).toFixed(1)}%`)
    if (anomaly.metadata?.supplierName) {
      console.log(`   Supplier: ${anomaly.metadata.supplierName}`)
    }
    if (anomaly.metadata?.buyerName) {
      console.log(`   Buyer: ${anomaly.metadata.buyerName}`)
    }
    console.log('')
  })

  // Get statistics
  const severityStats = await AnomalyModel.aggregate([
    {
      $group: {
        _id: '$severity',
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ])

  console.log('📈 Severity distribution:')
  severityStats.forEach(stat => {
    console.log(`   ${stat._id}: ${stat.count}`)
  })

  const typeStats = await AnomalyModel.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        avgConfidence: { $avg: '$confidence' },
      },
    },
    {
      $sort: { count: -1 },
    },
  ])

  console.log('\n🏷️  Type distribution:')
  typeStats.forEach(stat => {
    console.log(`   ${stat._id}: ${stat.count} (avg confidence: ${(stat.avgConfidence * 100).toFixed(1)}%)`)
  })

  // Recent anomalies
  const recent = await AnomalyModel.find({})
    .sort({ createdAt: -1 })
    .limit(3)
    .lean()

  console.log('\n🕒 Most recent anomalies:')
  recent.forEach((anomaly, index) => {
    const date = new Date(anomaly.createdAt).toLocaleDateString()
    console.log(`   ${index + 1}. ${anomaly.type} - ${date}`)
  })

  console.log('\n✅ Anomaly data looks good!')
}

if (require.main === module) {
  testAnomalies()
    .then(() => {
      console.log('🎉 Test completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error:', error)
      process.exit(1)
    })
}
