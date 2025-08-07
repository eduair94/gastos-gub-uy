module.exports = {
  apps: [
    {
      name: 'gastos-gub-dashboard',
      port: 3600,
      exec_mode: 'cluster',
      instances: 'max', // Use all available CPU cores
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
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      
      // Auto restart configuration
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Health monitoring
      health_check_grace_period: 3000,
      
      // Additional environment variables
      env_file: '.env'
    }
  ],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/master',
      repo: 'git@github.com:eduair94/gastos-gub-uy.git',
      path: '/var/www/gastos-gub',
      'pre-deploy-local': '',
      'post-deploy': 'cd app && npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
