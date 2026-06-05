// --- TIPOS DE BOLETO ---
// Precios definitivos. El Worker los valida de forma independiente.
const TIPOS_BOLETO = [
    { tipo: 'general',    nombre: 'General',    precio: 350 },
    { tipo: 'inapam',     nombre: 'INAPAM',     precio: 245, desc: '30% desc.' },
    { tipo: 'estudiante', nombre: 'Estudiante', precio: 245, desc: '30% desc.' },
    { tipo: 'maestro',    nombre: 'Maestro',    precio: 245, desc: '30% desc.' },
];

// --- ESTADO DEL CARRITO ---
let cantidades        = { general: 0, inapam: 0, estudiante: 0, maestro: 0 };
let fechaSeleccionada = null;  // clave dinámica (e.g. sabado_1234567890)
let fechaIsoActual    = null;  // YYYY-MM-DD para el Worker
let nombreFecha       = '';    // texto largo para mostrar al comprador
let reservaId         = null;
let disponibilidadInfo = null;
let _grupoGrandeNotificado = false;

// --- HELPERS DE CARRITO ---

function totalCantidad() {
    return Object.values(cantidades).reduce((s, c) => s + c, 0);
}

function calcularTotal() {
    const tieneEspeciales = cantidades.inapam > 0 || cantidades.estudiante > 0 || cantidades.maestro > 0;
    const promoGrupo = cantidades.general >= 5 && !tieneEspeciales;
    return TIPOS_BOLETO.reduce((s, t) => {
        const precio = (promoGrupo && t.tipo === 'general') ? t.precio * 0.75 : t.precio;
        return s + precio * (cantidades[t.tipo] || 0);
    }, 0);
}

// --- FUNCIÓN 1: CAMBIAR CANTIDAD POR TIPO ---
function cambiarCantidad(tipo, delta) {
    if (!(tipo in cantidades)) return;

    const nueva = cantidades[tipo] + delta;
    if (nueva < 0) return;

    const totalNueva = totalCantidad() - cantidades[tipo] + nueva;
    if (totalNueva > 50) {
        alert('El máximo es 50 boletos por compra. Para grupos mayores contáctanos.');
        return;
    }

    cantidades[tipo] = nueva;

    if (totalCantidad() === 0 && reservaId) {
        InventarioManager.liberarReserva(reservaId);
        reservaId = null;
    }

    actualizarPantalla();

    if (fechaSeleccionada && totalCantidad() > 0) {
        verificarDisponibilidad();
    }
}

// --- FUNCIÓN 2: SELECCIONAR FECHA ---
function seleccionarFecha(clave, texto, funcion = null) {
    if (funcion && funcion.bloqueada) {
        alert('Las ventas para esta función están bloqueadas. La función comenzará pronto.');
        return;
    }

    if (reservaId) {
        InventarioManager.liberarReserva(reservaId);
        reservaId = null;
    }

    fechaSeleccionada = clave;
    nombreFecha       = texto;

    if (funcion && funcion.fecha) {
        const d = funcion.fecha instanceof Date ? funcion.fecha : new Date(funcion.fecha);
        fechaIsoActual = d.toISOString().split('T')[0];
        refrescarDisponibilidadWorker();
    }

    actualizarPantalla();
    resaltarBotonFecha(clave);

    if (totalCantidad() > 0) {
        verificarDisponibilidad();
    }
}

// --- RESALTAR BOTÓN DE FECHA ---
function resaltarBotonFecha(clave) {
    document.querySelectorAll('#botones-fecha button').forEach(btn => {
        btn.style.border = '';
        btn.style.boxShadow = '';
    });
    const sel = document.querySelector(`#botones-fecha button[data-fecha-clave="${clave}"]`);
    if (sel && !sel.disabled) {
        sel.style.border = '3px solid white';
        sel.style.boxShadow = '0 0 0 3px rgba(255, 255, 255, 0.5)';
    }
}

