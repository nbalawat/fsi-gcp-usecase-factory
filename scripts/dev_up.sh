#!/usr/bin/env bash
# scripts/dev_up.sh — bring up the local demo stack.
#
# Starts (and idempotently restarts):
#   1. Cloud SQL Auth Proxy on 127.0.0.1:5432  (downloads the binary if missing)
#   2. The Atrium pipeline-console dev server on http://localhost:3000
#      with DB env vars wired so the SSE stream + portfolio + memo all read live.
#
# Usage:
#   bash scripts/dev_up.sh                          # foreground, exits when you Ctrl-C
#   bash scripts/dev_up.sh --background             # detach; tail logs in /tmp/atrium-*.log
#   bash scripts/dev_up.sh --stop                   # kill the proxy + dev server
#   bash scripts/dev_up.sh --status                 # show what's running
#
# Env overrides (all optional):
#   GCP_PROJECT      default: agentic-experiments
#   GCP_REGION       default: us-central1
#   SQL_INSTANCE     default: fsi-banking-dev
#   DB_PASS_SECRET   default: fsi-banking-db-pass-dev
#   PORT             default: 3000

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${GCP_PROJECT:-agentic-experiments}"
REGION="${GCP_REGION:-us-central1}"
SQL_INSTANCE="${SQL_INSTANCE:-fsi-banking-dev}"
DB_PASS_SECRET="${DB_PASS_SECRET:-fsi-banking-db-pass-dev}"
DB_USER="${DB_USER:-fsi_app}"
DB_NAME="${DB_NAME:-fsi_banking}"
DB_PORT="${DB_PORT:-5432}"
PORT="${PORT:-3000}"
KEY_FILE="${GOOGLE_APPLICATION_CREDENTIALS:-$REPO_ROOT/keys/agentic-experiments-71fb77221637.json}"

PROXY_BIN="/tmp/cloud-sql-proxy"
PROXY_LOG="/tmp/atrium-proxy.log"
DEV_LOG="/tmp/atrium-dev.log"
PROXY_PID="/tmp/atrium-proxy.pid"
DEV_PID="/tmp/atrium-dev.pid"

c_red()   { printf "\033[31m%s\033[0m\n" "$*"; }
c_grn()   { printf "\033[32m%s\033[0m\n" "$*"; }
c_dim()   { printf "\033[90m%s\033[0m\n" "$*"; }
c_bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

ensure_proxy_binary() {
    if [ -x "$PROXY_BIN" ] && "$PROXY_BIN" --version >/dev/null 2>&1; then
        return 0
    fi
    c_dim "→ downloading cloud-sql-proxy …"
    local arch
    arch="$(uname -m)"
    local pkg
    case "$arch" in
        arm64|aarch64) pkg="darwin.arm64" ;;
        x86_64|amd64)  pkg="darwin.amd64" ;;
        *) c_red "unsupported arch: $arch"; return 1 ;;
    esac
    rm -f "$PROXY_BIN"
    curl -sL -o "$PROXY_BIN" \
        "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.18.1/cloud-sql-proxy.${pkg}"
    chmod +x "$PROXY_BIN"
    "$PROXY_BIN" --version >/dev/null 2>&1
}

