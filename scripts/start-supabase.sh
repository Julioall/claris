#!/bin/sh
set -eu

RUNNER_CONTAINER_NAME="${RUNNER_CONTAINER_NAME:-claris-supabase}"
EVOLUTION_CONTAINER_NAME="${EVOLUTION_CONTAINER_NAME:-claris-evolution}"
SUPABASE_API_URL="${SUPABASE_API_URL:-http://127.0.0.1:54321}"
SUPABASE_API_HEALTH_PATH="${SUPABASE_API_HEALTH_PATH:-/rest/v1/}"
SUPABASE_API_WAIT_SECONDS="${SUPABASE_API_WAIT_SECONDS:-300}"

log() {
  printf '[supabase-runner] %s\n' "$*"
}

resolve_workdir() {
  mount_source="$(docker inspect "${RUNNER_CONTAINER_NAME}" --format '{{ range .Mounts }}{{ if eq .Destination "/workspace" }}{{ .Source }}{{ end }}{{ end }}' 2>/dev/null || true)"
  if [ -z "${mount_source}" ]; then
    echo "/workspace"
    return
  fi

  if printf '%s' "${mount_source}" | cut -c1-2 | grep -Eq '^[A-Za-z]:$'; then
    drive="$(printf '%s' "${mount_source}" | cut -d: -f1 | tr 'A-Z' 'a-z')"
    rest="$(printf '%s' "${mount_source}" | cut -d: -f2- | sed 's#\\#/#g')"
    echo "/${drive}${rest}"
    return
  fi

  echo "${mount_source}"
}

WORKDIR="${SUPABASE_WORKDIR:-$(resolve_workdir)}"

run_supabase() {
  supabase "$@" --workdir "$WORKDIR"
}

generate_app_database_types() {
  target_file="${WORKDIR}/src/integrations/supabase/types.ts"
  temp_file="${target_file}.tmp"

  mkdir -p "$(dirname "${target_file}")"

  if ! run_supabase gen types typescript --local --schema public > "${temp_file}"; then
    rm -f "${temp_file}"
    log "Failed to generate application Supabase types."
    return 1
  fi

  if [ -f "${target_file}" ] && cmp -s "${temp_file}" "${target_file}"; then
    rm -f "${temp_file}"
    log "Application Supabase types already in sync."
    return 0
  fi

  mv "${temp_file}" "${target_file}"
  log "Application Supabase types regenerated from local schema."
}

sync_edge_database_types() {
  source_file="${WORKDIR}/src/integrations/supabase/types.ts"
  target_file="${WORKDIR}/supabase/functions/_shared/db/generated.types.ts"

  if [ ! -f "${source_file}" ]; then
    log "Skipping Edge Function type sync: ${source_file} not found."
    return
  fi

  mkdir -p "$(dirname "${target_file}")"

  if [ -f "${target_file}" ] && cmp -s "${source_file}" "${target_file}"; then
    log "Edge Function types already in sync."
    return
  fi

  cp "${source_file}" "${target_file}"
  log "Edge Function types synchronized."
}

set_function_secrets() {
  env_file="${WORKDIR}/supabase/functions/.env"
  scheduled_messages_secret="${SCHEDULED_MESSAGES_CRON_SECRET:-claris-scheduled-messages-local-secret}"
  touch "${env_file}"

  write_secret() {
    _key="$1"
    _val="$2"
    [ -z "${_val}" ] && return
    # Remove any existing entry for this key, then append the new value
    { grep -v "^${_key}=" "${env_file}" 2>/dev/null || true; echo "${_key}=${_val}"; } > "${env_file}.tmp"
    mv "${env_file}.tmp" "${env_file}"
  }

  # Edge functions run inside the supabase_edge_runtime container on the
  # supabase_network_local bridge network. From there, 127.0.0.1 is the
  # container's own loopback – NOT the host. The bridge gateway IP is the
  # correct address to reach host-network services (like Evolution API).
  evo_url="${EVOLUTION_API_URL:-http://127.0.0.1:8081}"
  bridge_gw="$(docker network inspect supabase_network_local \
    --format '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
  if [ -n "${bridge_gw}" ]; then
    evo_url="http://${bridge_gw}:8081"
    log "Bridge gateway detected (${bridge_gw}): edge functions will call Evolution API at ${evo_url}."
  fi

  write_secret "EVOLUTION_API_URL" "${evo_url}"
  write_secret "EVOLUTION_API_KEY" "${EVOLUTION_API_KEY:-}"
  write_secret "MOODLE_REAUTH_SECRET" "${MOODLE_REAUTH_SECRET:-}"
  write_secret "SCHEDULED_MESSAGES_CRON_SECRET" "${scheduled_messages_secret}"
  write_secret "SUPABASE_PUBLIC_URL" "${SUPABASE_PUBLIC_URL:-${SUPABASE_API_URL}}"
  write_secret "WEBHOOK_SECRET"    "${WEBHOOK_SECRET:-}"

  log "Edge function secrets written to ${env_file} from docker-compose defaults."
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

restart_evolution_if_present() {
  if [ -z "${EVOLUTION_CONTAINER_NAME}" ]; then
    return
  fi

  if ! docker inspect "${EVOLUTION_CONTAINER_NAME}" >/dev/null 2>&1; then
    log "Skipping Evolution restart: container ${EVOLUTION_CONTAINER_NAME} not found."
    return
  fi

  log "Restarting ${EVOLUTION_CONTAINER_NAME} so it can rerun Prisma migrations against the local database..."
  docker restart "${EVOLUTION_CONTAINER_NAME}" >/dev/null
}

restart_edge_runtime_if_present() {
  edge_runtime_container="$(
    docker ps --format '{{.Names}}' \
      | grep '^supabase_edge_runtime_' \
      | head -n 1 \
      || true
  )"

  if [ -z "${edge_runtime_container}" ]; then
    log "Skipping Edge Runtime restart: container not found."
    return
  fi

  log "Restarting ${edge_runtime_container} so updated Edge Function secrets are loaded..."
  docker restart "${edge_runtime_container}" >/dev/null
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

log "Preparing edge function secrets before startup..."
set_function_secrets

log "Starting Supabase local stack from ${WORKDIR}..."
run_supabase start

log "Waiting for Supabase API to become healthy..."
wait_for_api

log "Applying pending migrations..."
run_supabase migration up --local --include-all

log "Generating Supabase application types from local schema..."
generate_app_database_types

log "Syncing generated Supabase types into Edge Functions..."
sync_edge_database_types

log "Configuring edge function secrets..."
set_function_secrets
restart_edge_runtime_if_present

restart_evolution_if_present

log "Supabase stack is running at ${SUPABASE_API_URL}."
while :; do
  sleep 3600 &
  wait $!
done
