module.exports = {
  apps: [
    {
      name: 'gastos-gub-cronserver',
      script: 'node',
      args: ['dist/src/cronserver.js'],
      instances: 1,
      exec_mode: 'fork',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        CRON_SERVER_PORT: 3902,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/gastos_gub'
      },
      env_production: {
        NODE_ENV: 'production',
        CRON_SERVER_PORT: 3902,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/gastos_gub'
      },
      // PM2 configuration
      watch: false,
      max_memory_restart: '512M',
      time: true,
      // Auto restart configuration
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      // Log configuration
      log_file: './logs/cronserver.log',
      out_file: './logs/cronserver-out.log',
      error_file: './logs/cronserver-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Health monitoring
      health_check_grace_period: 3000,
      // Additional environment variables
      env_file: '.env',
      // Cron restart options
      cron_restart: false, // Don't use PM2's cron restart as we have our own scheduling
      autorestart: true
    }
  ],
};
