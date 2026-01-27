# 📅 Sistema de Fechas Dinámicas - Documentación

## 📋 Resumen

Sistema completo de gestión de fechas dinámicas que:
- Muestra 3 sábados consecutivos automáticamente
- Permite funciones especiales (viernes) configurables
- Bloquea ventas 30 minutos antes de la función (2da llamada)
- Elimina funciones pasadas automáticamente a las 12am
- Se renueva automáticamente cada semana

---

## 🎯 Características Principales

### 1. **Sábados Regulares**
- Se generan automáticamente los próximos 3 sábados
- Hora fija: 19:00 (7 PM)
- Se renuevan automáticamente cuando pasa uno
- Siempre muestra 3 sábados disponibles

### 2. **Funciones Especiales (Viernes)**
- Configurables desde el panel admin
- Pueden activarse/desactivarse
- Nombre personalizable (ej: "Viernes 15 Nov")
- Hora configurable
- No aparecen por defecto, solo cuando se activan

### 3. **Bloqueo Automático**
- Las ventas se bloquean 30 minutos antes de la función
- Esto corresponde a la "2da llamada"
- Los botones se deshabilitan automáticamente
- Muestra mensaje "Ventas bloqueadas"

### 4. **Limpieza Automática**
- A las 12:00 AM se eliminan funciones pasadas
- Se agregan nuevas funciones automáticamente
- Mantiene siempre 3 sábados visibles

---

## 🛠️ Configuración

### Archivo: `js/fechas.js`

```javascript
CONFIG: {
    HORA_FUNCION: 19,              // 7 PM (19:00)
    MINUTOS_BLOQUEO: 30,           // Bloquear 30 min antes
    TOTAL_BOLETOS: 200,            // Boletos por función
    CANTIDAD_SABADOS_VISIBLES: 3   // Mostrar 3 sábados
}
```

---

## 📅 Cómo Funciona

### Generación de Sábados:

1. **Al cargar la página:**
   - Calcula el próximo sábado desde hoy
   - Genera 3 sábados consecutivos (esta semana, próxima, siguiente)
   - Cada sábado tiene su propia clave única

2. **Clave única:**
   - Formato: `sabado_{timestamp}`
   - Ejemplo: `sabado_1734567890000`
   - Permite múltiples funciones el mismo día si es necesario

3. **Renovación:**
   - A las 12:00 AM se ejecuta limpieza
   - Elimina sábados que ya pasaron
   - Agrega el siguiente sábado (4 semanas adelante)

---

## 🎫 Funciones Especiales (Viernes)

### Crear Función Especial:

1. **Desde Panel Admin:**
   - Accede como Admin o Gerente
   - Ve a "Funciones Especiales (Viernes)"
   - Haz clic en "Nueva Función Especial"

2. **Completar formulario:**
   - **Nombre:** Ej: "Viernes 15 Nov" o "Función Especial 1"
   - **Fecha:** Selecciona el viernes
   - **Hora:** Hora de la función (default: 20)
   - **Minutos:** Minutos (default: 30)

3. **Guardar:**
   - La función se crea y aparece en `boletos.html`
   - Se inicializa inventario automáticamente
   - Se puede activar/desactivar después

### Gestionar Funciones Especiales:

- **Editar:** Cambiar nombre, fecha, hora
- **Activar/Desactivar:** Mostrar u ocultar en la página de boletos
- **Eliminar:** Eliminar función (no se puede deshacer)

---

## 🔒 Bloqueo de Ventas

### Cuándo se Bloquea:

- **30 minutos antes** de la hora de la función
- Ejemplo: Si la función es a las 19:00, se bloquea a las 18:30

### Qué Pasa:

1. **En `boletos.html`:**
   - El botón de la función se deshabilita
   - Muestra "Ventas bloqueadas"
   - No se puede seleccionar

2. **Si alguien ya está en checkout:**
   - Puede completar su compra
   - Pero no se pueden iniciar nuevas compras

3. **Verificación:**
   - Se verifica cada minuto
   - El bloqueo es automático

---

## 🧹 Limpieza Automática

### Qué se Limpia:

1. **Funciones pasadas:**
   - Funciones especiales que ya pasaron
   - Se eliminan de la base de datos

2. **Inventario:**
   - Se mantiene solo inventario de funciones activas
   - Se elimina inventario de funciones pasadas

3. **Cuándo:**
   - A las 12:00 AM (medianoche)
   - Se ejecuta automáticamente
   - Solo una vez por día

---

## 📊 Estructura de Datos

### Función Regular (Sábado):

```javascript
{
    id: "sabado_1",
    fecha: Date,                    // Objeto Date
    nombre: "Sábado 23 Nov 2024 - 19:00 hrs",
    clave: "sabado_1734567890000",  // Clave única
    tipo: "regular",
    activa: true,
    bloqueada: false
}
```

### Función Especial (Viernes):

```javascript
{
    id: "especial_1734567890000",
    fecha: "2024-11-15T20:30:00.000Z",  // ISO string
    nombre: "Viernes 15 Nov",
    clave: "especial_1734567890000",
    tipo: "especial",
    activa: true,
    bloqueada: false,
    hora: 20,
    minutos: 30
}
```

---

## 🔄 Flujo de Usuario

### Compra Normal:

1. Usuario ve 3 sábados disponibles
2. Selecciona un sábado
3. Selecciona cantidad de boletos
4. Completa compra
5. Recibe certificado digital

