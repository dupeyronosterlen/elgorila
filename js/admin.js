// --- PANEL DE ADMINISTRACIÓN ---
// Sistema para ver y gestionar ventas, inventario y estadísticas
// Integrado con sistema de autenticación y roles

const VENTAS_KEY = 'historial_ventas';

// Verificar acceso con nuevo sistema
function verificarAcceso() {
    const usuarioId = document.getElementById('usuario-input').value.trim();
    const password = document.getElementById('password-input').value;
    const errorDiv = document.getElementById('error-login');
    
    if (!usuarioId) {
        mostrarError(errorDiv, 'Por favor, ingresa un usuario ID');
        return;
    }
    
    if (!password) {
        mostrarError(errorDiv, 'Por favor, ingresa una contraseña');
        return;
    }
    
    const resultado = AuthManager.autenticar(usuarioId, password);
    
    if (resultado.exito) {
        ocultarError(errorDiv);
        mostrarPanel(resultado.usuario);
    } else {
        mostrarError(errorDiv, resultado.error || 'Error al autenticar');
    }
}

// Mostrar panel según rol
function mostrarPanel(usuario) {
    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    
    loginScreen.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    
    // Mostrar información del usuario
    document.getElementById('usuario-actual').textContent = usuario.nombre;
    document.getElementById('rol-actual').textContent = usuario.rol.toUpperCase();
    
    // Configurar permisos según rol
    configurarPermisos(usuario.rol);
    
    // Inicializar panel
    actualizarPanel();
}

// Configurar permisos según rol
function configurarPermisos(rol) {
    const accionesAdmin = document.getElementById('acciones-admin');
    const gestionUsuarios = document.getElementById('gestion-usuarios');
    const auditoria = document.getElementById('auditoria');
    const linkTaquilla = document.getElementById('link-taquilla');
    const linkAcomodadores = document.getElementById('link-acomodadores');
    
    // Mostrar/ocultar secciones según permisos
    if (AuthManager.tienePermiso('modificarInventario')) {
        accionesAdmin.classList.remove('hidden');
        
        // Habilitar/deshabilitar botones según permisos
        document.getElementById('btn-resetear').disabled = !AuthManager.tienePermiso('resetearInventario');
        document.getElementById('btn-limpiar-reservas').disabled = !AuthManager.tienePermiso('limpiarReservas');
        document.getElementById('btn-limpiar-ventas').disabled = !AuthManager.tienePermiso('limpiarVentas');
    } else {
        accionesAdmin.classList.add('hidden');
    }
    
    if (AuthManager.tienePermiso('gestionarUsuarios')) {
        gestionUsuarios.classList.remove('hidden');
        cargarUsuarios();
    } else {
        gestionUsuarios.classList.add('hidden');
    }
    
    if (AuthManager.tienePermiso('verAuditoria')) {
        auditoria.classList.remove('hidden');
        cargarAuditoria();
    } else {
        auditoria.classList.add('hidden');
    }
    
    // Mostrar enlaces según permisos
    if (AuthManager.tienePermiso('verInventario')) {
        if (linkTaquilla) linkTaquilla.classList.remove('hidden');
    }
    
    if (AuthManager.tienePermiso('verificarBoletos')) {
        if (linkAcomodadores) linkAcomodadores.classList.remove('hidden');
    }
    
    // Mostrar/ocultar secciones según permisos de visualización
    if (!AuthManager.tienePermiso('verInventario')) {
        document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3').style.display = 'none';
        document.querySelector('#inventario-fechas').parentElement.style.display = 'none';
    }
    
    if (!AuthManager.tienePermiso('verVentas')) {
        document.querySelector('#tabla-ventas').parentElement.parentElement.style.display = 'none';
    }
}

// Verificar si ya hay sesión activa
function verificarSesion() {
    const usuario = AuthManager.obtenerUsuarioActual();
    
    if (usuario) {
        mostrarPanel(usuario);
    }
}

// Cerrar sesión
function cerrarSesion() {
    AuthManager.cerrarSesion();
    location.reload();
}

// Cargar y mostrar datos del panel
function actualizarPanel() {
    if (AuthManager.tienePermiso('verInventario')) {
        cargarInventario();
    }
    if (AuthManager.tienePermiso('verVentas')) {
        cargarVentas();
    }
    if (AuthManager.tienePermiso('verInventario') || AuthManager.tienePermiso('verVentas')) {
        cargarEstadisticas();
    }
}

