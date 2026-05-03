#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.site.env"
SERVICE_TEMPLATE="$ROOT_DIR/deploy/cleber-corretor-site.service.example"
SERVICE_TARGET="/etc/systemd/system/cleber-corretor-site.service"
DEFAULT_PORT="8081"
DEFAULT_HOST="0.0.0.0"
DEFAULT_SITE_ORIGIN="https://imoveis.codeflowsoluctions.com"
DEFAULT_API_BASE="https://cadastro.codeflowsoluctions.com"
DEFAULT_SITE_NAME="Cléber Corretor"

log() {
  printf '\n[site-install] %s\n' "$*"
}

warn() {
  printf '\n[site-install][aviso] %s\n' "$*" >&2
}

ensure_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Comando obrigatório não encontrado: $cmd" >&2
    exit 1
  fi
}

ensure_systemctl() {
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemctl não encontrado. Este instalador exige systemd." >&2
    exit 1
  fi
}

run_privileged() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

prompt_default() {
  local label="$1"
  local default_value="$2"
  local answer
  read -r -p "$label [$default_value]: " answer
  printf '%s' "${answer:-$default_value}"
}

escape_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

write_env_file() {
  local site_origin="$1"
  local api_base="$2"
  local site_name="$3"
  local port="$4"
  local host="$5"

  umask 077
  cat > "$ENV_FILE" <<EOF
PORT=$port
HOST=$host
CC_SITE_ORIGIN=$(escape_env_value "$site_origin")
CC_API_BASE=$(escape_env_value "$api_base")
CC_SITE_NAME=$(escape_env_value "$site_name")
EOF
  chmod 600 "$ENV_FILE"
}

publish_service() {
  local node_bin="$1"
  local run_user="$2"
  local run_group="$3"
  local rendered_service
  rendered_service="$(mktemp)"

  sed \
    -e "s|__WORKDIR__|$ROOT_DIR|g" \
    -e "s|__ENV_FILE__|$ENV_FILE|g" \
    -e "s|__NODE_BIN__|$node_bin|g" \
    -e "s|__RUN_USER__|$run_user|g" \
    -e "s|__RUN_GROUP__|$run_group|g" \
    "$SERVICE_TEMPLATE" > "$rendered_service"

  run_privileged install -m 644 "$rendered_service" "$SERVICE_TARGET"
  rm -f "$rendered_service"
}

ensure_firewall_port() {
  local port="$1"

  if command -v ufw >/dev/null 2>&1; then
    local ufw_status
    ufw_status="$(run_privileged ufw status 2>/dev/null || true)"

    if grep -q '^Status: inactive' <<<"$ufw_status"; then
      warn "UFW instalado, mas inativo. A porta ${port}/tcp não foi alterada."
      return 0
    fi

    if grep -Eq "^[[:space:]]*${port}/tcp[[:space:]]+ALLOW" <<<"$ufw_status"; then
      log "Firewall UFW já permite a porta ${port}/tcp"
      return 0
    fi

    log "Liberando ${port}/tcp no UFW de forma persistente"
    run_privileged ufw allow "${port}/tcp" comment 'Cléber Corretor Site'
    return 0
  fi

  if command -v firewall-cmd >/dev/null 2>&1; then
    if run_privileged firewall-cmd --state >/dev/null 2>&1; then
      if run_privileged firewall-cmd --query-port="${port}/tcp" >/dev/null 2>&1; then
        log "Firewall firewalld já permite a porta ${port}/tcp"
      else
        log "Liberando ${port}/tcp no firewalld de forma persistente"
        run_privileged firewall-cmd --permanent --add-port="${port}/tcp"
        run_privileged firewall-cmd --reload
      fi
      return 0
    fi

    warn "firewalld instalado, mas inativo. A porta ${port}/tcp não foi alterada."
    return 0
  fi

  warn "Nenhum firewall compatível encontrado (ufw/firewalld). Verifique a porta ${port}/tcp manualmente."
}

main() {
  ensure_systemctl
  ensure_cmd node
  ensure_cmd curl

  if [[ ! -f "$SERVICE_TEMPLATE" ]]; then
    echo "Template do service não encontrado: $SERVICE_TEMPLATE" >&2
    exit 1
  fi

  local service_user service_group node_bin site_origin api_base site_name port host
  service_user="${SUDO_USER:-$(logname 2>/dev/null || true)}"
  service_user="${service_user:-$(id -un)}"
  service_group="$(id -gn "$service_user")"
  node_bin="$(command -v node)"

  log "Validando o servidor do site"
  node --check "$ROOT_DIR/site-server.js"

  log "Digite os dados da instalação"
  site_origin="$(prompt_default 'URL pública do site' "$DEFAULT_SITE_ORIGIN")"
  api_base="$(prompt_default 'URL da API pública do backend' "$DEFAULT_API_BASE")"
  site_name="$(prompt_default 'Nome do site' "$DEFAULT_SITE_NAME")"
  port="$DEFAULT_PORT"
  host="$DEFAULT_HOST"

  log "Gravando configuração em $ENV_FILE"
  write_env_file "$site_origin" "$api_base" "$site_name" "$port" "$host"

  log "Verificando/liberando a porta ${port}/tcp no firewall"
  ensure_firewall_port "$port"

  log "Publicando service systemd"
  publish_service "$node_bin" "$service_user" "$service_group"

  log "Recarregando systemd e iniciando o serviço"
  run_privileged systemctl daemon-reload
  run_privileged systemctl enable --now cleber-corretor-site

  log "Aguardando o site responder"
  local ok=0
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:${port}/config.js" >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done

  if [[ "$ok" -ne 1 ]]; then
    echo "O site não respondeu na porta ${port}." >&2
    run_privileged systemctl status cleber-corretor-site --no-pager -l >&2 || true
    run_privileged journalctl -u cleber-corretor-site -n 60 --no-pager >&2 || true
    exit 1
  fi

  cat <<EOF

Instalação concluída.

- Site: http://127.0.0.1:${port}/
- Config: http://127.0.0.1:${port}/config.js
- Service: ${SERVICE_TARGET}
- Config local: ${ENV_FILE}

Agora falta só apontar o Nginx Proxy Manager para o upstream correto.
EOF
}

main "$@"
