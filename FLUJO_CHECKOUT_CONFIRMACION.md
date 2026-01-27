# Flujo de Checkout y Confirmación - Guía Completa

## 📋 Resumen del Flujo

El sistema de compra de boletos sigue este flujo:

```
Index.html → boletos.html → checkout.html → confirmacion.html
```

## 🔄 Flujo Detallado Paso a Paso

### 1. **Página Principal (Index.html)**
- Usuario ve la información de la obra
- Hace clic en el botón **"Boletos"**
- Redirige a `boletos.html`

### 2. **Selección de Boletos (boletos.html)**

#### Lo que hace el usuario:
1. **Selecciona una fecha** (Viernes, Sábado, o Domingo)
   - Al seleccionar, se crea automáticamente una **reserva temporal de 10 minutos**
   - El sistema verifica disponibilidad en tiempo real

2. **Selecciona cantidad de boletos** (1-10)
   - Usa los botones + y - para ajustar
   - El sistema verifica que haya suficientes boletos disponibles
   - Si no hay suficientes, ajusta automáticamente la cantidad

3. **Aplica código de descuento (opcional)**
   - Ingresa código en el campo
   - Presiona Enter o clic en "Aplicar"
   - El sistema valida y muestra el descuento aplicado

4. **Revisa el resumen de compra**
   - Ve: función, fecha, cantidad, subtotal, descuento (si aplica), total

5. **Hace clic en "Pagar $XXX (Continuar)"**
   - El sistema guarda toda la información en `localStorage`
   - Redirige a `checkout.html`

#### Datos guardados en localStorage:
```javascript
{
  fecha: "Viernes 20 Oct - 20:30 hrs",
  clave: "viernes",
  cantidad: 2,
  precioUnitario: 450,
  subtotal: 900,
  descuento: 90,
  codigoDescuento: "ESTUDIANTE10",
  descuentoAplicado: { nombre: "Descuento Estudiante", tipo: "porcentaje", descuento: 10 },
  total: 810,
  reservaId: "reserva_1234567890_abc123",
  timestamp: 1234567890
}
```

### 3. **Checkout / Pago (checkout.html)**

#### Lo que hace el usuario:
1. **Ve el resumen de su compra**
   - Función seleccionada
   - Cantidad de boletos
   - Subtotal
   - Descuento (si aplica)
   - Cargo por servicio (5% del subtotal)
   - **Total final**

2. **Ingresa su correo electrónico** (obligatorio)
   - Campo validado
   - Recibirá los boletos en este correo

3. **Hace clic en "Pagar con Boletia"**
   - El sistema verifica disponibilidad una última vez
   - Si ya no hay boletos, redirige a `boletos.html` con mensaje
   - Si hay disponibilidad, confirma la compra en el inventario
   - Genera un número de orden único
   - Guarda la orden completa
   - Redirige a `confirmacion.html`

#### Verificaciones en checkout:
- ✅ Verifica que la reserva existe y no ha expirado
- ✅ Verifica que la reserva pertenece a la sesión actual
- ✅ Verifica disponibilidad final antes de confirmar
- ✅ Valida el formato del email
- ✅ Verifica periódicamente cada 5 segundos si la disponibilidad cambia

#### Datos actualizados en localStorage:
```javascript
{
  // ... todos los datos anteriores ...
  email: "usuario@email.com",
  numeroOrden: "ORD-1234567890-ABC123",
  fechaCompra: "2024-10-20T15:30:00.000Z",
  estado: "completada",
  cargoServicio: 40.50,
  totalFinal: 850.50
}
```

### 4. **Confirmación (confirmacion.html)**

#### Lo que ve el usuario:
1. **Pantalla de éxito**
   - ✅ Icono de confirmación
   - Mensaje: "¡Compra Exitosa!"
   - Información de que se enviaron los boletos por email

2. **Datos de la compra**
   - Correo electrónico donde se enviaron los boletos
   - Número de orden único

