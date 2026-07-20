# Dashboard Metrics Auto-Refresh Implementation

## Overview

This implementation provides a reliable approach to sync quickStats in the layout with actual dashboard data, featuring automatic refresh capabilities and robust error handling.

## Key Components

### 1. `useDashboardMetrics` Composable

**Location**: `app/composables/useDashboardMetrics.ts`

**Features**:
- Provides unified access to dashboard metrics across components
- Automatic initialization on component mount
- Auto-refresh functionality with configurable intervals
- Loading states and error handling
- Formatted quick stats for the sidebar
- Callback mechanism for refresh notifications

**Usage**:
```typescript
const {
  metrics,           // Raw dashboard metrics
  quickStats,        // Formatted for sidebar display
  isLoading,         // Loading state
  error,             // Error state
  refreshMetrics,    // Manual refresh function
  isAutoRefreshEnabled, // Auto-refresh state
  startAutoRefresh,  // Start auto-refresh
  stopAutoRefresh,   // Stop auto-refresh
} = useDashboardMetrics()
```

### 2. Enhanced Layout with QuickStats

**Location**: `app/layouts/default.vue`

**Features**:
- Real-time dashboard metrics in sidebar
- Manual refresh button with loading indicator
- Auto-refresh toggle control
- Loading states and error indicators
- Last updated timestamp
- Automatic notifications on refresh

**Auto-refresh Configuration**:
- Default interval: 5 minutes
- Automatic start on layout mount
- Graceful cleanup on unmount
- User-controlled toggle

### 3. Dashboard Store Integration

**Location**: `app/stores/dashboard.ts`

**Features**:
- Centralized state management
- API integration with proper error handling
- Parallel data fetching for optimal performance
- Cached metrics with refresh capability

## Implementation Details

### Auto-Refresh Mechanism

```typescript
// Configurable interval (default: 5 minutes)
autoRefreshInterval.value = 5 * 60 * 1000

// Start auto-refresh with callback
startAutoRefresh(() => {
  // Optional callback for notifications
  showNotification('Data updated automatically')
})
```

### Error Handling

```typescript
// Graceful error handling in composable
try {
  await dashboardStore.refreshData()
} catch (err) {
  console.error('Error refreshing metrics:', err)
  // Error state is automatically managed
}
```

### Loading States

```typescript
// Combined loading state from multiple sources
const isLoading = computed(() => {
  return dashboardStore.loading.metrics
    || dashboardStore.loading.trends
    || dashboardStore.loading.suppliers
    || dashboardStore.loading.buyers
})
```

## Data Flow

1. **Initialization**: Layout mounts → Composable initializes → Store fetches data
2. **Display**: Store data → Composable formats → Layout displays
3. **Auto-refresh**: Timer triggers → Store refreshes → UI updates automatically
4. **Manual refresh**: User clicks → Immediate refresh → Notification shown
5. **Error handling**: API fails → Error state → User notification

## API Integration

### Dashboard Metrics Endpoint

**Endpoint**: `/api/dashboard/metrics`

**Response Format**:
```json
{
  "success": true,
  "data": {
    "totalContracts": 125000,
    "totalSpending": 15000000000,
    "totalSuppliers": 36000,
    "totalBuyers": 400,
    "avgContractValue": 120000,
    "currentYearGrowth": 8.5,
    "recentAnomalies": 23,
    "calculatedAt": "2025-08-07T10:30:00Z",
    "dataVersion": "v1691396400000"
  }
}
```

### Pre-calculated Data

The system uses pre-calculated dashboard metrics stored in MongoDB for optimal performance:

- **Collection**: `dashboard_metrics`
- **Update frequency**: Weekly (can be manually triggered)
- **Data freshness**: Automatic detection and refresh

## Testing

### Test Page

**Location**: `app/pages/test-dashboard-metrics.vue`

**Features**:
- Debug panel showing all metric states
- Manual testing controls
- Real-time state monitoring
- Verification checklist

### Debug Component

**Location**: `app/components/debug/DashboardMetricsDebug.vue`

**Features**:
- JSON display of current metrics
- Loading and error state monitoring
- Action buttons for testing
- Auto-refresh controls

## Performance Considerations

### Optimization Strategies

1. **Pre-calculated Data**: Heavy computations done offline
2. **Parallel Fetching**: Multiple API calls executed simultaneously
3. **Intelligent Caching**: Store prevents unnecessary API calls
4. **Minimal Re-renders**: Computed properties optimize Vue reactivity

### Memory Management

- Timer cleanup on component unmount
- Proper error boundary handling
- Efficient state updates

## Configuration

### Environment Variables

```env
# API base URL for dashboard endpoints
NUXT_PUBLIC_API_URL=http://localhost:3000/api

# Auto-refresh settings (can be overridden in code)
DASHBOARD_REFRESH_INTERVAL=300000  # 5 minutes
```

### Customization Options

```typescript
// Adjust refresh interval
dashboardMetrics.autoRefreshInterval.value = 10 * 60 * 1000 // 10 minutes

// Custom refresh callback
dashboardMetrics.startAutoRefresh(() => {
  console.log('Dashboard refreshed!')
})
```

## Error Recovery

### Automatic Retry

- Failed requests automatically show error state
- User can manually retry via refresh button
- Auto-refresh continues attempting updates

### Fallback Behavior

- QuickStats show 0 values when data unavailable
- Error indicators guide user to manual refresh
- Graceful degradation for partial data failure

## Future Enhancements

### Planned Features

1. **Smart Refresh**: Refresh only when data is stale
2. **Background Sync**: Service worker for offline capability
3. **Real-time Updates**: WebSocket integration for live data
4. **Progressive Loading**: Show cached data while fetching updates
5. **User Preferences**: Customizable refresh intervals per user

### Monitoring

1. **Refresh Success Rate**: Track API call success/failure
2. **User Engagement**: Monitor manual vs automatic refreshes
3. **Performance Metrics**: API response times and data freshness
4. **Error Analytics**: Common failure patterns and recovery

## Troubleshooting

### Common Issues

1. **Data Not Updating**: Check network connection and API availability
2. **High Memory Usage**: Ensure proper cleanup of timers
3. **Slow Performance**: Verify pre-calculated data is available
4. **UI Not Responding**: Check for JavaScript errors in console

### Debug Steps

1. Open test page: `/test-dashboard-metrics`
2. Monitor network tab for API calls
3. Check console for error messages
4. Verify auto-refresh timer in debug panel
5. Test manual refresh functionality

This implementation provides a robust, user-friendly approach to dashboard data synchronization with excellent performance characteristics and proper error handling.
