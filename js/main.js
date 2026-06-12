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
let seccionActiva      = 'platea';
let _galeriaAbierta    = false;
let _grupoGrandeNotificado = false;

function seccionVentaConfig() {
    const map = window.SECCIONES_VENTA || {};
    return map[seccionActiva] || map.platea || { precio_general: 350, precio_descuento: 245, nombre: 'Platea' };
}

function precioUnitario(tipo) {
    const sec = seccionVentaConfig();
    const base = tipo === 'general' ? sec.precio_general : sec.precio_descuento;
    if (promoManadaActiva() && tipo === 'general') return base * (1 - DESCUENTO_MANADA_PCT);
    return base;
}

// --- HELPERS DE CARRITO ---

function totalCantidad() {
    return Object.values(cantidades).reduce((s, c) => s + c, 0);
}

// Descuento Manada: 5+ generales → 20% off sobre todos los generales.
// Se aplica aunque haya boletos especiales (inapam/estudiante/maestro).
const DESCUENTO_MANADA_MIN  = 5;
const DESCUENTO_MANADA_PCT  = 0.20;
const DESCUENTO_ESPECIALES  = 0.30;
const NOMBRE_CREDENCIAL     = 'INAPAM · Estudiante · Maestro';
const TIPOS_CREDENCIAL      = ['inapam', 'estudiante', 'maestro'];

function nombreBoletoEnResumen(tipo) {
    if (TIPOS_CREDENCIAL.includes(tipo)) return NOMBRE_CREDENCIAL;
    const t = TIPOS_BOLETO.find(x => x.tipo === tipo);
    return t ? t.nombre : tipo;
}

function promoManadaActiva() {
    return cantidades.general >= DESCUENTO_MANADA_MIN;
}

function calcularTotal() {
    return TIPOS_BOLETO.reduce((s, t) => s + precioUnitario(t.tipo) * (cantidades[t.tipo] || 0), 0);
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

    if (funcion && funcion.fecha_iso) {
        fechaIsoActual = funcion.fecha_iso;
        refrescarDisponibilidadWorker();
    } else if (funcion && funcion.fecha) {
        const d = funcion.fecha instanceof Date ? funcion.fecha : new Date(funcion.fecha);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        fechaIsoActual = `${y}-${m}-${day}`;
        refrescarDisponibilidadWorker();
    } else if (clave && /^\d{4}-\d{2}-\d{2}$/.test(clave)) {
        fechaIsoActual = clave;
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
    const seccionInfo    = document.getElementById('seccion-venta-info');

    if (indicador) indicador.classList.remove('hidden');

    if (disponibilidadInfo) {
        if (disponibilidadInfo.disponible > 0) {
            const zona = _galeriaAbierta ? 'Galería (arriba)' : 'Platea (abajo)';
            if (indicador) {
                indicador.innerHTML = `<p class="text-xs text-green-400">✓ ${disponibilidadInfo.disponible} en ${zona}</p>`;
            }
            if (seccionInfo) {
                if (_galeriaAbierta) {
                    seccionInfo.innerHTML = '<p class="seccion-venta-aviso seccion-venta-aviso--galeria">Platea agotada — abrimos <strong>galería (arriba)</strong> al mismo precio</p>';
                } else {
                    seccionInfo.innerHTML = '<p class="seccion-venta-aviso">Venta en <strong>platea (abajo)</strong>. La galería se abre si se llena.</p>';
                }
            }
            if (mensajeAgotado) mensajeAgotado.classList.add('hidden');
        } else {
            if (indicador) indicador.innerHTML = `<p class="text-xs text-red-400">✗ Agotado</p>`;
            if (seccionInfo) seccionInfo.innerHTML = '';
            if (mensajeAgotado) mensajeAgotado.classList.remove('hidden');
        }
    } else {
        if (indicador) indicador.innerHTML = `<p class="text-xs text-text-muted-dark">Selecciona una fecha para ver disponibilidad</p>`;
        if (seccionInfo) seccionInfo.innerHTML = '';
        if (mensajeAgotado) mensajeAgotado.classList.add('hidden');
    }
}

// --- DISPONIBILIDAD REAL DESDE EL WORKER (fire-and-forget) ---
function refrescarDisponibilidadWorker() {
    if (!fechaIsoActual || !window.API_BASE) return;
    fetch(window.teatroApi(`disponibilidad?fecha=${encodeURIComponent(fechaIsoActual)}`))
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data) return;
            const platea  = data.secciones?.platea?.disponibles ?? 0;
            const galeria = data.secciones?.galeria?.disponibles ?? 0;
            _galeriaAbierta = !!data.galeria_abierta || (platea === 0 && galeria > 0);
            seccionActiva   = _galeriaAbierta ? 'galeria' : 'platea';
            const disp      = typeof data.disponibles === 'number'
                ? data.disponibles
                : (_galeriaAbierta ? galeria : platea);
            disponibilidadInfo = {
                disponible: disp,
                platea,
                galeria,
                galeria_abierta: _galeriaAbierta,
            };
            actualizarIndicadorDisponibilidad();
            actualizarPantalla();
        })
        .catch(() => {});
}

