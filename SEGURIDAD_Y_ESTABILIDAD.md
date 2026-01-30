# Seguridad y Estabilidad - Guía Completa

## ⚠️ PROBLEMAS CRÍTICOS ACTUALES

### 1. **LocalStorage es Vulnerable**
- ❌ **Problema**: Cualquier usuario puede modificar el inventario desde la consola del navegador
- ❌ **Problema**: No hay validación del lado del servidor
- ❌ **Problema**: Los datos se pueden manipular fácilmente

**Ejemplo de ataque:**
```javascript
// Cualquiera puede hacer esto en la consola:
localStorage.setItem('inventario_boletos', JSON.stringify({
    'viernes': { total: 100, vendidos: 0, reservados: 0 },
    'sabado': { total: 100, vendidos: 0, reservados: 0 },
    'domingo': { total: 100, vendidos: 0, reservados: 0 }
}));
```

### 2. **Sin Validación de Entrada**
- ❌ Los usuarios pueden inyectar código malicioso en campos de texto
- ❌ No hay sanitización de datos
- ❌ No hay límites de caracteres en algunos campos

### 3. **Sin Rate Limiting**
- ❌ Un usuario puede hacer miles de solicitudes por segundo
- ❌ Puede crear reservas infinitas
- ❌ Puede saturar el sistema

### 4. **Sin Protección CSRF**
- ❌ Vulnerable a ataques Cross-Site Request Forgery
- ❌ No hay tokens de validación

---

## 🛡️ MEDIDAS DE SEGURIDAD ESENCIALES

### 1. **Backend con Validación del Servidor**

**NUNCA confíes en el frontend para validar datos críticos**

```javascript
// ❌ MAL - Validación solo en frontend
function confirmarCompra(cantidad) {
    if (cantidad > 10) {
        alert("Máximo 10 boletos");
        return;
    }
    // ... procesar compra
}

// ✅ BIEN - Validación en servidor
// Frontend
fetch('/api/comprar', {
    method: 'POST',
    body: JSON.stringify({ cantidad: cantidad })
});

// Backend (Node.js ejemplo)
app.post('/api/comprar', (req, res) => {
    const cantidad = parseInt(req.body.cantidad);
    
    // Validar en servidor
    if (cantidad < 1 || cantidad > 10) {
        return res.status(400).json({ error: 'Cantidad inválida' });
    }
    
    // Verificar disponibilidad en base de datos
    // Procesar compra
});
```

### 2. **Sanitización de Entradas**

**Siempre sanitiza datos del usuario antes de procesarlos:**

```javascript
// Función de sanitización
function sanitizarInput(input) {
    if (typeof input !== 'string') return '';
    
    // Remover etiquetas HTML
    let sanitizado = input.replace(/<[^>]*>/g, '');
    
    // Escapar caracteres especiales
    sanitizado = sanitizado
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    
    // Limitar longitud
    return sanitizado.substring(0, 255);
}

// Usar en campos de entrada
const email = sanitizarInput(document.getElementById('email-input').value);
```

### 3. **Rate Limiting (Límite de Solicitudes)**

**Limita cuántas acciones puede hacer un usuario en un tiempo determinado:**

```javascript
// Ejemplo de rate limiting en frontend (temporal)
let ultimaAccion = 0;
const TIEMPO_MINIMO = 1000; // 1 segundo entre acciones

function accionConRateLimit() {
    const ahora = Date.now();
    if (ahora - ultimaAccion < TIEMPO_MINIMO) {
        alert('Por favor espera un momento antes de continuar');
        return false;
    }
    ultimaAccion = ahora;
    return true;
}

// En backend (más importante):
// Usar librerías como express-rate-limit
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // máximo 100 solicitudes por IP
});
```

### 4. **Validación de Email**

**Valida emails correctamente:**

```javascript
function validarEmail(email) {
    // Expresión regular más estricta
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!re.test(email)) {
        return false;
    }
    
    // Longitud máxima
    if (email.length > 254) {
        return false;
    }
    
    return true;
}
```

### 5. **Protección contra XSS (Cross-Site Scripting)**

**Nunca insertes contenido del usuario directamente en el HTML:**

```javascript
// ❌ PELIGROSO
document.getElementById('mensaje').innerHTML = usuarioInput;

// ✅ SEGURO
document.getElementById('mensaje').textContent = usuarioInput;

// O usar funciones de escape
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

### 6. **Límites de Tamaño de Datos**

**Establece límites claros:**

```javascript
// Límites recomendados
const LIMITES = {
    email: 254,
    codigoDescuento: 50,
    cantidadBoletos: 10,
    nombre: 100
};