// --- VERIFICAR DISPONIBILIDAD (localStorage + Worker) ---
function verificarDisponibilidad() {
    if (!fechaSeleccionada) return;

    const total = totalCantidad();
    disponibilidadInfo = InventarioManager.obtenerDisponibilidad(fechaSeleccionada);

    if (total > 0 && total > disponibilidadInfo.disponible) {
        alert(`Solo hay ${disponibilidadInfo.disponible} boletos disponibles para esta función.`);
        actualizarIndicadorDisponibilidad();
        return;
    }

    if (total > 0 && disponibilidadInfo.disponible >= total) {
        if (reservaId) InventarioManager.liberarReserva(reservaId);
        const resultado = InventarioManager.crearReserva(fechaSeleccionada, total);
        if (resultado.exito) {
            reservaId = resultado.reservaId;
            disponibilidadInfo = InventarioManager.obtenerDisponibilidad(fechaSeleccionada);
        } else {
            reservaId = null;
        }
    }

    actualizarIndicadorDisponibilidad();
}

// --- ACTUALIZAR INDICADOR DE DISPONIBILIDAD ---
function actualizarIndicadorDisponibilidad() {
    const indicador      = document.getElementById('disponibilidad-info');
    const mensajeAgotado = document.getElementById('mensaje-agotado');

    if (disponibilidadInfo) {
        if (disponibilidadInfo.disponible > 0) {
            if (indicador) indicador.innerHTML = `<p class="text-xs text-green-400">✓ ${disponibilidadInfo.disponible} boletos disponibles</p>`;
            if (mensajeAgotado) mensajeAgotado.classList.add('hidden');
        } else {
            if (indicador) indicador.innerHTML = `<p class="text-xs text-red-400">✗ Agotado</p>`;
            if (mensajeAgotado) mensajeAgotado.classList.remove('hidden');
        }
    } else {
        if (indicador) indicador.innerHTML = `<p class="text-xs text-text-muted-dark">Selecciona una fecha para ver disponibilidad</p>`;
        if (mensajeAgotado) mensajeAgotado.classList.add('hidden');
    }
}

