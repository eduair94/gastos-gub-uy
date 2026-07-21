module.exports = {
  apps: [
    {
      name: 'gastos-gub-dashboard',
      port: 3600,
      // Node's cluster module does not reliably bind the port on Windows (the
      // process shows "online" but nothing listens). Use fork there; cluster
      // elsewhere where it works and scales across cores.
      exec_mode: process.platform === 'win32' ? 'fork' : 'cluster',
      instances: 1,
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
    },
    {
      // Alternates RUPE-only and awarded suppliers through one globally paced
      // Crawl4AI transport so both populations receive the same enrichment.
      // Each successful supplier is checkpointed through enrichedAt, so PM2
      // restarts and deploys resume safely without repeating the current pass.
      name: 'gastos-gub-contact-enrichment',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'src/jobs/enrich-supplier-contacts.ts --all-populations --loop --limit=100 --stale-days=365 --pause-ms=60000 --require-crawl4ai --require-google-maps',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      watch: false,
      max_memory_restart: '1G',
      time: true,
      restart_delay: 10000,
      max_restarts: 20,
      min_uptime: '30s',
      kill_timeout: 30000,
      log_file: './logs/contact-enrichment.log',
      out_file: './logs/contact-enrichment-out.log',
      error_file: './logs/contact-enrichment-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_file: '.env'
    }
  ],
};