function validarLongitud(campo, valor, maximo) {
    if (valor.length > maximo) {
        return false;
    }
    return true;
}
```

### 7. **Manejo de Errores Robusto**

**Siempre maneja errores y no expongas información sensible:**

```javascript
// ❌ MAL - Expone información del sistema
try {
    procesarCompra();
} catch (error) {
    alert('Error: ' + error.message); // Puede exponer rutas, nombres de archivos, etc.
}

// ✅ BIEN - Mensaje genérico
try {
    procesarCompra();
} catch (error) {
    console.error('Error interno:', error); // Solo en consola para desarrollo
    alert('Ocurrió un error. Por favor intenta de nuevo o contacta al soporte.');
}
```

---

## 🚨 PROTECCIÓN CONTRA ATAQUES COMUNES

### 1. **Ataque de Reservas Múltiples**

**Problema actual:** Un usuario puede crear múltiples reservas desde diferentes pestañas.

**Solución:**
```javascript
// Limitar reservas por sesión
const MAX_RESERVAS_POR_SESION = 1;
let reservasActivas = 0;

function crearReserva() {
    if (reservasActivas >= MAX_RESERVAS_POR_SESION) {
        alert('Ya tienes una reserva activa. Completa tu compra o espera a que expire.');
        return false;
    }
    // ... crear reserva
    reservasActivas++;
}
```

### 2. **Ataque de Sobreventa**

**Problema:** Múltiples usuarios pueden comprar los últimos boletos simultáneamente.

**Solución:** Verificación atómica en servidor (transacciones de base de datos)

```javascript
// Backend - Verificación atómica
async function confirmarCompra(fecha, cantidad) {
    const transaccion = await db.beginTransaction();
    
    try {
        // Verificar disponibilidad dentro de la transacción
        const disponible = await db.query(
            'SELECT disponible FROM inventario WHERE fecha = ? FOR UPDATE',
            [fecha]
        );
        
        if (disponible < cantidad) {
            await transaccion.rollback();
            return { exito: false, mensaje: 'No hay suficientes boletos' };
        }
        
        // Actualizar inventario
        await db.query(
            'UPDATE inventario SET vendidos = vendidos + ? WHERE fecha = ?',
            [cantidad, fecha]
        );
        
        await transaccion.commit();
        return { exito: true };
    } catch (error) {
        await transaccion.rollback();
        throw error;
    }
}
```

### 3. **Ataque de Fuerza Bruta en Códigos de Descuento**

**Problema:** Un bot puede probar miles de códigos por segundo.

**Solución:**
```javascript
// Rate limiting por código
const intentosCodigo = new Map();

function validarCodigoConRateLimit(codigo, ip) {
    const clave = `${ip}_${codigo}`;
    const intentos = intentosCodigo.get(clave) || 0;
    
    if (intentos > 5) {
        return { 
            valido: false, 
            mensaje: 'Demasiados intentos. Espera 15 minutos.' 
        };
    }
    
    intentosCodigo.set(clave, intentos + 1);
    
    // Limpiar después de 15 minutos
    setTimeout(() => {
        intentosCodigo.delete(clave);
    }, 15 * 60 * 1000);
    
    return validarCodigoDescuento(codigo);
}
```

### 4. **Ataque de Denegación de Servicio (DoS)**

**Problema:** Un atacante puede saturar el servidor con solicitudes.

**Soluciones:**
- Rate limiting por IP
- Timeout en solicitudes
- Límite de conexiones simultáneas
- CDN para servir contenido estático
- Caché de respuestas

```javascript
// Backend - Rate limiting agresivo
const strictLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 20, // máximo 20 solicitudes por minuto
    message: 'Demasiadas solicitudes. Por favor espera.'
});
```

---

## 📊 MONITOREO Y LOGS

### 1. **Registrar Actividades Sospechosas**

```javascript
function registrarActividadSospechosa(tipo, datos) {
    const log = {
        timestamp: new Date().toISOString(),
        tipo: tipo, // 'intento_hack', 'reserva_masiva', etc.
        datos: datos,
        ip: obtenerIP(), // En backend
        userAgent: navigator.userAgent
    };
    
    // Enviar a servidor para análisis
    fetch('/api/logs', {
        method: 'POST',
        body: JSON.stringify(log)
    });
}

