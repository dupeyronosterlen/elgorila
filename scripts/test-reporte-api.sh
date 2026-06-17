#!/usr/bin/env bash
# Prueba GET /api/reporte — lee token de CREDENCIALES-AGENCIA.local.txt
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRED="$ROOT/CREDENCIALES-AGENCIA.local.txt"
API="https://elgorila-api.dupeyronosterlen.workers.dev/api/reporte"

if [[ ! -f "$CRED" ]]; then
  echo "Falta $CRED (REPORTE_TOKEN)" >&2
  exit 1
fi

TOKEN=$(grep -A1 '^REPORTE_TOKEN:' "$CRED" | tail -1 | tr -d '[:space:]')
if [[ -z "$TOKEN" ]]; then
  echo "No se encontró REPORTE_TOKEN en $CRED" >&2
  exit 1
fi

echo "GET $API"
curl -sS -H "Authorization: Bearer $TOKEN" "$API" | python3 -m json.tool 2>/dev/null | head -80
echo ""
echo "OK — reporte responde (mostrando primeras líneas)"
