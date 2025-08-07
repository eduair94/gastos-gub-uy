#!/usr/bin/env tsx

import { connectToDatabase } from '../app/server/utils/database'
import { ReleaseModel } from '../app/server/utils/models'

/**
 * Create search indexes for optimized contract search
 * This script creates text indexes and compound indexes for fast searching
 */
async function createSearchIndexes() {
  try {
    console.log('🔗 Connecting to database...')
    await connectToDatabase()

    console.log('📊 Creating text search indexes...')
    
    // Create comprehensive text index for search across multiple fields
    try {
      await ReleaseModel.collection.createIndex(
        {
          'tender.title': 'text',
          'tender.description': 'text',
          'buyer.name': 'text',
          'tender.procuringEntity.name': 'text',
          'awards.suppliers.name': 'text',
          'tender.items.description': 'text',
          'tender.items.classification.description': 'text',
          'awards.items.description': 'text',
          'awards.items.classification.description': 'text',
          ocid: 'text',
        },
        {
          name: 'contract_search_text_index',
          weights: {
            'tender.title': 10,
            'buyer.name': 8,
            'awards.suppliers.name': 8,
            'tender.procuringEntity.name': 8,
            'tender.description': 6,
            'tender.items.description': 4,
            'tender.items.classification.description': 4,
            'awards.items.description': 4,
            'awards.items.classification.description': 4,
            ocid: 6,
          },
          default_language: 'spanish',
          language_override: 'language',
        }
      )
      console.log('✅ Text search index created')
    } catch (error) {
      if (error.code === 85) { // IndexOptionsConflict
        console.log('⚠️ Text search index already exists, skipping...')
      } else {
        throw error
      }
    }

    // Create compound indexes for common filter combinations
    console.log('📊 Creating compound indexes for filtering...')

    const indexesToCreate = [
      {
        index: { date: -1, sourceYear: -1 },
        options: { name: 'date_year_index' }
      },
      {
        index: { 'tender.status': 1, 'tender.procurementMethod': 1 },
        options: { name: 'status_procurement_index' }
      },
      {
        index: { 'awards.items.unit.value.amount': -1 },
        options: { name: 'amount_index' }
      },
      {
        index: { 'buyer.name': 1 },
        options: { name: 'buyer_name_index' }
      },
      {
        index: { 'awards.suppliers.name': 1 },
        options: { name: 'supplier_name_index' }
      },
      {
        index: { 'tender.items.classification.description': 1 },
        options: { name: 'tender_categories_index' }
      },
      {
        index: { 'awards.items.classification.description': 1 },
        options: { name: 'award_categories_index' }
      },
      {
        index: { ocid: 1 },
        options: { name: 'ocid_index', unique: true }
      },
      {
        index: { sourceYear: -1 },
        options: { name: 'source_year_index' }
      }
    ]

    for (const { index, options } of indexesToCreate) {
      try {
        await ReleaseModel.collection.createIndex(index, options)
        console.log(`✅ Index ${options.name} created`)
      } catch (error) {
        if (error.code === 85 || error.code === 86) { // IndexOptionsConflict or IndexKeySpecsConflict
          console.log(`⚠️ Index ${options.name} already exists, skipping...`)
        } else {
          console.warn(`⚠️ Warning creating index ${options.name}:`, error.message)
        }
      }
    }

    console.log('✅ All compound indexes processed')

    // List all indexes
    console.log('📋 Current indexes:')
    const indexes = await ReleaseModel.collection.listIndexes().toArray()
    indexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`)
    })

    console.log('🎉 Search indexes creation completed successfully!')

  } catch (error) {
    console.error('❌ Error creating search indexes:', error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// Run if called directly
if (require.main === module) {
  createSearchIndexes()
}

export { createSearchIndexes }
