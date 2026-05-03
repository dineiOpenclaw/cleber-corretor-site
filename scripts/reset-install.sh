#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="cleber-corretor-site"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
FW_PORT="8081"
FORCE=0

if [[ "${1:-}" == "--yes" ]]; then
  FORCE=1
fi

run_privileged() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

log() {
  printf '[reset] %s\n' "$*"
}

warn() {
  printf '[reset][aviso] %s\n' "$*" >&2
}

exists_unit() {
  systemctl list-unit-files 2>/dev/null | awk '{print $1}' | grep -qx "$1"
}

cleanup_service() {
  if exists_unit "${SERVICE_NAME}.service"; then
    log "Parando e desabilitando ${SERVICE_NAME}.service"
    run_privileged systemctl stop "${SERVICE_NAME}.service" || true
    run_privileged systemctl disable "${SERVICE_NAME}.service" || true
  else
    log "Serviço ${SERVICE_NAME}.service não encontrado, pulando."
  fi

  if [[ -f "$SERVICE_FILE" ]]; then
    log "Removendo $SERVICE_FILE"
    run_privileged rm -f "$SERVICE_FILE"
    run_privileged systemctl daemon-reload || true
  fi
}

cleanup_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    local ufw_status
    ufw_status="$(ufw status 2>/dev/null || true)"
    if grep -q '^Status: active' <<<"$ufw_status" && grep -Eq "[[:space:]]${FW_PORT}/tcp[[:space:]]+ALLOW" <<<"$ufw_status"; then
      log "Removendo regra UFW ${FW_PORT}/tcp"
      run_privileged ufw --force delete allow "${FW_PORT}/tcp" || true
    fi
  fi

  if command -v firewall-cmd >/dev/null 2>&1; then
    if firewall-cmd --state >/dev/null 2>&1 && firewall-cmd --query-port="${FW_PORT}/tcp" >/dev/null 2>&1; then
      log "Removendo regra firewalld ${FW_PORT}/tcp"
      run_privileged firewall-cmd --permanent --remove-port="${FW_PORT}/tcp" >/dev/null 2>&1 || true
      run_privileged firewall-cmd --reload >/dev/null 2>&1 || true
    fi
  fi
}

cleanup_app_dir() {
  if [[ ! -e "$SITE_DIR" ]]; then
    log "Pasta $SITE_DIR não encontrada, pulando."
    return 0
  fi
  if [[ "$PWD" == "$SITE_DIR" || "$PWD" == "$SITE_DIR"/* ]]; then
    warn "Você está dentro de $SITE_DIR. Saia da pasta antes de rodar este reset."
    exit 1
  fi
  log "Removendo pasta $SITE_DIR"
  run_privileged rm -rf "$SITE_DIR"
}

confirm() {
  cat <<MSG
ATENÇÃO: este reset remove a instalação do Cléber Corretor Site, incluindo:
- pasta do projeto
- serviço cleber-corretor-site
- porta pública 8081, se houver regra de firewall

Use apenas para reinstalação limpa do site.
MSG
  if [[ "$FORCE" -eq 1 ]]; then
    return 0
  fi
  echo
  read -r -p "Digite RESETAR para continuar: " answer
  [[ "$answer" == "RESETAR" ]]
}

main() {
  confirm || { warn 'Reset cancelado.'; exit 1; }
  cleanup_service
  cleanup_firewall
  cleanup_app_dir
  log 'Reset concluído.'
}

main "$@"
