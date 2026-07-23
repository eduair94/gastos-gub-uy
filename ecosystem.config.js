// Keep the cronserver definition in one place. Importing it here prevents
// `npm run pm2:*` from silently replacing the production port/script declared
// in cronserver.config.js with a second, stale definition.
const [cronserverApp] = require('./cronserver.config.js').apps;

function contactEnrichmentApp(name, populationArgs, logSuffix) {
  return {
    name,
    script: './node_modules/tsx/dist/cli.mjs',
    args: [
      'src/jobs/enrich-supplier-contacts.ts',
      populationArgs,
      '--loop --limit=100 --concurrency=10 --stale-days=365 --pause-ms=10000',
      '--require-crawl4ai --require-google-maps'
    ].filter(Boolean).join(' '),
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      CRAWL4AI_MAX_CONCURRENCY: '3',
      MAPS_RETRY_ATTEMPTS: '7',
      MAPS_RETRY_BASE_MS: '500',
      MAPS_RETRY_MAX_MS: '30000'
    },
    env_production: {
      NODE_ENV: 'production',
      CRAWL4AI_MAX_CONCURRENCY: '3',
      MAPS_RETRY_ATTEMPTS: '7',
      MAPS_RETRY_BASE_MS: '500',
      MAPS_RETRY_MAX_MS: '30000'
    },
    watch: false,
    max_memory_restart: '1G',
    time: true,
    restart_delay: 10000,
    max_restarts: 20,
    min_uptime: '30s',
    kill_timeout: 30000,
    log_file: `./logs/contact-enrichment-${logSuffix}.log`,
    out_file: `./logs/contact-enrichment-${logSuffix}-out.log`,
    error_file: `./logs/contact-enrichment-${logSuffix}-error.log`,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    env_file: '.env'
  };
}

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
    cronserverApp,
    // Split populations across two workers: no duplicate candidate selection,
    // twice the useful throughput, and independent retry/backoff windows.
    contactEnrichmentApp('gastos-gub-contact-enrichment', '', 'awarded'),
    contactEnrichmentApp('gastos-gub-contact-enrichment-rupe', '--registry-only', 'rupe')
  ],
};
