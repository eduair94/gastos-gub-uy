# Release Uploader New - Web-based Data Fetching

## Overview

The `ReleaseUploaderNew` class provides a web-based alternative to the file-based `ReleaseUploader`. Instead of processing local JSON files, it fetches procurement data directly from the Uruguay government RSS feeds and OCDS endpoints.

## Features

✅ **Web-based Data Source**: Fetches data directly from comprasestatales.gub.uy RSS feeds  
✅ **Complete OCDS Data**: Retrieves full JSON data from each release URL  
✅ **Amount Calculation**: Uses shared amount calculator with multicurrency support  
✅ **Database Integration**: Uploads to MongoDB with same structure as file-based uploader  
✅ **Metadata Enhancement**: Adds web-specific metadata fields  
✅ **Rate Limiting**: Respectful delays between requests  
✅ **Error Handling**: Graceful handling of failed requests  
✅ **Batch Processing**: Efficient bulk database operations  

## Usage

### Direct Execution
```bash
npx tsx src/uploaders/release-uploader-new.ts
```

### Programmatic Usage
```typescript
import { ReleaseUploaderNew } from "./uploaders/release-uploader-new";
import { DatabaseService } from "./services/database-service";
import { Logger } from "./services/logger-service";

const uploader = new ReleaseUploaderNew(
  new DatabaseService(),
  new Logger(),
  "mongodb://localhost:27017/gastos_gub"
);

await uploader.uploadReleasesFromWeb();
```

## Data Structure

The uploader creates release documents with the following structure:

```typescript
{
  // Standard OCDS fields
  id: string,
  ocid: string,
  date: Date,
  tag: string[],
  initiationType: string,
  parties: IParty[],
  buyer?: IBuyer,
  tender?: ITender,
  awards?: IAward[],
  
  // Metadata fields (matching file-based uploader)
  sourceFileName: "web",
  sourceYear: 2025,
  amount: {
    totalAmounts: Record<string, number>,
    totalItems: number,
    currencies: string[],
    hasAmounts: boolean,
    primaryAmount: number,
    primaryCurrency: string,
    version: 2,
    calculatedAt: Date,
    exchangeRates: { ... },
    conversionNotes: string[]
  },
  
  // Web-specific metadata
  webFetchDate: Date,
  rssTitle: string,
  rssDescription: string,
  rssPublishDate: Date,
  rssLink: string
}
```

## Processing Flow

1. **Connect to Database**: Establishes MongoDB connection
2. **Fetch Currency Rates**: Gets current exchange rates for amount calculation
3. **Determine Date Range**: January 2025 to current month
4. **Process Each Month**:
   - Fetch RSS feed for the month
   - Get full OCDS data for each release
   - Transform to IRelease format
   - Calculate amounts with currency conversion
   - Add metadata
   - Bulk upload to database
5. **Rate Limiting**: 1-second delays between releases, 5-second delays between months

## Performance Characteristics

- **Rate Limiting**: 1 second between individual release fetches
- **Batch Size**: 1000 operations per database batch
- **Memory Efficiency**: Processes one month at a time
- **Error Recovery**: Continues processing if individual releases fail
- **Demo Mode**: Limited to 50 releases per month for testing

## Comparison with File-based Uploader

| Feature | File-based | Web-based |
|---------|------------|-----------|
| Data Source | Local JSON files | RSS feeds + OCDS API |
| Currency Rates | Live API calls | Live API calls |
| Amount Calculation | Version 2 calculator | Version 2 calculator |
| Database Structure | Same | Same |
| Processing Speed | Faster (no network) | Slower (network dependent) |
| Data Freshness | Static files | Real-time |
| Error Handling | File-level | Release-level |

## Configuration

### Environment Variables
- `MONGODB_URI`: MongoDB connection string

### Rate Limiting
- Release fetch delay: 1000ms
- Month transition delay: 5000ms  
- Batch size: 1000 operations

## Error Handling

The uploader handles various error scenarios:

- **Network Errors**: Continues with next release
- **Parse Errors**: Logs and skips malformed data  
- **Database Errors**: Retries with remaining batches
- **Currency API Errors**: Uses fallback rates

## Example Output

```
🚀 Starting web-based release upload...
[INFO] Connected to MongoDB
[INFO] Fetching current currency exchange rates...
✅ Fetched exchange rates (base: USD)
💱 Current USD to UYU rate: 40.0641026
🏦 Fetching UYI (Unidades Indexadas) exchange rate...
✅ Fetched UYI rate: 1 UYI = 6.3633 UYU
[INFO] Starting web-based upload for 2025 from January to 08
[INFO] Will process 8 months: 1, 2, 3, 4, 5, 6, 7, 8
[INFO] Processing 2025-01...
[INFO] Fetching OCDS data for 2025-01 (limited to 50 releases for demo)...
📋 Found 50 releases to fetch data for
🚀 Starting to fetch OCDS data for 50 releases...
📥 (1/50) Fetching data for release: adjudicacion-1219109
✅ Success - adjudicacion-1219109
...
[INFO] Executing 50 database operations for 2025-01...
[INFO] Details for 2025-01: 45 new, 3 updated, 2 unchanged
[INFO] 2025-01 complete: 50 uploaded, 0 skipped
```

## Production Deployment

For production use:

1. **Remove Demo Limit**: Set `maxReleases` to `undefined` in `fetchReleasesWithData()`
2. **Adjust Rate Limits**: Increase delays if server load is high
3. **Monitor Memory**: Process fewer months concurrently if needed
4. **Error Alerting**: Add notification system for failed uploads
5. **Scheduling**: Run periodically (daily/weekly) to get new releases

## Integration with Existing System

The web-based uploader:
- ✅ Uses same database schema as file-based uploader
- ✅ Uses same amount calculation logic  
- ✅ Compatible with existing analytics and dashboard
- ✅ Maintains data consistency and integrity
- ✅ Adds additional metadata without breaking existing queries

This ensures seamless integration with your existing gastos-gub system while providing real-time data updates from the government procurement portal.