// --- DISPONIBILIDAD REAL DESDE EL WORKER (fire-and-forget) ---
function refrescarDisponibilidadWorker() {
    if (!fechaIsoActual || !window.API_BASE) return;
    fetch(`${window.API_BASE}/api/disponibilidad?fecha=${encodeURIComponent(fechaIsoActual)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data || typeof data.disponibles !== 'number') return;
            disponibilidadInfo = { total: data.total, vendidos: data.vendidos, reservados: 0, disponible: data.disponibles };
            actualizarIndicadorDisponibilidad();
        })
        .catch(() => {});
}

// --- FUNCIÓN 3: ACTUALIZAR PANTALLA ---
function actualizarPantalla() {
    // Estado de promoción
    const tieneEspeciales = cantidades.inapam > 0 || cantidades.estudiante > 0 || cantidades.maestro > 0;
    const promoGrupo = cantidades.general >= 5 && !tieneEspeciales;

    // Cantidad por tipo
    TIPOS_BOLETO.forEach(t => {
        const el = document.getElementById(`cantidad-${t.tipo}`);
        if (el) el.textContent = cantidades[t.tipo] || 0;
    });

    // Fecha seleccionada
    const cajitaFecha = document.getElementById('fecha-seleccionada-texto');
    if (cajitaFecha) cajitaFecha.innerText = nombreFecha || 'Selecciona una fecha';

    // Resumen de items en el panel de precio
    const resumenEl = document.getElementById('items-resumen');
    if (resumenEl) {
        const activos = TIPOS_BOLETO.filter(t => cantidades[t.tipo] > 0);
        resumenEl.innerHTML = activos.map(t => {
            const precio = (promoGrupo && t.tipo === 'general') ? t.precio * 0.75 : t.precio;
            return `<div class="flex justify-between text-text-dark text-sm">
                <span>${t.nombre} × ${cantidades[t.tipo]}</span>
                <span>$${(precio * cantidades[t.tipo]).toFixed(2)}</span>
            </div>`;
        }).join('');
    }

    // Total
    const total = calcularTotal();
    const totalEl = document.getElementById('total-precio');
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)} MXN`;

    // Banner promo 5+ generales sin especiales
    let promoBanner = document.getElementById('promo-grupo-banner');
    if (!promoBanner && totalEl && totalEl.parentNode) {
        promoBanner = document.createElement('div');
        promoBanner.id = 'promo-grupo-banner';
        totalEl.parentNode.insertBefore(promoBanner, totalEl);
    }
    if (promoBanner) {
        if (promoGrupo) {
            promoBanner.className = 'text-xs text-green-400 font-semibold my-1';
            promoBanner.textContent = `🎟 Promoción: 25% de descuento en tus ${cantidades.general} boletos generales`;
        } else {
            promoBanner.className = 'hidden';
            promoBanner.textContent = '';
        }
    }

    // Botón continuar
    const boton = document.getElementById('btn-continuar');
    if (!boton) return;

    if (!fechaSeleccionada) {
        boton.textContent = 'Selecciona una fecha';
        boton.disabled = true;
        boton.classList.add('cursor-not-allowed', 'opacity-70');
    } else if (totalCantidad() === 0) {
        boton.textContent = 'Selecciona al menos 1 boleto';
        boton.disabled = true;
        boton.classList.add('cursor-not-allowed', 'opacity-70');
    } else {
        boton.textContent = `Continuar — $${total.toFixed(2)} MXN`;
        boton.disabled = false;
        boton.classList.remove('cursor-not-allowed', 'opacity-70');
    }

    // Leyenda grupo grande (20+ boletos)
    const esGrupoGrande = totalCantidad() >= 20;
    let grupoLeyenda = document.getElementById('grupo-leyenda');
    if (!grupoLeyenda && boton.parentNode) {
        grupoLeyenda = document.createElement('p');
        grupoLeyenda.id = 'grupo-leyenda';
        boton.parentNode.insertBefore(grupoLeyenda, boton.nextSibling);
    }
    if (grupoLeyenda) {
        if (esGrupoGrande) {
            grupoLeyenda.className = 'text-xs text-yellow-400 mt-2 text-center';
            grupoLeyenda.innerHTML = 'Para grupos grandes contáctanos: <a href="mailto:elgorilateatro@gmail.com" class="underline">elgorilateatro@gmail.com</a>';
        } else {
            grupoLeyenda.className = 'hidden';
            grupoLeyenda.innerHTML = '';
        }
    }

    // GA4 notificación grupo grande — una vez por umbral
    if (esGrupoGrande && !_grupoGrandeNotificado) {
        _grupoGrandeNotificado = true;
        if (typeof gtag === 'function') gtag('event', 'grupo_grande', { cantidad: totalCantidad() });
    } else if (!esGrupoGrande) {
        _grupoGrandeNotificado = false;
    }
}

// --- FUNCIÓN 4: IR A CHECKOUT ---
function irAConfirmacion() {
    if (!fechaSeleccionada) {
        alert('Por favor selecciona una fecha para continuar');
        return false;
    }

    const items = TIPOS_BOLETO
        .filter(t => cantidades[t.tipo] > 0)
        .map(t => ({ tipo: t.tipo, cantidad: cantidades[t.tipo] }));

    if (items.length === 0) {
        alert('Por favor selecciona al menos un boleto');
        return false;
    }

    const cantTotal = totalCantidad();
    verificarDisponibilidad();

    if (!reservaId) {
        const resultado = InventarioManager.crearReserva(fechaSeleccionada, cantTotal);
        if (resultado.exito) {
            reservaId = resultado.reservaId;
        } else {
            alert('No se pudo crear la reserva. Por favor intenta de nuevo.');
            return false;
        }
    }

    const orden = {
        fecha:         nombreFecha,
        fechaIso:      fechaIsoActual,
        clave:         fechaSeleccionada,
        items,
        cantidadTotal: cantTotal,
        total:         calcularTotal(),
        reservaId,
        timestamp:     Date.now(),
    };

    try {
        localStorage.setItem('orden_compra', JSON.stringify(orden));
        navegandoACheckout = true;
        window.location.href = 'checkout.html';
        return true;
    } catch (error) {
        console.error('Error al guardar la orden:', error);
        alert('Error al guardar la orden. Por favor intenta de nuevo.');
        return false;
    }
}

// --- LIMPIAR RESERVA AL SALIR ---
let navegandoACheckout = false;

function limpiarReserva() {
    if (reservaId && !navegandoACheckout) {
        InventarioManager.liberarReserva(reservaId);
        reservaId = null;
    }
}

window.addEventListener('beforeunload', limpiarReserva);

// --- CARGAR FECHAS DINÁMICAS ---
function cargarFechas() {
    if (typeof FechasManager === 'undefined') return;

    const funciones = FechasManager.obtenerFunciones();
    const botonesContainer = document.getElementById('botones-fecha');
    if (!botonesContainer) return;

    let html = '';

    [...funciones.especiales, ...funciones.regulares].forEach(funcion => {
        const bloqueada    = funcion.bloqueada;
        const esSeleccionada = fechaSeleccionada === funcion.clave;
        const claseBoton   = bloqueada
            ? 'p-4 rounded-lg text-center border border-slate-700/50 bg-slate-800/40 text-slate-400 cursor-not-allowed backdrop-blur-sm'
            : `p-3 sm:p-4 rounded-lg text-center border-2 ${esSeleccionada ? 'border-white border-4' : 'border-[#967d3d]'} bg-[#c69c3a] text-[#3e1116] transition-all duration-200 hover:bg-[#dcb048] hover:text-[#2a080d] active:bg-[#b88a2f] hover:shadow-md hover:border-[#bda056] group focus:ring-2 focus:ring-white touch-manipulation`;
        const estiloBoton  = bloqueada ? '' : (esSeleccionada
            ? 'border: 3px solid white; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5); -webkit-tap-highlight-color: transparent;'
            : '-webkit-tap-highlight-color: transparent;');
        const fechaCorta   = funcion.nombre.split(' - ')[0];
        const hora         = funcion.nombre.split(' - ')[1] || '';

        html += `
            <button
                type="button"
                data-fecha-clave="${funcion.clave}"
                onclick="${bloqueada ? '' : `seleccionarFecha('${funcion.clave}', '${funcion.nombre}', ${JSON.stringify(funcion).replace(/"/g, '&quot;')})`}"
                class="${claseBoton}"
                ${bloqueada ? 'disabled' : ''}
                style="${estiloBoton}"
            >
                <span class="block font-bold ${bloqueada ? 'opacity-60' : ''}">${fechaCorta}</span>
                <span class="text-sm ${bloqueada ? 'opacity-60' : 'font-medium opacity-90'}">
                    ${bloqueada ? 'Ventas bloqueadas' : hora}
                </span>
            </button>
        `;
    });

    botonesContainer.innerHTML = html;
    if (fechaSeleccionada) resaltarBotonFecha(fechaSeleccionada);
}

// --- INICIALIZACIÓN ---
function inicializar() {
    if (typeof InventarioManager !== 'undefined') InventarioManager.inicializar();

    cargarFechas();

    if (typeof FechasManager !== 'undefined') {
        const funciones = FechasManager.obtenerFunciones();
        [...funciones.regulares, ...funciones.especiales].forEach(f => {
            FechasManager.inicializarInventarioFuncion(f.clave);
        });
    }

    actualizarPantalla();

    setInterval(() => {
        if (fechaSeleccionada) { verificarDisponibilidad(); actualizarPantalla(); }
    }, 30000);

    setInterval(cargarFechas, 60000);
}

window.irAConfirmacion  = irAConfirmacion;
window.cambiarCantidad  = cambiarCantidad;
window.seleccionarFecha = seleccionarFecha;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
