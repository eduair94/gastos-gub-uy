# Government Data URL Scraper

A TypeScript web scraper built with SOLID principles to extract historical government expenditure data URLs from Uruguay's open data catalog.

## 🏗️ Architecture

This project demonstrates the implementation of SOLID principles in TypeScript:

### SOLID Principles Applied

1. **Single Responsibility Principle (SRP)**
   - `AxiosHttpClient`: Only handles HTTP requests
   - `CheerioParser`: Only parses HTML content
   - `GovernmentDataUrlExtractor`: Only extracts URLs from parsed content
   - `JsonFileWriter`: Only writes data to JSON files
   - `ConsoleLogger`: Only handles logging operations

2. **Open/Closed Principle (OCP)**
   - All classes implement interfaces, allowing for extension without modification
   - New parsers, writers, or HTTP clients can be added without changing existing code

3. **Liskov Substitution Principle (LSP)**
   - All implementations can be substituted for their interfaces without breaking functionality

4. **Interface Segregation Principle (ISP)**
   - Small, focused interfaces prevent classes from depending on unused methods
   - `HttpClient`, `HtmlParser`, `UrlExtractor`, `DataWriter` are all focused interfaces

5. **Dependency Inversion Principle (DIP)**
   - High-level modules depend on abstractions (interfaces), not concretions
   - Dependencies are injected via constructor injection

## 🚀 Features

- **Type-safe**: Written in TypeScript with strict typing
- **Robust error handling**: Retry logic with exponential backoff
- **Configurable**: Easy to modify target URLs, timeouts, and retry attempts
- **Extensible**: Add new data sources by implementing interfaces
- **Clean architecture**: SOLID principles ensure maintainable code

## 📦 Installation

```bash
npm install
```

## 🎯 Usage

### Build and Run
```bash
npm run build
npm start
```

### Development Mode
```bash
npm run dev
```

### Other Commands
```bash
npm run clean     # Remove build artifacts
npm run lint      # Run ESLint
npm run format    # Format code with Prettier
```

## 📁 Project Structure

```
src/
├── types/
│   └── interfaces.ts          # Type definitions and interfaces
├── config/
│   └── config.ts             # Configuration classes and constants
├── utils/
│   └── logger.ts             # Logging utilities
├── http/
│   └── axios-client.ts       # HTTP client implementation
├── parsers/
│   └── cheerio-parser.ts     # HTML parsing implementation
├── extractors/
│   └── url-extractor.ts      # URL extraction logic
├── writers/
│   └── json-writer.ts        # JSON file writing
├── scrapers/
│   └── government-data-scraper.ts  # Main scraper orchestration
├── factories/
│   └── scraper-factory.ts    # Dependency injection factory
└── index.ts                  # Application entry point
```

## 🔧 Configuration

The scraper can be configured by modifying `src/config/config.ts` or by using the factory methods:

```typescript
import { ScraperFactory } from './factories/scraper-factory.js';

// Use custom configuration
const scraper = ScraperFactory.createScraperWithConfig({
  timeout: 60000,
  retryAttempts: 5,
  userAgent: 'Custom User Agent'
});
```

## 📊 Output

The scraper generates a `urls.json` file with the following structure:

```json
[
  {
    "year": "2024",
    "url": "https://catalogodatos.gub.uy/dataset/.../download/ocds-2024.zip"
  },
  {
    "year": "2023", 
    "url": "https://catalogodatos.gub.uy/dataset/.../download/ocds-2023.zip"
  }
]
```

## 🧪 Testing

The architecture supports easy testing through dependency injection:

```typescript
// Mock implementations can be easily injected for testing
const mockHttpClient = new MockHttpClient();
const mockParser = new MockHtmlParser();
// ... other mocks

const scraper = new GovernmentDataScraper(
  mockHttpClient,
  mockParser,
  // ... other dependencies
);
```

## 🛠️ Extending the Scraper

### Adding a New Data Source

1. Implement the `UrlExtractor` interface
2. Create a new configuration class
3. Update the factory to wire dependencies

### Adding a New Output Format

1. Implement the `DataWriter` interface
2. Inject the new writer in the factory

### Adding a New HTTP Client

1. Implement the `HttpClient` interface
2. Replace the implementation in the factory

## 📝 License

MIT

## 📊 Analytics System

This project includes a comprehensive analytics system for processing and analyzing government expenditure data. The system is designed for high performance by pre-computing analytics data and storing it in MongoDB collections.

### 🏗️ Analytics Architecture

The analytics system follows a pre-computation approach for optimal performance:

1. **Batch Processing**: Analytics are computed in batches and stored in dedicated collections
2. **Pre-computed Data**: The API serves data from pre-computed collections rather than performing real-time aggregations
3. **Automatic Refresh**: The system automatically checks for stale data and recomputes when needed

### 📈 Analytics Components

#### Collections Created:
- `expense_insights`: Yearly/monthly spending insights
- `supplier_patterns`: Pre-computed supplier analysis
- `buyer_patterns`: Pre-computed buyer analysis  
- `anomalies`: Detected data anomalies

#### Scripts Available:
- `npm run batch-analytics`: Pre-compute all analytics data
- `npm run analytics`: Run real-time analytics (for testing)
- `npm run server`: Start the analytics API server

### 🚀 Running Analytics

1. **First, process the data:**
   ```bash
   npm run batch-analytics
   ```

2. **Start the analytics server:**
   ```bash
   npm run server
   ```

3. **Access the API endpoints:**
   - `GET /api/analytics/insights` - Get expense insights
   - `GET /api/analytics/anomalies` - Get detected anomalies
   - `GET /api/analysis/suppliers` - Get supplier patterns
   - `GET /api/analysis/buyers` - Get buyer patterns
   - `GET /api/analytics/overview` - Get analytics summary

### 📊 API Examples

```bash
# Get all insights
curl http://localhost:3600/api/analytics/insights

# Get insights for a specific year
curl http://localhost:3600/api/insights/2023

# Get anomalies with filtering
curl "http://localhost:3600/api/analytics/anomalies?severity=critical&limit=10"

# Search suppliers
curl "http://localhost:3600/api/analysis/suppliers?search=empresa&limit=20"
```

### ⚡ Performance Benefits

- **Fast Response Times**: Data is pre-computed, eliminating expensive real-time aggregations
- **Scalable**: Batch processing can handle large datasets efficiently
- **Resource Efficient**: API server focuses only on data retrieval
- **Automatic Updates**: Stale data detection ensures freshness

### 🔄 Data Refresh Strategy

- Analytics data is automatically refreshed when older than 1 week
- Manual refresh can be triggered by running `npm run batch-analytics`
- The system checks data freshness on each API request

## 🤝 Contributing

1. Follow SOLID principles
2. Maintain type safety
3. Add appropriate logging
4. Update documentation
5. Pre-compute analytics data for performance
