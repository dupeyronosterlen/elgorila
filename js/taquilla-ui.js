// --- INTERFAZ DE TAQUILLA ---
// UI para taquilla: disponibilidad y códigos de efectivo

let codigoActual = null;

// Cargar opciones de fecha en selector
function cargarOpcionesFecha() {
    const selector = document.getElementById('fecha-efectivo');
    if (!selector) return;
    
    if (typeof FechasManager === 'undefined') {
        console.error('FechasManager no está disponible');
        return;
    }
    
    const funciones = FechasManager.obtenerFunciones();
    const todasLasFunciones = [...funciones.especiales, ...funciones.regulares];
    
    // Limpiar opciones existentes (excepto la primera)
    selector.innerHTML = '<option value="">Seleccione una función</option>';
    
    // Agregar funciones disponibles (no bloqueadas)
    todasLasFunciones.forEach(funcion => {
        if (!funcion.bloqueada) {
            const option = document.createElement('option');
            option.value = funcion.clave;
            option.textContent = funcion.nombre;
            selector.appendChild(option);
        }
    });
}

// Cargar disponibilidad
function cargarDisponibilidad() {
    if (typeof InventarioManager === 'undefined') {
        console.error('InventarioManager no está disponible');
        return;
    }

    const inventario = InventarioManager.obtenerInventario();
    const reservas = obtenerReservas();
    
    // Cargar opciones de fecha
    cargarOpcionesFecha();
    
    // Obtener funciones dinámicas
    let funciones = [];
    if (typeof FechasManager !== 'undefined') {
        const funcionesData = FechasManager.obtenerFunciones();
        funciones = [...funcionesData.especiales, ...funcionesData.regulares];
    } else {
        // Fallback si FechasManager no está disponible
        funciones = [
            { clave: 'sabado', nombre: 'Sábado 21 Oct - 19:00 hrs' }
        ];
    }
    
    let html = '';
    
    for (const funcion of funciones) {
        const datos = inventario[funcion.clave] || { total: 200, vendidos: 0, reservados: 0 };
        const reservados = calcularReservadosPorFecha(funcion.clave, reservas);
        const disponible = datos.total - datos.vendidos - reservados;
        const porcentaje = (datos.vendidos / datos.total) * 100;
        
        // Obtener estadísticas de boletos en efectivo
        const statsEfectivo = TaquillaManager.obtenerEstadisticasPorFecha(funcion.nombre);
        
        const bloqueada = funcion.bloqueada ? ' (Bloqueada)' : '';
        
        html += `
            <div class="border border-gray-300 rounded-lg p-4 bg-gradient-to-br from-white to-gray-50">
                <h3 class="font-semibold text-gray-800 mb-3">${funcion.nombre}${bloqueada}</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-gray-600">Total:</span>
                        <span class="font-semibold text-gray-800">${datos.total}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Vendidos:</span>
                        <span class="font-semibold text-green-600">${datos.vendidos}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Reservados:</span>
                        <span class="font-semibold text-yellow-600">${reservados}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Efectivo:</span>
                        <span class="font-semibold text-blue-600">${statsEfectivo.total}</span>
                    </div>
                    <div class="flex justify-between border-t border-gray-300 pt-2 mt-2">
                        <span class="text-gray-700 font-bold">Disponible:</span>
                        <span class="font-bold text-2xl ${disponible > 10 ? 'text-green-600' : disponible > 0 ? 'text-yellow-600' : 'text-red-600'}">${disponible}</span>
                    </div>
                    <div class="mt-3">
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-primary h-2 rounded-full transition-all" style="width: ${porcentaje}%"></div>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">${porcentaje.toFixed(1)}% vendido</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    document.getElementById('disponibilidad-fechas').innerHTML = html;
}

// Generar código de ingreso
function generarCodigoIngreso(event) {
    event.preventDefault();
    
    const fecha = document.getElementById('fecha-efectivo').value;
    const cantidad = parseInt(document.getElementById('cantidad-efectivo').value);
    const discapacidad = document.getElementById('discapacidad-efectivo').checked;
    const acompanantes = parseInt(document.getElementById('acompanantes-efectivo').value) || 0;
    const notas = document.getElementById('notas-efectivo').value.trim();
    
    if (!fecha || !cantidad) {
        alert('Por favor, complete todos los campos requeridos');
        return;
    }
    
    // Verificar disponibilidad
    if (typeof InventarioManager !== 'undefined') {
        const disponibilidad = InventarioManager.obtenerDisponibilidad(fecha);
        if (disponibilidad.disponible < cantidad) {
            alert(`Solo hay ${disponibilidad.disponible} boletos disponibles para esta función.`);
            return;
        }
    }
    
    // Obtener nombre de fecha desde FechasManager
    let nombreFecha = fecha;
    if (typeof FechasManager !== 'undefined') {
        const funciones = FechasManager.obtenerFunciones();
        const todasLasFunciones = [...funciones.especiales, ...funciones.regulares];
        const funcion = todasLasFunciones.find(f => f.clave === fecha);
        if (funcion) {
            nombreFecha = funcion.nombre;
        }
    }
    
    // Generar código
    const boleto = TaquillaManager.generarCodigoIngreso(nombreFecha, cantidad, {
        discapacidad: discapacidad,
        acompanantes: acompanantes,
        notas: notas
    });
    
    codigoActual = boleto.id;
    
    // Mostrar código generado
    mostrarCodigoGenerado(boleto);
    
    // Actualizar inventario (vender boletos)
    if (typeof InventarioManager !== 'undefined') {
        // Crear una "venta" en efectivo
        for (let i = 0; i < cantidad; i++) {
            InventarioManager.confirmarCompra(fecha, 1, null);
        }
    }
    
    // Limpiar formulario
    document.getElementById('form-efectivo').reset();
    
    // Actualizar tablas
    cargarDisponibilidad();
    cargarBoletosEfectivo();
}

// Mostrar código generado
function mostrarCodigoGenerado(boleto) {
    const container = document.getElementById('codigo-generado');
    const codigoTexto = document.getElementById('codigo-texto');
    const codigoInfo = document.getElementById('codigo-info');
    const qrContainer = document.getElementById('qr-codigo-efectivo');
    
    container.classList.remove('hidden');
    codigoTexto.textContent = boleto.id;
    
    const info = `${boleto.cantidad} boleto(s) - ${boleto.fecha}`;
    if (boleto.metadata.discapacidad) {
        codigoInfo.textContent = info + ' | Persona con discapacidad';
    } else {
        codigoInfo.textContent = info;
    }
    
    // Generar QR code
    if (typeof QRCode !== 'undefined') {
        qrContainer.innerHTML = '';
        const urlVerificacion = `${window.location.origin}${window.location.pathname.replace('taquilla.html', '')}verificar.html?codigo=${encodeURIComponent(boleto.id)}`;
        QRCode.toCanvas(qrContainer, urlVerificacion, {
            width: 200,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        }, function (error) {
            if (error) {
                console.error('Error al generar QR:', error);
            }
        });
    }
    
    // Scroll a la sección
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Copiar código
function copiarCodigo() {
    if (!codigoActual) return;
    
    navigator.clipboard.writeText(codigoActual).then(() => {
        alert('Código copiado al portapapeles');
    }).catch(err => {
        console.error('Error al copiar:', err);
        alert('Error al copiar código');
    });
}

// Cargar boletos en efectivo
function cargarBoletosEfectivo() {
    const boletos = TaquillaManager.obtenerBoletosEfectivo();
    const boletosArray = Object.values(boletos);
    
    // Filtrar solo los de hoy
    const hoy = new Date().toISOString().split('T')[0];
    const boletosHoy = boletosArray.filter(b => {
        const fechaBoleto = new Date(b.fechaCreacion).toISOString().split('T')[0];
        return fechaBoleto === hoy;
    });
    
    // Ordenar por fecha de creación (más recientes primero)
    boletosHoy.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
    
    if (boletosHoy.length === 0) {
        document.getElementById('tabla-efectivo').innerHTML = `
            <tr>
                <td colspan="5" class="py-8 text-center text-gray-500">No hay boletos en efectivo generados hoy</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    boletosHoy.forEach(boleto => {
        const fechaCreacion = new Date(boleto.fechaCreacion).toLocaleString('es-MX');
        const estado = boleto.usado ? 'Usado' : 'Activo';
        const estadoClass = boleto.usado ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';
        
        let info = `${boleto.cantidad} boleto(s)`;
        if (boleto.metadata.discapacidad) {
            info += ' | Discapacidad';
        }
        if (boleto.metadata.acompanantes > 0) {
            info += ` | ${boleto.metadata.acompanantes} acompañante(s)`;
        }
        
        html += `
            <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="py-3 text-gray-800 font-mono text-sm">${boleto.id}</td>
                <td class="py-3 text-gray-700">${boleto.fecha}</td>
                <td class="py-3 text-gray-700">${boleto.cantidad}</td>
                <td class="py-3">
                    <span class="px-2 py-1 rounded text-xs font-semibold ${estadoClass}">${estado}</span>
                </td>
                <td class="py-3 text-gray-600 text-sm">${info}</td>
            </tr>
        `;
    });
    
    document.getElementById('tabla-efectivo').innerHTML = html;
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

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    // Verificar autenticación
    if (typeof AuthManager !== 'undefined') {
        const usuario = AuthManager.obtenerUsuarioActual();
        if (!usuario || !AuthManager.tienePermiso('verInventario')) {
            alert('No tienes permiso para acceder a esta página');
            window.location.href = 'admin.html';
            return;
        }
    }
    
    // Cargar datos
    cargarDisponibilidad();
    cargarBoletosEfectivo();
    
    // Event listeners
    const formEfectivo = document.getElementById('form-efectivo');
    if (formEfectivo) {
        formEfectivo.addEventListener('submit', generarCodigoIngreso);
    }
    
    // Actualizar cada 30 segundos
    setInterval(() => {
        cargarDisponibilidad();
        cargarBoletosEfectivo();
    }, 30000);
});

// Exportar funciones
window.copiarCodigo = copiarCodigo;
