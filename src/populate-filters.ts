#!/usr/bin/env tsx

import { connectToDatabase } from '../app/server/utils/database'
import { FilterDataModel, ReleaseModel } from '../shared/models'

/**
 * Generate and populate filter data collection for fast filter option retrieval
 * This creates pre-computed filter options to avoid expensive aggregation queries
 */
async function populateFilterData() {
  try {
    // These facets group over ~2.2M releases and outlast the shared 45s idle-socket default,
    // which is tuned for the web app. Must be set before the first connect.
    if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
      process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000)
    }

    console.log('🔗 Connecting to database...')
    await connectToDatabase()

    console.log('📊 Generating filter data...')

    // Get total release count for metadata
    const totalReleases = await ReleaseModel.countDocuments()
    console.log(`📝 Processing ${totalReleases} releases`)

    // Generate Years filter data
    console.log('📅 Generating years filter...')
    const yearsAgg = await ReleaseModel.aggregate([
      {
        $group: {
          _id: '$sourceYear',
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          _id: { $nin: [null, ''] },
        },
      },
      {
        $sort: { _id: -1 },
      },
    ])

    const yearsData = yearsAgg.map(item => ({
      value: item._id,
      label: item._id.toString(),
      count: item.count,
    }))

    await FilterDataModel.findOneAndUpdate(
      { type: 'years' },
      {
        type: 'years',
        data: yearsData,
        lastUpdated: new Date(),
        generatedFromReleases: totalReleases,
      },
      { upsert: true },
    )
    console.log(`✅ Years: ${yearsData.length} options`)

    // Generate Status filter data
    console.log('📋 Generating statuses filter...')
    const statusesAgg = await ReleaseModel.aggregate([
      {
        $group: {
          _id: '$tender.status',
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          _id: { $nin: [null, ''] },
        },
      },
      {
        $sort: { count: -1 },
      },
    ])

    const statusesData = statusesAgg.map(item => ({
      value: item._id,
      label: item._id.charAt(0).toUpperCase() + item._id.slice(1),
      count: item.count,
    }))

    await FilterDataModel.findOneAndUpdate(
      { type: 'statuses' },
      {
        type: 'statuses',
        data: statusesData,
        lastUpdated: new Date(),
        generatedFromReleases: totalReleases,
      },
      { upsert: true },
    )
    console.log(`✅ Statuses: ${statusesData.length} options`)

    // Generate Procurement Methods filter data
    console.log('🛒 Generating procurement methods filter...')
    const procurementMethodsAgg = await ReleaseModel.aggregate([
      {
        $group: {
          _id: '$tender.procurementMethod',
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          _id: { $nin: [null, ''] },
        },
      },
      {
        $sort: { count: -1 },
      },
    ])

    const procurementMethodsData = procurementMethodsAgg.map(item => ({
      value: item._id,
      label: item._id.charAt(0).toUpperCase() + item._id.slice(1),
      count: item.count,
    }))

    await FilterDataModel.findOneAndUpdate(
      { type: 'procurementMethods' },
      {
        type: 'procurementMethods',
        data: procurementMethodsData,
        lastUpdated: new Date(),
        generatedFromReleases: totalReleases,
      },
      { upsert: true },
    )
    console.log(`✅ Procurement Methods: ${procurementMethodsData.length} options`)

    // Generate Suppliers filter data (top 1000 by contract count)
    console.log('🏢 Generating suppliers filter...')
    const suppliersAgg = await ReleaseModel.aggregate([
      { $unwind: '$awards' },
      { $unwind: '$awards.suppliers' },
      {
        $group: {
          _id: '$awards.suppliers.name',
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          _id: { $nin: [null, ''] },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 1000, // Limit to top 1000 suppliers for performance
      },
    ])

    const suppliersData = suppliersAgg.map(item => ({
      value: item._id,
      label: item._id,
      count: item.count,
    }))

    await FilterDataModel.findOneAndUpdate(
      { type: 'suppliers' },
      {
        type: 'suppliers',
        data: suppliersData,
        lastUpdated: new Date(),
        generatedFromReleases: totalReleases,
      },
      { upsert: true },
    )
    console.log(`✅ Suppliers: ${suppliersData.length} options`)

    // Generate Buyers filter data
    console.log('🏛️ Generating buyers filter...')
    const buyersAgg = await ReleaseModel.aggregate([
      {
        $group: {
          _id: '$buyer.name',
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          _id: { $nin: [null, ''] },
        },
      },
      {
        $sort: { count: -1 },
      },
    ])

    const buyersData = buyersAgg.map(item => ({
      value: item._id,
      label: item._id,
      count: item.count,
    }))

    await FilterDataModel.findOneAndUpdate(
      { type: 'buyers' },
      {
        type: 'buyers',
        data: buyersData,
        lastUpdated: new Date(),
        generatedFromReleases: totalReleases,
      },
      { upsert: true },
    )
    console.log(`✅ Buyers: ${buyersData.length} options`)

    // Skip categories generation due to too many options
    console.log('📂 Skipping categories filter (too many options)...')

    // Summary
    console.log('📊 Filter data generation summary:')
    const filterDataStats = await FilterDataModel.find().select('type data lastUpdated generatedFromReleases')
    filterDataStats.forEach(filterData => {
      console.log(`  - ${filterData.type}: ${filterData.data.length} options (from ${filterData.generatedFromReleases} releases)`)
    })

    console.log('🎉 Filter data population completed successfully!')

  } catch (error) {
    console.error('❌ Error populating filter data:', error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// Run if called directly
if (require.main === module) {
  populateFilterData()
}

export { populateFilterData }
