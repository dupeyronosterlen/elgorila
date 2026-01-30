# 🎯 Necesidades Específicas del Proyecto - El Gorila

## 📋 Contexto del Proyecto

**Obra:** El Gorila de Franz Kafka  
**Capacidad:** 200 boletos por función  
**Funciones:** Principalmente sábados (3 fechas visibles), ocasionalmente viernes  
**Precio:** $389.00 MXN por boleto  
**Reservas:** 4 minutos de duración  
**Bloqueo de ventas:** 5 minutos antes de la función  

---

## 🎯 NECESIDADES CRÍTICAS

### 1. **Sistema de Reserva/Token Recuperable**

#### Requisitos:
- ✅ Reserva se guarda inmediatamente al seleccionar fecha/cantidad
- ✅ Usuario puede regresar a boletos.html sin perder la reserva
- ✅ Token único que identifica la reserva
- ✅ Válido por 4 minutos (tiempo de reserva)
- ✅ Si regresa, puede continuar desde donde quedó

#### Implementación:
```javascript
// Al seleccionar fecha/cantidad
const tokenReserva = generarTokenReserva();
localStorage.setItem('reserva_token', tokenReserva);
localStorage.setItem('reserva_datos', JSON.stringify({
    fecha: fechaSeleccionada,
    cantidad: cantidadActual,
    timestamp: Date.now(),
    token: tokenReserva
}));

// Al regresar a boletos.html
const reservaGuardada = localStorage.getItem('reserva_datos');
if (reservaGuardada && !reservaExpirada(reservaGuardada)) {
    // Restaurar selección
    restaurarReserva(reservaGuardada);
}
```

---

### 2. **Sistema de Pagos (Sin Boletia)**

#### Requisitos:
- ✅ Método principal: Stripe/OpenPay (tarjeta, OXXO, SPEI)
- ✅ Métodos NO deben interferir entre sí
- ✅ Si un método falla, activar respaldo automáticamente
- ✅ Monitoreo en tiempo real
- ✅ Resolución automática de problemas

#### Estructura Modular:
```
PagoManager (Coordinador)
├── StripeHandler (Método 1)
├── OpenPayHandler (Método 2 - Respaldo)
├── TransferenciaHandler (Respaldo 2)
└── TaquillaHandler (Plan X)
```

**Cada handler es independiente y no comparte estado.**

---

### 3. **Prevención de Caídas del Sistema**

#### Estrategias:

##### A. **Validaciones Robustas**
- Validar datos antes de cada operación
- Verificar disponibilidad antes de reservar
- Confirmar pago antes de generar boletos
- Validar token antes de procesar

##### B. **Manejo de Errores**
- Capturar TODOS los errores posibles
- Mensajes claros al usuario
- Logs detallados para debug
- No perder datos si algo falla

##### C. **Timeouts y Límites**
- Timeout de checkout: **5 minutos**
- Límite de intentos de pago: 3
- Prevenir múltiples clics
- Limpiar reservas expiradas automáticamente

##### D. **Monitoreo en Producción**
- Detectar errores en tiempo real
- Alertas automáticas
- Fallback automático si método falla
- Dashboard de estado del sistema

---

### 4. **Cartera Digital (Opcional - Para Reducir Peso)**

#### Opción A: Wallet Pass (Apple/Google)
- ✅ Reduce carga del sitio
- ✅ Boletos en cartera nativa del teléfono
- ✅ Fácil acceso sin abrir sitio
- ❌ Requiere configuración adicional
- ❌ Más complejo de implementar

#### Opción B: PWA (Progressive Web App)
- ✅ Instalable como app
- ✅ Funciona offline
- ✅ Acceso rápido desde home
- ✅ Más fácil de implementar
- ✅ Boletos almacenados localmente

#### Opción C: QR + Email (Actual - Recomendado)
- ✅ Más simple
- ✅ Funciona en todos los dispositivos
- ✅ No requiere instalación
- ✅ Fácil de implementar
- ❌ Requiere abrir email/app

**RECOMENDACIÓN: Mantener QR + Email por simplicidad. PWA como mejora futura.**

---

## 🔄 FLUJO ACTUAL vs FLUJO MEJORADO

### **FLUJO ACTUAL:**
```
1. Usuario selecciona fecha → Reserva temporal (4 min)
2. Usuario selecciona cantidad
3. Usuario hace click en "Continuar"
4. Redirige a checkout.html
5. Usuario ingresa email
6. Usuario paga
7. Redirige a confirmacion.html
```

**Problema:** Si usuario regresa, pierde la reserva.

---

### **FLUJO MEJORADO (Con Token):**
```
1. Usuario selecciona fecha → Reserva + Token guardado
2. Usuario selecciona cantidad → Token actualizado
3. Usuario hace click en "Continuar" → Redirige a checkout.html
   - Si regresa antes de pagar → Token permite restaurar
4. Checkout con timeout de 5 minutos
5. Usuario paga → Token se marca como "en proceso"
6. Si pago exitoso → Token se marca como "completado"
7. Confirmación → Token se archiva
```

**Ventajas:**
- ✅ Usuario puede regresar sin perder progreso
- ✅ Token rastrea estado de la compra
- ✅ Si expira, se limpia automáticamente
- ✅ Permite recuperar compras interrumpidas

---

## 💳 SISTEMA DE PAGOS MODULAR (Sin Conflictos)

### **Arquitectura:**