// Cargar inventario (actualizado para fechas dinámicas)
function cargarInventario() {
    if (!AuthManager.tienePermiso('verInventario')) return;
    
    const inventario = InventarioManager.obtenerInventario();
    const reservas = obtenerReservas();
    
    let html = '';
    let totalDisponible = 0;
    let totalReservas = 0;
    
    // Obtener funciones dinámicas
    let funciones = [];
    if (typeof FechasManager !== 'undefined') {
        const funcionesData = FechasManager.obtenerFunciones();
        funciones = [...funcionesData.especiales, ...funcionesData.regulares];
    } else {
        // Fallback a fechas fijas si FechasManager no está disponible
        funciones = [
            { clave: 'sabado', nombre: 'Sábado 21 Oct - 19:00 hrs' }
        ];
    }
    
    for (const funcion of funciones) {
        const datos = inventario[funcion.clave] || { total: 200, vendidos: 0, reservados: 0 };
        const reservados = calcularReservadosPorFecha(funcion.clave, reservas);
        const disponible = datos.total - datos.vendidos - reservados;
        totalDisponible += disponible;
        totalReservas += reservados;
        
        const porcentaje = (datos.vendidos / datos.total) * 100;
        const bloqueada = funcion.bloqueada ? ' (Bloqueada)' : '';
        
        html += `
            <div class="border border-primary/20 rounded-sm p-4">
                <h3 class="font-semibold text-text-dark mb-3">${funcion.nombre}${bloqueada}</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-text-dark/70">Total:</span>
                        <span class="text-text-dark font-semibold">${datos.total}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-text-dark/70">Vendidos:</span>
                        <span class="text-green-400 font-semibold">${datos.vendidos}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-text-dark/70">Reservados:</span>
                        <span class="text-yellow-400 font-semibold">${reservados}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-text-dark/70">Disponible:</span>
                        <span class="text-primary font-semibold">${disponible}</span>
                    </div>
                    <div class="mt-3">
                        <div class="w-full bg-background-dark rounded-full h-2">
                            <div class="bg-primary h-2 rounded-full" style="width: ${porcentaje}%"></div>
                        </div>
                        <p class="text-xs text-text-dark/60 mt-1">${porcentaje.toFixed(1)}% vendido</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    document.getElementById('inventario-fechas').innerHTML = html;
    document.getElementById('total-disponible').textContent = totalDisponible;
    document.getElementById('reservas-activas').textContent = totalReservas;
}

// Cargar ventas
function cargarVentas() {
    if (!AuthManager.tienePermiso('verVentas')) return;
    
    const ventas = obtenerVentas();
    
    if (ventas.length === 0) {
        document.getElementById('tabla-ventas').innerHTML = `
            <tr>
                <td colspan="6" class="py-8 text-center text-text-dark/60">No hay ventas registradas</td>
            </tr>
        `;
        return;
    }
    
    // Ordenar por fecha más reciente
    ventas.sort((a, b) => new Date(b.fechaCompra) - new Date(a.fechaCompra));
    
    let html = '';
    ventas.forEach(venta => {
        const fecha = new Date(venta.fechaCompra).toLocaleString('es-MX');
        html += `
            <tr class="border-b border-primary/10 hover:bg-primary/5 transition-colors">
                <td class="py-3 text-text-dark font-mono text-sm">${venta.numeroOrden || 'N/A'}</td>
                <td class="py-3 text-text-dark/80 text-sm">${fecha}</td>
                <td class="py-3 text-text-dark/80">${venta.fecha || 'N/A'}</td>
                <td class="py-3 text-text-dark/80">${venta.cantidad}</td>
                <td class="py-3 text-primary font-semibold">$${venta.totalFinal.toFixed(2)}</td>
                <td class="py-3 text-text-dark/80 text-sm">${venta.email || 'N/A'}</td>
            </tr>
        `;
    });
    
    document.getElementById('tabla-ventas').innerHTML = html;
}

// Cargar estadísticas
function cargarEstadisticas() {
    const ventas = obtenerVentas();
    
    let totalVendido = 0;
    let totalBoletos = 0;
    
    ventas.forEach(venta => {
        totalVendido += venta.totalFinal || 0;
        totalBoletos += venta.cantidad || 0;
    });
    
    document.getElementById('total-vendido').textContent = `$${totalVendido.toFixed(2)} MXN`;
    document.getElementById('total-boletos-vendidos').textContent = `${totalBoletos} boletos vendidos`;
}

// Cargar usuarios
function cargarUsuarios() {
    if (!AuthManager.tienePermiso('gestionarUsuarios')) return;
    
    const usuarios = AuthManager.obtenerUsuarios();
    const usuariosArray = Object.values(usuarios);
    
    if (usuariosArray.length === 0) {
        document.getElementById('tabla-usuarios').innerHTML = `
            <tr>
                <td colspan="6" class="py-8 text-center text-text-dark/60">No hay usuarios registrados</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    usuariosArray.forEach(usuario => {
        const ultimoAcceso = usuario.ultimoAcceso 
            ? new Date(usuario.ultimoAcceso).toLocaleString('es-MX')
            : 'Nunca';
        
        html += `
            <tr class="border-b border-primary/10 hover:bg-primary/5 transition-colors">
                <td class="py-3 text-text-dark font-mono text-sm">${usuario.id}</td>
                <td class="py-3 text-text-dark/80">${usuario.nombre}</td>
                <td class="py-3 text-text-dark/80">
                    <span class="px-2 py-1 bg-primary/20 text-primary rounded text-xs">${usuario.rol.toUpperCase()}</span>
                </td>
                <td class="py-3 text-text-dark/80">
                    <span class="px-2 py-1 ${usuario.activo ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'} rounded text-xs">
                        ${usuario.activo ? 'Activo' : 'Inactivo'}
                    </span>
                </td>
                <td class="py-3 text-text-dark/60 text-sm">${ultimoAcceso}</td>
                <td class="py-3">
                    <button onclick="editarUsuario('${usuario.id}')" class="px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs mr-2">
                        Editar
                    </button>
                    ${usuario.rol !== 'admin' && usuario.rol !== 'gerente' ? `
                        <button onclick="eliminarUsuarioConfirmar('${usuario.id}')" class="px-3 py-1 bg-red-900/30 hover:bg-red-900/40 text-red-300 rounded text-xs">
                            Eliminar
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });
    
    document.getElementById('tabla-usuarios').innerHTML = html;
}

// Cargar auditoría
function cargarAuditoria() {
    if (!AuthManager.tienePermiso('verAuditoria')) return;
    
    const auditoria = AuthManager.obtenerAuditoria(100);
    
    if (auditoria.length === 0) {
        document.getElementById('tabla-auditoria').innerHTML = `
            <tr>
                <td colspan="5" class="py-8 text-center text-text-dark/60">No hay registros de auditoría</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    auditoria.forEach(entrada => {
        const fecha = new Date(entrada.fecha).toLocaleString('es-MX');
        html += `
            <tr class="border-b border-primary/10 hover:bg-primary/5 transition-colors">
                <td class="py-3 text-text-dark/80 text-sm">${fecha}</td>
                <td class="py-3 text-text-dark/80">${entrada.usuario}</td>
                <td class="py-3 text-text-dark/80">
                    <span class="px-2 py-1 bg-primary/20 text-primary rounded text-xs">${entrada.rol.toUpperCase()}</span>
                </td>
                <td class="py-3 text-text-dark/80">
                    <span class="px-2 py-1 bg-accent-gold/20 text-accent-gold rounded text-xs">${entrada.accion}</span>
                </td>
                <td class="py-3 text-text-dark/60 text-sm">${entrada.detalles}</td>
            </tr>
        `;
    });
    
    document.getElementById('tabla-auditoria').innerHTML = html;
}

// Mostrar formulario de usuario
let usuarioEditando = null;

function mostrarFormularioUsuario(usuarioId = null) {
    usuarioEditando = usuarioId;
    const modal = document.getElementById('modal-usuario');
    const titulo = document.getElementById('modal-titulo');
    
    if (usuarioId) {
        titulo.textContent = 'Editar Usuario';
        const usuarios = AuthManager.obtenerUsuarios();
        const usuario = usuarios[usuarioId];
        
        if (usuario) {
            document.getElementById('modal-usuario-id').value = usuario.id;
            document.getElementById('modal-usuario-id').disabled = true;
            document.getElementById('modal-usuario-nombre').value = usuario.nombre;
            document.getElementById('modal-usuario-rol').value = usuario.rol;
            document.getElementById('modal-usuario-password').value = '';
            document.getElementById('modal-usuario-password').placeholder = 'Dejar vacío para no cambiar';
        }
    } else {
        titulo.textContent = 'Nuevo Usuario';
        document.getElementById('modal-usuario-id').value = '';
        document.getElementById('modal-usuario-id').disabled = false;
        document.getElementById('modal-usuario-nombre').value = '';
        document.getElementById('modal-usuario-rol').value = 'taquilla';
        document.getElementById('modal-usuario-password').value = '';
        document.getElementById('modal-usuario-password').placeholder = 'Nueva contraseña';
    }
    
    ocultarError(document.getElementById('error-usuario'));
    modal.classList.remove('hidden');
}

// Cerrar modal de usuario
function cerrarModalUsuario() {
    document.getElementById('modal-usuario').classList.add('hidden');
    usuarioEditando = null;
}

// Guardar usuario
function guardarUsuario() {
    const errorDiv = document.getElementById('error-usuario');
    const usuarioId = document.getElementById('modal-usuario-id').value.trim();
    const nombre = document.getElementById('modal-usuario-nombre').value.trim();
    const rol = document.getElementById('modal-usuario-rol').value;
    const password = document.getElementById('modal-usuario-password').value;
    
    if (!usuarioId || !nombre || !rol) {
        mostrarError(errorDiv, 'Por favor, completa todos los campos');
        return;
    }
    
    if (usuarioEditando) {
        // Editar usuario existente
        const cambios = {
            nombre: nombre,
            rol: rol
        };
        
        if (password) {
            cambios.password = password;
        }
        
        const resultado = AuthManager.modificarUsuario(usuarioId, cambios);
        
        if (resultado.exito) {
            cerrarModalUsuario();
            cargarUsuarios();
        } else {
            mostrarError(errorDiv, resultado.error);
        }
    } else {
        // Crear nuevo usuario
        if (!password) {
            mostrarError(errorDiv, 'La contraseña es obligatoria para nuevos usuarios');
            return;
        }
        
        const resultado = AuthManager.crearUsuario(usuarioId, nombre, rol, password);
        
        if (resultado.exito) {
            cerrarModalUsuario();
            cargarUsuarios();
        } else {
            mostrarError(errorDiv, resultado.error);
        }
    }
}

// Editar usuario
function editarUsuario(usuarioId) {
    mostrarFormularioUsuario(usuarioId);
}

// Eliminar usuario (con confirmación)
function eliminarUsuarioConfirmar(usuarioId) {
    const usuarios = AuthManager.obtenerUsuarios();
    const usuario = usuarios[usuarioId];
    
    if (!usuario) return;
    
    if (!confirm(`¿Estás seguro de eliminar al usuario "${usuario.nombre}"? Esta acción no se puede deshacer.`)) {
        return;
    }
    
    const resultado = AuthManager.eliminarUsuario(usuarioId);
    
    if (resultado.exito) {
        cargarUsuarios();
    } else {
        alert('Error: ' + resultado.error);
    }
}

// Exportar auditoría
function exportarAuditoria() {
    const auditoria = AuthManager.obtenerAuditoria(1000);
    
    const datos = {
        fechaExportacion: new Date().toISOString(),
        auditoria: auditoria
    };
    
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Obtener reservas
function obtenerReservas() {
    const reservas = localStorage.getItem('reservas_temporales');
    return reservas ? JSON.parse(reservas) : {};
}

// Calcular reservados por fecha
function calcularReservadosPorFecha(fecha, reservas) {
    let total = 0;
    const ahora = Date.now();
    const TIEMPO_RESERVA = 4 * 60 * 1000;
    
    for (const reserva of Object.values(reservas)) {
        if (reserva.fecha === fecha && (ahora - reserva.timestamp < TIEMPO_RESERVA)) {
            total += reserva.cantidad || 0;
        }
    }
    
    return total;
}

// Obtener ventas
function obtenerVentas() {
    const ventas = localStorage.getItem(VENTAS_KEY);
    if (!ventas) return [];
    
    try {
        return JSON.parse(ventas);
    } catch (e) {
        return [];
    }
}

// Guardar venta en historial
function guardarVenta(orden) {
    if (orden.estado !== 'completada') return;
    
    const ventas = obtenerVentas();
    ventas.push(orden);
    localStorage.setItem(VENTAS_KEY, JSON.stringify(ventas));
}

// Exportar datos
function exportarDatos() {
    if (!AuthManager.tienePermiso('exportarDatos')) {
        alert('No tienes permiso para exportar datos');
        return;
    }
    
    const ventas = obtenerVentas();
    const inventario = InventarioManager.obtenerInventario();
    
    const datos = {
        fechaExportacion: new Date().toISOString(),
        inventario: inventario,
        ventas: ventas,
        estadisticas: {
            totalVendido: ventas.reduce((sum, v) => sum + (v.totalFinal || 0), 0),
            totalBoletos: ventas.reduce((sum, v) => sum + (v.cantidad || 0), 0)
        }
    };
    
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exportacion_boletos_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    // Registrar en auditoría
    const usuario = AuthManager.obtenerUsuarioActual();
    AuthManager.registrarAuditoria({
        accion: 'exportar_datos',
        usuario: usuario.nombre,
        rol: usuario.rol,
        detalles: 'Exportación de datos del sistema'
    });
}

// Resetear inventario (con auditoría)
function resetearInventario() {
    if (!AuthManager.tienePermiso('resetearInventario')) {
        alert('No tienes permiso para resetear el inventario');
        return;
    }
    
    if (!confirm('¿Estás seguro de resetear el inventario? Esto no afectará las ventas registradas.')) {
        return;
    }
    
    const inventario = {
        'viernes': { total: 100, vendidos: 0, reservados: 0 },
        'sabado': { total: 100, vendidos: 0, reservados: 0 },
        'domingo': { total: 100, vendidos: 0, reservados: 0 }
    };
    
    localStorage.setItem('inventario_boletos', JSON.stringify(inventario));
    alert('Inventario reseteado');
    actualizarPanel();
    
    // Registrar en auditoría
    const usuario = AuthManager.obtenerUsuarioActual();
    AuthManager.registrarAuditoria({
        accion: 'resetear_inventario',
        usuario: usuario.nombre,
        rol: usuario.rol,
        detalles: 'Inventario reseteado a valores por defecto',
        cambios: { inventario: inventario }
    });
}

// Limpiar reservas (con auditoría)
function limpiarReservas() {
    if (!AuthManager.tienePermiso('limpiarReservas')) {
        alert('No tienes permiso para limpiar reservas');
        return;
    }
    
    if (!confirm('¿Limpiar todas las reservas expiradas?')) {
        return;
    }
    
    const reservas = obtenerReservas();
    const ahora = Date.now();
    const TIEMPO_RESERVA = 4 * 60 * 1000;
    const reservasActivas = {};
    let eliminadas = 0;
    
    for (const [id, reserva] of Object.entries(reservas)) {
        if (ahora - reserva.timestamp < TIEMPO_RESERVA) {
            reservasActivas[id] = reserva;
        } else {
            eliminadas++;
        }
    }
    
    localStorage.setItem('reservas_temporales', JSON.stringify(reservasActivas));
    alert(`Reservas expiradas limpiadas (${eliminadas} eliminadas)`);
    actualizarPanel();
    
    // Registrar en auditoría
    const usuario = AuthManager.obtenerUsuarioActual();
    AuthManager.registrarAuditoria({
        accion: 'limpiar_reservas',
        usuario: usuario.nombre,
        rol: usuario.rol,
        detalles: `${eliminadas} reservas expiradas eliminadas`
    });
}

// Limpiar historial de ventas (con auditoría)
function limpiarVentas() {
    if (!AuthManager.tienePermiso('limpiarVentas')) {
        alert('No tienes permiso para limpiar ventas');
        return;
    }
    
    if (!confirm('¿Estás seguro de limpiar el historial de ventas? Esta acción no se puede deshacer.')) {
        return;
    }
    
    if (!confirm('¿REALMENTE estás seguro? Esto eliminará todos los registros de ventas.')) {
        return;
    }
    
    const ventasAntes = obtenerVentas().length;
    localStorage.removeItem(VENTAS_KEY);
    alert('Historial de ventas limpiado');
    actualizarPanel();
    
    // Registrar en auditoría
    const usuario = AuthManager.obtenerUsuarioActual();
    AuthManager.registrarAuditoria({
        accion: 'limpiar_ventas',
        usuario: usuario.nombre,
        rol: usuario.rol,
        detalles: `Historial de ventas limpiado (${ventasAntes} registros eliminados)`
    });
}

// Funciones auxiliares
function mostrarError(div, mensaje) {
    if (div) {
        div.textContent = mensaje;
        div.classList.remove('hidden');
    }
}

function ocultarError(div) {
    if (div) {
        div.classList.add('hidden');
    }
}

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    verificarSesion();
    
    // Actualizar cada 30 segundos (solo si hay sesión activa)
    setInterval(function() {
        if (AuthManager.obtenerUsuarioActual()) {
            actualizarPanel();
            if (AuthManager.tienePermiso('verAuditoria')) {
                cargarAuditoria();
            }
        }
    }, 30000);
    
    // Permitir acceso con Enter
    const usuarioInput = document.getElementById('usuario-input');
    const passwordInput = document.getElementById('password-input');
    
    if (usuarioInput) {
        usuarioInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                passwordInput.focus();
            }
        });
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                verificarAcceso();
            }
        });
    }
});

// Gestión de Funciones Especiales
let funcionEditando = null;

function cargarFuncionesEspeciales() {
    if (!AuthManager.tienePermiso('gestionarUsuarios')) return;
    if (typeof FechasManager === 'undefined') return;
    
    const especiales = FechasManager.obtenerFuncionesEspeciales();
    
    if (especiales.length === 0) {
        document.getElementById('tabla-funciones-especiales').innerHTML = `
            <tr>
                <td colspan="4" class="py-8 text-center text-text-dark/60">No hay funciones especiales configuradas</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    especiales.forEach(funcion => {
        const fecha = new Date(funcion.fecha);
        const fechaFormateada = FechasManager.formatearFecha(fecha);
        const estado = funcion.activa ? 'Activa' : 'Inactiva';
        const estadoClass = funcion.activa ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300';
        
        html += `
            <tr class="border-b border-primary/10 hover:bg-primary/5 transition-colors">
                <td class="py-3 text-text-dark/80">${funcion.nombre}</td>
                <td class="py-3 text-text-dark/80">${fechaFormateada}</td>
                <td class="py-3">
                    <span class="px-2 py-1 rounded text-xs font-semibold ${estadoClass}">${estado}</span>
                </td>
                <td class="py-3">
                    <button onclick="editarFuncionEspecial('${funcion.id}')" class="px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs mr-2">
                        Editar
                    </button>
                    <button onclick="toggleFuncionEspecial('${funcion.id}')" class="px-3 py-1 bg-yellow-900/30 hover:bg-yellow-900/40 text-yellow-300 rounded text-xs mr-2">
                        ${funcion.activa ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onclick="eliminarFuncionEspecialConfirmar('${funcion.id}')" class="px-3 py-1 bg-red-900/30 hover:bg-red-900/40 text-red-300 rounded text-xs">
                        Eliminar
                    </button>
                </td>
            </tr>
        `;
    });
    
    document.getElementById('tabla-funciones-especiales').innerHTML = html;
}

function mostrarFormularioFuncion(id = null) {
    funcionEditando = id;
    const modal = document.getElementById('modal-funcion');
    const titulo = document.getElementById('modal-funcion-titulo');
    
    if (id) {
        titulo.textContent = 'Editar Función Especial';
        const especiales = FechasManager.obtenerFuncionesEspeciales();
        const funcion = especiales.find(f => f.id === id);
        
        if (funcion) {
            const fecha = new Date(funcion.fecha);
            document.getElementById('modal-funcion-nombre').value = funcion.nombre;
            document.getElementById('modal-funcion-fecha').value = fecha.toISOString().split('T')[0];
            document.getElementById('modal-funcion-hora').value = funcion.hora || 20;
            document.getElementById('modal-funcion-minutos').value = funcion.minutos || 10;
        }
    } else {
        titulo.textContent = 'Nueva Función Especial';
        document.getElementById('modal-funcion-nombre').value = '';
        document.getElementById('modal-funcion-fecha').value = '';
        document.getElementById('modal-funcion-hora').value = 19;
        document.getElementById('modal-funcion-minutos').value = 10;
    }
    
    ocultarError(document.getElementById('error-funcion'));
    modal.classList.remove('hidden');
}

function cerrarModalFuncion() {
    document.getElementById('modal-funcion').classList.add('hidden');
    funcionEditando = null;
}

function guardarFuncion() {
    const errorDiv = document.getElementById('error-funcion');
    const nombre = document.getElementById('modal-funcion-nombre').value.trim();
    const fecha = document.getElementById('modal-funcion-fecha').value;
    const hora = parseInt(document.getElementById('modal-funcion-hora').value);
    const minutos = parseInt(document.getElementById('modal-funcion-minutos').value);
    
    if (!nombre || !fecha) {
        mostrarError(errorDiv, 'Por favor, completa todos los campos');
        return;
    }
    
    if (funcionEditando) {
        // Editar función existente
        const fechaObj = new Date(fecha);
        fechaObj.setHours(hora, minutos, 0, 0);
        
        const resultado = FechasManager.actualizarFuncionEspecial(funcionEditando, {
            nombre: nombre,
            fecha: fechaObj.toISOString(),
            hora: hora,
            minutos: minutos
        });
        
        if (resultado.exito) {
            cerrarModalFuncion();
            cargarFuncionesEspeciales();
            cargarInventario();
        } else {
            mostrarError(errorDiv, resultado.error);
        }
    } else {
        // Crear nueva función
        const resultado = FechasManager.crearFuncionEspecial(fecha, nombre, hora, minutos);
        
        if (resultado) {
            cerrarModalFuncion();
            cargarFuncionesEspeciales();
            cargarInventario();
            
            // Registrar en auditoría
            const usuario = AuthManager.obtenerUsuarioActual();
            AuthManager.registrarAuditoria({
                accion: 'crear_funcion_especial',
                usuario: usuario.nombre,
                rol: usuario.rol,
                detalles: `Función especial creada: ${nombre}`,
                cambios: { funcion: resultado }
            });
        } else {
            mostrarError(errorDiv, 'Error al crear función');
        }
    }
}

function editarFuncionEspecial(id) {
    mostrarFormularioFuncion(id);
}

function toggleFuncionEspecial(id) {
    const resultado = FechasManager.toggleFuncionEspecial(id);
    
    if (resultado.exito) {
        cargarFuncionesEspeciales();
        cargarInventario();
        
        // Registrar en auditoría
        const usuario = AuthManager.obtenerUsuarioActual();
        AuthManager.registrarAuditoria({
            accion: resultado.funcion.activa ? 'activar_funcion_especial' : 'desactivar_funcion_especial',
            usuario: usuario.nombre,
            rol: usuario.rol,
            detalles: `Función especial ${resultado.funcion.activa ? 'activada' : 'desactivada'}: ${resultado.funcion.nombre}`
        });
    }
}

function eliminarFuncionEspecialConfirmar(id) {
    const especiales = FechasManager.obtenerFuncionesEspeciales();
    const funcion = especiales.find(f => f.id === id);
    
    if (!funcion) return;
    
    if (!confirm(`¿Estás seguro de eliminar la función "${funcion.nombre}"? Esta acción no se puede deshacer.`)) {
        return;
    }
    
    const resultado = FechasManager.eliminarFuncionEspecial(id);
    
    if (resultado.exito) {
        cargarFuncionesEspeciales();
        cargarInventario();
        
        // Registrar en auditoría
        const usuario = AuthManager.obtenerUsuarioActual();
        AuthManager.registrarAuditoria({
            accion: 'eliminar_funcion_especial',
            usuario: usuario.nombre,
            rol: usuario.rol,
            detalles: `Función especial eliminada: ${funcion.nombre}`
        });
    }
}

// Exportar funciones para uso en HTML
window.verificarAcceso = verificarAcceso;
window.cerrarSesion = cerrarSesion;
window.actualizarPanel = actualizarPanel;
window.exportarDatos = exportarDatos;
window.resetearInventario = resetearInventario;
window.limpiarReservas = limpiarReservas;
window.limpiarVentas = limpiarVentas;
window.mostrarFormularioUsuario = mostrarFormularioUsuario;
window.cerrarModalUsuario = cerrarModalUsuario;
window.guardarUsuario = guardarUsuario;
window.editarUsuario = editarUsuario;
window.eliminarUsuarioConfirmar = eliminarUsuarioConfirmar;
window.exportarAuditoria = exportarAuditoria;
window.mostrarFormularioFuncion = mostrarFormularioFuncion;
window.cerrarModalFuncion = cerrarModalFuncion;
window.guardarFuncion = guardarFuncion;
window.editarFuncionEspecial = editarFuncionEspecial;
window.toggleFuncionEspecial = toggleFuncionEspecial;
window.eliminarFuncionEspecialConfirmar = eliminarFuncionEspecialConfirmar;

// Exportar función para guardar ventas desde checkout
window.guardarVentaEnHistorial = guardarVenta;
