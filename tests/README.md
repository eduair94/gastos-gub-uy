# Tests

This directory contains all test files organized by category.

## Directory Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── test-amount-calculator.ts     # Tests for amount calculation utilities
│   ├── test-amount-calculation.ts    # Amount calculation validation tests
│   ├── test-rss-fetcher.ts          # RSS fetcher service tests
│   ├── test-script-consistency.ts   # Script consistency validation
│   ├── test-uploader-structure.ts   # Uploader structure tests
│   └── test-url-structure.ts        # URL structure validation
├── integration/             # Integration tests with database/APIs
│   ├── test-anomalies.ts            # Anomaly detection tests
│   ├── test-autocomplete-api.ts     # Autocomplete API tests
│   ├── test-dashboard.ts            # Dashboard functionality tests
│   ├── test-single-upload.ts        # Single release upload test
│   ├── test-supplier-ids.ts         # Supplier ID format tests
│   └── test-supplier-patterns.ts    # Supplier pattern tests
└── performance/             # Performance and load tests
    ├── test-parallel-fetcher.ts     # Parallel fetching performance
    └── test-supplier-id-performance.ts  # Supplier ID index performance
```

## Running Tests

### Unit Tests
```bash
# Run individual unit tests
npx tsx tests/unit/test-amount-calculator.ts
npx tsx tests/unit/test-rss-fetcher.ts
```

### Integration Tests
```bash
# Run integration tests (requires database connection)
npx tsx tests/integration/test-single-upload.ts
npx tsx tests/integration/test-supplier-patterns.ts
```

### Performance Tests
```bash
# Run performance tests
npx tsx tests/performance/test-parallel-fetcher.ts
npx tsx tests/performance/test-supplier-id-performance.ts
```

## Test Categories

### Unit Tests
- **Independent**: Don't require external dependencies
- **Fast execution**: Quick feedback for development
- **Component focused**: Test individual functions/classes

### Integration Tests
- **Database dependent**: Require MongoDB connection
- **API testing**: Test end-to-end workflows
- **System integration**: Test component interactions

### Performance Tests
- **Load testing**: Test system under load
- **Benchmarking**: Measure execution times
- **Resource utilization**: Monitor memory/CPU usage

## Adding New Tests

1. **Choose the right category** based on test type
2. **Follow naming convention**: `test-[component-name].ts`
3. **Update import paths** to use relative paths from tests folder
4. **Add documentation** to this README if introducing new test types
