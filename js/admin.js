// --- PANEL DE ADMINISTRACIÓN ---
// Sistema para ver y gestionar ventas, inventario y estadísticas
// Integrado con sistema de autenticación y roles

const VENTAS_KEY = 'historial_ventas';
const MENSAJES_KEY = 'elgorila_mensajes';

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
        var miCuenta = document.getElementById('mi-cuenta-block');
        if (miCuenta) miCuenta.classList.add('hidden');
        var btnMiCuenta = document.getElementById('btn-mi-cuenta');
        if (btnMiCuenta) btnMiCuenta.classList.add('hidden');
    } else {
        gestionUsuarios.classList.add('hidden');
        var miCuenta = document.getElementById('mi-cuenta-block');
        if (miCuenta) miCuenta.classList.remove('hidden');
        var btnMiCuenta = document.getElementById('btn-mi-cuenta');
        if (btnMiCuenta) btnMiCuenta.classList.remove('hidden');
    }
    var sectionConfig = document.getElementById('seccion-config');
    var sectionMensajes = document.getElementById('seccion-mensajes');
    if (AuthManager.puedeHacerCambios()) {
        if (sectionConfig) sectionConfig.classList.remove('hidden');
        if (sectionMensajes) sectionMensajes.classList.remove('hidden');
        cargarUrlVenta();
        cargarInstagram();
        cargarMusica();
        cargarWhatsApp();
        cargarEmail();
        cargarAdminFooter();
        cargarSinopsis();
        cargarMensajes();
    } else {
        if (sectionConfig) sectionConfig.classList.add('hidden');
        if (sectionMensajes) sectionMensajes.classList.add('hidden');
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
    var sectionInventario = document.getElementById('seccion-inventario');
    var sectionVentas = document.getElementById('seccion-ventas');
    if (!AuthManager.tienePermiso('verInventario')) {
        if (sectionInventario) sectionInventario.classList.add('hidden');
    } else {
        if (sectionInventario) sectionInventario.classList.remove('hidden');
    }
    if (!AuthManager.tienePermiso('verVentas')) {
        if (sectionVentas) sectionVentas.classList.add('hidden');
    } else {
        if (sectionVentas) sectionVentas.classList.remove('hidden');
    }
    
    actualizarNavAdmin();
}

// Sincroniza visibilidad del menú de navegación con las secciones visibles según rol
function actualizarNavAdmin() {
    var nav = document.getElementById('admin-nav');
    if (!nav) return;
    var sectionCheck = {
        'seccion-config': function () { var el = document.getElementById('seccion-config'); return el && !el.classList.contains('hidden'); },
        'seccion-resumen': function () { return true; },
        'actividad-landing': function () { return true; },
        'seccion-mensajes': function () { var el = document.getElementById('seccion-mensajes'); return el && !el.classList.contains('hidden'); },
        'seccion-inventario': function () { return AuthManager.tienePermiso('verInventario'); },
        'seccion-ventas': function () { return AuthManager.tienePermiso('verVentas'); },
        'acciones-admin': function () { var el = document.getElementById('acciones-admin'); return el && !el.classList.contains('hidden'); },
        'mi-cuenta-block': function () { var el = document.getElementById('mi-cuenta-block'); return el && !el.classList.contains('hidden'); },
        'gestion-usuarios': function () { var el = document.getElementById('gestion-usuarios'); return el && !el.classList.contains('hidden'); },
        'gestion-funciones': function () { var el = document.getElementById('gestion-funciones'); return el && !el.classList.contains('hidden'); },
        'auditoria': function () { var el = document.getElementById('auditoria'); return el && !el.classList.contains('hidden'); }
    };
    var links = nav.querySelectorAll('.admin-nav-link');
    for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var sectionId = link.getAttribute('data-section');
        var show = sectionCheck[sectionId] ? sectionCheck[sectionId]() : true;
        if (show) link.classList.remove('hidden'); else link.classList.add('hidden');
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
    cargarActividadLanding();
    if (AuthManager.puedeHacerCambios()) cargarMensajes();
}

