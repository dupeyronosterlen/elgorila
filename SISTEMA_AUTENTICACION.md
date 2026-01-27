# 🔐 Sistema de Autenticación y Roles - Guía Completa

## 📋 Resumen

Sistema completo de autenticación con múltiples roles, permisos y auditoría de cambios. Cada acción importante genera un registro con firma digital.

---

## 👥 Roles Disponibles

### 1. **Administrador** (`admin`)
- ✅ Acceso completo al sistema
- ✅ Puede hacer cambios directos
- ✅ Gestión de usuarios
- ✅ Ver auditoría completa
- ✅ Exportar datos

**Usuario por defecto:** `admin` / `admin2024`

---

### 2. **Gerente General** (`gerente`)
- ✅ Acceso completo al sistema
- ✅ Puede hacer cambios directos
- ✅ Gestión de usuarios
- ✅ Ver auditoría completa
- ✅ Exportar datos

**Usuario por defecto:** `gerente` / `gerente2024`

---

### 3. **Taquilla** (`taquilla`)
- ✅ Ver inventario
- ✅ Ver ventas
- ✅ Exportar datos
- ❌ No puede hacer cambios
- ❌ No puede gestionar usuarios

**Usuario por defecto:** `taquilla1` / `taquilla2024`

---

### 4. **Validación QR** (`validacion`)
- ✅ Verificar boletos QR
- ❌ No puede ver inventario
- ❌ No puede ver ventas
- ❌ No puede hacer cambios

**Usuarios por defecto:**
- `validacion1` / `validacion2024`
- `validacion2` / `validacion2024`
- `validacion3` / `validacion2024`

---

### 5. **Reclamos** (`reclamos`)
- ✅ Ver ventas
- ✅ Gestionar reclamos
- ❌ No puede ver inventario
- ❌ No puede hacer cambios

**Usuario por defecto:** `reclamos1` / `reclamos2024`

---

## 🚀 Cómo Acceder al Panel de Administración

### Paso 1: Ir a `admin.html`

Abre el archivo `admin.html` en tu navegador o accede a:
```
http://localhost:8000/admin.html
```

### Paso 2: Ingresar Credenciales

1. **Usuario ID:** Ingresa el ID del usuario (ej: `admin`, `gerente`, `taquilla1`)
2. **Contraseña:** Ingresa la contraseña correspondiente

### Paso 3: Acceder

Haz clic en "Acceder" o presiona Enter.

---

## 🔑 Usuarios por Defecto

| Usuario ID | Contraseña | Rol | Descripción |
|------------|------------|-----|-------------|
| `admin` | `admin2024` | Administrador | Acceso completo |
| `gerente` | `gerente2024` | Gerente | Acceso completo |
| `taquilla1` | `taquilla2024` | Taquilla | Solo lectura |
| `validacion1` | `validacion2024` | Validación | Solo QR |
| `validacion2` | `validacion2024` | Validación | Solo QR |
| `validacion3` | `validacion2024` | Validación | Solo QR |
| `reclamos1` | `reclamos2024` | Reclamos | Ver ventas |

**⚠️ IMPORTANTE:** Cambia estas contraseñas en producción.

---

## 👤 Gestión de Usuarios

### Solo Admin y Gerente pueden gestionar usuarios

### Crear Nuevo Usuario:

1. Accede como Admin o Gerente
2. Ve a la sección "Gestión de Usuarios"
3. Haz clic en "Nuevo Usuario"
4. Completa el formulario:
   - **Usuario ID:** Identificador único (ej: `taquilla2`)
   - **Nombre:** Nombre completo
   - **Rol:** Selecciona el rol
   - **Contraseña:** Contraseña inicial
5. Haz clic en "Guardar"

### Editar Usuario:

1. En la tabla de usuarios, haz clic en "Editar"
2. Modifica los campos necesarios
3. Si dejas la contraseña vacía, no se cambiará
4. Haz clic en "Guardar"

### Eliminar Usuario:

1. En la tabla de usuarios, haz clic en "Eliminar"
2. Confirma la acción
3. **Nota:** No se pueden eliminar usuarios Admin o Gerente

---

## 📊 Sistema de Auditoría

### ¿Qué se registra?

Cada acción importante genera un registro con:
- ✅ Fecha y hora exacta
- ✅ Usuario que realizó la acción
- ✅ Rol del usuario
- ✅ Tipo de acción
- ✅ Detalles de la acción
- ✅ Cambios realizados (si aplica)
- ✅ IP y User Agent

### Acciones Registradas:

- `login` - Inicio de sesión
- `logout` - Cierre de sesión
- `crear_usuario` - Creación de usuario
- `modificar_usuario` - Modificación de usuario
- `eliminar_usuario` - Eliminación de usuario
- `resetear_inventario` - Resetear inventario
- `limpiar_reservas` - Limpiar reservas expiradas
- `limpiar_ventas` - Limpiar historial de ventas
- `exportar_datos` - Exportación de datos
- `exportar_auditoria` - Exportación de auditoría

