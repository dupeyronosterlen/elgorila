// --- TIPOS DE BOLETO ---
// Precios definitivos. El Worker los valida de forma independiente.
const TIPOS_BOLETO = [
    { tipo: 'general',    nombre: 'General',    precio: 400 },
    { tipo: 'inapam',     nombre: 'INAPAM',     precio: 280, desc: '30% desc.' },
    { tipo: 'estudiante', nombre: 'Estudiante', precio: 280, desc: '30% desc.' },
    { tipo: 'maestro',    nombre: 'Maestro',    precio: 280, desc: '30% desc.' },
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
    const map = (typeof window.seccionesVentaVigentes === 'function'
      ? window.seccionesVentaVigentes()
      : window.SECCIONES_VENTA) || {};
    return map[seccionActiva] || map.platea || {
      precio_general: (typeof window.precioGeneralVigente === 'function' ? window.precioGeneralVigente() : 400),
      precio_descuento: window.PRECIO_CREDENCIAL || 280,
      nombre: 'Platea',
    };
}

// Precio especial de la función seleccionada (ej. preestreno de prensa $10/boleto).
// Aplica a todos los tipos y desactiva promos automáticas.
function precioEspecialFuncion() {
    const f  = (window.FUNCIONES_TEMPORADA || []).find(x => x.fecha_iso === fechaSeleccionada);
    const pe = Number(f?.precio_especial);
    return pe > 0 ? pe : null;
}

function precioUnitario(tipo) {
    const pe = precioEspecialFuncion();
    if (pe) return pe;
    const sec = seccionVentaConfig();
    return tipo === 'general' ? sec.precio_general : sec.precio_descuento;
}

// --- HELPERS DE CARRITO ---

function totalCantidad() {
    return Object.values(cantidades).reduce((s, c) => s + c, 0);
}

// Credenciales: tarifa fija $280 en su fila (no son cupones).
const NOMBRE_CREDENCIAL     = 'INAPAM · Estudiante · Maestro';
const TIPOS_CREDENCIAL      = ['inapam', 'estudiante', 'maestro'];
const CUPON_GRUPO20_MIN      = 5;
const CUPON_GRUPO20_HINT_MIN = 3;
const CUPON_GRUPO20_PCT      = 0.20;

function tieneBoletosCredencial() {
    return TIPOS_CREDENCIAL.some(t => (cantidades[t] || 0) > 0);
}

// Promo automática: solo GRUPO20 (5+ generales, sin credencial). ESPEJO va manual al pagar.
function detectarPromoAutomatica() {
    if (precioEspecialFuncion()) return null;
    if (tieneBoletosCredencial()) return null;
    const gen   = cantidades.general || 0;
    const total = totalCantidad();
    if (gen >= CUPON_GRUPO20_MIN && gen === total) {
        return {
            codigo:     'GRUPO20',
            nombre:     'Grupo 20%',
            tipo:       'porcentaje',
            porcentaje: Math.round(CUPON_GRUPO20_PCT * 100),
        };
    }
    return null;
}

function calcularSubtotalBruto() {
    return TIPOS_BOLETO.reduce((s, t) => s + precioUnitario(t.tipo) * (cantidades[t.tipo] || 0), 0);
}

function calcularPreciosConPromo(promo) {
    const subtotal = calcularSubtotalBruto();
    if (!promo) {
        return { subtotal, total: subtotal, descuentoMonto: 0, promo: null };
    }
    let total = subtotal;
    if (promo.tipo === 'par_fijo') {
        total = promo.totalMxn;
    } else if (promo.tipo === 'porcentaje') {
        total = subtotal * (1 - promo.porcentaje / 100);
    }
    const descuentoMonto = Math.max(0, Math.round((subtotal - total) * 100) / 100);
    total = Math.round(total * 100) / 100;
    return { subtotal, total, descuentoMonto, promo };
}

