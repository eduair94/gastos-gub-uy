#!/usr/bin/env node

/**
 * Database Import Script
 * Imports database from export created by export-database.ts
 * Supports both MongoDB restore and custom JSON import formats
 */

import { exec } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import { connectToDatabase, mongoose } from '../shared/connection/database'

const execAsync = promisify(exec)

interface ImportOptions {
  format: 'mongorestore' | 'json' | 'auto'
  inputDir: string
  dropDatabase: boolean
  createIndexes: boolean
  collections?: string[]
  batchSize: number
}

interface ImportStats {
  totalDocuments: number
  collections: Record<string, number>
  duration: number
  format: string
  indexesCreated: number
}

class DatabaseImporter {
  private options: ImportOptions
  private startTime: number = 0
  private stats: ImportStats = {
    totalDocuments: 0,
    collections: {},
    duration: 0,
    format: 'unknown',
    indexesCreated: 0
  }

  constructor(options: ImportOptions) {
    this.options = options
  }

  async import(): Promise<ImportStats> {
    console.log('🚀 Starting database import...')
    console.log(`📂 Input directory: ${this.options.inputDir}`)
    console.log(`📋 Format: ${this.options.format}`)
    
    this.startTime = Date.now()

    try {
      // Validate input directory
      await this.validateInputDir()

      // Detect format if auto
      if (this.options.format === 'auto') {
        this.options.format = await this.detectFormat()
        console.log(`🔍 Detected format: ${this.options.format}`)
      }

      // Connect to database
      await this.connectDatabase()

      // Drop database if requested
      if (this.options.dropDatabase) {
        await this.dropDatabase()
      }

      // Import based on format
      switch (this.options.format) {
        case 'mongorestore':
          await this.importWithMongoRestore()
          break
        case 'json':
          await this.importFromJSON()
          break
      }

      // Create indexes if requested and available
      if (this.options.createIndexes) {
        await this.createIndexes()
      }

      // Calculate final stats
      this.calculateStats()

      console.log('✅ Database import completed successfully!')
      return this.stats

    } catch (error) {
      console.error('❌ Import failed:', error)
      throw error
    } finally {
      await this.disconnectDatabase()
    }
  }

  private async validateInputDir(): Promise<void> {
    try {
      await fs.access(this.options.inputDir)
    } catch {
      throw new Error(`Input directory does not exist: ${this.options.inputDir}`)
    }
  }

  private async detectFormat(): Promise<'mongorestore' | 'json'> {
    const mongodumpDir = path.join(this.options.inputDir, 'mongodump')
    const jsonDir = path.join(this.options.inputDir, 'json')

    try {
      await fs.access(mongodumpDir)
      return 'mongorestore'
    } catch {
      try {
        await fs.access(jsonDir)
        return 'json'
      } catch {
        throw new Error('Could not detect export format. Neither mongodump nor json directory found.')
      }
    }
  }

  private async connectDatabase(): Promise<void> {
    console.log('📡 Connecting to database...')
    await connectToDatabase()
    
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection not ready')
    }
    
