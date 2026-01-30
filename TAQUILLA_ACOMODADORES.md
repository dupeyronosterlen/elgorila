# 🎫 Sistema de Taquilla y Acomodadores - Guía Completa

## 📋 Resumen

Sistema completo para gestión de taquilla (ventas en efectivo) y acomodadores (validación de boletos) con información útil para el personal.

---

## 🏪 TAQUILLA

### Características:

1. **Ver Disponibilidad en Tiempo Real**
   - Disponibilidad por función
   - Boletos vendidos, reservados y en efectivo
   - Indicador visual de disponibilidad

2. **Generar Códigos de Ingreso para Efectivo**
   - Código único por venta en efectivo
   - QR code para verificación
   - Metadata: discapacidad, acompañantes, notas

3. **Base de Datos Actualizada**
   - Se actualiza automáticamente al generar código
   - Sincronizado con inventario principal

### Cómo Acceder:

1. Accede al panel admin con usuario `taquilla1` / `taquilla2024`
2. Haz clic en el botón "Taquilla" en el header
3. O accede directamente a `taquilla.html`

### Uso:

#### Ver Disponibilidad:
- Se muestra automáticamente al cargar la página
- Actualiza cada 30 segundos
- Muestra: Total, Vendidos, Reservados, Efectivo, Disponible

#### Generar Código de Ingreso:

1. Selecciona la función
2. Ingresa cantidad de boletos (1-10)
3. Marca si es persona con discapacidad
4. Ingresa número de acompañantes (opcional)
5. Agrega notas (opcional)
6. Haz clic en "Generar Código de Ingreso"

**El código generado:**
- Se muestra con QR code
- Se puede copiar al portapapeles
- Se guarda en la base de datos
- Actualiza el inventario automáticamente

#### Ver Boletos Generados:

- Tabla muestra todos los boletos en efectivo generados hoy
- Muestra: Código, Función, Cantidad, Estado, Info especial
- Se actualiza automáticamente

---

## 👥 ACOMODADORES

### Características:

1. **Interfaz Tipo App Móvil**
   - Diseño optimizado para móvil
   - Se puede instalar como app
   - Interfaz simple y rápida

2. **Información Útil:**
   - Total esperado por función
   - Cantidad ingresados
   - Pendientes de ingreso
   - **Personas con discapacidad** (alerta especial)
   - Lista de boletos pendientes

3. **Verificación Rápida:**
   - Escanear o ingresar código
   - Soporta certificados digitales (CERT-)
   - Soporta boletos en efectivo (EFECT-)
   - Muestra información especial (discapacidad)

### Cómo Acceder:

1. Accede al panel admin con usuario `validacion1` / `validacion2024`
2. Haz clic en el botón "Acomodadores" en el header
3. O accede directamente a `acomodadores.html`

### Uso:

#### Ver Resumen de Función:

1. Selecciona la función en el selector superior
2. Verás:
   - **Total Esperado:** Total de boletos para la función
   - **Ingresados:** Boletos ya validados
   - **Pendientes:** Boletos que faltan por ingresar
   - **Con Discapacidad:** Personas que requieren atención especial

#### Alerta de Discapacidad:

- Se muestra automáticamente si hay personas con discapacidad
- Indica cuántas personas se esperan
- Recordatorio para preparar acceso especial

#### Verificar Boleto:

1. Ingresa o escanea el código del boleto
2. El sistema verifica automáticamente
3. Muestra información:
   - Código
   - Función
   - Cantidad de personas
   - **Si tiene discapacidad** (alerta visual)
4. Haz clic en "Confirmar Ingreso"

#### Lista de Pendientes:

- Muestra todos los boletos pendientes de ingreso
- Botón "Verificar" rápido para cada boleto
- Indica si es digital o efectivo
- Muestra si tiene discapacidad

#### Instalar como App:

1. Haz clic en "Instalar App" al final
2. En iOS: Compartir → Agregar a Pantalla de Inicio
3. En Android: Menú → Agregar a Pantalla de Inicio
4. La app funcionará sin conexión (con datos en cache)

---

## 🔄 Flujo Completo

### Venta en Taquilla (Efectivo):

1. Cliente llega a taquilla
2. Taquilla verifica disponibilidad
3. Genera código de ingreso con metadata
4. Cliente recibe código (puede ser impreso o QR)
5. Cliente llega a entrada
6. Acomodador escanea código
7. Sistema valida y muestra información especial
8. Acomodador confirma ingreso
9. Base de datos se actualiza

### Venta Online:

