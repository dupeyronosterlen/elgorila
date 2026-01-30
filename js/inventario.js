// --- SISTEMA DE GESTIÓN DE INVENTARIO Y RESERVAS ---
// Este módulo maneja la disponibilidad de boletos y reservas temporales
// para evitar conflictos cuando múltiples usuarios compran simultáneamente

const INVENTARIO_KEY = 'inventario_boletos';
const RESERVAS_KEY = 'reservas_temporales';
const TIEMPO_RESERVA = 4 * 60 * 1000; // 4 minutos en milisegundos

// Protección: Rate limiting básico
const RATE_LIMIT_KEY = 'rate_limit_timestamps';
const MAX_ACCIONES_POR_MINUTO = 10;

// Verificar rate limit
function verificarRateLimit() {
    const ahora = Date.now();
    const timestamps = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '[]');
    
    // Filtrar timestamps de hace más de 1 minuto
    const timestampsRecientes = timestamps.filter(ts => ahora - ts < 60000);
    
    if (timestampsRecientes.length >= MAX_ACCIONES_POR_MINUTO) {
        return false; // Demasiadas acciones
    }
    
    // Agregar timestamp actual
    timestampsRecientes.push(ahora);
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(timestampsRecientes));
    
    return true;
}

// Validar integridad de datos (actualizado para fechas dinámicas)
function validarIntegridadInventario(inventario) {
    if (!inventario || typeof inventario !== 'object') return false;
    
    // Validar cada entrada del inventario
    for (const clave in inventario) {
        const datos = inventario[clave];
        
        if (typeof datos !== 'object') return false;
        if (typeof datos.total !== 'number' || datos.total < 0) return false;
        if (typeof datos.vendidos !== 'number' || datos.vendidos < 0) return false;
        if (typeof datos.reservados !== 'number' || datos.reservados < 0) return false;
        
        // Validar que no haya valores imposibles
        if (datos.vendidos > datos.total) return false;
        if (datos.reservados > datos.total) return false;
    }
    
    return true;
}

// Códigos de descuento válidos (en producción esto vendría de un servidor)
const CODIGOS_DESCUENTO = {
    'ESTUDIANTE10': { descuento: 10, tipo: 'porcentaje', nombre: 'Descuento Estudiante' },
    'SENIOR15': { descuento: 15, tipo: 'porcentaje', nombre: 'Descuento Tercera Edad' },
    'GRUPO20': { descuento: 20, tipo: 'porcentaje', nombre: 'Descuento Grupo' },
    'PREVENTA50': { descuento: 50, tipo: 'fijo', nombre: 'Descuento Preventa' },
    'KAFKA2024': { descuento: 25, tipo: 'porcentaje', nombre: 'Código Especial' }
};

// Inicializar inventario si no existe (actualizado para fechas dinámicas)
function inicializarInventario() {
    let inventario = {};
    
    // Si ya existe inventario, usarlo
    const inventarioExistente = localStorage.getItem(INVENTARIO_KEY);
    if (inventarioExistente) {
        inventario = JSON.parse(inventarioExistente);
    }
    
    // Inicializar inventario para funciones dinámicas
    if (typeof FechasManager !== 'undefined') {
        const funciones = FechasManager.obtenerFunciones();
        const todasLasFunciones = [...funciones.regulares, ...funciones.especiales];
        
        todasLasFunciones.forEach(funcion => {
            if (!inventario[funcion.clave]) {
                inventario[funcion.clave] = {
                    total: FechasManager.CONFIG.TOTAL_BOLETOS,
                    vendidos: 0,
                    reservados: 0
                };
            }
        });
    } else {
        // Fallback: inicializar con fechas fijas si FechasManager no está disponible
        if (Object.keys(inventario).length === 0) {
            inventario = {
                'sabado': { total: 200, vendidos: 0, reservados: 0 }
            };
        }
    }
    
    localStorage.setItem(INVENTARIO_KEY, JSON.stringify(inventario));
}

// Obtener inventario actual con validación
function obtenerInventario() {
    inicializarInventario();
    const inventario = JSON.parse(localStorage.getItem(INVENTARIO_KEY));
    
    // Validar integridad
    if (!validarIntegridadInventario(inventario)) {
        console.warn('Inventario corrupto detectado, reinicializando...');
        localStorage.removeItem(INVENTARIO_KEY);
        inicializarInventario();
        return JSON.parse(localStorage.getItem(INVENTARIO_KEY));
    }
    
    return inventario;
}

