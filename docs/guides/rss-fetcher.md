# Release RSS Fetcher

## Overview

The `ReleaseRSSFetcher` class provides a robust interface for fetching contract release IDs from the Uruguay government procurement RSS feed (`comprasestatales.gub.uy`). It handles multiple months, error handling, and proper parsing of the RSS feed structure.

## Features

- ✅ **Fetch by Month/Year**: Get releases for specific time periods
- ✅ **Batch Processing**: Fetch multiple months or entire years
- ✅ **Error Handling**: Robust error handling with fallback mechanisms  
- ✅ **Rate Limiting**: Built-in delays to be respectful to the server
- ✅ **Multiple ID Formats**: Handles various release ID patterns
- ✅ **Metadata Extraction**: Gets titles, dates, descriptions, and links
- ✅ **Availability Check**: Check which months have data available

## Installation

The class requires these dependencies:
```bash
npm install axios xml2js @types/xml2js
```

## Usage Examples

### Basic Usage

```typescript
import { ReleaseRSSFetcher } from "./services/release-rss-fetcher";

const fetcher = new ReleaseRSSFetcher();

// Get releases for January 2025
const releases = await fetcher.fetchReleaseIds(2025, 1);
console.log(`Found ${releases.length} releases`);

// Process each release
for (const release of releases) {
  console.log(`Processing ${release.id}`);
  console.log(`  Title: ${release.title}`);
  console.log(`  Published: ${release.publishDate}`);
  console.log(`  Link: ${release.link}`);
}
```

### Get Only Release IDs

```typescript
// If you only need the IDs (string array)
const releaseIds = await fetcher.getReleaseIds(2025, 1);
console.log(`IDs: ${releaseIds.join(', ')}`);
// Output: "adjudicacion-1219109, adjudicacion-1219108, ..."
```

### Fetch Multiple Months

```typescript
// Get releases for Q1 2025
const q1Releases = await fetcher.fetchReleaseIdsForMultipleMonths(2025, [1, 2, 3]);
console.log(`Q1 2025: ${q1Releases.length} releases`);

// Get entire year
const yearReleases = await fetcher.fetchReleaseIdsForYear(2024);
console.log(`2024 total: ${yearReleases.length} releases`);
```

### Check Available Months

```typescript
// See which months have data
const availableMonths = await fetcher.getAvailableMonths(2025);
console.log(`Available months in 2025: ${availableMonths.join(', ')}`);
// Output: "1, 2, 3, 4, ..." (depending on what's available)
```

### Custom User Agent

```typescript
// Use a custom user agent for identification
const fetcher = new ReleaseRSSFetcher("MyApp/1.0 (contact@example.com)");
const releases = await fetcher.fetchReleaseIds(2025, 1);
```

## API Reference

### Constructor

```typescript
new ReleaseRSSFetcher(userAgent?: string)
```

- `userAgent` (optional): Custom user agent string for HTTP requests

### Main Methods

#### `fetchReleaseIds(year: number, month: number): Promise<ReleaseInfo[]>`
Fetches complete release information for a specific month.

**Parameters:**
- `year`: Year (e.g., 2025)
- `month`: Month (1-12)

**Returns:** Array of `ReleaseInfo` objects with full metadata

#### `getReleaseIds(year: number, month: number): Promise<string[]>`
Gets only the release ID strings (simplified version).

**Returns:** Array of release ID strings

#### `fetchReleaseIdsForMultipleMonths(year: number, months: number[]): Promise<ReleaseInfo[]>`
Fetches releases for multiple months in a single call.

**Parameters:**
- `year`: Year
- `months`: Array of month numbers (e.g., `[1, 2, 3]`)

#### `fetchReleaseIdsForYear(year: number): Promise<ReleaseInfo[]>`
Fetches releases for an entire year (all 12 months).

#### `getAvailableMonths(year: number): Promise<number[]>`
Checks which months have RSS feeds available for a given year.

### Data Structures

#### `ReleaseInfo`
```typescript
interface ReleaseInfo {
  id: string;              // Release ID (e.g., "adjudicacion-1219109")
  title: string;           // Full title from RSS
  link: string;            // Link to release details
  description: string;     // Description text
  publishDate: Date;       // Publication date
  guid?: string;           // GUID if available
}
```

