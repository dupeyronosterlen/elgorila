# Cómo Probar la Página en Móvil y Diferentes Dispositivos

## 📱 OPCIÓN 1: Herramientas de Desarrollo del Navegador (Más Fácil)

### Chrome/Edge (Recomendado)
1. Abre tu página: `http://localhost:8000`
2. Presiona `F12` o `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
3. Haz clic en el ícono de dispositivo móvil (📱) o presiona `Cmd+Shift+M` (Mac) / `Ctrl+Shift+M` (Windows)
4. Selecciona un dispositivo:
   - iPhone 12/13/14
   - Samsung Galaxy
   - iPad
   - O personaliza el tamaño

### Firefox
1. Abre tu página: `http://localhost:8000`
2. Presiona `F12`
3. Haz clic en el ícono de dispositivo móvil
4. Selecciona un dispositivo

### Safari (Mac)
1. Abre Safari
2. Ve a `Desarrollo` > `Mostrar Herramientas de Desarrollo Web`
3. Presiona `Cmd+Option+R` para entrar en modo responsive

---

## 📱 OPCIÓN 2: Probar en Tu Móvil Real (Más Realista)

### Paso 1: Encontrar tu IP local
```bash
# En Mac/Linux:
ifconfig | grep "inet " | grep -v 127.0.0.1

# O más simple:
ipconfig getifaddr en0  # Mac con WiFi
```

### Paso 2: Iniciar servidor accesible en red local
```bash
# En lugar de localhost, usar 0.0.0.0
python3 -m http.server 8000 --bind 0.0.0.0
```

### Paso 3: Conectar desde tu móvil
1. Asegúrate de que tu móvil esté en la misma red WiFi
2. Abre el navegador en tu móvil
3. Ve a: `http://TU_IP:8000`
   - Ejemplo: `http://192.168.1.100:8000`

---

## 📱 OPCIÓN 3: Usar ngrok (Acceso desde Internet)

### Instalación
```bash
# Mac
brew install ngrok

# O descarga desde: https://ngrok.com/download
```

### Uso
```bash
# 1. Inicia tu servidor local
python3 -m http.server 8000

# 2. En otra terminal, ejecuta:
ngrok http 8000

# 3. Copia la URL que te da (ej: https://abc123.ngrok.io)
# 4. Abre esa URL en tu móvil (funciona desde cualquier lugar)
```

---

## 🔍 QUÉ PROBAR EN MÓVIL

### Visual
- [ ] ¿Se ve bien el header?
- [ ] ¿El logo se ve completo?
- [ ] ¿Los botones son fáciles de tocar?
- [ ] ¿El texto es legible?
- [ ] ¿Las imágenes se cargan correctamente?
- [ ] ¿El fondo se ve bien?

### Funcionalidad
- [ ] ¿Puedes seleccionar fecha?
- [ ] ¿Puedes cambiar cantidad de boletos?
- [ ] ¿Puedes ingresar código de descuento?
- [ ] ¿El checkout funciona?
- [ ] ¿Los formularios son fáciles de llenar?

### Navegación
- [ ] ¿Los enlaces funcionan?
- [ ] ¿Puedes hacer scroll suavemente?
- [ ] ¿El menú es accesible?

---

## 🛠️ HERRAMIENTAS ÚTILES

### Chrome DevTools
- **Network tab**: Ver qué recursos cargan lento
- **Console**: Ver errores de JavaScript
- **Lighthouse**: Analizar rendimiento y accesibilidad

### Responsive Design Mode
- Prueba diferentes tamaños de pantalla
- Prueba orientación vertical/horizontal
- Simula diferentes conexiones (3G, 4G, WiFi)

---

## 📊 DISPOSITIVOS A PROBAR

### Mínimo recomendado:
1. **iPhone** (Safari)
2. **Android** (Chrome)
3. **Tablet** (iPad o Android)
4. **Desktop** (Chrome, Firefox, Safari)

### Tamaños de pantalla:
- Móvil pequeño: 320px - 375px
- Móvil grande: 375px - 425px
- Tablet: 768px - 1024px
- Desktop: 1024px+