### Ver Auditoría:

1. Accede como Admin o Gerente
2. Ve a la sección "Registro de Auditoría"
3. Verás los últimos 100 registros
4. Puedes exportar la auditoría completa

### Exportar Auditoría:

1. En la sección de auditoría, haz clic en "Exportar Auditoría"
2. Se descargará un archivo JSON con todos los registros

---

## 🔒 Permisos por Rol

### Matriz de Permisos:

| Acción | Admin | Gerente | Taquilla | Validación | Reclamos |
|--------|-------|---------|----------|------------|----------|
| Ver Inventario | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ver Ventas | ✅ | ✅ | ✅ | ❌ | ✅ |
| Modificar Inventario | ✅ | ✅ | ❌ | ❌ | ❌ |
| Resetear Inventario | ✅ | ✅ | ❌ | ❌ | ❌ |
| Limpiar Reservas | ✅ | ✅ | ❌ | ❌ | ❌ |
| Limpiar Ventas | ✅ | ✅ | ❌ | ❌ | ❌ |
| Verificar Boletos QR | ✅ | ✅ | ❌ | ✅ | ❌ |
| Gestionar Reclamos | ✅ | ✅ | ❌ | ❌ | ✅ |
| Gestionar Usuarios | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver Auditoría | ✅ | ✅ | ❌ | ❌ | ❌ |
| Exportar Datos | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## 🎯 Casos de Uso

### Para Taquilla:

1. **Acceder:** `taquilla1` / `taquilla2024`
2. **Ver:** Inventario y ventas
3. **Exportar:** Datos para reportes
4. **No puede:** Hacer cambios ni gestionar usuarios

### Para Validación QR:

1. **Acceder:** `validacion1` / `validacion2024`
2. **Usar:** Página `verificar.html` para validar boletos
3. **No puede:** Ver inventario ni ventas en el panel admin

### Para Reclamos:

1. **Acceder:** `reclamos1` / `reclamos2024`
2. **Ver:** Ventas para atender reclamos
3. **Gestionar:** Reclamos de clientes
4. **No puede:** Ver inventario ni hacer cambios

### Para Admin/Gerente:

1. **Acceder:** `admin` / `admin2024` o `gerente` / `gerente2024`
2. **Hacer:** Cualquier cambio necesario
3. **Gestionar:** Usuarios del sistema
4. **Ver:** Auditoría completa de todos los cambios

---

## 🔐 Seguridad

### Cambios con Firma Digital:

Cada cambio importante genera un registro de auditoría que incluye:
- Usuario que hizo el cambio
- Fecha y hora exacta
- Detalles del cambio
- Estado anterior y nuevo (si aplica)

### Solo Admin y Gerente pueden:

- Hacer cambios directos al sistema
- Gestionar usuarios
- Ver auditoría completa

### Otros roles:

- Solo pueden ver información
- No pueden modificar nada
- Sus acciones también se registran en auditoría

---

## 📝 Ejemplo de Registro de Auditoría

```json
{
  "id": "AUD-1697824800000-ABC123",
  "fecha": "2024-10-20T15:30:00.000Z",
  "accion": "resetear_inventario",
  "usuario": "Administrador",
  "rol": "admin",
  "detalles": "Inventario reseteado a valores por defecto",
  "cambios": {
    "inventario": {
      "viernes": { "total": 100, "vendidos": 0 },
      "sabado": { "total": 100, "vendidos": 0 },
      "domingo": { "total": 100, "vendidos": 0 }
    }
  },
  "ip": "local",
  "userAgent": "Mozilla/5.0..."
}
```

---

## 🛠️ Mantenimiento

### Cambiar Contraseñas:

1. Accede como Admin o Gerente
2. Ve a "Gestión de Usuarios"
3. Haz clic en "Editar" en el usuario
4. Ingresa la nueva contraseña
5. Guarda los cambios

### Desactivar Usuario:

1. Edita el usuario
2. Cambia el estado a "Inactivo"
3. El usuario no podrá iniciar sesión

### Ver Últimos Accesos:

En la tabla de usuarios, verás la columna "Último Acceso" que muestra cuándo fue la última vez que cada usuario inició sesión.

---

## ⚠️ Importante

1. **Cambiar contraseñas por defecto** antes de usar en producción
2. **No compartir credenciales** de Admin o Gerente
3. **Revisar auditoría regularmente** para detectar actividades sospechosas
4. **Exportar auditoría** periódicamente como backup

---

## 📞 Soporte

Si tienes problemas:
1. Verifica que `auth.js` esté cargado
2. Revisa la consola del navegador (F12)
3. Verifica que los usuarios estén inicializados en localStorage
4. Revisa esta documentación

---

**Sistema listo para usar** ✅