// Detectar patrones sospechosos
function detectarPatronSospechoso() {
    const reservas = obtenerReservas();
    const reservasUsuario = Object.values(reservas).filter(
        r => r.sessionId === sessionStorage.getItem('session_id')
    );
    
    if (reservasUsuario.length > 3) {
        registrarActividadSospechosa('reserva_masiva', {
            cantidad: reservasUsuario.length
        });
    }
}
```

### 2. **Alertas Automáticas**

```javascript
// Alertar cuando hay actividad sospechosa
function verificarActividadSospechosa() {
    // Verificar múltiples reservas
    // Verificar cambios en localStorage
    // Verificar intentos fallidos de pago
    // etc.
}
```

---

## 🔒 MEJORAS INMEDIATAS PARA TU CÓDIGO ACTUAL

### 1. **Agregar Validación en checkout.js**

```javascript
// Agregar al inicio de procesarPago()
function procesarPago() {
    // Validar que cantidad sea un número válido
    if (!ordenCompra || typeof ordenCompra.cantidad !== 'number') {
        alert('Error: Datos inválidos');
        window.location.href = 'boletos.html';
        return;
    }
    
    // Validar rango
    if (ordenCompra.cantidad < 1 || ordenCompra.cantidad > 10) {
        alert('Error: Cantidad inválida');
        window.location.href = 'boletos.html';
        return;
    }
    
    // ... resto del código
}
```

### 2. **Protección contra Manipulación de LocalStorage**

```javascript
// Agregar checksum a los datos
function guardarConChecksum(clave, datos) {
    const datosString = JSON.stringify(datos);
    const checksum = calcularChecksum(datosString);
    localStorage.setItem(clave, datosString);
    localStorage.setItem(clave + '_checksum', checksum);
}

function cargarConValidacion(clave) {
    const datos = localStorage.getItem(clave);
    const checksum = localStorage.getItem(clave + '_checksum');
    
    if (!datos || !checksum) return null;
    
    if (calcularChecksum(datos) !== checksum) {
        console.error('Datos manipulados detectados');
        return null;
    }
    
    return JSON.parse(datos);
}
```

### 3. **Timeout en Reservas**

```javascript
// Reducir tiempo de reserva si hay mucha actividad
function ajustarTiempoReserva() {
    const reservas = obtenerReservas();
    const cantidadReservas = Object.keys(reservas).length;
    
    // Si hay muchas reservas, reducir tiempo
    if (cantidadReservas > 50) {
        return 5 * 60 * 1000; // 5 minutos
    }
    
    return 10 * 60 * 1000; // 10 minutos normal
}
```

---

## 🚀 RECOMENDACIONES PARA PRODUCCIÓN

### 1. **Backend Obligatorio**
- ✅ Base de datos real (PostgreSQL, MySQL, MongoDB)
- ✅ API REST con autenticación
- ✅ Validación en servidor de TODOS los datos
- ✅ Transacciones atómicas para inventario

### 2. **Seguridad del Servidor**
- ✅ HTTPS obligatorio
- ✅ Headers de seguridad (CSP, X-Frame-Options, etc.)
- ✅ Firewall configurado
- ✅ Actualizaciones de seguridad regulares

### 3. **Monitoreo**
- ✅ Logs de todas las transacciones
- ✅ Alertas de actividad sospechosa
- ✅ Métricas de rendimiento
- ✅ Backup automático de base de datos

### 4. **Escalabilidad**
- ✅ CDN para archivos estáticos
- ✅ Caché de respuestas
- ✅ Load balancing si hay mucho tráfico
- ✅ Base de datos optimizada con índices

### 5. **Pasarela de Pago Segura**
- ✅ Usar API oficial de Boletia (no procesar tarjetas directamente)
- ✅ Webhooks para confirmar pagos
- ✅ No almacenar información de tarjetas
- ✅ PCI DSS compliance

---

## 📋 CHECKLIST DE SEGURIDAD

Antes de lanzar a producción, verifica:

- [ ] Backend con validación del servidor
- [ ] Base de datos con transacciones atómicas
- [ ] Rate limiting implementado
- [ ] Sanitización de todas las entradas
- [ ] Validación de emails estricta
- [ ] HTTPS configurado
- [ ] Headers de seguridad configurados
- [ ] Logs de seguridad implementados
- [ ] Sistema de alertas configurado
- [ ] Backup automático de datos
- [ ] Pruebas de carga realizadas
- [ ] Plan de respuesta a incidentes

---

## ⚡ ACCIONES INMEDIATAS (Sin Backend)

Mientras implementas el backend, puedes agregar estas protecciones básicas:

1. **Validación más estricta en frontend**
2. **Rate limiting básico con timestamps**
3. **Detección de manipulación de localStorage**
4. **Límites más estrictos en reservas**
5. **Logs de actividad sospechosa**

¿Quieres que implemente alguna de estas protecciones básicas ahora mismo?
