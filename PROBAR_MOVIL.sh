#!/bin/bash
# Script para probar la página en móvil

echo "📱 Configurando servidor para pruebas móviles..."
echo ""

# Obtener IP local
IP=$(ipconfig getifaddr en0 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')

if [ -z "$IP" ]; then
    echo "❌ No se pudo encontrar tu IP local"
    echo "💡 Usa: ifconfig o ipconfig para encontrarla manualmente"
    exit 1
fi

echo "✅ Tu IP local es: $IP"
echo ""
echo "🌐 Iniciando servidor accesible desde tu móvil..."
echo ""
echo "📱 Para acceder desde tu móvil:"
echo "   http://$IP:8000"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   - Tu móvil debe estar en la misma red WiFi"
echo "   - Asegúrate de que el firewall permita conexiones en el puerto 8000"
echo ""
echo "Presiona Ctrl+C para detener el servidor"
echo ""

# Iniciar servidor accesible en red local
python3 -m http.server 8000 --bind 0.0.0.0
