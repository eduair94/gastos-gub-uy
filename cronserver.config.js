module.exports = {
  apps: [
    {
      name: 'gastos-gub-cronserver',
      script: 'dist/src/cronserver.js',
      // Memory and performance settings
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
