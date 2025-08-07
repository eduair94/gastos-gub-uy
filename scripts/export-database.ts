#!/usr/bin/env node

/**
 * Database Export Script
 * Exports the entire gastos_gub database to facilitate migration between servers
 * Supports both MongoDB dump and custom JSON export formats
 */

import { exec } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import { connectToDatabase, mongoose } from '../shared/connection/database'

const execAsync = promisify(exec)

interface ExportOptions {
  format: 'mongodump' | 'json' | 'both'
  outputDir: string
  includeIndexes: boolean
  compress: boolean
  collections?: string[]
}

interface ExportStats {
  totalDocuments: number
  collections: Record<string, number>
  exportSize: string
  duration: number
  format: string
}

class DatabaseExporter {
  private options: ExportOptions
  private startTime: number = 0
  private stats: ExportStats = {
    totalDocuments: 0,
    collections: {},
    exportSize: '0 B',
    duration: 0,
    format: 'unknown'
  }

  constructor(options: ExportOptions) {
    this.options = options
  }

  async export(): Promise<ExportStats> {
    console.log('🚀 Starting database export...')
    console.log(`📂 Output directory: ${this.options.outputDir}`)
    console.log(`📋 Format: ${this.options.format}`)
    
    this.startTime = Date.now()

    try {
      // Ensure output directory exists
      await this.ensureOutputDir()

      // Connect to database
      await this.connectDatabase()

      // Export based on format
      switch (this.options.format) {
        case 'mongodump':
          await this.exportWithMongoDump()
          break
        case 'json':
          await this.exportToJSON()
          break
        case 'both':
          await this.exportWithMongoDump()
          await this.exportToJSON()
          break
      }

      // Calculate final stats
      await this.calculateStats()

      console.log('✅ Database export completed successfully!')
      return this.stats

    } catch (error) {
      console.error('❌ Export failed:', error)
      throw error
    } finally {
      await this.disconnectDatabase()
    }
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.access(this.options.outputDir)
    } catch {
      await fs.mkdir(this.options.outputDir, { recursive: true })
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

  private async exportWithMongoDump(): Promise<void> {
    console.log('📦 Exporting with mongodump...')

    // Get MongoDB connection details from environment or connection string
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gastos_gub'
    const dbName = process.env.MONGODB_DB_NAME || 'gastos_gub'
    
    // Parse connection string to extract components
    const uriParts = mongoUri.match(/mongodb:\/\/(?:([^:]+):([^@]+)@)?([^:\/]+)(?::(\d+))?(?:\/([^?]+))?/)
    
    if (!uriParts) {
      throw new Error('Invalid MongoDB URI format')
    }

    const [, username, password, host, port = '27017'] = uriParts
    
    // Build mongodump command
    let mongodumpCmd = `mongodump`
    mongodumpCmd += ` --host ${host}:${port}`
    mongodumpCmd += ` --db ${dbName}`
    mongodumpCmd += ` --out "${path.join(this.options.outputDir, 'mongodump')}"`
    
    if (username && password) {
      mongodumpCmd += ` --username "${username}" --password "${password}"`
    }

    if (this.options.compress) {
      mongodumpCmd += ` --gzip`
    }

    // Add specific collections if specified
    if (this.options.collections && this.options.collections.length > 0) {
      for (const collection of this.options.collections) {
        mongodumpCmd += ` --collection ${collection}`
      }
    }

    try {
      console.log('🔧 Running mongodump command...')
      const { stdout, stderr } = await execAsync(mongodumpCmd)
      
      if (stderr && !stderr.includes('done dumping')) {
        console.warn('⚠️ mongodump warnings:', stderr)
      }
      
      console.log('✅ mongodump completed successfully')
    } catch (error) {
      console.error('❌ mongodump failed:', error)
      throw new Error(`mongodump failed: ${error}`)
    }
  }

  private async exportToJSON(): Promise<void> {
    console.log('📄 Exporting to JSON format...')

    // Get all collections in the database
    if (!mongoose.connection.db) {
      throw new Error('Database connection not available')
    }
    
    const collections = await mongoose.connection.db.listCollections().toArray()
    
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      
      // Skip system collections
      if (collectionName.startsWith('system.')) {
        continue
      }

      // Skip if specific collections are requested and this isn't one of them
      if (this.options.collections && !this.options.collections.includes(collectionName)) {
        continue
      }

      await this.exportCollectionToJSON(collectionName)
    }

    // Export indexes if requested
    if (this.options.includeIndexes) {
      await this.exportIndexes()
    }

    // Create metadata file
    await this.createMetadataFile()
  }

