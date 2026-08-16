# Local dev bootstrap, for a contributor with no database. `just run` gets a
# working dashboard from a clean checkout: creates .env if missing, creates and
# starts a local Mongo container (persisted in a named volume), seeds it with
# the synthetic dev fixture (scripts/seed-dev-db.ts) if it's empty, then starts
# the dashboard dev server. Ctrl+C stops both the dashboard and the container.
#
# `just run` is deliberately LOCAL-ONLY and refuses to proceed against a remote
# MONGODB_URI, because seeding wipes `releases`. If you already have a .env
# pointing at a shared database, use `just dev` — it starts nothing but Nuxt.
#
# Bash/Docker only; on Windows use `npm --prefix app run dev` directly.

mongo_container := "gastos-gub-mongo"
mongo_volume := "gastos-gub-mongo-data"
mongo_port := "27017"

# Ports a dashboard can end up on. 3600 is what .env configures; 3000 is Nuxt's
# default, which is where a dev server lands when it was started from a
# directory where app/.env isn't picked up. Leaving one of each running serves
# two DIFFERENT builds on two ports, and you debug the one you aren't editing.
app_ports := "3600 3000"

# Start the dashboard against whatever .env already says. No container, no seed.
dev:
    npm --prefix app run dev

# Free the app ports. ONLY processes whose working directory is inside this
# checkout are killed: 3000 is Node's default port, so anything at all can be
# sitting on it — another project's dev server included. A process we cannot
# identify is reported and left alone.
#
# This lives in its own recipe so `stop` and `run` share one copy, and so `stop`
# stays line-based: `just` strips the `-` (ignore-error) prefix only in the
# linewise path, so a `-docker stop` inside a shebang recipe would reach bash
# verbatim and fail with `-docker: command not found`.
_free-ports:
    #!/usr/bin/env bash
    set -uo pipefail

    repo="$(cd "{{justfile_directory()}}" && pwd -P)"

    port_pids() {
      local pids
      pids="$(lsof -ti "tcp:$1" 2>/dev/null || true)"
      if [ -z "$pids" ]; then
        # `grep -o` + `cut`, not `grep -oP`: -P is GNU-only, and one ss line can
        # carry several pid= entries.
        pids="$(ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
      fi
      echo "$pids"
    }

    proc_cwd() {
      if [ -r "/proc/$1/cwd" ]; then
        readlink -f "/proc/$1/cwd" 2>/dev/null || true
      else
        lsof -a -d cwd -p "$1" -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
      fi
    }

    for port in {{app_ports}}; do
      mine=""
      for pid in $(port_pids "$port"); do
        cwd="$(proc_cwd "$pid")"
        case "${cwd:-}" in
          "$repo" | "$repo"/*) mine="$mine $pid" ;;
          '') echo "→ port $port: cannot read pid $pid's working directory, leaving it alone" ;;
          *) echo "→ port $port: pid $pid runs from $cwd, not this checkout — leaving it alone" ;;
        esac
      done
      if [ -n "$mine" ]; then
        echo "→ freeing port $port (pid$mine)"
        kill $mine 2>/dev/null || true
      fi
    done

# Stop the local Mongo container and any dashboard still holding an app port.
stop: _free-ports
    -docker stop "{{mongo_container}}"

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

    # An EXISTING .env usually points at the shared remote database, and this
    # recipe is built entirely around a local container: it would start Mongo,
    # find it empty, and hand the seeder a remote URI that the seeder's safety
    # guard correctly refuses — aborting the whole bootstrap at the last step.
    # Say so now instead, and point at the recipe that skips the local stack.
    if ! grep -qE '^MONGODB_URI=mongodb://(localhost|127\.0\.0\.1|mongo)(:[0-9]+)?/' .env; then
      echo "✗ .env already points at a non-local MONGODB_URI." >&2
      echo "  'just run' bootstraps a LOCAL Mongo container and will not seed over a remote database." >&2
      echo "  Run 'just dev' to start the dashboard against your existing .env, or point MONGODB_URI" >&2
      echo "  at mongodb://localhost:27017/gastos_gub to use the local fixture." >&2
      exit 1
    fi

    # 2. docker — printed, not run. Installing system packages and changing
    #    group membership on someone's machine is not a bootstrap script's call.
    if ! command -v docker >/dev/null 2>&1; then
      echo "✗ docker not found. Install it, then re-run 'just run'." >&2
      if command -v apt-get >/dev/null 2>&1; then
        echo "  sudo apt-get update -y && sudo apt-get install -y docker.io" >&2
        echo "  sudo systemctl enable --now docker" >&2
        echo "  sudo usermod -aG docker \"$USER\"   # then 'newgrp docker' or log out/in" >&2
      fi
      exit 1
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
    #
    # Whatever already holds an app port goes first. A previous run killed with
    # SIGKILL, or a `npm run dev` started by hand from a subdirectory (which
    # misses app/.env and so listens on 3000 instead of 3600), leaves a server
    # serving a stale build — and then the page you are looking at is not the
    # code you are editing. Both ports are freed on the way in and on the way out.
    "{{just_executable()}}" _free-ports || true

    CLEANED_UP=""
    cleanup() {
      [ -n "$CLEANED_UP" ] && return
      CLEANED_UP=1
      echo ""
      echo "→ stopping…"
      [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null || true
      "{{just_executable()}}" _free-ports || true
      docker stop "{{mongo_container}}" >/dev/null 2>&1 || true
    }
    trap cleanup INT TERM EXIT

    echo "→ starting dashboard on http://localhost:3600"
    npm --prefix app run dev &
    APP_PID=$!
    wait "$APP_PID"
