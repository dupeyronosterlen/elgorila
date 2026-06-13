#!/usr/bin/env bash
# Sube secrets de Google Wallet al Worker elgorila-api.
# Uso:
#   ./scripts/setup-google-wallet-secrets.sh /ruta/al-service-account.json
#
# Issuer ID fijo del proyecto (Google Wallet Console):
ISSUER_ID="3388000000023157310"

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 /ruta/al-service-account.json"
  echo ""
  echo "Pasos previos:"
  echo "  1. Google Cloud → Service Accounts → crear elgorila-wallet → descargar JSON"
  echo "  2. Wallet Console → Register REST API → agregar el client_email del JSON"
  exit 1
fi

JSON_FILE="$1"
if [[ ! -f "$JSON_FILE" ]]; then
  echo "No existe: $JSON_FILE"
  exit 1
fi

if ! python3 -c "import json; d=json.load(open('$JSON_FILE')); assert d.get('type')=='service_account' and d.get('private_key')"; then
  echo "El archivo no parece un service account JSON válido."
  exit 1
fi

echo "→ GOOGLE_WALLET_ISSUER_ID = $ISSUER_ID"
printf '%s' "$ISSUER_ID" | wrangler secret put GOOGLE_WALLET_ISSUER_ID

echo "→ GOOGLE_WALLET_SA_JSON (desde $JSON_FILE)"
python3 -c "import json; print(json.dumps(json.load(open('$JSON_FILE'))))" | wrangler secret put GOOGLE_WALLET_SA_JSON

echo "→ wrangler deploy"
wrangler deploy

echo ""
echo "Probar:"
echo "  curl -s \"https://elgorila-api.dupeyronosterlen.workers.dev/api/wilberto/venta/CERT-ORD-15F11890F6FC/wallet\" | python3 -m json.tool"
