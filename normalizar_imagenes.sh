#!/bin/bash
# Script para normalizar nombres de imágenes a formato numérico (1.jpg, 2.jpg, etc.)
# Ejecutar desde la raíz del proyecto

echo "🖼️  Normalizando nombres de imágenes..."
echo ""

# Función para normalizar una carpeta
normalizar_carpeta() {
    local carpeta=$1
    local extension=$2
    
    if [ ! -d "img/$carpeta" ]; then
        echo "⚠️  Carpeta img/$carpeta no existe, saltando..."
        return
    fi
    
    echo "📁 Normalizando: img/$carpeta"
    cd "img/$carpeta"
    
    # Contador
    contador=1
    
    # Procesar archivos según extensión
    for archivo in *.$extension; do
        if [ -f "$archivo" ]; then
            nuevo_nombre="${contador}.${extension}"
            if [ "$archivo" != "$nuevo_nombre" ]; then
                echo "  Renombrando: $archivo -> $nuevo_nombre"
                mv "$archivo" "$nuevo_nombre" 2>/dev/null || echo "    ⚠️  Error al renombrar $archivo"
            fi
            contador=$((contador + 1))
        fi
    done
    
    cd ../..
    echo "✅ img/$carpeta normalizada"
    echo ""
}

# Normalizar carpetas principales
echo "Normalizando imágenes JPG..."
normalizar_carpeta "OBRA" "jpg"
normalizar_carpeta "ODILA DUPEYRON" "jpg"
normalizar_carpeta "ARIEL DE LA PEÑA" "jpg"
normalizar_carpeta "HUMBERTO DUPEYRON" "jpg"
normalizar_carpeta "CARTEL ROTATORIO" "jpg"

echo "Normalizando imágenes PNG..."
normalizar_carpeta "CARTEL INFORMATIVO" "png"
normalizar_carpeta "CARTEL PRINCIPAL" "png"

echo "✨ Normalización completada!"
echo ""
echo "📝 Nota: Revisa manualmente las carpetas para asegurar que todo esté correcto."
echo "   Algunos archivos pueden necesitar ajustes manuales."
