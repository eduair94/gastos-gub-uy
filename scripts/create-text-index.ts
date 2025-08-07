#!/usr/bin/env node

/**
 * Script to create the comprehensive text search index for the Release collection
 * This script can be run independently to ensure the text index is properly created
 */

import { connectToDatabase, mongoose } from '../shared/connection/database'
import { ReleaseModel } from '../shared/models/release'

async function createTextIndex(): Promise<void> {
  console.log('🚀 Starting text index creation...')
  
  try {
    // Connect to database
    console.log('📡 Connecting to database...')
    await connectToDatabase()
    
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection not ready')
    }
    
    console.log('✅ Database connected successfully')
    
    // Check if text index already exists
    console.log('🔍 Checking existing indexes...')
    const existingIndexes = await ReleaseModel.collection.getIndexes()
    
    // Look for existing text index
    const hasTextIndex = Object.keys(existingIndexes).some(indexName => 
      indexName.includes('text') || indexName === 'comprehensive_text_search'
    )
    
    if (hasTextIndex) {
      console.log('⚠️  Text index already exists. Dropping existing text index...')
      
      // Drop existing text indexes
      try {
        await ReleaseModel.collection.dropIndex('comprehensive_text_search')
        console.log('🗑️  Dropped existing text index')
      } catch (error) {
        // Try to drop any text index
        for (const indexName of Object.keys(existingIndexes)) {
          if (indexName.includes('text')) {
            try {
              await ReleaseModel.collection.dropIndex(indexName)
              console.log(`🗑️  Dropped existing text index: ${indexName}`)
            } catch (e) {
              console.log(`⚠️  Could not drop index ${indexName}:`, e)
            }
          }
        }
      }
    }
    
    // Create the comprehensive text search index
    console.log('🔨 Creating comprehensive text search index...')
    
    const textIndexDefinition: Record<string, 'text'> = {
      // High priority: Main descriptions and titles
      "tender.title": "text",
      "tender.description": "text", 
      "awards.title": "text",
      
      // Medium-high priority: Item descriptions
      "tender.items.description": "text",
      "awards.items.description": "text", 
      
      // Medium priority: Classifications
      "tender.items.classification.description": "text",
      "awards.items.classification.description": "text",
      
      // Lower priority: Entity names
      "buyer.name": "text",
      "tender.procuringEntity.name": "text",
      "awards.suppliers.name": "text",
      "parties.name": "text",
      
      // Lowest priority: OCID for exact matches
      "ocid": "text"
    }
    
    const indexOptions = {
      weights: {
        // High priority: Main descriptions and titles
        "tender.title": 10,
        "tender.description": 10,
        "awards.title": 10,
        
        // Medium-high priority: Item descriptions
        "tender.items.description": 8,
        "awards.items.description": 8,
        
        // Medium priority: Classifications
        "tender.items.classification.description": 6,
        "awards.items.classification.description": 6,
        
        // Lower priority: Entity names
        "buyer.name": 4,
        "tender.procuringEntity.name": 4,
        "awards.suppliers.name": 4,
        "parties.name": 4,
        
        // Lowest priority: OCID
        "ocid": 2
      },
      name: "comprehensive_text_search",
      background: true, // Create index in background to avoid blocking
      sparse: true, // Only index documents that have at least one of these fields
    }
    
    await ReleaseModel.collection.createIndex(textIndexDefinition, indexOptions)
    
    console.log('✅ Text search index created successfully!')
    
    // Verify the index was created
    console.log('🔍 Verifying index creation...')
    const updatedIndexes = await ReleaseModel.collection.getIndexes()
    
    if (updatedIndexes.comprehensive_text_search) {
      console.log('✅ Index verification successful!')
      console.log('📋 Index details:')
      console.log('   - Name: comprehensive_text_search')
      console.log('   - Fields:', Object.keys(textIndexDefinition).length)
      console.log('   - Weighted: Yes')
      console.log('   - Language: spanish (default)')
    } else {
      console.log('❌ Index verification failed - index not found')
    }
    
    // Show index statistics
    console.log('\n📊 Index Statistics:')
    try {
      const docCount = await ReleaseModel.countDocuments()
      const indexInfo = await ReleaseModel.collection.indexInformation()
      
      console.log(`   - Total documents: ${docCount.toLocaleString()}`)
      console.log(`   - Total indexes: ${Object.keys(indexInfo).length}`)
      console.log('   - Indexes:', Object.keys(indexInfo).join(', '))
    } catch (statsError) {
      console.log('   - Could not retrieve statistics:', statsError)
    }
    
  } catch (error) {
    console.error('❌ Error creating text index:', error)
    throw error
  } finally {
    // Close database connection
    console.log('🔌 Closing database connection...')
    await mongoose.connection.close()
    console.log('✅ Database connection closed')
  }
}

async function main(): Promise<void> {
  try {
    await createTextIndex()
    console.log('\n🎉 Text index creation completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('\n💥 Text index creation failed:', error)
    process.exit(1)
  }
}

// Run the script if called directly
if (require.main === module) {
  main()
}

export { createTextIndex }