// --- FUNCIÓN 3: ACTUALIZAR PANTALLA ---
function actualizarPantalla() {
    const manada = promoManadaActiva();

    // Cantidad por tipo
    TIPOS_BOLETO.forEach(t => {
        const el = document.getElementById(`cantidad-${t.tipo}`);
        if (el) el.textContent = cantidades[t.tipo] || 0;
    });

    // Fecha seleccionada
    const cajitaFecha = document.getElementById('fecha-seleccionada-texto');
    if (cajitaFecha) cajitaFecha.innerText = nombreFecha || 'Selecciona una fecha';

    const secCfg = seccionVentaConfig();
    const precioGeneralEl = document.getElementById('precio-general-display');
    if (precioGeneralEl) {
        const base = secCfg.precio_general;
        if (manada) {
            const precioDesc = (base * (1 - DESCUENTO_MANADA_PCT)).toFixed(2);
            precioGeneralEl.innerHTML =
                `<span style="text-decoration:line-through;opacity:.45;">$${base}</span> ` +
                `<span style="color:#4ade80;">$${precioDesc} MXN</span> ` +
                `<span style="opacity:.55;">· −${Math.round(DESCUENTO_MANADA_PCT * 100)}%</span>`;
        } else {
            precioGeneralEl.innerHTML = `$${base} MXN`;
        }
    }

    // Resumen de items
    const resumenEl = document.getElementById('items-resumen');
    if (resumenEl) {
        const activos = TIPOS_BOLETO.filter(t => cantidades[t.tipo] > 0);
        let html = activos.map(t => {
            const esGeneral = t.tipo === 'general';
            const precioUnit = precioUnitario(t.tipo);
            const subtipo = (manada && esGeneral)
                ? ` <span style="color:#4ade80;font-size:.8em;">−${Math.round(DESCUENTO_MANADA_PCT*100)}%</span>`
                : (t.desc ? ` <span style="color:#4ade80;font-size:.8em;">−30%</span>` : '');
            return `<div class="flex justify-between text-text-dark text-sm">
                <span>${nombreBoletoEnResumen(t.tipo)} × ${cantidades[t.tipo]}${subtipo}</span>
                <span>$${(precioUnit * cantidades[t.tipo]).toFixed(2)}</span>
            </div>`;
        }).join('');

        // Línea de descuento total (si hay algún descuento activo)
        const subtotalBruto = TIPOS_BOLETO.reduce((s, t) => {
            const sec = seccionVentaConfig();
            const base = t.tipo === 'general' ? sec.precio_general : sec.precio_descuento;
            return s + base * (cantidades[t.tipo] || 0);
        }, 0);
        const totalDesc = calcularTotal();
        const montoDescuento = subtotalBruto - totalDesc;
        if (montoDescuento > 0.01 && activos.length > 0) {
            html += `<div class="flex justify-between text-sm" style="color:#4ade80;border-top:0.5px solid rgba(241,234,217,0.10);padding-top:6px;margin-top:4px;">
                <span>Descuento aplicado</span>
                <span>−$${montoDescuento.toFixed(2)}</span>
            </div>`;
        }
        resumenEl.innerHTML = html;
    }

    // Total
    const total = calcularTotal();
    const totalEl = document.getElementById('total-precio');
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)} MXN`;

    // Banner "Descuento Manada"
    let promoBanner = document.getElementById('promo-grupo-banner');
    if (!promoBanner && totalEl && totalEl.parentNode) {
        promoBanner = document.createElement('div');
        promoBanner.id = 'promo-grupo-banner';
        totalEl.parentNode.insertBefore(promoBanner, totalEl);
    }
    if (promoBanner) {
        if (manada) {
            const ahorro = (seccionVentaConfig().precio_general * DESCUENTO_MANADA_PCT * cantidades.general).toFixed(2);
            promoBanner.className = 'text-xs text-green-400 font-semibold my-1';
            promoBanner.innerHTML =
                `✓ Descuento Manada activo — ${Math.round(DESCUENTO_MANADA_PCT*100)}% off · ` +
                `ahorras $${ahorro} MXN en ${cantidades.general} boletos generales`;
        } else if (cantidades.general > 0 && cantidades.general < DESCUENTO_MANADA_MIN) {
            promoBanner.className = 'text-xs my-1';
            promoBanner.style.color = 'rgba(217,155,58,.6)';
            promoBanner.innerHTML =
                `Agrega ${DESCUENTO_MANADA_MIN - cantidades.general} general(es) más para activar el ` +
                `<strong>Descuento Manada (${Math.round(DESCUENTO_MANADA_PCT*100)}%)</strong>`;
        } else {
            promoBanner.className = 'hidden';
            promoBanner.innerHTML = '';
            promoBanner.style.color = '';
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
        if (window.ElGorilaAnalytics) ElGorilaAnalytics.grupoGrande(totalCantidad());
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
    if (!fechaIsoActual || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIsoActual)) {
        alert('No se detectó la fecha de la función. Vuelve a tocar el día en el calendario.');
        return false;
    }

    const items = TIPOS_BOLETO
        .filter(t => cantidades[t.tipo] > 0)
        .map(t => ({ tipo: t.tipo, cantidad: cantidades[t.tipo], seccion: seccionActiva }));

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

    const subtotalSinDescuento = TIPOS_BOLETO.reduce((s, t) => {
        const sec = seccionVentaConfig();
        const base = t.tipo === 'general' ? sec.precio_general : sec.precio_descuento;
        return s + base * (cantidades[t.tipo] || 0);
    }, 0);
    const totalConDescuento = calcularTotal();
    const descuentoMonto = subtotalSinDescuento - totalConDescuento;

    const orden = {
        fecha:          nombreFecha,
        fechaIso:       fechaIsoActual,
        clave:          fechaSeleccionada,
        items,
        cantidadTotal:  cantTotal,
        subtotal:       subtotalSinDescuento,
        subtotalConManada: totalConDescuento,
        descuentoMonto: descuentoMonto > 0 ? descuentoMonto : 0,
        total:          totalConDescuento,
        reservaId,
        timestamp:      Date.now(),
    };

    try {
        localStorage.setItem('orden_compra', JSON.stringify(orden));

        if (window.ElGorilaAnalytics) ElGorilaAnalytics.addToCart(orden);

        // Si existe el panel inline en boletos.html, mostrarlo en lugar de navegar.
        // Fallback a checkout.html si el panel no existe (otras páginas o JS sin DOM).
        if (typeof mostrarCheckoutInline === 'function' && document.getElementById('inline-checkout')) {
            navegandoACheckout = true; // evita liberar la reserva al hacer scroll
            mostrarCheckoutInline(orden);
        } else {
            navegandoACheckout = true;
            window.location.href = 'checkout.html';
        }
        return true;
    } catch (error) {
        console.error('Error al guardar la orden:', error);
        alert('Error al guardar la orden. Por favor intenta de nuevo.');
        return false;
    }
}

// --- FUNCIÓN 5: MOSTRAR CHECKOUT INLINE ---
function mostrarCheckoutInline(orden) {
    const panel = document.getElementById('inline-checkout');
    if (!panel) { window.location.href = 'checkout.html'; return; }

    // Fecha
    const fechaEl = document.getElementById('ichk-fecha');
    if (fechaEl) fechaEl.textContent = orden.fecha || '—';

    // Ítems del pedido
    const itemsWrap = document.getElementById('ichk-items-wrap');
    if (itemsWrap && Array.isArray(orden.items)) {
        itemsWrap.innerHTML = orden.items.map(item => {
            const prevSec = item.seccion || seccionActiva;
            const secMap = window.SECCIONES_VENTA || {};
            const sec = secMap[prevSec] || secMap.platea || { precio_general: 350, precio_descuento: 245 };
            let precioUnit = item.tipo === 'general' ? sec.precio_general : sec.precio_descuento;
            if (promoManadaActiva() && item.tipo === 'general') precioUnit *= (1 - DESCUENTO_MANADA_PCT);
            const sub = (precioUnit * item.cantidad).toFixed(0);
            return `<div class="ichk-item-fila">
                <span class="ichk-etiq">${nombreBoletoEnResumen(item.tipo)} × ${item.cantidad}</span>
                <span class="ichk-val">$${sub}</span>
            </div>`;
        }).join('');
    }

    // Descuento Manada (si aplica; cupón se muestra aparte en boletos.html)
    const descEl = document.getElementById('ichk-descuento-wrap');
    const manadaDesc = Math.max(0, (orden.subtotal || 0) - (orden.subtotalConManada ?? orden.total ?? 0));
    if (descEl) {
        if (manadaDesc > 0.01) {
            descEl.style.display = '';
            const dMonto = document.getElementById('ichk-descuento-monto');
            if (dMonto) dMonto.textContent = `−$${manadaDesc.toFixed(2)}`;
        } else {
            descEl.style.display = 'none';
        }
    }

    const cuponWrap = document.getElementById('ichk-cupon-wrap');
    if (cuponWrap) {
        const cuponDesc = orden.cuponDescuentoMonto || 0;
        if (orden.codigoCupon && cuponDesc > 0) {
            cuponWrap.style.display = '';
            const cm = document.getElementById('ichk-cupon-monto');
            const ce = document.getElementById('ichk-cupon-etiq');
            if (cm) cm.textContent = `−$${cuponDesc.toFixed(2)}`;
            if (ce) ce.textContent = orden.codigoCupon;
        } else {
            cuponWrap.style.display = 'none';
        }
    }

    const cuponInput = document.getElementById('ichk-cupon-input');
    const cuponMsg   = document.getElementById('ichk-cupon-msg');
    if (cuponInput) cuponInput.value = orden.codigoCupon || '';
    if (cuponMsg) { cuponMsg.textContent = ''; cuponMsg.className = ''; }

    // Total
    const totalEl = document.getElementById('ichk-total');
    if (totalEl) totalEl.textContent = `$${orden.total.toFixed(2)} MXN`;

    // Mostrar panel y desplazar
    panel.style.display = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
        const emailInput = document.getElementById('ichk-email-input');
        if (emailInput) emailInput.focus();
    }, 700);

    if (window.ElGorilaAnalytics) ElGorilaAnalytics.beginCheckout(orden);
}

// --- FUNCIÓN 6: VOLVER A EDITAR ---
function editarPedido() {
    const panel = document.getElementById('inline-checkout');
    if (panel) panel.style.display = 'none';
    navegandoACheckout = false;
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        const bloqueada      = funcion.bloqueada;
        const esAgotada      = funcion.agotada === true;
        const esSeleccionada = fechaSeleccionada === funcion.clave;
        const partesNombre   = funcion.nombre.split(/\s*[—–-]\s*/);
        const fechaCorta     = partesNombre[0] || funcion.nombre;
        const hora           = partesNombre[1] || '20:30 hrs';
        const estrenoTag     = funcion.estreno
            ? '<span class="fecha-estreno-tag">Estreno</span>'
            : '';
        const claveStr       = funcion.clave;
        const nombreStr      = funcion.nombre.replace(/'/g, "\\'");

        if (esAgotada) {
            const fechaIsoF = funcion.fecha_iso || funcion.clave;
            html += `
            <div data-fecha-item data-fecha-mes="${claveStr.slice(0, 7)}">
                <button type="button" disabled data-fecha-clave="${claveStr}" data-fecha-mes="${claveStr.slice(0, 7)}"
                    class="w-full p-4 rounded-lg text-center border border-red-800/50 bg-red-950/30 text-red-300 cursor-not-allowed backdrop-blur-sm">
                    <span class="block font-bold text-sm">${fechaCorta}</span>
                    <span class="inline-block mt-1 bg-red-700 text-white text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">Agotado</span>
                </button>
                <button type="button" onclick="abrirListaEspera('${claveStr}', '${nombreStr}', '${fechaIsoF}')"
                    class="w-full mt-1 text-xs text-accent-gold underline hover:text-white transition-colors py-1">
                    Anotarme en lista de espera →
                </button>
            </div>
            `;
            return;
        }

        const claseBoton   = bloqueada
            ? 'p-4 rounded-lg text-center border border-slate-700/50 bg-slate-800/40 text-slate-400 cursor-not-allowed backdrop-blur-sm'
            : `p-3 sm:p-4 rounded-lg text-center border-2 ${esSeleccionada ? 'border-white border-4' : 'border-[#967d3d]'} bg-[#c69c3a] text-[#3e1116] transition-all duration-200 hover:bg-[#dcb048] hover:text-[#2a080d] active:bg-[#b88a2f] hover:shadow-md hover:border-[#bda056] group focus:ring-2 focus:ring-white touch-manipulation`;
        const estiloBoton  = bloqueada ? '' : (esSeleccionada
            ? 'border: 3px solid white; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5); -webkit-tap-highlight-color: transparent;'
            : '-webkit-tap-highlight-color: transparent;');

        const mesIso = claveStr.slice(0, 7);
        html += `
            <button
                type="button"
                data-fecha-clave="${claveStr}"
                data-fecha-mes="${mesIso}"
                onclick="${bloqueada ? '' : `seleccionarFecha('${claveStr}', '${nombreStr}', ${JSON.stringify(funcion).replace(/"/g, '&quot;')})`}"
                class="${claseBoton}"
                ${bloqueada ? 'disabled' : ''}
                style="${estiloBoton}"
            >
                <span class="block font-bold ${bloqueada ? 'opacity-60' : ''}">${fechaCorta}</span>
                ${estrenoTag}
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

// --- LISTA DE ESPERA ---
let _listaEsperaClave   = null;
let _listaEsperaFechaIso = null;

function abrirListaEspera(clave, nombre, fechaIso) {
    _listaEsperaClave    = clave;
    _listaEsperaFechaIso = fechaIso || null;
    const modal = document.getElementById('modal-lista-espera');
    const texto = document.getElementById('espera-funcion-texto');
    if (texto) texto.textContent = nombre;
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    const n = document.getElementById('espera-nombre');
    const e = document.getElementById('espera-email');
    if (n) n.value = '';
    if (e) e.value = '';
    const msg = document.getElementById('espera-mensaje');
    if (msg) msg.classList.add('hidden');
}

function cerrarListaEspera() {
    const modal = document.getElementById('modal-lista-espera');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

async function enviarListaEspera() {
    const nombre = (document.getElementById('espera-nombre')?.value || '').trim();
    const email  = (document.getElementById('espera-email')?.value || '').trim();
    const msgEl  = document.getElementById('espera-mensaje');

    if (!nombre) { alert('Por favor escribe tu nombre'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Por favor ingresa un correo válido'); return; }

    const btn = document.querySelector('#modal-lista-espera .btn-espera-submit');
    if (btn) btn.disabled = true;

    try {
        if (window.API_BASE) {
            const res = await fetch(window.teatroApi('lista-espera'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clave: _listaEsperaClave, fechaIso: _listaEsperaFechaIso, nombre, email })
            });
            const data = await res.json();
            if (!res.ok) {
                if (msgEl) { msgEl.className = 'mt-3 text-center text-sm text-red-400'; msgEl.textContent = data.error || 'Error al registrar'; msgEl.classList.remove('hidden'); }
                return;
            }
        }
        if (msgEl) {
            msgEl.className = 'mt-3 text-center text-sm text-green-400';
            msgEl.textContent = '¡Listo! Te avisaremos si hay disponibilidad.';
            msgEl.classList.remove('hidden');
        }
        setTimeout(cerrarListaEspera, 2500);
    } catch {
        if (msgEl) { msgEl.className = 'mt-3 text-center text-sm text-red-400'; msgEl.textContent = 'Error de conexión. Intenta de nuevo.'; msgEl.classList.remove('hidden'); }
    } finally {
        if (btn) btn.disabled = false;
    }
}

window.irAConfirmacion  = irAConfirmacion;
window.cambiarCantidad  = cambiarCantidad;
window.seleccionarFecha = seleccionarFecha;
window.abrirListaEspera   = abrirListaEspera;
window.cerrarListaEspera  = cerrarListaEspera;
window.enviarListaEspera  = enviarListaEspera;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
