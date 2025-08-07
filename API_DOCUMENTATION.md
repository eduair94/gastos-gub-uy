# Analytics API Documentation

## Overview
The Analytics API provides endpoints to analyze government expenditure data with anomaly detection capabilities.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update `.env` with your MongoDB connection string

## Running the System

### Generate Analytics Data
```bash
npm run analytics
```

### Start API Server
```bash
npm run server
```

## API Endpoints

### Base URL
`http://localhost:3600/api`

### Analytics Endpoints

#### Get Yearly Insights
```
GET /analytics/insights?year=2024&page=1&limit=10
```

#### Get Anomalies
```
GET /analytics/anomalies?type=price_spike&severity=high&page=1&limit=10
```

#### Get Supplier Patterns
```
GET /analytics/suppliers?minContracts=5&page=1&limit=10
```

#### Get Buyer Patterns
```
GET /analytics/buyers?minSpending=1000000&page=1&limit=10
```

### Data Endpoints

#### Get Releases
```
GET /data/releases?year=2024&buyer=ANEP&page=1&limit=10
```

#### Get Release by ID
```
GET /data/releases/:id
```

#### Get Awards
```
GET /data/awards?minAmount=100000&currency=UYU&page=1&limit=10
```

### Aggregation Endpoints

#### Monthly Spending
```
GET /aggregations/monthly-spending?year=2024
```

#### Top Suppliers
```
GET /aggregations/top-suppliers?year=2024&limit=20
```

#### Top Buyers
```
GET /aggregations/top-buyers?year=2024&limit=20
```

#### Spending by Category
```
GET /aggregations/spending-by-category?year=2024
```

### Statistics Endpoints

#### Database Statistics
```
GET /stats/database
```

#### Yearly Statistics
```
GET /stats/yearly?year=2024
```

## Query Parameters

### Common Parameters
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10, max: 100)
- `year`: Filter by year
- `startDate`: Filter from date (ISO string)
- `endDate`: Filter to date (ISO string)

### Anomaly Parameters
- `type`: price_spike, suspicious_amount, supplier_pattern, buyer_pattern
- `severity`: low, medium, high, critical

### Release Parameters
- `buyer`: Buyer name (partial match)
- `supplier`: Supplier name (partial match)
- `minAmount`: Minimum award amount
- `maxAmount`: Maximum award amount
- `currency`: Currency code (UYU, USD, etc.)

## Response Format

All endpoints return data in this format:
```json
{
  "success": true,
  "data": {
    "docs": [...],
    "totalDocs": 1000,
    "page": 1,
    "limit": 10,
    "totalPages": 100,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

## Error Handling

Errors return:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details"
}
```

## Rate Limiting

API is rate limited to 100 requests per 15 minutes per IP address.

## Examples

### Get High Severity Anomalies
```bash
curl "http://localhost:3600/api/analytics/anomalies?severity=high&limit=5"
```

### Get Top Suppliers for 2024
```bash
curl "http://localhost:3600/api/aggregations/top-suppliers?year=2024&limit=10"
```

### Get Monthly Spending Trends
```bash
curl "http://localhost:3600/api/aggregations/monthly-spending?year=2024"
```

### Search Releases by Buyer
```bash
curl "http://localhost:3600/api/data/releases?buyer=ANEP&page=1&limit=5"
```