// Métricas de la landing (visitas y clics desde index.html, mismo navegador)
function cargarActividadLanding() {
    const KEY = 'elgorila_landing_events';
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let list = [];
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) list = JSON.parse(raw);
    } catch (e) {}
    const visits7 = list.filter(function (e) { return e.type === 'visit' && (now - e.t) < sevenDaysMs; }).length;
    const whatsapp = list.filter(function (e) { return e.type === 'whatsapp_click'; }).length;
    const email = list.filter(function (e) { return e.type === 'email_click'; }).length;
    const mensaje = list.filter(function (e) { return e.type === 'mensaje_modal_open'; }).length;
    const el = function (id) { return document.getElementById(id); };
    if (el('metric-visits-7')) el('metric-visits-7').textContent = visits7;
    if (el('metric-whatsapp')) el('metric-whatsapp').textContent = whatsapp;
    if (el('metric-email')) el('metric-email').textContent = email;
    if (el('metric-mensaje')) el('metric-mensaje').textContent = mensaje;
    const last = list.slice(-20).reverse();
    const pre = el('metric-events-list');
    if (pre) pre.textContent = last.length ? last.map(function (e) {
        var d = new Date(e.t).toLocaleString('es-MX');
        return d + '  ' + e.type + (e.data && e.data.w ? ' (w:' + e.data.w + ')' : '');
    }).join('\n') : 'Sin eventos en este navegador.';
}