// Guardar inventario
function guardarInventario(inventario) {
    localStorage.setItem(INVENTARIO_KEY, JSON.stringify(inventario));
}

// Limpiar reservas expiradas (sin recursión)
function limpiarReservasExpiradas() {
    const reservasRaw = localStorage.getItem(RESERVAS_KEY);
    if (!reservasRaw) return {};
    
    const reservas = JSON.parse(reservasRaw);
    const ahora = Date.now();
    const reservasActivas = {};
    
    for (const [id, reserva] of Object.entries(reservas)) {
        if (ahora - reserva.timestamp < TIEMPO_RESERVA) {
            reservasActivas[id] = reserva;
        }
    }
    
    localStorage.setItem(RESERVAS_KEY, JSON.stringify(reservasActivas));
    return reservasActivas;
}

// Obtener reservas activas (sin recursión)
function obtenerReservas() {
    limpiarReservasExpiradas();
    const reservas = localStorage.getItem(RESERVAS_KEY);
    return reservas ? JSON.parse(reservas) : {};
}

// Crear una reserva temporal con verificación mejorada
function crearReserva(fecha, cantidad) {
    // Validar entrada
    if (!fecha || typeof fecha !== 'string') {
        return { exito: false, mensaje: 'Fecha inválida' };
    }
    
    if (typeof cantidad !== 'number' || cantidad < 1 || cantidad > 10) {
        return { exito: false, mensaje: 'Cantidad inválida. Debe ser entre 1 y 10.' };
    }
    
    // Verificar rate limit
    if (!verificarRateLimit()) {
        return { exito: false, mensaje: 'Demasiadas acciones. Por favor espera un momento.' };
    }
    
    // Intentar hasta 3 veces en caso de conflicto
    for (let intento = 0; intento < 3; intento++) {
        limpiarReservasExpiradas();
        const inventario = obtenerInventario();
        const reservas = obtenerReservas();
        
        // Verificar disponibilidad
        const disponible = inventario[fecha].total - 
                           inventario[fecha].vendidos - 
                           calcularReservados(fecha);
        
        if (cantidad > disponible) {
            return { 
                exito: false, 
                mensaje: `Solo hay ${disponible} boletos disponibles para esta función` 
            };
        }
        
        // Crear ID único para la reserva con identificador de sesión
        const sessionId = sessionStorage.getItem('session_id') || 
                         'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('session_id', sessionId);
        
        const reservaId = 'reserva_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Guardar reserva con información de sesión
        reservas[reservaId] = {
            fecha: fecha,
            cantidad: cantidad,
            timestamp: Date.now(),
            sessionId: sessionId
        };
        
        try {
            localStorage.setItem(RESERVAS_KEY, JSON.stringify(reservas));
            
            // Verificar que se guardó correctamente
            const reservasVerificadas = obtenerReservas();
            if (reservasVerificadas[reservaId]) {
                return { 
                    exito: true, 
                    reservaId: reservaId,
                    disponible: disponible - cantidad
                };
            }
        } catch (error) {
            console.warn('Error al guardar reserva, reintentando...', error);
            if (intento < 2) {
                // Esperar un poco antes de reintentar
                continue;
            }
        }
    }
    
    return { 
        exito: false, 
        mensaje: 'Error al crear la reserva. Por favor, intenta de nuevo.' 
    };
}

// Calcular boletos reservados para una fecha
function calcularReservados(fecha) {
    const reservas = obtenerReservas();
    let totalReservados = 0;
    
    for (const reserva of Object.values(reservas)) {
        if (reserva.fecha === fecha) {
            totalReservados += reserva.cantidad;
        }
    }
    
    return totalReservados;
}

// Liberar una reserva
function liberarReserva(reservaId) {
    const reservas = obtenerReservas();
    if (reservas[reservaId]) {
        delete reservas[reservaId];
        localStorage.setItem(RESERVAS_KEY, JSON.stringify(reservas));
        return true;
    }
    return false;
}

