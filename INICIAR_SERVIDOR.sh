#!/bin/bash
# Script para iniciar un servidor local y probar la página

echo "🚀 Iniciando servidor local..."
echo "📂 Directorio: $(pwd)"
echo ""
echo "🌐 Abre tu navegador en: http://localhost:8000"
echo ""
echo "Presiona Ctrl+C para detener el servidor"
echo ""

# Intentar usar Python 3
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
# Si no hay Python, intentar con Python 2
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer 8000
# Si no hay Python, usar Node.js http-server
elif command -v npx &> /dev/null; then
    npx http-server -p 8000
else
    echo "❌ Error: Necesitas Python o Node.js instalado"
    echo "Instala Python desde: https://www.python.org/downloads/"
    exit 1
fi
