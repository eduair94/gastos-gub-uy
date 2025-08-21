module.exports = {
  apps: [
    {
      name: 'gastos-gub-dashboard',
      port: 3600,
      exec_mode: 'cluster',
      instances: '1', // Use all available CPU cores
      script: './.output/server/index.mjs',
      cwd: './app',
      env: {
        NODE_ENV: 'production',
        PORT: 3600,
        NITRO_PORT: 3600,
        HOST: '0.0.0.0'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3600,
        NITRO_PORT: 3600,
        HOST: '0.0.0.0'
      },
      // PM2 configuration
      watch: false,
      max_memory_restart: '1G',
      time: true,
      // Auto restart configuration
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      // Health monitoring
      health_check_grace_period: 3000,
      // Additional environment variables
      env_file: '.env'
    },
    {
      name: 'gastos-gub-cronserver',
      script: 'tsx',
      args: 'src/cronserver.ts',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        CRON_SERVER_PORT: 3002
      },
      env_production: {
        NODE_ENV: 'production',
        CRON_SERVER_PORT: 3002
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
      env_file: '.env'
    }
  ],
};
