#!/bin/sh

set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$ROOT_DIR"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "Se creo .env a partir de .env.example"
fi

DOCKER_BIN="docker"
if command -v docker.exe >/dev/null 2>&1; then
  if docker.exe info >/dev/null 2>&1; then
    DOCKER_BIN="docker.exe"
  fi
fi

if ! $DOCKER_BIN info >/dev/null 2>&1; then
  echo "Error: Docker daemon no disponible."
  echo "Abri Docker Desktop y volve a ejecutar: bash scripts/dev.sh"
  exit 1
fi

detect_host_ip() {
  # 1. Try detect-ip.js
  for node_cmd in node node.exe "/c/Program Files/nodejs/node.exe"; do
    if command -v "$node_cmd" >/dev/null 2>&1 || [ -x "$node_cmd" ]; then
      _ip=$("$node_cmd" "$ROOT_DIR/scripts/detect-ip.js" 2>/dev/null | tr -d '\r\n')
      if [ -n "$_ip" ] && [ "$_ip" != "127.0.0.1" ]; then
        echo "$_ip"
        return
      fi
    fi
  done

  # 2. Try PowerShell
  for ps_cmd in powershell.exe "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"; do
    if command -v "$ps_cmd" >/dev/null 2>&1 || [ -x "$ps_cmd" ]; then
      _ip=$("$ps_cmd" -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex).IPAddress" 2>/dev/null | tr -d '\r\n')
      if [ -n "$_ip" ]; then
        echo "$_ip"
        return
      fi
    fi
  done

  # 3. Fallback
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1"
}

HOST_IP="${EXPO_HOST_IP:-$(detect_host_ip)}"
HOST_IP="${HOST_IP:-127.0.0.1}"
export EXPO_PUBLIC_API_URL="http://${HOST_IP}:3000/api"
export REACT_NATIVE_PACKAGER_HOSTNAME="${HOST_IP}"

EAS_PROJECT_ID=""
if [ -f .env ]; then
  EAS_PROJECT_ID=$(grep '^EXPO_PUBLIC_EAS_PROJECT_ID=' .env | head -n 1 | cut -d '=' -f 2-)
fi

# Expo inyecta EXPO_PUBLIC_* leyendo .env/.env.local al bundlear.
# Guardamos vars dinamicas para evitar fallback a localhost en dispositivos fisicos.
{
  printf 'EXPO_PUBLIC_API_URL=%s\n' "$EXPO_PUBLIC_API_URL"
  if [ -n "$EAS_PROJECT_ID" ]; then
    printf 'EXPO_PUBLIC_EAS_PROJECT_ID=%s\n' "$EAS_PROJECT_ID"
  fi
} > .env.local

echo "EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL"
if [ -n "$EAS_PROJECT_ID" ]; then
  echo "EXPO_PUBLIC_EAS_PROJECT_ID configurado"
else
  echo "EXPO_PUBLIC_EAS_PROJECT_ID no configurado (push remoto se omite en Expo Go)"
fi

$DOCKER_BIN compose up --build "$@"

# Tras levantar el stack, migrá los datos del db.json si es la primera vez:
# docker compose exec backend npm run seed