is_pid_alive() {
    local pid="${1:-}"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

stop_one() {
    local name="$1" pid_file="$2"
    if [ -f "$pid_file" ]; then
        local pid
        pid="$(cat "$pid_file" 2>/dev/null || true)"
        if is_pid_alive "$pid"; then
            c_dim "→ stopping $name (pid=$pid)"
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$pid_file"
    fi
}

stop_all() {
    stop_one "cloud-sql-proxy" "$PROXY_PID"
    stop_one "next-dev" "$DEV_PID"
    # Last-ditch: kill anything still bound to our ports
    pkill -f "cloud-sql-proxy.*${SQL_INSTANCE}" 2>/dev/null || true
    pkill -f "next dev -p ${PORT}" 2>/dev/null || true
    c_grn "✓ stopped"
}

start_proxy() {
    if [ -f "$PROXY_PID" ] && is_pid_alive "$(cat "$PROXY_PID")"; then
        c_dim "→ proxy already running (pid=$(cat "$PROXY_PID"))"
        return 0
    fi
    ensure_proxy_binary
    c_dim "→ starting cloud-sql-proxy on 127.0.0.1:${DB_PORT} …"
    GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE" \
        nohup "$PROXY_BIN" \
            --port="$DB_PORT" \
            --credentials-file="$KEY_FILE" \
            "${PROJECT}:${REGION}:${SQL_INSTANCE}" \
            > "$PROXY_LOG" 2>&1 &
    echo "$!" > "$PROXY_PID"
    # wait until listening
    local i=0
    until nc -z 127.0.0.1 "$DB_PORT" 2>/dev/null; do
        sleep 0.5; i=$((i+1))
        if [ "$i" -gt 30 ]; then
            c_red "proxy never listened on ${DB_PORT}; see $PROXY_LOG"
            return 1
        fi
    done
    c_grn "✓ cloud-sql-proxy ready on 127.0.0.1:${DB_PORT}  (log: $PROXY_LOG)"
}

start_dev() {
    if [ -f "$DEV_PID" ] && is_pid_alive "$(cat "$DEV_PID")"; then
        c_dim "→ dev server already running (pid=$(cat "$DEV_PID"))"
        return 0
    fi
    c_dim "→ fetching DB password from Secret Manager ($DB_PASS_SECRET) …"
    local pw
    pw="$(gcloud secrets versions access latest --secret="$DB_PASS_SECRET" --project="$PROJECT" 2>/dev/null)"
    if [ -z "$pw" ]; then
        c_red "could not read secret $DB_PASS_SECRET; is gcloud auth set up?"
        return 1
    fi

    c_dim "→ starting Next.js dev server on http://localhost:${PORT} …"
    cd "$REPO_ROOT/ui"
    DB_HOST=127.0.0.1 \
    DB_PORT="$DB_PORT" \
    DB_USER="$DB_USER" \
    DB_NAME="$DB_NAME" \
    DB_PASS="$pw" \
    GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE" \
    GCP_PROJECT="$PROJECT" \
    GCP_REGION="$REGION" \
    nohup pnpm --filter pipeline-console dev > "$DEV_LOG" 2>&1 &
    echo "$!" > "$DEV_PID"

    # wait until http is answering
    local i=0
    until curl -s -m 2 -o /dev/null -w "%{http_code}" "http://localhost:${PORT}" 2>/dev/null | grep -qE "200|500"; do
        sleep 1; i=$((i+1))
        if [ "$i" -gt 60 ]; then
            c_red "dev server never answered on ${PORT}; see $DEV_LOG"
            return 1
        fi
    done
    c_grn "✓ pipeline-console ready on http://localhost:${PORT}  (log: $DEV_LOG)"
}

status() {
    local p_pid="$(cat "$PROXY_PID" 2>/dev/null || true)"
    local d_pid="$(cat "$DEV_PID" 2>/dev/null || true)"
    if is_pid_alive "$p_pid"; then c_grn "cloud-sql-proxy:  RUNNING (pid=$p_pid)  log: $PROXY_LOG"
    else                          c_red "cloud-sql-proxy:  stopped"; fi
    if is_pid_alive "$d_pid"; then c_grn "pipeline-console: RUNNING (pid=$d_pid)  log: $DEV_LOG  http://localhost:${PORT}"
    else                          c_red "pipeline-console: stopped"; fi
}

case "${1:-}" in
    --stop|stop)        stop_all; exit 0 ;;
    --status|status)    status; exit 0 ;;
    --restart|restart)  stop_all; ;;
esac

c_bold "═══ Atrium dev stack ═══"
start_proxy || exit 1
start_dev   || exit 1
echo
status
echo
c_bold "Open: http://localhost:${PORT}"
c_dim  "Stop with: bash scripts/dev_up.sh --stop"
c_dim  "Logs:      tail -f $PROXY_LOG  /  tail -f $DEV_LOG"

if [ "${1:-}" != "--background" ]; then
    echo
    c_dim "Tailing dev server log (Ctrl-C to detach; processes keep running) …"
    tail -F "$DEV_LOG"
fi
