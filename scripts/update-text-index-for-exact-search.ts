#!/usr/bin/env tsx

/**
 * Script to update MongoDB text index for exact substring matching
 * This script will drop the existing text index and recreate it with 
 * language set to 'none' to disable stemming and enable exact phrase matching
 */

import { connectToDatabase, mongoose } from '../shared/connection/database'
import { ReleaseModel } from '../shared/models/release'

interface IndexInfo {
  v?: number
  key: Record<string, any>
  name: string
  weights?: Record<string, number>
  default_language?: string
  language_override?: string
  textIndexVersion?: number
}

async function updateTextIndexForExactSearch() {
  console.log('🔄 Starting text index update for exact substring matching...')

  try {
    // Connect to database
    await connectToDatabase()
    console.log('✅ Connected to database')

    const collection = ReleaseModel.collection

    // Get current indexes
    console.log('📋 Checking current indexes...')
    const indexes = await collection.listIndexes().toArray() as IndexInfo[]
    
    // Find text index
    const textIndex = indexes.find(index => 
      index.name === 'comprehensive_text_search' || 
      Object.values(index.key || {}).includes('text')
    )

    if (textIndex) {
      console.log('📍 Found existing text index:', textIndex.name)
      console.log('   Current language setting:', textIndex.default_language || 'spanish')
      
      // Drop existing text index
      console.log('🗑️  Dropping existing text index...')
      await collection.dropIndex(textIndex.name)
      console.log('✅ Text index dropped successfully')
    } else {
      console.log('ℹ️  No existing text index found')
    }

    // Create new text index with exact matching configuration
    console.log('🔨 Creating new text index for exact substring matching...')
    
    const indexDefinition: Record<string, 'text'> = {
      // High priority: Main descriptions and titles
      'tender.title': 'text',
      'tender.description': 'text', 
      'awards.title': 'text',
      
      // Medium-high priority: Item descriptions
      'tender.items.description': 'text',
      'awards.items.description': 'text', 
      
      // Medium priority: Classifications
      'tender.items.classification.description': 'text',
      'awards.items.classification.description': 'text',
      
      // Lower priority: Entity names
      'buyer.name': 'text',
      'tender.procuringEntity.name': 'text',
      'awards.suppliers.name': 'text',
      'parties.name': 'text',
      
      // Lowest priority: OCID for exact matches
      'ocid': 'text'
    }

    const indexOptions = {
      weights: {
        // High priority: Main descriptions and titles
        'tender.title': 10,
        'tender.description': 10,
        'awards.title': 10,
        
        // Medium-high priority: Item descriptions
        'tender.items.description': 8,
        'awards.items.description': 8,
        
        // Medium priority: Classifications
        'tender.items.classification.description': 6,
        'awards.items.classification.description': 6,
        
        // Lower priority: Entity names
        'buyer.name': 4,
        'tender.procuringEntity.name': 4,
        'awards.suppliers.name': 4,
        'parties.name': 4,
        
        // Lowest priority: OCID
        'ocid': 2
      },
      name: 'comprehensive_text_search_exact',
      default_language: 'none', // Disable stemming for exact matching
      language_override: 'language', // Allow per-document language override
      background: true // Create index in background
    }

    const result = await collection.createIndex(indexDefinition, indexOptions)
    console.log('✅ New text index created:', result)

    // Verify the new index
    console.log('🔍 Verifying new index...')
    const newIndexes = await collection.listIndexes().toArray() as IndexInfo[]
    const newTextIndex = newIndexes.find(index => index.name === 'comprehensive_text_search_exact')
    
    if (newTextIndex) {
      console.log('✅ Index verification successful:')
      console.log('   Name:', newTextIndex.name)
      console.log('   Language:', newTextIndex.default_language)
      console.log('   Fields indexed:', Object.keys(newTextIndex.key).length)
    } else {
      throw new Error('Failed to verify new index creation')
    }

    // Test the exact search functionality
    console.log('🧪 Testing exact search functionality...')
    
    // Test with a sample search that should match exactly
    const testResult = await ReleaseModel.aggregate([
      {
        $match: {
          $text: {
            $search: '"pescado"', // Phrase search with quotes
            $language: 'none',
            $caseSensitive: false,
            $diacriticSensitive: false,
          }
        }
      },
      {
        $addFields: {
          textScore: { $meta: 'textScore' }
        }
      },
      { $limit: 5 },
      {
        $project: {
          'tender.title': 1,
          'tender.description': 1,
          textScore: 1
        }
      }
    ])

    console.log('🔍 Test search results for "pescado":')
    console.log(`   Found ${testResult.length} documents`)
    if (testResult.length > 0) {
      console.log('   Sample result:', {
        title: testResult[0].tender?.title?.substring(0, 100) + '...',
        score: testResult[0].textScore
      })
    }

    console.log('\n🎉 Text index update completed successfully!')
    console.log('\n📋 Usage instructions:')
    console.log('   - Use phrase search with quotes: "pescado"')
    console.log('   - This will match exact substrings only')
    console.log('   - No stemming or partial word matching')
    console.log('   - Case-insensitive matching is still enabled')

  } catch (error) {
    console.error('❌ Error updating text index:', error)
    throw error
  } finally {
    // Close database connection
    await mongoose.connection.close()
    console.log('🔌 Database connection closed')
  }
}

// Run the script
if (require.main === module) {
  updateTextIndexForExactSearch()
    .then(() => {
      console.log('✅ Script completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script failed:', error)
      process.exit(1)
    })
}

export { updateTextIndexForExactSearch }