1. Cliente compra en línea
2. Recibe certificado digital (CERT-)
3. Cliente llega a entrada
4. Acomodador escanea código
5. Sistema valida certificado
6. Acomodador confirma ingreso
7. Base de datos se actualiza

---

## 📊 Metadata de Boletos

### Campos Disponibles:

- **Discapacidad:** Boolean - Indica si requiere atención especial
- **Acompañantes:** Number - Número de acompañantes
- **Notas:** String - Notas adicionales
- **Cantidad:** Number - Número de boletos

### Uso:

- **Taquilla:** Puede marcar discapacidad al generar código
- **Acomodadores:** Ven alerta si hay discapacidad
- **Base de datos:** Se guarda toda la metadata

---

## 🔗 Integración

### Archivos Relacionados:

- `taquilla.html` - Interfaz de taquilla
- `acomodadores.html` - Interfaz de acomodadores
- `js/taquilla.js` - Lógica de boletos en efectivo
- `js/taquilla-ui.js` - UI de taquilla
- `js/acomodadores.js` - Lógica de acomodadores
- `verificar.html` - Verificación general (soporta ambos tipos)

### Base de Datos:

- `boletos_efectivo` - Boletos vendidos en efectivo
- `certificados_db` - Certificados digitales
- `inventario_boletos` - Inventario principal

---

## 📱 Optimización Móvil

### Acomodadores:

- ✅ Interfaz tipo app
- ✅ Botones grandes y táctiles
- ✅ Auto-focus en input
- ✅ Actualización automática
- ✅ Se puede instalar como PWA

### Taquilla:

- ✅ Responsive design
- ✅ Funciona en tablet y móvil
- ✅ QR codes grandes y legibles

---

## 🎯 Casos de Uso

### Taquilla:

**Escenario:** Cliente llega a comprar en efectivo
1. Taquilla abre `taquilla.html`
2. Ve que hay 15 boletos disponibles
3. Cliente compra 2 boletos
4. Cliente menciona que tiene discapacidad
5. Taquilla genera código marcando "Persona con discapacidad"
6. Cliente recibe código impreso o en pantalla
7. Inventario se actualiza automáticamente

### Acomodadores:

**Escenario:** Inicio de función
1. Acomodador abre `acomodadores.html`
2. Selecciona función "Viernes 20 Oct"
3. Ve que hay 3 personas con discapacidad esperadas
4. Se prepara para atención especial
5. Cliente llega y muestra código
6. Acomodador escanea código
7. Sistema muestra alerta de discapacidad
8. Acomodador confirma ingreso
9. Contador se actualiza automáticamente

---

## 🔒 Permisos

### Taquilla:

- ✅ Ver inventario y disponibilidad
- ✅ Generar códigos de ingreso
- ✅ Ver boletos en efectivo generados
- ❌ No puede modificar inventario directamente
- ❌ No puede ver auditoría

### Acomodadores (Validación):

- ✅ Verificar boletos (digitales y efectivo)
- ✅ Ver resumen de función
- ✅ Ver información de discapacidad
- ❌ No puede ver inventario completo
- ❌ No puede ver ventas

---

## 📈 Estadísticas

### Taquilla Muestra:

- Total de boletos por función
- Vendidos (online + efectivo)
- Reservados temporalmente
- Disponibles
- Boletos en efectivo generados

### Acomodadores Muestra:

- Total esperado
- Ingresados
- Pendientes
- Personas con discapacidad

---

## 🚀 Próximas Mejoras

1. **Escaneo con Cámara:**
   - Leer QR codes directamente
   - Más rápido para validación

2. **Notificaciones Push:**
   - Alertas cuando quedan pocos boletos
   - Notificaciones de personas con discapacidad

3. **Reportes:**
   - Exportar lista de ingresados
   - Estadísticas por función

4. **Offline Mode:**
   - Funcionar sin conexión
   - Sincronizar cuando haya conexión

---

## ✅ Checklist de Uso

### Para Taquilla:

- [ ] Acceder con usuario taquilla
- [ ] Verificar disponibilidad antes de vender
- [ ] Generar código con metadata correcta
- [ ] Imprimir o mostrar código al cliente
- [ ] Verificar que inventario se actualizó

### Para Acomodadores:

- [ ] Acceder con usuario validación
- [ ] Seleccionar función correcta
- [ ] Revisar alertas de discapacidad
- [ ] Escanear códigos correctamente
- [ ] Confirmar ingreso después de validar

---

**Sistema listo para usar** ✅
