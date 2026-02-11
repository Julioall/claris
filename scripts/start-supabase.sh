#!/bin/sh
set -eu

RUNNER_CONTAINER_NAME="${RUNNER_CONTAINER_NAME:-moodle-monitor-supabase}"
SUPABASE_API_URL="${SUPABASE_API_URL:-http://127.0.0.1:54321}"
SUPABASE_API_HEALTH_PATH="${SUPABASE_API_HEALTH_PATH:-/rest/v1/}"
SUPABASE_API_WAIT_SECONDS="${SUPABASE_API_WAIT_SECONDS:-60}"

log() {
  printf '[supabase-runner] %s\n' "$*"
}

resolve_workdir() {
  mount_source="$(docker inspect "${RUNNER_CONTAINER_NAME}" --format '{{ range .Mounts }}{{ if eq .Destination "/workspace" }}{{ .Source }}{{ end }}{{ end }}' 2>/dev/null || true)"
  if [ -z "${mount_source}" ]; then
    echo "/workspace"
    return
  fi

  case "${mount_source}" in
    [A-Za-z]:\\*)
      drive="$(printf '%s' "${mount_source}" | cut -d: -f1 | tr 'A-Z' 'a-z')"
      rest="$(printf '%s' "${mount_source}" | cut -d: -f2- | sed 's#\\#/#g')"
      echo "/${drive}${rest}"
      ;;
    *)
      echo "${mount_source}"
      ;;
  esac
}

WORKDIR="${SUPABASE_WORKDIR:-$(resolve_workdir)}"

run_supabase() {
  supabase "$@" --workdir "$WORKDIR"
}

wait_for_api() {
  health_url="${SUPABASE_API_URL%/}${SUPABASE_API_HEALTH_PATH}"
  retries="${SUPABASE_API_WAIT_SECONDS}"

  while [ "${retries}" -gt 0 ]; do
    if curl -fsS "${health_url}" >/dev/null 2>&1; then
      return 0
    fi

    retries=$((retries - 1))
    sleep 1
  done

  log "Timed out waiting for Supabase API at ${health_url}."
  return 1
}

prepare_workdir_alias() {
  if [ "${WORKDIR}" = "/workspace" ]; then
    return
  fi

  mkdir -p "$(dirname "${WORKDIR}")"
  ln -sfn /workspace "${WORKDIR}"
}

cleanup() {
  log "Stopping Supabase local stack..."
  run_supabase stop --no-backup || true
  exit 0
}

trap cleanup INT TERM

prepare_workdir_alias

log "Using workdir: ${WORKDIR}"
cd "${WORKDIR}"
log "Starting Supabase local stack from ${WORKDIR}..."
run_supabase start

log "Waiting for Supabase API to become healthy..."
wait_for_api

log "Applying pending migrations..."
run_supabase migration up --local --include-all

log "Supabase stack is running at ${SUPABASE_API_URL}."
while :; do
  sleep 3600 &
  wait $!
done