function renderResumenDescuentoOrden(orden) {
    const autoDesc  = (!orden.promoManual && orden.promoAutomatica) ? (orden.descuentoMonto || 0) : 0;
    const cuponDesc = orden.promoManual ? (orden.cuponDescuentoMonto || 0) : 0;

    const descWrap = document.getElementById('ichk-descuento-wrap');
    const descMonto = document.getElementById('ichk-descuento-monto');
    if (descWrap) {
        if (autoDesc > 0.01 && orden.codigoCupon) {
            descWrap.style.display = '';
            if (descMonto) descMonto.textContent = `−$${autoDesc.toFixed(2)} (${orden.codigoCupon})`;
        } else {
            descWrap.style.display = 'none';
        }
    }

    const cuponWrap = document.getElementById('ichk-cupon-wrap');
    const cuponMonto = document.getElementById('ichk-cupon-monto');
    const cuponEtiq = document.getElementById('ichk-cupon-etiq');
    if (cuponWrap) {
        if (cuponDesc > 0.01 && orden.codigoCupon && orden.promoManual) {
            cuponWrap.style.display = '';
            if (cuponMonto) cuponMonto.textContent = `−$${cuponDesc.toFixed(2)}`;
            if (cuponEtiq) cuponEtiq.textContent = orden.codigoCupon;
        } else {
            cuponWrap.style.display = 'none';
        }
    }

    const totalEl = document.getElementById('ichk-total');
    if (totalEl) totalEl.textContent = `$${(orden.total || 0).toFixed(2)} MXN`;
}

function nombreBoletoEnResumen(tipo) {
    if (TIPOS_CREDENCIAL.includes(tipo)) return NOMBRE_CREDENCIAL;
    const t = TIPOS_BOLETO.find(x => x.tipo === tipo);
    return t ? t.nombre : tipo;
}