    console.log('✅ Database connected successfully')
  }

  private async disconnectDatabase(): Promise<void> {
    console.log('🔌 Closing database connection...')
    await mongoose.connection.close()
  }

  private async dropDatabase(): Promise<void> {
    console.log('🗑️ Dropping existing database...')
    
    if (!mongoose.connection.db) {
      throw new Error('Database connection not available')
    }

    await mongoose.connection.db.dropDatabase()
    console.log('✅ Database dropped successfully')
  }

  private async importWithMongoRestore(): Promise<void> {
    console.log('📦 Importing with mongorestore...')

    // Get MongoDB connection details from environment or connection string
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gastos-gub'
    const dbName = process.env.MONGODB_DB_NAME || 'gastos-gub'
    
    // Parse connection string to extract components
    const uriParts = mongoUri.match(/mongodb:\/\/(?:([^:]+):([^@]+)@)?([^:\/]+)(?::(\d+))?(?:\/([^?]+))?/)
    
    if (!uriParts) {
      throw new Error('Invalid MongoDB URI format')
    }

    const [, username, password, host, port = '27017'] = uriParts
    
    // Build mongorestore command
    let mongorestoreCmd = `mongorestore`
    mongorestoreCmd += ` --host ${host}:${port}`
    mongorestoreCmd += ` --db ${dbName}`
    mongorestoreCmd += ` "${path.join(this.options.inputDir, 'mongodump', dbName)}"`
    
    if (username && password) {
      mongorestoreCmd += ` --username "${username}" --password "${password}"`
    }

    if (this.options.dropDatabase) {
      mongorestoreCmd += ` --drop`
    }

    // Add specific collections if specified
    if (this.options.collections && this.options.collections.length > 0) {
      for (const collection of this.options.collections) {
        mongorestoreCmd += ` --collection ${collection}`
      }
    }

    try {
      console.log('🔧 Running mongorestore command...')
      const { stdout, stderr } = await execAsync(mongorestoreCmd)
      
      if (stderr && !stderr.includes('done')) {
        console.warn('⚠️ mongorestore warnings:', stderr)
      }
      
      console.log('✅ mongorestore completed successfully')

      // Parse stdout to get import stats
      this.parseMongoRestoreOutput(stdout)
      
    } catch (error) {
      console.error('❌ mongorestore failed:', error)
      throw new Error(`mongorestore failed: ${error}`)
    }
  }

  private parseMongoRestoreOutput(output: string): void {
    // Parse mongorestore output to extract statistics
    const lines = output.split('\n')
    
    for (const line of lines) {
      const match = line.match(/(\d+) document\(s\) imported/)
      if (match) {
        this.stats.totalDocuments += parseInt(match[1])
      }

      const collectionMatch = line.match(/restoring (\w+)\.(\w+)/)
      if (collectionMatch) {
        const collectionName = collectionMatch[2]
        if (!this.stats.collections[collectionName]) {
          this.stats.collections[collectionName] = 0
        }
      }
    }
  }

  private async importFromJSON(): Promise<void> {
    console.log('📄 Importing from JSON format...')

    const jsonDir = path.join(this.options.inputDir, 'json')
    
    try {
      const files = await fs.readdir(jsonDir)
      const jsonFiles = files.filter(file => file.endsWith('.json'))

      for (const file of jsonFiles) {
        const collectionName = path.basename(file, '.json')
        
        // Skip if specific collections are requested and this isn't one of them
        if (this.options.collections && !this.options.collections.includes(collectionName)) {
          continue
        }

        await this.importCollectionFromJSON(collectionName, path.join(jsonDir, file))
      }

    } catch (error) {
      throw new Error(`Failed to import from JSON: ${error}`)
    }
  }

  private async importCollectionFromJSON(collectionName: string, filePath: string): Promise<void> {
    console.log(`📄 Importing collection: ${collectionName}`)

    if (!mongoose.connection.db) {
      throw new Error('Database connection not available')
    }

    try {
      const fileContent = await fs.readFile(filePath, 'utf8')
      const documents = JSON.parse(fileContent)

      if (!Array.isArray(documents)) {
        throw new Error(`Invalid JSON format in ${filePath}`)
      }

      if (documents.length === 0) {
        console.log(`⚠️ No documents found in ${collectionName}`)
        return
      }

      const collection = mongoose.connection.db.collection(collectionName)

      // Import in batches to avoid memory issues
      const batchSize = this.options.batchSize
      let imported = 0

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)
        
        try {
          await collection.insertMany(batch, { ordered: false })
          imported += batch.length
          
          if (imported % 1000 === 0 || imported === documents.length) {
            console.log(`   📥 Imported ${imported}/${documents.length} documents`)
          }
        } catch (error) {
          console.warn(`⚠️ Some documents in batch failed to import:`, error)
          imported += batch.length // Count them anyway for progress
        }
      }

      this.stats.collections[collectionName] = imported
      this.stats.totalDocuments += imported

      console.log(`✅ Imported ${imported} documents to ${collectionName}`)

    } catch (error) {
      console.error(`❌ Failed to import collection ${collectionName}:`, error)
      throw error
    }
  }

  private async createIndexes(): Promise<void> {
    console.log('🔍 Creating indexes...')

    const indexesPath = path.join(this.options.inputDir, 'indexes.json')
    
    try {
      await fs.access(indexesPath)
    } catch {
      console.log('⚠️ No indexes.json file found, skipping index creation')
      return
    }

    if (!mongoose.connection.db) {
      throw new Error('Database connection not available')
    }

    try {
      const indexesContent = await fs.readFile(indexesPath, 'utf8')
      const allIndexes = JSON.parse(indexesContent)

      for (const [collectionName, indexes] of Object.entries(allIndexes)) {
        if (this.options.collections && !this.options.collections.includes(collectionName)) {
          continue
        }

        const collection = mongoose.connection.db.collection(collectionName)
        
        for (const indexSpec of indexes as any[]) {
          // Skip the default _id index
          if (indexSpec.name === '_id_') {
            continue
          }

          try {
            await collection.createIndex(indexSpec.key, {
              name: indexSpec.name,
              ...indexSpec
            })
            
            this.stats.indexesCreated++
            console.log(`   ✅ Created index ${indexSpec.name} on ${collectionName}`)
            
          } catch (error) {
            console.warn(`   ⚠️ Failed to create index ${indexSpec.name} on ${collectionName}:`, error)
          }
        }
      }

      console.log(`✅ Created ${this.stats.indexesCreated} indexes`)

    } catch (error) {
      console.error('❌ Failed to create indexes:', error)
      throw error
    }
  }

  private calculateStats(): void {
    this.stats.duration = Date.now() - this.startTime
    this.stats.format = this.options.format
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const options: ImportOptions = {
    format: 'auto',
    inputDir: './database-export',
    dropDatabase: false,
    createIndexes: true,
    collections: undefined,
    batchSize: 1000
  }

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--format':
        options.format = args[++i] as 'mongorestore' | 'json' | 'auto'
        break
      case '--input':
      case '-i':
        options.inputDir = args[++i]
        break
      case '--drop':
        options.dropDatabase = true
        break
      case '--no-indexes':
        options.createIndexes = false
        break
      case '--collections':
        options.collections = args[++i].split(',')
        break
      case '--batch-size':
        options.batchSize = parseInt(args[++i])
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  try {
    const importer = new DatabaseImporter(options)
    const stats = await importer.import()

    console.log('\n📊 Import Statistics:')
    console.log(`   - Duration: ${(stats.duration / 1000).toFixed(2)}s`)
    console.log(`   - Total documents: ${stats.totalDocuments.toLocaleString()}`)
    console.log(`   - Indexes created: ${stats.indexesCreated}`)
    console.log(`   - Collections:`)
    
    Object.entries(stats.collections).forEach(([name, count]) => {
      console.log(`     • ${name}: ${count.toLocaleString()} documents`)
    })

    console.log('\n🎉 Database import completed successfully!')
    
  } catch (error) {
    console.error('\n💥 Import failed:', error)
    process.exit(1)
  }
}

function printHelp(): void {
  console.log(`
Database Import Tool

Usage: npm run import-db [options]

Options:
  --format <type>       Import format: mongorestore, json, or auto (default: auto)
  --input, -i <dir>     Input directory (default: ./database-export)
  --drop                Drop existing database before import
  --no-indexes          Don't create indexes
  --collections <list>  Only import specific collections (comma-separated)
  --batch-size <size>   Batch size for JSON imports (default: 1000)
  --help, -h            Show this help message

Examples:
  npm run import-db
  npm run import-db --input ./backup --drop
  npm run import-db --format json --collections releases --no-indexes
`)
}

// Run if called directly
if (require.main === module) {
  main()
}

export { DatabaseImporter, ImportOptions, ImportStats }