```
┌─────────────────────────────────────┐
│      PagoManager (Coordinador)      │
│  - Detecta qué método está activo   │
│  - Maneja fallbacks automáticos     │
│  - Monitorea estado de cada método  │
└─────────────────────────────────────┘
           │
    ┌──────┼──────┬──────────┐
    │      │      │          │
┌───▼───┐ │  ┌───▼───┐  ┌───▼──────┐
│Stripe │ │  │OpenPay│  │Transfer. │
│Handler│ │  │Handler│  │Handler   │
└───────┘ │  └───────┘  └──────────┘
          │
     ┌────▼────┐
     │Taquilla │
     │Handler  │
     │(Plan X) │
     └─────────┘
```

### **Características:**
- ✅ Cada handler es independiente
- ✅ No comparten estado
- ✅ Si uno falla, otro se activa
- ✅ Monitoreo independiente
- ✅ No hay conflictos

---

## 🚨 MONITOREO Y RESOLUCIÓN EN PRODUCCIÓN

### **1. Detección Automática de Problemas**

#### A. **Health Checks**
```javascript
// Verificar cada 30 segundos
setInterval(() => {
    verificarEstadoSistema();
}, 30000);

function verificarEstadoSistema() {
    // Verificar localStorage
    // Verificar APIs de pago
    // Verificar disponibilidad
    // Detectar errores
}
```

#### B. **Alertas Automáticas**
- Error en método de pago → Activar respaldo
- Timeout de checkout → Limpiar y notificar
- Reserva expirada → Limpiar automáticamente
- Error en validación → Log y notificar

#### C. **Dashboard de Estado**
- Estado de cada método de pago
- Número de reservas activas
- Errores recientes
- Tiempo de respuesta

---

### **2. Resolución Automática**

#### A. **Fallback Automático**
```
Si Stripe falla:
  → Intentar OpenPay
  → Si OpenPay falla:
    → Activar transferencia bancaria
    → Si transferencia falla:
      → Activar Plan X (Taquilla)
```

#### B. **Limpieza Automática**
- Reservas expiradas → Limpiar cada minuto
- Ordenes sin completar → Limpiar después de 10 minutos
- Tokens expirados → Limpiar automáticamente

#### C. **Recuperación de Errores**
- Si pago falla → Mantener reserva por 2 minutos más
- Si checkout timeout → Ofrecer código para taquilla
- Si error de validación → Mostrar mensaje claro y permitir reintentar

---

## 📊 OPTIMIZACIÓN DE DATOS Y PROCESOS

### **1. Reducir Peso de Datos**

#### A. **LocalStorage Optimizado**
```javascript
// En vez de guardar todo, guardar solo lo esencial
const reservaMinima = {
    t: token,                    // token (corto)
    f: fechaClave,              // fecha clave (corto)
    c: cantidad,                // cantidad
    ts: timestamp               // timestamp
};

// Expandir solo cuando se necesita
function expandirReserva(reservaMinima) {
    return {
        token: reservaMinima.t,
        fecha: obtenerFechaCompleta(reservaMinima.f),
        cantidad: reservaMinima.c,
        timestamp: reservaMinima.ts
    };
}
```

#### B. **Limpiar Datos Antiguos**
- Limpiar reservas expiradas cada minuto
- Limpiar órdenes sin completar después de 1 hora
- Limpiar logs antiguos (mantener solo últimas 24 horas)

---

### **2. Procesos Eficientes**

#### A. **Validaciones Ligeras**
- Validar solo cuando es necesario
- Cachear resultados de validación
- Validar en paralelo cuando es posible

#### B. **Operaciones Asíncronas**
- Guardar en localStorage de forma asíncrona
- Procesar pagos en background
- Cargar datos de forma lazy

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### **Fase 1: Sistema de Token/Reserva**
- [ ] Generar token único al seleccionar fecha
- [ ] Guardar token en localStorage
- [ ] Restaurar selección al regresar
- [ ] Limpiar token si expira
- [ ] Validar token antes de procesar

### **Fase 2: Checkout con Timeout**
- [ ] Timeout de 5 minutos
- [ ] Mostrar countdown
- [ ] Limpiar reserva si expira
- [ ] Ofrecer código de taquilla si expira

### **Fase 3: Sistema de Pagos Modular**
- [ ] Estructura de handlers independientes
- [ ] Coordinador (PagoManager)
- [ ] Handler de Stripe
- [ ] Handler de OpenPay (respaldo)
- [ ] Handler de transferencia (respaldo 2)
- [ ] Handler de taquilla (Plan X)

### **Fase 4: Monitoreo y Resolución**
- [ ] Health checks automáticos
- [ ] Alertas automáticas
- [ ] Fallback automático
- [ ] Dashboard de estado
- [ ] Logs detallados

---

## 🎯 PRIORIDADES

### **ALTA PRIORIDAD (Ahora):**
1. ✅ Sistema de token/reserva recuperable
2. ✅ Timeout de checkout (5 minutos)
3. ✅ Arreglar botón "Continuar"
4. ✅ Validaciones robustas

### **MEDIA PRIORIDAD (Esta semana):**
5. Sistema de pagos modular
6. Monitoreo básico
7. Fallback automático

### **BAJA PRIORIDAD (Después):**
8. Dashboard avanzado
9. PWA (cartera digital)
10. Optimizaciones avanzadas

---

## 💡 RECOMENDACIONES FINALES

1. **Empezar simple:** Implementar token/reserva primero
2. **Agregar complejidad gradualmente:** No implementar todo a la vez
3. **Probar cada parte:** Verificar que funciona antes de agregar más
4. **Documentar todo:** Cada decisión debe estar documentada
5. **Monitorear siempre:** Tener visibilidad de qué está pasando

---

**¿Quieres que empecemos con el sistema de token/reserva y el arreglo del botón?**
