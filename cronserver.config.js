module.exports = {
  apps: [
    {
      name: 'gastos-gub-cronserver',
      script: 'dist/src/cronserver.js',
      // Memory and performance settings.
      //
      // 512M is deliberate and stays: this process only schedules and fetches RSS. The heavy
      // analytics/anomaly aggregations over ~2.2M releases run in child processes that the server
      // spawns with their own 2GB heap (see runJobProcess in src/cronserver.ts), so they neither
      // trip this limit nor take the scheduler down with them if they OOM.
      max_memory_restart: '512M',
      node_args: '--max-old-space-size=512',
      // Restart settings for stability
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      // Auto restart on crashes
      autorestart: true,
      // Don't watch files in production
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      ignore_watch: ['node_modules', 'logs', 'dist'],
      // Logging configuration
      log_file: 'logs/cronserver.log',
      out_file: 'logs/cronserver-out.log',
      error_file: 'logs/cronserver-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Environment variables
      env: {
        NODE_ENV: 'production',
        CRON_SERVER_PORT: 3902,
        // Prefer existing environment variable if present, otherwise fallback
      }
    }
  ]
};