  private async exportCollectionToJSON(collectionName: string): Promise<void> {
    console.log(`📄 Exporting collection: ${collectionName}`)

    if (!mongoose.connection.db) {
      throw new Error('Database connection not available')
    }

    const collection = mongoose.connection.db.collection(collectionName)
    const documents = await collection.find({}).toArray()
    
    this.stats.collections[collectionName] = documents.length
    this.stats.totalDocuments += documents.length

    const outputPath = path.join(this.options.outputDir, 'json', `${collectionName}.json`)
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    
    // Write documents to file
    await fs.writeFile(outputPath, JSON.stringify(documents, null, 2), 'utf8')
    
    console.log(`✅ Exported ${documents.length} documents from ${collectionName}`)
  }

  private async exportIndexes(): Promise<void> {
    console.log('🔍 Exporting indexes...')

    if (!mongoose.connection.db) {
      throw new Error('Database connection not available')
    }

    const collections = await mongoose.connection.db.listCollections().toArray()
    const allIndexes: Record<string, any[]> = {}

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      
      if (collectionName.startsWith('system.')) {
        continue
      }

      try {
        const collection = mongoose.connection.db.collection(collectionName)
        const indexes = await collection.listIndexes().toArray()
        allIndexes[collectionName] = indexes
      } catch (error) {
        console.warn(`⚠️ Could not export indexes for ${collectionName}:`, error)
      }
    }

    const indexesPath = path.join(this.options.outputDir, 'indexes.json')
    await fs.writeFile(indexesPath, JSON.stringify(allIndexes, null, 2), 'utf8')
    
    console.log('✅ Indexes exported successfully')
  }

  private async createMetadataFile(): Promise<void> {
    if (!mongoose.connection.db) {
      throw new Error('Database connection not available')
    }

    const metadata = {
      exportDate: new Date().toISOString(),
      databaseName: mongoose.connection.db.databaseName,
      mongoVersion: (await mongoose.connection.db.admin().serverStatus()).version,
      exportFormat: this.options.format,
      includeIndexes: this.options.includeIndexes,
      collections: this.stats.collections,
      totalDocuments: this.stats.totalDocuments,
      exportOptions: this.options
    }

    const metadataPath = path.join(this.options.outputDir, 'metadata.json')
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8')
    
    console.log('✅ Metadata file created')
  }

  private async calculateStats(): Promise<void> {
    this.stats.duration = Date.now() - this.startTime
    this.stats.format = this.options.format

    try {
      // Calculate export size
      const { stdout } = await execAsync(`du -sh "${this.options.outputDir}"`)
      this.stats.exportSize = stdout.split('\t')[0] || '0 B'
    } catch {
      // Fallback for Windows or if du is not available
      this.stats.exportSize = 'Unknown'
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const options: ExportOptions = {
    format: 'both',
    outputDir: './database-export',
    includeIndexes: true,
    compress: true,
    collections: undefined
  }

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--format':
        options.format = args[++i] as 'mongodump' | 'json' | 'both'
        break
      case '--output':
      case '-o':
        options.outputDir = args[++i]
        break
      case '--no-indexes':
        options.includeIndexes = false
        break
      case '--no-compress':
        options.compress = false
        break
      case '--collections':
        options.collections = args[++i].split(',')
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  try {
    const exporter = new DatabaseExporter(options)
    const stats = await exporter.export()

    console.log('\n📊 Export Statistics:')
    console.log(`   - Duration: ${(stats.duration / 1000).toFixed(2)}s`)
    console.log(`   - Total documents: ${stats.totalDocuments.toLocaleString()}`)
    console.log(`   - Export size: ${stats.exportSize}`)
    console.log(`   - Collections:`)
    
    Object.entries(stats.collections).forEach(([name, count]) => {
      console.log(`     • ${name}: ${count.toLocaleString()} documents`)
    })

    console.log('\n🎉 Database export completed successfully!')
    console.log(`📂 Export location: ${options.outputDir}`)
    
  } catch (error) {
    console.error('\n💥 Export failed:', error)
    process.exit(1)
  }
}

function printHelp(): void {
  console.log(`
Database Export Tool

Usage: npm run export-db [options]

Options:
  --format <type>     Export format: mongodump, json, or both (default: both)
  --output, -o <dir>  Output directory (default: ./database-export)
  --no-indexes        Don't export indexes
  --no-compress       Don't compress mongodump output
  --collections <list> Only export specific collections (comma-separated)
  --help, -h          Show this help message

Examples:
  npm run export-db
  npm run export-db --format json --output ./backup
  npm run export-db --collections releases,filters --no-indexes
`)
}

// Run if called directly
if (require.main === module) {
  main()
}

export { DatabaseExporter, ExportOptions, ExportStats }
