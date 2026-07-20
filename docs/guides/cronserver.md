# Gastos Gub Cronserver Documentation

## Overview

The Gastos Gub Cronserver is a Node.js application that runs scheduled tasks using PM2 process manager. It automatically uploads new releases from the web for the current month every day at midnight (Uruguay timezone) and provides health monitoring endpoints.

## Features

- **Scheduled Upload**: Runs daily at 00:00 (midnight) Uruguay timezone
- **Health Monitoring**: Comprehensive health checks including MongoDB connection status
- **Automatic MongoDB Service Recovery**: Attempts to restart MongoDB service if connection fails
- **Manual Trigger**: API endpoint to manually trigger the upload job
- **Process Management**: Managed by PM2 for reliability and monitoring
- **Logging**: Comprehensive logging with timestamps and rotation

## Installation

1. Install dependencies:
```bash
npm install
```

2. Ensure MongoDB is running and accessible
3. Make sure PM2 is installed globally:
```bash
npm install -g pm2
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/gastos_gub

# Cronserver port (default: 3002)
CRON_SERVER_PORT=3002

# Node environment
NODE_ENV=production
```

### System Permissions

The cronserver needs sudo permissions to restart MongoDB service. Add this to your sudoers file:

```bash
# Allow user to restart mongod service without password
username ALL=(ALL) NOPASSWD: /bin/systemctl start mongod, /bin/systemctl stop mongod, /bin/systemctl restart mongod
```

Replace `username` with your actual username.

## Usage

### Starting the Cronserver

```bash
# Start with PM2
npm run cronserver:start

# Or start directly (development)
npm run cronserver
```

### Managing with PM2

```bash
# Check status
npm run cronserver:status

# View logs
npm run cronserver:logs

# Restart
npm run cronserver:restart

# Stop
npm run cronserver:stop

# Delete (stop and remove from PM2)
npm run cronserver:delete
```

### Monitoring

```bash
# PM2 monitoring dashboard
pm2 monit

# View all PM2 processes
pm2 list
```

## API Endpoints

### Health Check
- **URL**: `GET /health`
- **Description**: Comprehensive health check including MongoDB status
- **Features**: 
  - MongoDB connection test
  - Automatic MongoDB service restart if unhealthy
  - Cronjob status information
  - System uptime and environment info

**Example Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-21T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "mongodb": {
    "status": "healthy",
    "connected": true,
    "readyState": 1
  },
  "cronjob": {
    "lastRun": "2025-08-21T00:00:00.000Z",
    "nextRun": "2025-08-22T00:00:00.000Z",
    "status": "idle",
    "lastError": null,
    "successfulRuns": 5,
    "failedRuns": 0,
    "isRunning": false
  }
}
```

### Cronjob Status
- **URL**: `GET /cron/status`
- **Description**: Detailed cronjob status information

### Manual Trigger
- **URL**: `POST /cron/trigger`
- **Description**: Manually trigger the upload job
- **Note**: Cannot trigger if job is already running

### MongoDB Service Restart
- **URL**: `POST /admin/restart-mongodb`
- **Description**: Manually restart MongoDB service
- **Requires**: Sudo permissions for systemctl commands

## Scheduled Task Details

### Timing
- **Schedule**: Every day at 00:00 (midnight)
- **Timezone**: America/Montevideo (Uruguay, UTC-3)
- **Pattern**: `0 0 * * *` (cron expression)

### What it does
1. Connects to MongoDB
2. Fetches current currency exchange rates
3. Processes only the current month's releases
4. Downloads new releases in batches of 200
5. Processes data with controlled concurrency (20 simultaneous requests)
6. Uploads to database in batches of 500
7. Logs comprehensive statistics
8. Updates job status for monitoring

### Error Handling
- Continues processing even if individual releases fail
- Attempts MongoDB service restart on connection failures
- Logs all errors for debugging
- Updates failure statistics for monitoring
- Prevents concurrent job execution

## Logging

Logs are stored in:
- `./logs/cronserver.log` - Combined log
- `./logs/cronserver-out.log` - Standard output
- `./logs/cronserver-error.log` - Error output

Log format includes timestamps and is automatically rotated by PM2.

## Monitoring and Alerts

### Health Check Integration

You can integrate the health endpoint with monitoring services like:
- **Uptime monitoring**: Check `/health` endpoint regularly
- **Log monitoring**: Monitor error logs for failures
- **Process monitoring**: Use `pm2 monit` or integrate with monitoring systems

### Example Monitoring Script

```bash
#!/bin/bash
# Simple health check script
RESPONSE=$(curl -s http://localhost:3002/health)
STATUS=$(echo $RESPONSE | jq -r '.status')

if [ "$STATUS" != "healthy" ]; then
    echo "ALERT: Cronserver is unhealthy"
    echo $RESPONSE
    # Add your alert mechanism here (email, Slack, etc.)
fi
```

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failures**
   - Check MongoDB service status: `sudo systemctl status mongod`
   - Check connection string in `.env`
   - Ensure MongoDB is accepting connections

2. **Permission Issues**
   - Ensure sudoers file is configured correctly
   - Check file permissions on log directory
   - Verify user has access to MongoDB

3. **PM2 Process Issues**
   - Check PM2 status: `pm2 list`
   - View detailed logs: `pm2 logs gastos-gub-cronserver`
   - Restart if needed: `npm run cronserver:restart`

4. **Cronjob Not Running**
   - Check server timezone: `date`
   - Verify cron expression in code
   - Check if process is hung: look for `isRunning: true` in status

### Log Analysis

```bash
# View recent logs
npm run cronserver:logs

# Search for errors
pm2 logs gastos-gub-cronserver | grep -i error

# Monitor real-time
pm2 logs gastos-gub-cronserver --lines 0
```

## Performance Considerations

- **Memory Usage**: Configured with 512MB limit
- **Concurrency**: 20 simultaneous requests maximum
- **Batch Sizes**: 200 for fetching, 500 for database operations
- **Delays**: 1-2 seconds between batches to avoid overwhelming servers

## Security Notes

- Cronserver runs on port 3002 (configurable)
- Health endpoints are publicly accessible
- Admin endpoints should be protected in production
- Sudo permissions are limited to MongoDB service commands only
- All database operations use connection pooling and proper error handling

## Maintenance

### Regular Tasks
- Monitor disk space for logs
- Review error statistics in health checks
- Verify cronjob execution in logs
- Check MongoDB performance and storage

### Updates
- Update dependencies regularly
- Monitor PM2 process health
- Review and rotate logs as needed
- Test backup and recovery procedures