function calcularTotal() {
    const promo = detectarPromoAutomatica();
    return calcularPreciosConPromo(promo).total;
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

    if (window.ElGorilaAnalytics && fechaIsoActual) {
        var catId = ElGorilaAnalytics.catalogContentId
            ? ElGorilaAnalytics.catalogContentId(fechaIsoActual)
            : ('gorila-' + fechaIsoActual);
        ElGorilaAnalytics.viewContent({
            content_ids:  [catId],
            content_name: texto,
        });
    }

    if (totalCantidad() > 0) {
        verificarDisponibilidad();
    }

    // Guía de scroll: tras elegir fecha, acomoda la pantalla con
    // "Boletos" arriba para que el conteo y el botón Continuar
    // queden a la vista sin que la persona tenga que buscarlos.
    var seccionBoletos = document.querySelector('.boletos-sub-label');
    if (seccionBoletos) {
        setTimeout(function () {
            seccionBoletos.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
    }
}

// --- RESALTAR BOTÓN DE FECHA ---
function resaltarBotonFecha(clave) {
    document.querySelectorAll('#botones-fecha button').forEach(btn => {
        btn.style.border = '';
        btn.style.boxShadow = '';
        const atenuada = btn.dataset.fechaAtenuada === '1' && !btn.disabled;
        btn.style.opacity = atenuada ? '0.55' : '';
        btn.style.filter  = atenuada ? 'saturate(0.75)' : '';
        if (btn.dataset.fechaDestacada === '1' && !btn.disabled) {
            btn.style.borderColor = '#d43a1a';
            btn.style.boxShadow = '0 0 0 2px rgba(212, 58, 26, 0.35)';
        }
    });
    const sel = document.querySelector(`#botones-fecha button[data-fecha-clave="${clave}"]`);
    if (sel && !sel.disabled) {
        sel.style.border = '3px solid white';
        sel.style.boxShadow = '0 0 0 3px rgba(255, 255, 255, 0.5)';
        sel.style.opacity = '';
        sel.style.filter = '';
    }
}

// --- VERIFICAR DISPONIBILIDAD (localStorage + Worker) ---
function verificarDisponibilidad() {
    if (!fechaSeleccionada) return;

    const total = totalCantidad();

    // Liberar reserva actual antes de verificar para no competir contra nosotros mismos
    if (reservaId) {
        InventarioManager.liberarReserva(reservaId);
        reservaId = null;
    }

    disponibilidadInfo = InventarioManager.obtenerDisponibilidad(fechaSeleccionada);

    if (total > 0 && total > disponibilidadInfo.disponible) {
        alert('No hay suficientes lugares para esta función.');
        actualizarIndicadorDisponibilidad();
        return;
    }

    if (total > 0 && disponibilidadInfo.disponible >= total) {
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

// --- ACTUALIZAR INDICADOR DE DISPONIBILIDAD (solo lógica interna; sin textos al público) ---
function actualizarIndicadorDisponibilidad() {
    const indicador      = document.getElementById('disponibilidad-info');
    const mensajeAgotado = document.getElementById('mensaje-agotado');
    const seccionInfo    = document.getElementById('seccion-venta-info');

    if (indicador) {
        indicador.classList.add('hidden');
        indicador.innerHTML = '';
    }
    if (seccionInfo) seccionInfo.innerHTML = '';

    if (disponibilidadInfo && disponibilidadInfo.disponible <= 0) {
        if (mensajeAgotado) mensajeAgotado.classList.remove('hidden');
    } else if (mensajeAgotado) {
        mensajeAgotado.classList.add('hidden');
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
    const promoAuto = detectarPromoAutomatica();
    const precios   = calcularPreciosConPromo(promoAuto);

    // Cantidad por tipo
    TIPOS_BOLETO.forEach(t => {
        const el = document.getElementById(`cantidad-${t.tipo}`);
        if (el) el.textContent = cantidades[t.tipo] || 0;
    });

    // Fecha seleccionada
    const cajitaFecha = document.getElementById('fecha-seleccionada-texto');
    if (cajitaFecha) {
        if (fechaSeleccionada && nombreFecha) {
            cajitaFecha.textContent = nombreFecha;
            cajitaFecha.hidden = false;
        } else {
            cajitaFecha.textContent = '';
            cajitaFecha.hidden = true;
        }
    }

    const secCfg = seccionVentaConfig();
    const pe = precioEspecialFuncion();
    const lista = window.PRECIO_GENERAL_TEMPORADA || 400;
    const preventa = typeof window.esPreventaVigente === 'function' ? window.esPreventaVigente() : false;
    const precioGeneralEl = document.getElementById('precio-general-display');
    if (precioGeneralEl) {
        if (pe) {
            precioGeneralEl.innerHTML = `<span style="text-decoration:line-through;opacity:.42;font-size:.75em;">$${secCfg.precio_general}</span> $${pe} MXN`;
        } else if (preventa) {
            precioGeneralEl.innerHTML = `<span style="text-decoration:line-through;opacity:.42;font-size:.75em;">$${lista}</span> $${secCfg.precio_general} MXN`;
        } else {
            precioGeneralEl.innerHTML = `$${secCfg.precio_general} MXN`;
        }
    }
    const precioCredencialEl = document.getElementById('precio-credencial-display');
    if (precioCredencialEl) {
        precioCredencialEl.innerHTML = pe
            ? `<span style="text-decoration:line-through;opacity:.42;">$${secCfg.precio_descuento}</span> <span style="margin: 0 4px;">→</span> <span class="ticket-precio-promo">$${pe} MXN</span>`
            : `<span style="text-decoration:line-through;opacity:.42;">$${secCfg.precio_general}</span> <span style="margin: 0 4px;">→</span> <span class="ticket-precio-promo">$${secCfg.precio_descuento} MXN</span> <span style="opacity:.55;"> · −30%</span>`;
    }
    const notaPreventaEl = document.getElementById('nota-preventa-general');
    if (notaPreventaEl) {
        if (pe) notaPreventaEl.textContent = 'Función de prensa — precio especial';
        else if (preventa) notaPreventaEl.textContent = 'Precio especial hasta el 26 jul · 15:00';
        else notaPreventaEl.textContent = '';
    }

    // Resumen de items
    const resumenEl = document.getElementById('items-resumen');
    if (resumenEl) {
        const activos = TIPOS_BOLETO.filter(t => cantidades[t.tipo] > 0);
        let html = activos.map(t => {
            const precioUnit = precioUnitario(t.tipo);
            const subtipo = t.desc ? ` <span style="color:#4ade80;font-size:.8em;">−30%</span>` : '';
            return `<div class="flex justify-between text-text-dark text-sm">
                <span>${nombreBoletoEnResumen(t.tipo)} × ${cantidades[t.tipo]}${subtipo}</span>
                <span>$${(precioUnit * cantidades[t.tipo]).toFixed(2)}</span>
            </div>`;
        }).join('');

        if (precios.descuentoMonto > 0.01 && promoAuto) {
            html += `<div class="flex justify-between text-sm" style="color:#4ade80;border-top:0.5px solid rgba(241,234,217,0.10);padding-top:6px;margin-top:4px;">
                <span>Promo ${promoAuto.codigo}</span>
                <span>−$${precios.descuentoMonto.toFixed(2)}</span>
            </div>`;
        }

        resumenEl.innerHTML = html;
    }

    // Total
    const total = precios.total;
    const totalEl = document.getElementById('total-precio');
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)} MXN`;

    let promoBanner = document.getElementById('promo-grupo-banner');
    if (!promoBanner && totalEl) {
        promoBanner = document.createElement('div');
        promoBanner.id = 'promo-grupo-banner';
        promoBanner.className = 'promo-grupo-banner hidden';
        const totalFila = totalEl.closest('.total-fila');
        if (totalFila && totalFila.parentNode) {
            totalFila.parentNode.insertBefore(promoBanner, totalFila.nextSibling);
        }
    }
    if (promoBanner) {
        if (promoAuto?.codigo === 'GRUPO20') {
            promoBanner.className = 'promo-grupo-banner';
            promoBanner.style.color = '#4ade80';
            promoBanner.innerHTML =
                `✓ Promo <strong>GRUPO20</strong> activa — −${Math.round(CUPON_GRUPO20_PCT * 100)}% en ${cantidades.general} generales`;
        } else if (
            cantidades.general >= CUPON_GRUPO20_HINT_MIN
            && cantidades.general < CUPON_GRUPO20_MIN
            && !tieneBoletosCredencial()
        ) {
            promoBanner.className = 'promo-grupo-banner';
            promoBanner.style.color = 'rgba(217,155,58,.6)';
            promoBanner.innerHTML =
                `Agrega ${CUPON_GRUPO20_MIN - cantidades.general} general(es) más para activar <strong>GRUPO20</strong> (−20%)`;
        } else if (cantidades.general >= CUPON_GRUPO20_MIN && tieneBoletosCredencial()) {
            promoBanner.className = 'promo-grupo-banner';
            promoBanner.style.color = 'rgba(217,155,58,.6)';
            promoBanner.innerHTML =
                '<strong>GRUPO20</strong> aplica solo cuando todos los boletos son generales. Las credenciales van en tarifa aparte ($280).';
        } else {
            promoBanner.className = 'promo-grupo-banner hidden';
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

    // verificarDisponibilidad ya libera la reserva previa y crea una nueva.
    // Si reservaId sigue null, significa que no hay lugares disponibles (ya se mostró alerta).
    if (!reservaId) return false;

    const promoAuto = detectarPromoAutomatica();
    const precios   = calcularPreciosConPromo(promoAuto);

    const orden = {
        fecha:          nombreFecha,
        fechaIso:       fechaIsoActual,
        clave:          fechaSeleccionada,
        items,
        cantidadTotal:  cantTotal,
        subtotal:       precios.subtotal,
        total:          precios.total,
        descuentoMonto: precios.descuentoMonto > 0 ? precios.descuentoMonto : 0,
        reservaId,
        timestamp:      Date.now(),
    };

    if (promoAuto) {
        orden.codigoCupon          = promoAuto.codigo;
        orden.cuponNombre          = promoAuto.nombre;
        orden.cuponTipo            = promoAuto.tipo;
        orden.cuponPorcentaje      = promoAuto.porcentaje || 0;
        orden.cuponTotalMxn        = promoAuto.totalMxn || null;
        orden.cuponDescuentoMonto  = precios.descuentoMonto;
        orden.promoAutomatica      = true;
        orden.promoManual          = false;
    }

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
            window.irA ? window.irA('/checkout.html') : (window.location.href = '/checkout.html');
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
    if (!panel) { window.irA ? window.irA('/checkout.html') : (window.location.href = '/checkout.html'); return; }


    // Fecha
    const fechaEl = document.getElementById('ichk-fecha');
    if (fechaEl) fechaEl.textContent = orden.fecha || '—';

    // Ítems del pedido
    const itemsWrap = document.getElementById('ichk-items-wrap');
    if (itemsWrap && Array.isArray(orden.items)) {
        itemsWrap.innerHTML = orden.items.map(item => {
            const prevSec = item.seccion || seccionActiva;
            const secMap = window.SECCIONES_VENTA || {};
            const sec = secMap[prevSec] || secMap.platea || { precio_general: 400, precio_descuento: 280 };
            let precioUnit = item.tipo === 'general' ? sec.precio_general : sec.precio_descuento;
            const sub = (precioUnit * item.cantidad).toFixed(0);
            return `<div class="ichk-item-fila">
                <span class="ichk-etiq">${nombreBoletoEnResumen(item.tipo)} × ${item.cantidad}</span>
                <span class="ichk-val">$${sub}</span>
            </div>`;
        }).join('');
    }

    renderResumenDescuentoOrden(orden);

    const cuponInput = document.getElementById('ichk-cupon-input');
    const cuponMsg   = document.getElementById('ichk-cupon-msg');
    if (cuponInput) cuponInput.value = orden.promoManual ? (orden.codigoCupon || '') : '';
    if (cuponMsg) { cuponMsg.textContent = ''; cuponMsg.className = ''; }

    // Mostrar panel y desplazar (nombre y correo se piden en Stripe).
    panel.style.display = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // begin_checkout/InitiateCheckout se dispara en procesarPagoInline (el click
    // real a Stripe): abrir el panel, editarlo o volver de un pago cancelado
    // inflaba la señal ~4-5x vs sesiones reales de Stripe.
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

// Volver desde Stripe con "Atrás": el navegador restaura la página congelada
// (bfcache) con el checkout inline abierto y el botón de pago deshabilitado.
// La reactivamos y regresamos a modo edición para poder ajustar sin refrescar.
window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return; // solo cuando la página viene de bfcache (atrás/adelante)
    navegandoACheckout = false;
    var btn = document.getElementById('btn-pagar-inline');
    if (btn) btn.disabled = false;
    var txt = document.getElementById('ichk-btn-texto');
    if (txt) txt.textContent = 'Ir al pago seguro';
    if (typeof editarPedido === 'function') editarPedido();
});

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
        const hora           = partesNombre[1] || '18:00 hrs';
        const textoEtiqueta  = funcion.etiqueta || (funcion.estreno ? 'Estreno' : '');
        const estrenoTag     = textoEtiqueta
            ? `<span class="fecha-estreno-tag">${textoEtiqueta}</span>`
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
        let estiloBoton  = bloqueada ? '' : (esSeleccionada
            ? 'border: 3px solid white; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5); -webkit-tap-highlight-color: transparent;'
            : '-webkit-tap-highlight-color: transparent;');
        // Fecha atenuada: sigue en venta pero con menor protagonismo visual
        if (funcion.atenuada && !bloqueada && !esSeleccionada) estiloBoton += ' opacity: 0.55; filter: saturate(0.75);';
        // Fecha destacada: marcada en rojo, sin texto adicional
        if (funcion.destacada && !bloqueada && !esSeleccionada) estiloBoton += ' border-color: #d43a1a; box-shadow: 0 0 0 2px rgba(212, 58, 26, 0.35);';

        const mesIso = claveStr.slice(0, 7);
        html += `
            <button
                type="button"
                data-fecha-clave="${claveStr}"
                data-fecha-mes="${mesIso}"
                ${funcion.atenuada ? 'data-fecha-atenuada="1"' : ''}
                ${funcion.destacada ? 'data-fecha-destacada="1"' : ''}
                onclick="${bloqueada ? '' : `seleccionarFecha('${claveStr}', '${nombreStr}', ${JSON.stringify(funcion).replace(/"/g, '&quot;')})`}"
                class="${claseBoton}"
                ${bloqueada ? 'disabled' : ''}
                style="${estiloBoton}"
            >
                <span class="block font-bold ${bloqueada ? 'opacity-60' : ''}">${fechaCorta}</span>
                <span class="text-sm ${bloqueada ? 'opacity-60' : 'font-medium opacity-90'}">
                    ${bloqueada ? 'Ventas bloqueadas' : hora}
                </span>
                ${estrenoTag}
            </button>
        `;
    });

    botonesContainer.innerHTML = html;
    if (fechaSeleccionada) resaltarBotonFecha(fechaSeleccionada);
}

// --- INICIALIZACIÓN ---
async function inicializar() {
    if (typeof InventarioManager !== 'undefined') InventarioManager.inicializar();

    if (typeof sincronizarFuncionesActivas === 'function') await sincronizarFuncionesActivas();
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

    setInterval(async () => {
        if (typeof sincronizarFuncionesActivas === 'function') await sincronizarFuncionesActivas();
        cargarFechas();
    }, 60000);
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
window.renderResumenDescuentoOrden = renderResumenDescuentoOrden;
window.mostrarCheckoutInline = mostrarCheckoutInline;
window.editarPedido = editarPedido;
window.abrirListaEspera   = abrirListaEspera;
window.cerrarListaEspera  = cerrarListaEspera;
window.enviarListaEspera  = enviarListaEspera;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
