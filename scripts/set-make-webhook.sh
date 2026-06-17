#!/usr/bin/env bash
# Sube MAKE_WEBHOOK_URL a Cloudflare Worker elgorila-api
set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Uso: $0 https://hook.eu1.make.com/XXXXXXXX"
  echo "Pega la URL del webhook del escenario A en Make."
  exit 1
fi

if [[ ! "$URL" =~ ^https://hook\. ]]; then
  echo "Advertencia: la URL no parece un webhook Make (hook.*.make.com)" >&2
  read -r -p "¿Continuar? [y/N] " ok
  [[ "$ok" =~ ^[yY] ]] || exit 1
fi

cd "$(dirname "$0")/.."
echo "$URL" | npx wrangler secret put MAKE_WEBHOOK_URL
echo "✅ MAKE_WEBHOOK_URL configurado. Haz una venta de prueba o:"
echo "   curl -X POST \"$URL\" -H 'Content-Type: application/json' -d @agencia/ejemplo-venta-webhook.json"
