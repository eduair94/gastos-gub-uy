# Local dev bootstrap. `just run` gets a working dashboard from a clean checkout:
# creates .env if missing, installs Docker if missing, creates/starts a local
# Mongo container (persisted in a named volume) if missing, seeds it with the
# synthetic dev fixture (scripts/seed-dev-db.ts) if it's empty, then starts the
# dashboard dev server. Ctrl+C stops both the dashboard and the Mongo container.

mongo_container := "gastos-gub-mongo"
mongo_volume := "gastos-gub-mongo-data"
mongo_port := "27017"

# Bootstrap everything and start the dashboard on http://localhost:3600.
run:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"

    # 1. .env (root + app — dotenv reads relative to cwd, and the Nuxt dev
    #    server's cwd is app/, so both need one).
    if [ ! -f .env ]; then
      echo "→ creating .env"
      printf 'MONGODB_URI=mongodb://localhost:27017/gastos_gub\nPORT=3600\nNODE_ENV=development\n' > .env
    fi
    if [ ! -f app/.env ]; then
      echo "→ creating app/.env"
      cp .env app/.env
    fi

    # 2. docker
    if ! command -v docker >/dev/null 2>&1; then
      echo "→ docker not found, installing (needs sudo)…"
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y && sudo apt-get install -y docker.io
        sudo systemctl enable --now docker
        sudo usermod -aG docker "$USER" || true
      else
        echo "✗ don't know how to install docker on this system — install it manually and re-run 'just run'." >&2
        exit 1
      fi
    fi
    if ! docker ps >/dev/null 2>&1; then
      echo "✗ docker is installed but not usable by $USER (permission denied)." >&2
      echo "  If docker was just installed, run 'newgrp docker' (or log out/in) and re-run 'just run'." >&2
      exit 1
    fi

    # 3. mongo container (named volume so data survives stop/start, not just --rm)
    if [ -z "$(docker ps -aq -f name=^{{mongo_container}}$)" ]; then
      echo "→ creating mongo container '{{mongo_container}}'"
      docker run -d --name "{{mongo_container}}" -p {{mongo_port}}:27017 \
        -v "{{mongo_volume}}:/data/db" mongo:7 >/dev/null
    elif [ -z "$(docker ps -q -f name=^{{mongo_container}}$ -f status=running)" ]; then
      echo "→ starting mongo container '{{mongo_container}}'"
      docker start "{{mongo_container}}" >/dev/null
    fi

    echo "→ waiting for mongo…"
    for i in $(seq 1 30); do
      docker exec "{{mongo_container}}" mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1 && break
      sleep 1
    done

    # 4. dependencies — only reinstall when node_modules is missing or
    #    package.json/package-lock.json changed since the last install (hashed
    #    into a stamp file inside node_modules, so a plain re-run is a no-op).
    ensure_deps() {
      local dir="$1" stamp current
      stamp="$dir/node_modules/.deps-stamp"
      current="$(cat "$dir/package.json" "$dir/package-lock.json" 2>/dev/null | sha256sum | cut -d' ' -f1)"
      if [ -f "$stamp" ] && [ "$(cat "$stamp" 2>/dev/null)" = "$current" ]; then
        return
      fi
      echo "→ npm install ($dir)"
      (cd "$dir" && npm install)
      echo "$current" > "$stamp"
    }
    ensure_deps .
    ensure_deps app

    # 5. seed the fixture if the database is empty.
    COUNT="$(docker exec "{{mongo_container}}" mongosh gastos_gub --quiet \
      --eval 'db.releases.countDocuments()' 2>/dev/null || echo 0)"
    if [ "$COUNT" = "0" ]; then
      echo "→ database is empty, seeding dev fixture…"
      npm run seed:dev
    else
      echo "→ already seeded ($COUNT releases)"
    fi

    # 6. run the dashboard; Ctrl+C stops it AND the mongo container.
    CLEANED_UP=""
    cleanup() {
      [ -n "$CLEANED_UP" ] && return
      CLEANED_UP=1
      echo ""
      echo "→ stopping…"
      [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null || true
      docker stop "{{mongo_container}}" >/dev/null 2>&1 || true
    }
    trap cleanup INT TERM EXIT

    echo "→ starting dashboard on http://localhost:3600"
    npm --prefix app run dev &
    APP_PID=$!
    wait "$APP_PID"