## RSS Feed Structure

The Uruguay procurement RSS feed follows this pattern:
- **Base URL**: `https://www.comprasestatales.gub.uy/ocds/rss/{year}/{month}`
- **Format**: Standard RSS 2.0 XML
- **Title Format**: `"id_compra:{purchase_id},release_id:{release_id}"`
- **Content-Type**: `application/atom+xml`

### Example RSS Item
```xml
<item>
  <title>id_compra:1219109,release_id:adjudicacion-1219109</title>
  <pubDate>Fri, 31 Jan 2025 21:45:03</pubDate>
  <link>...</link>
  <description>...</description>
</item>
```

## Release ID Patterns

The fetcher handles multiple release ID patterns:

1. **Standard Format**: `"adjudicacion-1219109"` (from title)
2. **Full OCDS ID**: `"ocds-70d2nz-123456"` 
3. **Numeric IDs**: `"1219109"` (fallback)
4. **Prefixed IDs**: `"contrato-123"`, `"licitacion-456"`

## Error Handling

The class provides comprehensive error handling:

- **404 Errors**: RSS feed doesn't exist for the period
- **Network Errors**: Connection timeouts, DNS resolution
- **Parsing Errors**: Invalid XML content
- **Validation Errors**: Invalid year/month parameters

```typescript
try {
  const releases = await fetcher.fetchReleaseIds(2025, 13); // Invalid month
} catch (error) {
  console.error("Error:", error.message);
  // "Invalid month: 13. Month must be between 1 and 12"
}
```

## Performance Considerations

- **Rate Limiting**: 1-second delay between requests when fetching multiple months
- **Timeout**: 30-second timeout for each request
- **Memory**: Large months may return 10,000+ releases; process in batches if needed
- **Concurrency**: Use responsibly to avoid overwhelming the server

## Real-World Usage Statistics

Based on testing with live data:
- **January 2025**: ~12,663 releases
- **Average per month**: ~8,000-15,000 releases
- **Peak months**: December/January typically highest
- **Response time**: 2-5 seconds per month on average

## Integration Examples

### With Database Storage

```typescript
import { ReleaseRSSFetcher } from "./services/release-rss-fetcher";
import { ReleaseModel } from "./models/release";

async function syncLatestReleases() {
  const fetcher = new ReleaseRSSFetcher();
  const currentDate = new Date();
  
  // Get this month's releases
  const releases = await fetcher.fetchReleaseIds(
    currentDate.getFullYear(), 
    currentDate.getMonth() + 1
  );
  
  console.log(`Found ${releases.length} releases to sync`);
  
  // Store only new ones
  for (const release of releases) {
    const exists = await ReleaseModel.findOne({ id: release.id });
    if (!exists) {
      console.log(`New release: ${release.id}`);
      // Process new release...
    }
  }
}
```

### Monitoring Script

```typescript
async function monitorNewReleases() {
  const fetcher = new ReleaseRSSFetcher();
  const now = new Date();
  
  // Check current month
  const releases = await fetcher.fetchReleaseIds(now.getFullYear(), now.getMonth() + 1);
  
  // Filter releases from today
  const today = new Date().toDateString();
  const todaysReleases = releases.filter(r => 
    r.publishDate.toDateString() === today
  );
  
  if (todaysReleases.length > 0) {
    console.log(`🆕 ${todaysReleases.length} new releases today!`);
    // Send notification, update dashboard, etc.
  }
}

// Run every hour
setInterval(monitorNewReleases, 60 * 60 * 1000);
```

## Troubleshooting

### Common Issues

1. **406 Not Acceptable**: Check user agent and headers
2. **Empty Results**: Month may not have data yet
3. **Parsing Errors**: RSS format may have changed
4. **Network Timeouts**: Server may be slow; try increasing timeout

### Debug Mode

Enable detailed logging by checking console output - the class provides extensive logging for debugging.

## License & Usage

This tool is designed for legitimate data analysis and procurement transparency purposes. Please use responsibly and in accordance with the website's terms of service.