3. **Siguientes pasos**
   - Revisar bandeja de entrada
   - Guardar los boletos (código QR)
   - Presentar código QR en el teatro

4. **Botón "Volver al Inicio"**
   - Regresa a `Index.html`

## 🔒 Sistema de Reservas Temporales

### ¿Cómo funciona?

1. **Al seleccionar fecha**: Se crea una reserva de 10 minutos
   - ID único: `reserva_timestamp_random`
   - Incluye: fecha, cantidad, timestamp, sessionId

2. **Durante el proceso**: La reserva se mantiene activa
   - Se libera automáticamente si expira (10 min)
   - Se libera al completar la compra
   - Se libera al salir de la página

3. **Múltiples usuarios**: 
   - Cada usuario tiene su propia reserva
   - El sistema calcula: `disponible = total - vendidos - reservados`
   - Si no hay espacio, no permite crear más reservas

## 📊 Ejemplo Práctico

### Escenario: Usuario compra 2 boletos para Viernes

**Paso 1: boletos.html**
```
Usuario selecciona: Viernes 20 Oct - 20:30 hrs
Cantidad: 2 boletos
Código: ESTUDIANTE10
Subtotal: $900.00
Descuento: -$90.00 (10%)
Total: $810.00
→ Clic en "Pagar $810.00 (Continuar)"
```

**Paso 2: checkout.html**
```
Resumen:
- Función: Viernes 20 Oct - 20:30 hrs
- Boletos: 2 x General
- Subtotal: $900.00
- Descuento (ESTUDIANTE10): -$90.00
- Cargo por servicio: $40.50 (5%)
- Total: $850.50 MXN

Email: usuario@email.com
→ Clic en "Pagar con Boletia"
```

**Paso 3: confirmacion.html**
```
✅ ¡Compra Exitosa!

Correo electrónico: usuario@email.com
Número de orden: ORD-1234567890-ABC123

Siguientes pasos:
1. Revisa tu bandeja de entrada
2. Guarda tus boletos (código QR)
3. Presenta el código QR en el teatro
```

## ⚠️ Casos Especiales

### Caso 1: Reserva Expirada
- Si el usuario tarda más de 10 minutos, la reserva expira
- Al intentar pagar, el sistema detecta que la reserva expiró
- Redirige a `boletos.html` con mensaje
- Usuario debe seleccionar fecha nuevamente

### Caso 2: Sin Disponibilidad
- Si otro usuario compró todos los boletos mientras estaba en checkout
- El sistema detecta esto (verificación cada 5 segundos)
- Muestra advertencia en checkout
- Al intentar pagar, redirige a `boletos.html`

### Caso 3: Múltiples Pestañas
- Si el usuario abre `boletos.html` en otra pestaña
- El sistema sincroniza cambios en tiempo real
- Las reservas se comparten entre pestañas del mismo navegador

## 🔧 Datos Técnicos

### LocalStorage Keys:
- `orden_compra`: Orden actual del usuario
- `inventario_boletos`: Estado del inventario
- `reservas_temporales`: Reservas activas
- `historial_ventas`: Historial de todas las ventas

### SessionStorage Keys:
- `session_id`: ID único de la sesión del usuario
- `admin_session`: Sesión de administrador (si aplica)
- `admin_mode`: Modo de admin (viewer/admin)

## 📝 Notas Importantes

1. **El sistema actual usa localStorage**, que es local al navegador
   - Funciona perfectamente para múltiples pestañas
   - NO sincroniza entre diferentes navegadores/dispositivos

2. **Para producción real**, necesitarías:
   - Backend con base de datos
   - API para gestionar inventario y reservas
   - Integración real con Boletia
   - Sistema de envío de emails

3. **Las reservas son temporales** (10 minutos)
   - Se liberan automáticamente
   - Previenen que los boletos queden "bloqueados" indefinidamente

4. **El sistema verifica disponibilidad múltiples veces**:
   - Al seleccionar fecha
   - Al cambiar cantidad
   - Periódicamente en checkout (cada 5 segundos)
   - Final antes de confirmar compra