// Mensajes de contacto (formulario "Dejar un mensaje" en Index)
function cargarMensajes() {
    var listEl = document.getElementById('mensajes-list');
    var vacioEl = document.getElementById('mensajes-vacio');
    if (!listEl) return;
    var list = [];
    try {
        var raw = localStorage.getItem(MENSAJES_KEY);
        if (raw) list = JSON.parse(raw);
    } catch (e) {}
    if (!list.length) {
        if (vacioEl) vacioEl.classList.remove('hidden');
        listEl.innerHTML = '<p class="text-text-dark/50 text-sm" id="mensajes-vacio">No hay mensajes.</p>';
        return;
    }
    if (vacioEl) vacioEl.classList.add('hidden');
    listEl.innerHTML = '';
    list.forEach(function (m) {
        var d = m.fecha ? new Date(m.fecha).toLocaleString('es-MX') : '—';
        var card = document.createElement('div');
        card.className = 'bg-background-dark/80 border border-primary/20 rounded p-4 ' + (m.leido ? 'opacity-75' : '');
        card.innerHTML =
            '<div class="flex justify-between items-start gap-2 mb-2">' +
            '<div><strong class="text-primary">' + (m.nombre || 'Sin nombre') + '</strong>' +
            (m.email ? ' <a href="mailto:' + m.email + '" class="text-accent-gold/90 hover:text-accent-gold text-sm">' + m.email + '</a>' : '') + '</div>' +
            '<span class="text-text-dark/50 text-xs shrink-0">' + d + '</span></div>' +
            '<p class="text-text-dark/90 text-sm whitespace-pre-wrap mb-3">' + (m.mensaje || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' +
            '<div class="flex gap-2">' +
            '<button type="button" onclick="marcarMensajeLeido(' + m.id + ')" class="px-2 py-1 text-xs rounded border border-primary/30 hover:bg-primary/10 text-primary">' + (m.leido ? 'Marcar no leído' : 'Marcar leído') + '</button>' +
            '<button type="button" onclick="eliminarMensaje(' + m.id + ')" class="px-2 py-1 text-xs rounded border border-red-800/40 hover:bg-red-900/30 text-red-300">Eliminar</button>' +
            '</div>';
        listEl.appendChild(card);
    });
}

function marcarMensajeLeido(id) {
    try {
        var raw = localStorage.getItem(MENSAJES_KEY);
        var list = raw ? JSON.parse(raw) : [];
        var idx = list.findIndex(function (m) { return m.id === id; });
        if (idx >= 0) {
            list[idx].leido = !list[idx].leido;
            localStorage.setItem(MENSAJES_KEY, JSON.stringify(list));
            cargarMensajes();
        }
    } catch (e) {}
}

function eliminarMensaje(id) {
    if (!confirm('¿Eliminar este mensaje?')) return;
    try {
        var raw = localStorage.getItem(MENSAJES_KEY);
        var list = raw ? JSON.parse(raw) : [];
        list = list.filter(function (m) { return m.id !== id; });
        localStorage.setItem(MENSAJES_KEY, JSON.stringify(list));
        cargarMensajes();
    } catch (e) {}
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

// Botones de compra: URL o ventana con mensaje - usada en index.html
var URL_VENTA_KEY = 'elgorila_url_venta';
var VENTA_MODO_KEY = 'elgorila_venta_modo';
var VENTA_MENSAJE_KEY = 'elgorila_venta_mensaje';

function actualizarBloquesVenta() {
    var modoUrl = document.getElementById('venta-modo-url');
    var bloqueUrl = document.getElementById('bloque-url-venta');
    var bloqueMensaje = document.getElementById('bloque-mensaje-venta');
    var esUrl = modoUrl && modoUrl.checked;
    if (bloqueUrl) bloqueUrl.classList.toggle('hidden', !esUrl);
    if (bloqueMensaje) bloqueMensaje.classList.toggle('hidden', esUrl);
}

function cargarUrlVenta() {
    var modo = '';
    var url = '';
    var mensaje = '';
    try {
        modo = localStorage.getItem(VENTA_MODO_KEY) || 'url';
        url = localStorage.getItem(URL_VENTA_KEY) || '';
        mensaje = localStorage.getItem(VENTA_MENSAJE_KEY) || '';
    } catch (e) {}
    var radioUrl = document.getElementById('venta-modo-url');
    var radioMensaje = document.getElementById('venta-modo-mensaje');
    if (radioUrl) radioUrl.checked = modo !== 'mensaje';
    if (radioMensaje) radioMensaje.checked = modo === 'mensaje';
    var inputUrl = document.getElementById('input-url-venta');
    var inputMensaje = document.getElementById('input-mensaje-venta');
    if (inputUrl) inputUrl.value = url;
    if (inputMensaje) inputMensaje.value = mensaje;
    actualizarBloquesVenta();
    var status = document.getElementById('url-venta-guardada');
    if (status) {
        if (modo === 'mensaje') status.textContent = 'En uso: ventana con mensaje.';
        else if (url) status.textContent = 'En uso: enlace ' + url;
        else status.textContent = 'En uso: #venta-boletos (sección en la misma página).';
    }
}

function guardarUrlVenta() {
    var radioMensaje = document.getElementById('venta-modo-mensaje');
    var modo = (radioMensaje && radioMensaje.checked) ? 'mensaje' : 'url';
    var inputUrl = document.getElementById('input-url-venta');
    var inputMensaje = document.getElementById('input-mensaje-venta');
    var url = (inputUrl && inputUrl.value) ? inputUrl.value.trim() : '';
    var mensaje = (inputMensaje && inputMensaje.value) ? inputMensaje.value.trim() : '';
    var status = document.getElementById('url-venta-guardada');
    try {
        localStorage.setItem(VENTA_MODO_KEY, modo);
        if (modo === 'mensaje') localStorage.setItem(VENTA_MENSAJE_KEY, mensaje);
        else {
            if (url) localStorage.setItem(URL_VENTA_KEY, url);
            else localStorage.removeItem(URL_VENTA_KEY);
        }
    } catch (e) {
        if (status) status.textContent = 'Error al guardar.';
        return;
    }
    cargarUrlVenta();
    if (status) status.textContent = 'Guardado a las ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setTimeout(function() { cargarUrlVenta(); }, 4000);
}

// Instagram - usada en index.html (sección contacto)
var INSTAGRAM_KEY = 'elgorila_instagram_url';

function cargarInstagram() {
    var url = '';
    try { url = localStorage.getItem(INSTAGRAM_KEY) || ''; } catch (e) {}
    var input = document.getElementById('input-instagram');
    var status = document.getElementById('instagram-guardada');
    if (input) input.value = url;
    if (status) status.textContent = url ? 'En uso: ' + url : 'Vacío: en la página se usará instagram.com/elgorilateatro por defecto.';
}

function guardarInstagram() {
    var input = document.getElementById('input-instagram');
    var status = document.getElementById('instagram-guardada');
    if (!input) return;
    var url = (input.value || '').trim();
    try {
        if (url) localStorage.setItem(INSTAGRAM_KEY, url);
        else localStorage.removeItem(INSTAGRAM_KEY);
    } catch (e) {
        if (status) status.textContent = 'Error al guardar.';
        return;
    }
    cargarInstagram();
    if (status) status.textContent = 'Guardado a las ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setTimeout(function() { cargarInstagram(); }, 4000);
}

// Música - enlace en Index (sección contacto); si no hay URL no se muestra
var MUSICA_KEY = 'elgorila_musica_url';

function cargarMusica() {
    var url = '';
    try { url = localStorage.getItem(MUSICA_KEY) || ''; } catch (e) {}
    var input = document.getElementById('input-musica');
    var status = document.getElementById('musica-guardada');
    if (input) input.value = url;
    if (status) status.textContent = url ? 'En uso: ' + url : 'Vacío: el enlace Música no se mostrará en la página.';
}

function guardarMusica() {
    var input = document.getElementById('input-musica');
    var status = document.getElementById('musica-guardada');
    if (!input) return;
    var url = (input.value || '').trim();
    try {
        if (url) localStorage.setItem(MUSICA_KEY, url);
        else localStorage.removeItem(MUSICA_KEY);
    } catch (e) {
        if (status) status.textContent = 'Error al guardar.';
        return;
    }
    cargarMusica();
    if (status) status.textContent = 'Guardado a las ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setTimeout(function() { cargarMusica(); }, 4000);
}

// WhatsApp - número en sección contacto (Index)
var WHATSAPP_KEY = 'elgorila_whatsapp';
var DEFAULT_WHATSAPP = '5215512037223';

function cargarWhatsApp() {
    var num = '';
    try { num = (localStorage.getItem(WHATSAPP_KEY) || '').trim(); } catch (e) {}
    var input = document.getElementById('input-whatsapp');
    var status = document.getElementById('whatsapp-guardada');
    if (input) input.value = num;
    if (status) status.textContent = num ? 'En uso: ' + num : 'Vacío: en la página se usará ' + DEFAULT_WHATSAPP + ' por defecto.';
}

function guardarWhatsApp() {
    var input = document.getElementById('input-whatsapp');
    var status = document.getElementById('whatsapp-guardada');
    if (!input) return;
    var num = (input.value || '').trim().replace(/\D/g, '');
    try {
        if (num) localStorage.setItem(WHATSAPP_KEY, num);
        else localStorage.removeItem(WHATSAPP_KEY);
    } catch (e) {
        if (status) status.textContent = 'Error al guardar.';
        return;
    }
    cargarWhatsApp();
    if (status) status.textContent = 'Guardado a las ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setTimeout(function() { cargarWhatsApp(); }, 4000);
}

// Email de contacto - mailto y textos en Index
var EMAIL_KEY = 'elgorila_email_contacto';
var DEFAULT_EMAIL = 'info@elgorilateatro.com.mx';

function cargarEmail() {
    var email = '';
    try { email = (localStorage.getItem(EMAIL_KEY) || '').trim(); } catch (e) {}
    var input = document.getElementById('input-email');
    var status = document.getElementById('email-guardada');
    if (input) input.value = email;
    if (status) status.textContent = email ? 'En uso: ' + email : 'Vacío: en la página se usará ' + DEFAULT_EMAIL + ' por defecto.';
}

function guardarEmail() {
    var input = document.getElementById('input-email');
    var status = document.getElementById('email-guardada');
    if (!input) return;
    var email = (input.value || '').trim();
    try {
        if (email) localStorage.setItem(EMAIL_KEY, email);
        else localStorage.removeItem(EMAIL_KEY);
    } catch (e) {
        if (status) status.textContent = 'Error al guardar.';
        return;
    }
    cargarEmail();
    if (status) status.textContent = 'Guardado a las ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setTimeout(function() { cargarEmail(); }, 4000);
}

// Mostrar u ocultar enlace Administrador en el footer (Index)
var ADMIN_FOOTER_KEY = 'elgorila_mostrar_admin_footer';

function cargarAdminFooter() {
    var val = '';
    try { val = localStorage.getItem(ADMIN_FOOTER_KEY) || ''; } catch (e) {}
    var cb = document.getElementById('input-mostrar-admin-footer');
    var status = document.getElementById('admin-footer-guardada');
    if (cb) cb.checked = (val !== '0');
    if (status) status.textContent = (val === '0') ? 'En la página el enlace Administrador está oculto.' : 'En la página se muestra el enlace Administrador.';
}

function guardarAdminFooter() {
    var cb = document.getElementById('input-mostrar-admin-footer');
    var status = document.getElementById('admin-footer-guardada');
    if (!cb) return;
    try {
        if (cb.checked) localStorage.setItem(ADMIN_FOOTER_KEY, '1');
        else localStorage.setItem(ADMIN_FOOTER_KEY, '0');
    } catch (e) {
        if (status) status.textContent = 'Error al guardar.';
        return;
    }
    cargarAdminFooter();
    if (status) status.textContent = 'Guardado a las ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setTimeout(function() { cargarAdminFooter(); }, 4000);
}

// Sinopsis - texto en la sección Sinopsis (Index)
var SINOPSIS_KEY = 'elgorila_sinopsis';
var DEFAULT_SINOPSIS = 'Un simio se presenta ante una academia de científicos para rendir un informe. Ya no es un animal: viste de frac, articula. Relata su captura, su encierro, el viaje en barco donde entendió algo: no había salida, lo que sí había: un inventario. Escupir, beber, imitar. Gestos que lo volvieron tolerable, luego aceptable, después respetable. No perseguía la libertad —esa ya no venía en el paquete—, perseguía solo un lugar donde estar sin barrotes. Lo consiguió. Ahora cobra por poder decirlo. Pero mientras rinde su informe con una cortesía impecable, algo rechina. El simio tiene su informe listo.';

function cargarSinopsis() {
    var text = '';
    try { text = localStorage.getItem(SINOPSIS_KEY) || ''; } catch (e) {}
    var input = document.getElementById('input-sinopsis');
    var status = document.getElementById('sinopsis-guardada');
    if (input) input.value = text;
    if (status) status.textContent = text ? 'En uso: sinopsis personalizada (' + text.length + ' caracteres).' : 'Vacío: en la página se muestra el texto por defecto.';
}

function guardarSinopsis() {
    var input = document.getElementById('input-sinopsis');
    var status = document.getElementById('sinopsis-guardada');
    if (!input) return;
    var text = (input.value || '').trim();
    try {
        if (text) localStorage.setItem(SINOPSIS_KEY, text);
        else localStorage.removeItem(SINOPSIS_KEY);
    } catch (e) {
        if (status) status.textContent = 'Error al guardar.';
        return;
    }
    cargarSinopsis();
    if (status) status.textContent = 'Guardado a las ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setTimeout(function() { cargarSinopsis(); }, 4000);
}

(function() {
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('input[name="venta-modo"]').forEach(function(r) {
            r.addEventListener('change', actualizarBloquesVenta);
        });
    });
})();

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
    
    const current = AuthManager.obtenerUsuarioActual();
    let html = '';
    usuariosArray.forEach(usuario => {
        const ultimoAcceso = usuario.ultimoAcceso 
            ? new Date(usuario.ultimoAcceso).toLocaleString('es-MX')
            : 'Nunca';
        const puedeEditar = current && AuthManager.puedeModificarUsuario(usuario.id);
        const puedeEliminar = current && AuthManager.puedeEliminarUsuario(usuario.id);
        
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
                    ${puedeEditar ? `<button onclick="editarUsuario('${usuario.id}')" class="px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs mr-2">Editar</button>` : ''}
                    ${puedeEliminar ? `<button onclick="eliminarUsuarioConfirmar('${usuario.id}')" class="px-3 py-1 bg-red-900/30 hover:bg-red-900/40 text-red-300 rounded text-xs">Eliminar</button>` : ''}
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
    const rolRow = document.getElementById('modal-usuario-rol-row');
    const idRow = document.getElementById('modal-usuario-id-row');
    const current = AuthManager.obtenerUsuarioActual();
    const esPropio = usuarioId && current && usuarioId === current.usuarioId;
    
    if (usuarioId) {
        const usuarios = AuthManager.obtenerUsuarios();
        const usuario = usuarios[usuarioId];
        if (esPropio) {
            titulo.textContent = 'Cambiar mi contraseña';
            if (rolRow) rolRow.classList.add('hidden');
            if (idRow) idRow.classList.add('hidden');
        } else {
            titulo.textContent = 'Editar Usuario';
            if (rolRow) rolRow.classList.remove('hidden');
            if (idRow) idRow.classList.remove('hidden');
        }
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
        if (rolRow) rolRow.classList.remove('hidden');
        if (idRow) idRow.classList.remove('hidden');
        document.getElementById('modal-usuario-id').value = '';
        document.getElementById('modal-usuario-id').disabled = false;
        document.getElementById('modal-usuario-nombre').value = '';
        document.getElementById('modal-usuario-password').value = '';
        document.getElementById('modal-usuario-password').placeholder = 'Nueva contraseña';
        var selectRol = document.getElementById('modal-usuario-rol');
        var rolesPermitidos = ['admin', 'gerente', 'taquilla', 'validacion', 'reclamos'].filter(function(r) { return AuthManager.puedeCrearRol(r); });
        selectRol.innerHTML = '';
        var labels = { admin: 'Administrador', gerente: 'Gerente', taquilla: 'Taquilla', validacion: 'Validación QR', reclamos: 'Reclamos' };
        rolesPermitidos.forEach(function(r) {
            var opt = document.createElement('option');
            opt.value = r;
            opt.textContent = labels[r] || r;
            selectRol.appendChild(opt);
        });
        selectRol.value = rolesPermitidos.indexOf('taquilla') >= 0 ? 'taquilla' : (rolesPermitidos[0] || 'taquilla');
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
    const current = AuthManager.obtenerUsuarioActual();
    const esPropio = usuarioEditando && current && usuarioEditando === current.usuarioId;
    
    if (esPropio) {
        if (!usuarioId || !nombre) {
            mostrarError(errorDiv, 'Nombre obligatorio');
            return;
        }
        var cambios = { nombre: nombre };
        if (password) cambios.password = password;
        var resultado = AuthManager.modificarUsuario(usuarioId, cambios);
        if (resultado.exito) {
            cerrarModalUsuario();
            if (AuthManager.tienePermiso('gestionarUsuarios')) cargarUsuarios();
            document.getElementById('usuario-actual').textContent = nombre;
        } else {
            mostrarError(errorDiv, resultado.error);
        }
        return;
    }
    
    if (!usuarioId || !nombre || !rol) {
        mostrarError(errorDiv, 'Por favor, completa todos los campos');
        return;
    }
    
    if (usuarioEditando) {
        var cambios = { nombre: nombre, rol: rol };
        if (password) cambios.password = password;
        var resultado = AuthManager.modificarUsuario(usuarioId, cambios);
        if (resultado.exito) {
            cerrarModalUsuario();
            cargarUsuarios();
        } else {
            mostrarError(errorDiv, resultado.error);
        }
    } else {
        if (!password) {
            mostrarError(errorDiv, 'La contraseña es obligatoria para nuevos usuarios');
            return;
        }
        var resultado = AuthManager.crearUsuario(usuarioId, nombre, rol, password);
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