// Confirmar compra (convertir reserva en venta) con verificación mejorada
function confirmarCompra(fecha, cantidad, reservaId) {
    // Verificar que la reserva existe y es válida
    if (reservaId) {
        const reservas = obtenerReservas();
        const reserva = reservas[reservaId];
        
        if (!reserva) {
            return { 
                exito: false, 
                mensaje: 'La reserva ha expirado. Por favor, selecciona los boletos nuevamente.' 
            };
        }
        
        // Verificar que la reserva corresponde a esta sesión
        const sessionId = sessionStorage.getItem('session_id');
        if (sessionId && reserva.sessionId !== sessionId) {
            return { 
                exito: false, 
                mensaje: 'Esta reserva pertenece a otra sesión. Por favor, intenta de nuevo.' 
            };
        }
    }
    
    // Verificar disponibilidad una última vez
    limpiarReservasExpiradas();
    const inventario = obtenerInventario();
    const reservados = calcularReservados(fecha);
    const disponible = inventario[fecha].total - inventario[fecha].vendidos - reservados;
    
    if (cantidad > disponible) {
        return { 
            exito: false, 
            mensaje: `Solo hay ${disponible} boletos disponibles. La disponibilidad cambió mientras procesabas el pago.` 
        };
    }
    
    // Confirmar la compra
    inventario[fecha].vendidos += cantidad;
    guardarInventario(inventario);
    
    // Liberar la reserva
    if (reservaId) {
        liberarReserva(reservaId);
    }
    
    return { exito: true };
}

// Obtener disponibilidad para una fecha
function obtenerDisponibilidad(fecha) {
    limpiarReservasExpiradas();
    const inventario = obtenerInventario();
    const reservados = calcularReservados(fecha);
    const disponible = inventario[fecha].total - 
                       inventario[fecha].vendidos - 
                       reservados;
    
    return {
        total: inventario[fecha].total,
        vendidos: inventario[fecha].vendidos,
        reservados: reservados,
        disponible: Math.max(0, disponible)
    };
}

// Validar código de descuento con rate limiting
function validarCodigoDescuento(codigo) {
    // Validar entrada
    if (!codigo || typeof codigo !== 'string') {
        return {
            valido: false,
            mensaje: 'Código inválido'
        };
    }
    
    // Sanitizar: solo letras, números, máximo 50 caracteres
    const codigoSanitizado = codigo.trim().substring(0, 50).replace(/[^A-Za-z0-9]/g, '');
    
    if (codigoSanitizado.length === 0) {
        return {
            valido: false,
            mensaje: 'Código inválido'
        };
    }
    
    // Verificar rate limit
    if (!verificarRateLimit()) {
        return {
            valido: false,
            mensaje: 'Demasiados intentos. Por favor espera un momento.'
        };
    }
    
    const codigoUpper = codigoSanitizado.toUpperCase();
    if (CODIGOS_DESCUENTO[codigoUpper]) {
        return {
            valido: true,
            datos: CODIGOS_DESCUENTO[codigoUpper]
        };
    }
    return {
        valido: false,
        mensaje: 'Código de descuento no válido'
    };
}

// Calcular precio con descuento
function calcularPrecioConDescuento(precioBase, cantidad, codigoDescuento) {
    let subtotal = precioBase * cantidad;
    let descuento = 0;
    let descuentoAplicado = null;
    
    if (codigoDescuento) {
        const validacion = validarCodigoDescuento(codigoDescuento);
        if (validacion.valido) {
            descuentoAplicado = validacion.datos;
            if (validacion.datos.tipo === 'porcentaje') {
                descuento = subtotal * (validacion.datos.descuento / 100);
            } else if (validacion.datos.tipo === 'fijo') {
                descuento = Math.min(validacion.datos.descuento, subtotal);
            }
        }
    }
    
    const total = subtotal - descuento;
    
    return {
        subtotal: subtotal,
        descuento: descuento,
        total: Math.max(0, total),
        descuentoAplicado: descuentoAplicado
    };
}

// Sincronizar cambios entre pestañas
function sincronizarCambios() {
    window.addEventListener('storage', function(e) {
        if (e.key === INVENTARIO_KEY || e.key === RESERVAS_KEY) {
            // Notificar a otras partes de la aplicación que el inventario cambió
            window.dispatchEvent(new CustomEvent('inventario-actualizado'));
        }
    });
}

// Inicializar sincronización
sincronizarCambios();

// Exportar funciones para uso global
window.InventarioManager = {
    inicializar: inicializarInventario,
    obtenerDisponibilidad: obtenerDisponibilidad,
    crearReserva: crearReserva,
    liberarReserva: liberarReserva,
    confirmarCompra: confirmarCompra,
    validarCodigoDescuento: validarCodigoDescuento,
    calcularPrecioConDescuento: calcularPrecioConDescuento,
    obtenerInventario: obtenerInventario
};