### Con Función Especial:

1. Admin crea función especial (viernes)
2. Función aparece en `boletos.html`
3. Usuario puede seleccionarla
4. Funciona igual que sábado regular

### Bloqueo de Ventas:

1. Faltan 30 minutos para la función
2. Sistema detecta automáticamente
3. Botón se deshabilita
4. Muestra "Ventas bloqueadas"
5. Usuarios no pueden iniciar nuevas compras

---

## 🎛️ Panel de Administración

### Gestión de Funciones Especiales:

**Ubicación:** Panel Admin → "Funciones Especiales (Viernes)"

**Funciones:**
- Ver todas las funciones especiales
- Crear nueva función
- Editar función existente
- Activar/Desactivar función
- Eliminar función

**Tabla muestra:**
- Nombre de la función
- Fecha y hora
- Estado (Activa/Inactiva)
- Acciones (Editar, Activar/Desactivar, Eliminar)

---

## ⚙️ Configuración Avanzada

### Cambiar Hora de Función:

En `js/fechas.js`:
```javascript
CONFIG: {
    HORA_FUNCION: 19,  // Cambiar a la hora deseada (0-23)
}
```

### Cambiar Minutos de Bloqueo:

```javascript
CONFIG: {
    MINUTOS_BLOQUEO: 30,  // Cambiar a minutos deseados
}
```

### Cambiar Cantidad de Boletos:

```javascript
CONFIG: {
    TOTAL_BOLETOS: 200,  // Cambiar a cantidad deseada
}
```

### Cambiar Cantidad de Sábados Visibles:

```javascript
CONFIG: {
    CANTIDAD_SABADOS_VISIBLES: 3,  // Cambiar a cantidad deseada
}
```

---

## 🔍 Verificación y Debugging

### Ver Funciones Actuales:

```javascript
// En consola del navegador
const funciones = FechasManager.obtenerFunciones();
console.log(funciones);
```

### Ver Funciones Especiales:

```javascript
const especiales = FechasManager.obtenerFuncionesEspeciales();
console.log(especiales);
```

### Verificar Bloqueo:

```javascript
const funciones = FechasManager.obtenerFunciones();
funciones.regulares.forEach(f => {
    console.log(f.nombre, 'Bloqueada:', f.bloqueada);
});
```

---

## 📝 Ejemplos de Uso

### Ejemplo 1: Función Regular

**Situación:** Sábado 23 Nov a las 19:00
- Se genera automáticamente
- Aparece en `boletos.html`
- Se puede comprar hasta las 18:30
- A las 18:30 se bloquea automáticamente

### Ejemplo 2: Función Especial

**Situación:** Viernes 15 Nov a las 20:30
1. Admin crea función especial desde panel
2. Nombre: "Viernes 15 Nov"
3. Fecha: 15 Nov 2024
4. Hora: 20:30
5. Función aparece en `boletos.html`
6. Usuarios pueden comprar
7. Se bloquea a las 20:00 (30 min antes)

### Ejemplo 3: Múltiples Funciones Especiales

**Situación:** Varios viernes especiales
- Se pueden crear hasta 4 funciones especiales
- Cada una con nombre único
- Todas aparecen en `boletos.html`
- Se pueden activar/desactivar individualmente

---

## 🚨 Casos Especiales

### Si se Agota una Función:

- La función sigue visible
- Muestra "Agotada" o "0 disponibles"
- No se puede comprar más boletos
- No se elimina hasta que pase

### Si se Cancela una Función:

- Admin puede desactivarla desde panel
- Desaparece de `boletos.html`
- Los boletos vendidos se mantienen en historial
- Se puede reactivar después

### Si Cambia la Hora de una Función:

- Admin puede editar la función
- Cambiar fecha, hora, minutos
- Los cambios se reflejan inmediatamente
- Boletos ya vendidos no se afectan

---

## ✅ Checklist de Implementación

- [x] Sistema de fechas dinámicas
- [x] Generación automática de sábados
- [x] Sistema de funciones especiales
- [x] Bloqueo automático de ventas
- [x] Limpieza automática de funciones pasadas
- [x] Panel admin para gestionar funciones especiales
- [x] Integración con sistema de inventario
- [x] Integración con sistema de boletos
- [x] Actualización automática de UI

---

## 🔧 Troubleshooting

### Problema: No aparecen sábados

**Solución:**
- Verificar que `fechas.js` esté cargado
- Verificar consola del navegador
- Verificar que `FechasManager` esté disponible

### Problema: Funciones especiales no aparecen

**Solución:**
- Verificar que estén activas en panel admin
- Verificar que la fecha no haya pasado
- Verificar que `FechasManager` esté cargado

### Problema: Bloqueo no funciona

**Solución:**
- Verificar que la hora del sistema sea correcta
- Verificar que `verificarYLimpiar()` se ejecute
- Verificar configuración de `MINUTOS_BLOQUEO`

---

## 📈 Próximas Mejoras

1. **Notificaciones:**
   - Alertar cuando se acerca el bloqueo
   - Notificar cuando se crea función especial

2. **Estadísticas:**
   - Ver funciones más vendidas
   - Comparar sábados vs viernes

3. **Automatización:**
   - Crear funciones especiales recurrentes
   - Programar funciones con anticipación

---

**Sistema listo para usar** ✅
