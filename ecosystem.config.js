// Keep the cronserver definition in one place. Importing it here prevents
// `npm run pm2:*` from silently replacing the production port/script declared
// in cronserver.config.js with a second, stale definition.
const [cronserverApp] = require('./cronserver.config.js').apps;

function contactEnrichmentApp(name, args, logSuffix) {
  return {
    name,
    script: './node_modules/tsx/dist/cli.mjs',
    args,
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
      // Two workers keep the site available if one crashes or is replaced
      // during a rolling deployment. The 167 host has enough headroom for both.
      instances: 2,
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
      // Poné techo al heap de V8.
      //
      // Sin este flag V8 dimensiona su old space contra la RAM total de la caja
      // y deja crecer cada worker hasta ~2 GB. Los dos juntos comían 4 GB de los
      // 11,9 GB del server 167, mongod terminaba con 1 GB en swap y sus
      // agregaciones morían con MaxTimeMSExpired. Incidente del 2026-09-04.
      //
      // 1024 MB sale de una medición, no de una corazonada: tras un reinicio
      // limpio cada worker se estabiliza en ~1,5 GB de RSS, y de eso sólo una
      // parte es heap de JS. El resto es el binario, los buffers de socket y los
      // chunks del bundle, que este flag no toca.
      //
      // CUIDADO: `max_memory_restart` NO es la red de contención. El monitor de
      // pm2 en el server 167 informa 0 b para todos los procesos, así que ese
      // tope nunca dispara.
      //
      // NO verifiques este flag con `/proc/<pid>/cmdline`: sale vacío igual.
      // En modo cluster pm2 forkea al worker desde su daemon y le pasa el flag
      // por `execArgv`, así que nunca aparece en la línea de comandos.
      //
      // Tampoco lo pongas en `NODE_OPTIONS`: en modo cluster no sirve. Node lee
      // esa variable sólo cuando arranca un proceso, y un worker de cluster es
      // un fork. Medido en el server 167 el 2026-09-04, con una app de prueba
      // que imprime `v8.getHeapStatistics().heap_size_limit`:
      //
      //   node_args --max-old-space-size=333  ->  381 MB  (funciona)
      //   NODE_OPTIONS --max-old-space-size=444 -> 2096 MB  (ignorado)
      //   sin nada                            -> 2096 MB  (el default)
      //
      // Esos 2096 MB de default son los que dejaban a cada worker crecer hasta
      // 2 GB. Para comprobar el techo, medí el RSS: con el tope puesto se
      // estabiliza cerca de 1,2 GB, no de 1,5 GB.
      //
      // 1024 ERA MUY POCO Y TIRÓ PRODUCCIÓN ABAJO el 06-09-2026. Con ese techo
      // los dos workers arrancaban, escuchaban en :3600, conectaban a Mongo y
      // después quemaban 145% de CPU cada uno sin contestar un solo pedido, ni
      // siquiera `/robots.txt`. Se acumularon 4.603 sockets en CLOSE-WAIT. El
      // deploy falló el health-check y el rollback al build anterior falló
      // igual, que es la prueba de que no era el código.
      //
      // La comparación que lo cierra: el MISMO build, arrancado a mano con
      // `--max-old-space-size=2048`, sirvió `/robots.txt` en 19 ms y el home en
      // 0,52 s. Es GC en espiral contra un techo demasiado bajo, no una
      // regresión. Con 1792 los workers estabilizan cerca de 570 MB de RSS.
      //
      // Si hay que volver a bajarlo, medí el heap real primero:
      // `v8.getHeapStatistics().heap_size_limit` dentro de un worker, y el RSS
      // con `ps -eo pid,pcpu,rss,args` — el monitor de pm2 informa 0b acá.
      node_args: ['--max-old-space-size=1792'],
      // PM2 configuration
      watch: false,
      // Acompaña al techo de heap: con 1792 el RSS pasa de 1 GB sin ser un
      // problema. El monitor de pm2 está roto en el 167 y nunca dispara esto,
      // pero dejarlo en 1G contradice al flag de arriba.
      max_memory_restart: '2G',
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
    // Crawl4AI and Maps have independent checkpoints and workers. Slow page
    // rendering can no longer hold up the high-concurrency Maps pass.
    contactEnrichmentApp(
      'gastos-gub-contact-enrichment',
      'src/jobs/enrich-supplier-contacts.ts --all-populations --sources=dei,rupe,website,webSearch,impo --loop --limit=100 --concurrency=10 --stale-days=365 --pause-ms=10000 --require-crawl4ai',
      'crawl',
    ),
    contactEnrichmentApp(
      'gastos-gub-google-maps-enrichment',
      'src/jobs/enrich-supplier-contacts.ts --maps-only --all-populations --sources=dei,rupe,googleMaps --loop --limit=500 --concurrency=20 --stale-days=365 --pause-ms=2000 --require-google-maps',
      'maps',
    )
  ],
};
