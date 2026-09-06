#!/bin/bash
# Recicla los workers del dashboard cuando el RSS pasa el umbral.
#
# POR QUÉ EXISTE. El monitor de pm2 informa 0b de memoria para TODOS los procesos en el server
# 167, así que `max_memory_restart` no dispara nunca. Este script hace ese trabajo con `ps`.
#
# ES UN PARCHE, no el arreglo. La causa de fondo es la concurrencia de renders SSR, y eso lo
# limita app/server/middleware/ssrConcurrency.ts. Este script queda como red: si algún día un
# worker vuelve a crecer sin freno, lo recicla en vez de dejar el sitio trabado.
#
# Instalación en el 167 (cron cada 5 minutos):
#   cp scripts/prod-recycle-dashboard.sh /root/gastos-gub-recycle.sh
#   chmod +x /root/gastos-gub-recycle.sh
#   (crontab -l; echo "*/5 * * * * /root/gastos-gub-recycle.sh") | crontab -
#
# El reload de pm2 en modo cluster es rotativo: reemplaza un worker por vez, así que el sitio
# sigue contestando durante el reciclado.

UMBRAL_MB="${UMBRAL_MB:-1700}"
PM2_BIN="${PM2_BIN:-/root/.nvm/versions/node/v22.14.0/bin/pm2}"
LOG="${LOG:-/var/log/gastos-gub-recycle.log}"

MAX=$(ps -eo rss,args \
  | grep "[g]astos-gub-uy/app/.output/server/index.mjs" \
  | awk '{ if ($1 > m) m = $1 } END { print int(m / 1024) }')

[ -z "$MAX" ] && exit 0

if [ "$MAX" -gt "$UMBRAL_MB" ]; then
  echo "$(date -Is) RSS max ${MAX}MB > ${UMBRAL_MB}MB -> pm2 reload" >> "$LOG"
  "$PM2_BIN" reload gastos-gub-dashboard >> "$LOG" 2>&1
fi
