module.exports = {
  apps: [
    {
      name: 'gastos-gub-cronserver',
      script: 'dist/src/cronserver.js',
      env: {
        CRON_SERVER_PORT: 3902,
        MONGODB_URI: 'mongodb://localhost:27017/gastos_gub'
      }
    }
  ]
};
