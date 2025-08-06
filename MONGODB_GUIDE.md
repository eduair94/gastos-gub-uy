# MongoDB Integration and Schema Analysis

This extension adds MongoDB integration and schema analysis capabilities to efficiently handle large government purchase data JSON files.

## New Features

### 🔍 Schema Analysis
- **Streaming JSON Analysis**: Analyzes large JSON files without loading them entirely into memory
- **Schema Detection**: Automatically detects field types, nested structures, and data patterns
- **Sample Data**: Captures example values for each field to understand data structure
- **Multi-file Support**: Analyzes entire directories of JSON files

### 📊 MongoDB Integration
- **Efficient Uploading**: Streams data to MongoDB in configurable batches
- **Progress Tracking**: Real-time progress reporting during upload operations
- **Error Recovery**: Continues processing even if individual files fail
- **Automatic Indexing**: Creates recommended indexes for government purchase data

### 🎯 SOLID Principles Implementation
- **Single Responsibility**: Each class has one clear purpose
- **Open/Closed**: Easy to extend with new database backends
- **Liskov Substitution**: Interface-based design allows component swapping
- **Interface Segregation**: Focused interfaces for specific functionality
- **Dependency Inversion**: Abstractions over concrete implementations

## Usage

### 1. Environment Setup
```bash
# Set MongoDB connection (optional, defaults to localhost)
export MONGODB_URI="mongodb://localhost:27017"
export MONGODB_DATABASE="government_data"
export MONGODB_COLLECTION="purchases"
export MONGODB_BATCH_SIZE="1000"
```

### 2. Run Schema Analysis and Upload
```bash
# Using npm script
npm run analyze

# Or using tsx directly
tsx src/analyzer.ts
```

### 3. Query the Data
Once uploaded, you can query the government purchase data:

```javascript
// Find purchases by buyer
db.purchases.find({"buyer.name": /ministry/i})

// Find large contracts
db.purchases.find({"tender.value.amount": {$gt: 1000000}})

// Search by supplier
db.purchases.find({"awards.suppliers.name": /company/i})

// Find recent awards
db.purchases.find({"awards.date": {$gte: ISODate("2024-01-01")}})
```

## Architecture

### Core Components

#### Schema Analyzer (`JsonSchemaAnalyzer`)
- Streams through JSON files to detect schema
- Handles nested objects and arrays
- Captures field types and examples
- Configurable sampling size and depth

#### Database Client (`MongoDbClient`)
- Abstracted MongoDB operations
- Connection management
- Batch insert operations
- Index creation and management

#### JSON Processor (`StreamingJsonProcessor`)
- Memory-efficient JSON processing
- Configurable batch sizes
- Error handling and recovery
- Progress tracking

#### Data Uploader (`MongoDataUploader`)
- Orchestrates upload process
- Enriches data with metadata
- Handles directory traversal
- Provides upload statistics

### Configuration

The system is highly configurable through environment variables and config files:

```typescript
// MongoDB Configuration
export const MONGO_CONFIG = {
  uri: process.env.MONGODB_URI || "mongodb://localhost:27017",
  database: process.env.MONGODB_DATABASE || "government_data",
  collection: process.env.MONGODB_COLLECTION || "purchases",
  batchSize: parseInt(process.env.MONGODB_BATCH_SIZE || "1000")
}

// Schema Analysis Configuration
export const SCHEMA_ANALYZER_CONFIG = {
  sampleSize: 100,    // Records to sample per file
  maxDepth: 10,       // Maximum nesting depth
  exampleCount: 3     // Examples to keep per field
}
```

## Performance Considerations

### Memory Efficiency
- Uses Node.js streams to process large files
- Configurable batch sizes prevent memory overflow
- No complete file loading into memory

### Processing Speed
- Parallel processing where possible
- Optimized MongoDB bulk operations
- Progress tracking for long operations

### Error Handling
- Graceful degradation on file errors
- Detailed error logging and reporting
- Automatic retry mechanisms

## Sample Schema Output

The schema analyzer produces detailed schema information:

```json
{
  "2024": {
    "a-01-2024.json": {
      "ocid": {
        "type": "string",
        "optional": false,
        "examples": ["ocds-r6ebe6-AGC-LP-2024-001"]
      },
      "buyer": {
        "type": "object",
        "optional": false,
        "nestedFields": {
          "name": {
            "type": "string",
            "optional": false,
            "examples": ["Ministry of Education"]
          }
        }
      },
      "tender": {
        "type": "object",
        "optional": false,
        "nestedFields": {
          "value": {
            "type": "object",
            "nestedFields": {
              "amount": {
                "type": "number",
                "examples": [150000, 75000, 300000]
              }
            }
          }
        }
      }
    }
  }
}
```

## Recommended Indexes

The system automatically creates these indexes for optimal query performance:

- `ocid`: Unique identifier lookup
- `date`: Temporal queries
- `buyer.name`: Buyer organization searches
- `tender.title`: Text search on tender descriptions
- `tender.value.amount`: Value range queries
- `awards.suppliers.name`: Supplier searches
- `tender.procurementMethod`: Procurement type filtering

## Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Start MongoDB (if using local installation)
sudo systemctl start mongod
```

### Memory Issues
```bash
# Reduce batch size if running out of memory
export MONGODB_BATCH_SIZE="500"
```

### Large File Processing
```bash
# Reduce sample size for faster schema analysis
# Edit SCHEMA_ANALYZER_CONFIG.sampleSize in config.ts
```

## Future Enhancements

- [ ] Data validation and cleaning
- [ ] Incremental updates (delta loading)
- [ ] Data transformation pipelines
- [ ] Advanced query interface
- [ ] Data visualization integration
- [ ] Multiple database backend support
