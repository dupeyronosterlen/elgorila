// --- SISTEMA DE CONFIRMACIÓN Y PAGO ---
// Página de pago final y confirmación (Stripe + modo simulado)

let ordenCompra = null;

function baseUrlSitio() {
    const p = window.location.pathname.replace(/[^/]+$/, '');
    return window.location.origin + p;
}

function urlProgramaMano() {
    const path = '/programa/v2.html';
    return typeof window.rutaAbsoluta === 'function' ? window.rutaAbsoluta(path) : path;
}

function htmlBtnProgramaMano() {
    const href = urlProgramaMano();
    return `<a href="${href}" class="btn-programa-mano" target="_blank" rel="noopener noreferrer">
            <span class="material-symbols-outlined">menu_book</span>
            Ver programa de mano
        </a>`;
}

function codigoQrBoleto(orden) {
    const boletos = orden.boletos || [];
    if (window.ElGorilaQr) return window.ElGorilaQr.codigoQrOficial(orden);
    if (boletos.length === 1 && boletos[0].cert) return boletos[0].cert;
    return orden.numeroOrden || orden.certificado || '';
}

function folioTaquillaOrden(orden) {
    const boletos = orden.boletos || [];
    if (boletos.length === 1 && boletos[0].folio) return boletos[0].folio;
    return boletos.map(b => b.folio).filter(Boolean).join(' · ') || null;
}

function pintarQR(container, codigo, size) {
    if (window.ElGorilaQr && typeof window.ElGorilaQr.pintarQr === 'function') {
        return window.ElGorilaQr.pintarQr(container, codigo, size);
    }
    if (!container || !codigo) return Promise.resolve();
    if (typeof QRCode === 'undefined') {
        container.textContent = String(codigo).trim().toUpperCase();
        return Promise.reject(new Error('QRCode no cargado'));
    }
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    return QRCode.toCanvas(canvas, codigo, {
        width: size,
        margin: 1,
        color: { dark: '#1a1411', light: '#f1ead9' },
    });
}

// Cargar datos de la orden
async function cargarConfirmacion() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    // --- Stripe: si hay session_id, obtener venta del backend (reintentar si webhook tarda) ---
    if (sessionId && window.API_BASE) {
        // Con session_id el comprador YA pagó: fuera el formulario de pago,
        // que verlo otra vez parece que la compra no se hizo.
        mostrarEsperandoConfirmacion();
        for (let intento = 0; intento < 6; intento++) {
            try {
                const tid = typeof window.teatroIdFromUrl === 'function' ? window.teatroIdFromUrl() : (window.TEATRO_ID || 'wilberto');
                const res = await fetch(`${window.API_BASE}/api/${tid}/venta/` + encodeURIComponent(sessionId));

                // 410 = reembolsada o cancelada. Es una respuesta definitiva: no
                // tiene caso reintentar ni caer al localStorage, que mostraría una
                // pantalla de "compra exitosa" con un boleto que ya no sirve.
                if (res.status === 410) {
                    let msg = 'Este boleto fue cancelado o reembolsado.';
                    try {
                        const data = await res.json();
                        if (data && data.error) msg = data.error;
                    } catch (_) {}
                    mostrarBoletoInvalido(msg);
                    return;
                }

                if (res.ok) {
                    const venta = await res.json();
                    let local = null;
                    try { local = JSON.parse(localStorage.getItem('orden_compra') || 'null'); } catch (_) {}
                    const fechaIsoApi = venta.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(venta.fecha))
                        ? venta.fecha
                        : null;
                    ordenCompra = {
                        estado: 'completada',
                        // El correo del API manda: el local puede ser de una compra
                        // anterior, y con Stripe el comprador lo captura allá.
                        email: venta.email || (local && local.email) || '',
                        nombre: (local && local.nombre) || '',
                        numeroOrden: venta.certificado || venta.codigo || (local && local.numeroOrden) || sessionId,
                        certificado: venta.certificado || venta.codigo,
                        boletos: venta.boletos || [],
                        sessionId,
                        cantidad: venta.cantidad,
                        cantidadTotal: venta.cantidad,
                        fechaIso: (local && local.fechaIso) || fechaIsoApi,
                        fecha: venta.funcionNombre || venta.fecha,
                        items: venta.items || (local && local.items) || [],
                        total: venta.total,
                        descuentoMonto: (local && local.descuentoMonto) || 0,
                    };
                    try {
                        localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
                    } catch (_) {}
                    mostrarExito();
                    return;
                }
            } catch (err) {
                console.error('Error al obtener venta:', err);
            }
            await new Promise(r => setTimeout(r, 800 * (intento + 1)));
        }
    }

    // --- Modo localStorage (simulado o fallback) ---
    const ordenGuardada = localStorage.getItem('orden_compra');
    if (!ordenGuardada) {
        // Con session_id el comprador YA pagó: nunca se le devuelve a la taquilla.
        if (sessionId) {
            mostrarPagoSinBoletos();
            return;
        }
        alert('No hay una orden de compra. Redirigiendo a la página de boletos...');
        window.irA ? window.irA('/boletos.html') : (window.location.href = '/boletos.html');
        return;
    }

    try {
        ordenCompra = JSON.parse(ordenGuardada);
        if (ordenCompra.estado === 'completada') {
            mostrarExito();
        } else {
            mostrarFormularioPago();
        }
    } catch (error) {
        console.error('Error al cargar la confirmación:', error);
        alert('Error al cargar los datos. Por favor, intenta de nuevo.');
        window.irA ? window.irA('/boletos.html') : (window.location.href = '/boletos.html');
    }
}

// Mostrar formulario de pago
/** Muestra una sola tarjeta y esconde las demás (pago / espera / inválido / éxito). */
function mostrarSoloTarjeta(idVisible) {
    ['contenedor-pago', 'contenedor-espera', 'contenedor-invalido', 'contenedor-exito'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== idVisible);
    });
}

/** "Confirmando tu pago…" mientras el webhook de Stripe registra la venta. */
function mostrarEsperandoConfirmacion() {
    mostrarSoloTarjeta('contenedor-espera');
}

/**
 * Se agotaron los reintentos y no hay boletos que mostrar. El comprador ya pagó,
 * así que NO se le manda de vuelta a la taquilla: se le dice qué pasó y a dónde
 * escribir. El boleto le llega por correo en cuanto el webhook entre.
 */
function mostrarPagoSinBoletos() {
    const titulo = document.getElementById('espera-titulo');
    const texto  = document.getElementById('espera-texto');
    const ayuda  = document.getElementById('espera-ayuda');
    if (titulo) titulo.textContent = 'Tu pago se registró';
    if (texto) {
        texto.innerHTML = 'Estamos tardando más de lo normal en generar tus boletos. '
            + '<strong>Tu lugar está apartado</strong> y los recibirás por correo en unos minutos. '
            + 'Revisa también tu carpeta de correo no deseado.';
    }
    if (ayuda) ayuda.classList.remove('hidden');
    mostrarSoloTarjeta('contenedor-espera');
}

/** Boleto reembolsado o cancelado: respuesta definitiva del servidor. */
function mostrarBoletoInvalido(mensaje) {
    const p = document.getElementById('invalido-mensaje');
    if (p && mensaje) p.textContent = mensaje;
    mostrarSoloTarjeta('contenedor-invalido');
}

function mostrarFormularioPago() {
    if (!ordenCompra) return;
    mostrarSoloTarjeta('contenedor-pago');

    const subtotal       = ordenCompra.subtotal       || ordenCompra.total || 0;
    const total          = ordenCompra.total          || 0;
    const descuentoMonto = ordenCompra.descuentoMonto || 0;

    // Función
    const funcionElement = document.getElementById('confirmacion-funcion');
    if (funcionElement) funcionElement.textContent = ordenCompra.fecha || 'No especificada';

    // Cantidad/items
    const cantidadElement = document.getElementById('confirmacion-cantidad');
    if (cantidadElement) {
        if (Array.isArray(ordenCompra.items) && ordenCompra.items.length) {
            cantidadElement.textContent = ordenCompra.items
                .map(i => `${i.cantidad} × ${i.tipo.charAt(0).toUpperCase() + i.tipo.slice(1)}`)
                .join(', ');
        } else {
            cantidadElement.textContent = `${ordenCompra.cantidadTotal || 0} boletos`;
        }
    }

    // Subtotal
    const subtotalElement = document.getElementById('confirmacion-subtotal');
    if (subtotalElement) subtotalElement.textContent = `$${subtotal.toFixed(2)}`;

    // Descuento
    const descuentoContainer = document.getElementById('confirmacion-descuento-container');
    const descuentoElement   = document.getElementById('confirmacion-descuento');
    if (descuentoContainer) {
        if (descuentoMonto > 0) {
            descuentoContainer.classList.remove('hidden');
            if (descuentoElement) descuentoElement.textContent = `-$${descuentoMonto.toFixed(2)}`;
        } else {
            descuentoContainer.classList.add('hidden');
        }
    }

    // Total
    const totalElement = document.getElementById('confirmacion-total');
    if (totalElement) totalElement.textContent = `$${total.toFixed(2)} MXN`;
}

// Procesar pago
function procesarPago() {
    if (!ordenCompra) {
        alert('Error: No se encontró la orden de compra');
        return;
    }

    // Validar email
    const email = document.getElementById('email-input').value.trim();
    if (!email || !validarEmail(email)) {
        alert('Por favor, ingresa un correo electrónico válido');
        return;
    }

    // Verificar disponibilidad
    if (typeof InventarioManager !== 'undefined') {
        const disponibilidad = InventarioManager.obtenerDisponibilidad(ordenCompra.clave);
        if (disponibilidad.disponible < ordenCompra.cantidad) {
            alert('Lo sentimos, ya no hay suficientes boletos disponibles para esta función.');
            window.irA ? window.irA('/boletos.html') : (window.location.href = '/boletos.html');
            return;
        }

        // Confirmar compra
        const resultado = InventarioManager.confirmarCompra(
            ordenCompra.clave,
            ordenCompra.cantidad,
            ordenCompra.reservaId
        );

        if (!resultado.exito) {
            alert(resultado.mensaje || 'Error al confirmar la compra');
            return;
        }
    }

    // Generar número de orden
    const numeroOrden = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Actualizar orden
    ordenCompra.email = email;
    ordenCompra.numeroOrden = numeroOrden;
    ordenCompra.fechaCompra = new Date().toISOString();
    ordenCompra.estado = 'completada';

    // Guardar orden
    localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));

    // Guardar en historial
    if (typeof window.guardarVentaEnHistorial === 'function') {
        window.guardarVentaEnHistorial(ordenCompra);
    } else {
        const ventas = JSON.parse(localStorage.getItem('historial_ventas') || '[]');
        ventas.push(ordenCompra);
        localStorage.setItem('historial_ventas', JSON.stringify(ventas));
    }

    // Generar certificados digitales si no se generaron antes
    if (typeof CertificadoManager !== 'undefined') {
        if (!ordenCompra.certificados || ordenCompra.certificados.length === 0) {
            const resultadoCertificados = CertificadoManager.generarCertificadosParaOrden(ordenCompra);
            if (resultadoCertificados.exito) {
                ordenCompra.certificados = resultadoCertificados.certificados.map(c => c.id);
                localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
                console.log(`Certificados generados: ${resultadoCertificados.certificados.length}`);
            }
        }
    }

    // Mostrar éxito
    mostrarExito();
}

// Mostrar pantalla de éxito
function mostrarExito() {
    mostrarSoloTarjeta('contenedor-exito');

    // Único punto de conversión purchase (GA4 + Meta).
    if (window.ElGorilaAnalytics && ordenCompra) {
        const params = new URLSearchParams(window.location.search);
        const txId = ordenCompra.certificado || ordenCompra.numeroOrden || params.get('session_id') || '';
        if (!ordenCompra.sessionId && params.get('session_id')) {
            ordenCompra.sessionId = params.get('session_id');
        }
        ElGorilaAnalytics.purchase(ordenCompra, txId);
    }

    // Mostrar datos finales
    document.getElementById('confirmacion-email-final').textContent = ordenCompra.email || 'No especificado';
    document.getElementById('confirmacion-orden-final').textContent = ordenCompra.numeroOrden || 'No disponible';

    // Mostrar cantidad de boletos
    const cantidadFinal = document.getElementById('confirmacion-cantidad-final');
    const cantTotal = ordenCompra.cantidadTotal || ordenCompra.cantidad || 0;
    if (cantidadFinal) {
        cantidadFinal.textContent = `${cantTotal} ${cantTotal === 1 ? 'boleto' : 'boletos'}`;
    }

    // Compartir boleto directo por WhatsApp (imagen + texto, sin subpágina)
    const waContainer = document.getElementById('btn-whatsapp-container');
    if (waContainer) {
        const cantTotal = ordenCompra.cantidadTotal || ordenCompra.cantidad || 0;
        const entradas = cantTotal === 1 ? '1 entrada' : `${cantTotal} entradas`;
        waContainer.innerHTML = `
            <button type="button" id="btn-compartir-wa"
               class="flex items-center justify-center gap-2 w-full border border-green-600/50 bg-green-900/30 hover:bg-green-800/40 text-green-400 font-semibold py-3 rounded-xl transition-colors text-sm">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 0C5.373 0 0 5.373 0 12c0 2.109.549 4.09 1.508 5.814L0 24l6.335-1.496A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.882 9.882 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374A9.858 9.858 0 012.106 12c0-5.455 4.44-9.894 9.894-9.894 5.455 0 9.894 4.439 9.894 9.894 0 5.455-4.439 9.894-9.894 9.894z"/></svg>
                Compartir por WhatsApp · ${entradas}
            </button>
            <p class="text-xs text-center text-text-dark/50 mt-2">Se abre WhatsApp con la imagen de tu boleto. También la recibirás por correo.</p>`;
        waContainer.classList.remove('hidden');
        const btnWa = document.getElementById('btn-compartir-wa');
        if (btnWa) {
            btnWa.addEventListener('click', async function () {
                btnWa.disabled = true;
                const label = btnWa.innerHTML;
                btnWa.textContent = 'Preparando boleto…';
                try {
                    if (window.ElGorilaCompartirWa) {
                        await ElGorilaCompartirWa.compartirPorWhatsApp(ordenCompra);
                    } else {
                        throw new Error('Compartir no disponible');
                    }
                } catch (e) {
                    if (e.name !== 'AbortError') {
                        alert('No se pudo compartir. Revisa tu correo: ahí viene el boleto con QR.');
                    }
                } finally {
                    btnWa.disabled = false;
                    btnWa.innerHTML = label;
                }
            });
        }
    }

    void initGoogleWalletBtn();

    // QR único por folio (compra en línea)
    mostrarBoletoFolio();
}

async function initGoogleWalletBtn() {
    const container = document.getElementById('btn-whatsapp-container');
    const cert = ordenCompra && (ordenCompra.numeroOrden || ordenCompra.certificado);
    if (!container || !cert || !/^CERT-/i.test(cert) || !window.API_BASE) return;

    try {
        const tid = typeof window.teatroIdFromUrl === 'function'
            ? window.teatroIdFromUrl()
            : (window.TEATRO_ID || 'wilberto');
        const res = await fetch(`${window.API_BASE}/api/${tid}/venta/${encodeURIComponent(cert)}/wallet`);
        const data = await res.json().catch(() => ({}));
        if (!data.google?.ok || !data.google.saveUrl) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flex items-center justify-center gap-2 w-full mt-2 border border-white/20 bg-black/40 hover:bg-black/60 text-white font-semibold py-3 rounded-xl transition-colors text-sm';
        btn.innerHTML = '<span aria-hidden="true">📲</span> Agregar a Google Wallet';
        btn.addEventListener('click', () => window.open(data.google.saveUrl, '_blank', 'noopener'));
        container.appendChild(btn);
    } catch { /* wallet opcional */ }
}

function mostrarBoletoFolio() {
    const certificadoInfo = document.getElementById('certificado-info');
    const certificadosLista = document.getElementById('certificados-lista');
    if (!certificadoInfo || !certificadosLista || !ordenCompra) return;

    let cant = ordenCompra.cantidadTotal || ordenCompra.cantidad;
    const certOrden = ordenCompra.numeroOrden || ordenCompra.certificado;
    if (!cant && certOrden && /^CERT-/i.test(certOrden)) {
        cant = 1;
        ordenCompra.cantidad = 1;
    }
    if (!cant) {
        mostrarInfoCertificados();
        return;
    }

    certificadoInfo.classList.remove('hidden');
    certificadosLista.innerHTML = '<div id="boleto-preview-wrap"></div>';
    void pintarBoletitoCanvas(document.getElementById('boleto-preview-wrap'), ordenCompra);
}

function htmlVistaBoleto(orden, opts) {
    const cant = orden.cantidadTotal || orden.cantidad || 1;
    const folio = folioTaquillaOrden(orden);
    const cert = orden.numeroOrden || orden.certificado || '';
    const imgAlt = opts.fullTicket ? 'Boleto digital EL GORILA con código QR' : 'Código QR — presentar en puerta';
    const media = opts.previewSrc
        ? `<div class="boleto-preview">
            <img id="boleto-preview-img" src="${opts.previewSrc}" alt="${imgAlt}" loading="eager">
        </div>`
        : `<div class="boleto-preview">
            <div class="qr-box" id="qr-preview-live" aria-label="${imgAlt}"></div>
        </div>`;
    return `
        ${media}
        <p class="boleto-meta">${cant === 1 ? '1 entrada' : cant + ' entradas'}${folio ? ' · Folio ' + folio : ''}</p>
        ${cert ? `<p class="boleto-cert">${cert}</p>` : ''}
        <button type="button" class="btn-guardar-boleto" id="btn-guardar-boleto">
            <span class="material-symbols-outlined">download</span>
            Guardar imagen del boleto
        </button>
        ${htmlBtnProgramaMano()}
        <p class="boleto-hint">Presenta este QR en la entrada. Al compartir por WhatsApp se envía la imagen del boleto.</p>`;
}

function enlazarGuardarBoleto(canvas) {
    document.getElementById('btn-guardar-boleto')?.addEventListener('click', () => {
        if (!canvas || !window.GenerarImagenBoleto) return;
        GenerarImagenBoleto.guardarEnDispositivo(canvas, 'el-gorila-boleto.png', 'Mi boleto — EL GORILA')
            .catch((e) => {
                if (e.name !== 'AbortError') GenerarImagenBoleto.descargar(canvas, 'el-gorila-boleto.png');
            });
    });
}

async function pintarBoletitoCanvas(container, orden) {
    if (!container || !orden) return;

    const cant = orden.cantidadTotal || orden.cantidad || 1;
    const folio = folioTaquillaOrden(orden);
    const cert = orden.numeroOrden || orden.certificado || '';

    container.innerHTML = htmlVistaBoleto(orden, {});
    void pintarQR(document.getElementById('qr-preview-live'), codigoQrBoleto(orden), 280);

    if (!window.ElGorilaCompartirWa || !window.GenerarImagenBoleto) {
        pintarQrFallback(container, orden, cant, folio, cert);
        return;
    }

    try {
        const canvas = await ElGorilaCompartirWa.generarCanvas(orden);
        const dataUrl = canvas.toDataURL('image/png', 0.92);
        container.innerHTML = htmlVistaBoleto(orden, { previewSrc: dataUrl, fullTicket: true });
        enlazarGuardarBoleto(canvas);
    } catch (err) {
        console.warn('Boleto completo no disponible, mostrando QR:', err);
        document.getElementById('btn-guardar-boleto')?.addEventListener('click', async () => {
            try {
                const c = await ElGorilaCompartirWa.generarCanvas(orden);
                await GenerarImagenBoleto.guardarEnDispositivo(c, 'el-gorila-boleto.png', 'Mi boleto — EL GORILA');
            } catch (e) {
                if (e.name !== 'AbortError') alert('No se pudo guardar. Usa captura de pantalla del QR o revisa tu correo.');
            }
        }, { once: true });
    }
}

function pintarQrFallback(container, orden, cant, folio, cert) {
    const qrCodigo = codigoQrBoleto(orden);
    const qrData = window.ElGorilaQr ? window.ElGorilaQr.codigoQrPayload(qrCodigo) : qrCodigo;
    container.innerHTML = `
        <div class="boleto-fallback-qr">
            <div class="qr-box"><div id="qr-folio-fallback"></div></div>
            <div>
                <p class="boleto-meta" style="text-align:left;margin-bottom:8px;">${cant === 1 ? '1 entrada' : cant + ' entradas'}</p>
                ${folio ? `<p class="boleto-cert" style="text-align:left;margin-bottom:8px;">Folio: ${folio}</p>` : ''}
                ${cert ? `<p class="boleto-cert" style="text-align:left;">${cert}</p>` : ''}
                <p class="boleto-hint" style="text-align:left;margin-top:10px;">Presenta el QR en la entrada. También lo tienes en tu correo.</p>
            </div>
        </div>
        ${htmlBtnProgramaMano()}`;
    pintarQR(document.getElementById('qr-folio-fallback'), qrData, 84);
}

// Mostrar información de certificados (modo simulado / legacy)
function mostrarInfoCertificados() {
    if (!ordenCompra) return;

    const certificadoInfo = document.getElementById('certificado-info');
    const certificadosLista = document.getElementById('certificados-lista');
    if (!certificadoInfo || !certificadosLista) return;

    let certificados = [];
    if (ordenCompra.certificados && ordenCompra.certificados.length > 0) {
        if (typeof CertificadoManager !== 'undefined') {
            certificados = ordenCompra.certificados.map(id => {
                const resultado = CertificadoManager.verificarCertificado(id);
                return resultado.certificado;
            }).filter(c => c);
        }
    } else if (typeof CertificadoManager !== 'undefined') {
        certificados = CertificadoManager.obtenerCertificadosPorOrden(ordenCompra.numeroOrden);
    }

    if (!ordenCompra.cantidad && !ordenCompra.cantidadTotal && certificados.length) {
        ordenCompra.cantidad = certificados.length;
        ordenCompra.cantidadTotal = certificados.length;
    }

    const cant = ordenCompra.cantidadTotal || ordenCompra.cantidad;
    if (cant) {
        certificadoInfo.classList.remove('hidden');
        certificadosLista.innerHTML = '<div id="boleto-preview-wrap"></div>';
        void pintarBoletitoCanvas(document.getElementById('boleto-preview-wrap'), ordenCompra);
        return;
    }

    if (certificados.length === 0) return;

    certificadoInfo.classList.remove('hidden');
    certificadosLista.innerHTML = '<div id="boleto-preview-wrap"></div>';
    ordenCompra.cantidad = certificados.length;
    ordenCompra.cantidadTotal = certificados.length;
    void pintarBoletitoCanvas(document.getElementById('boleto-preview-wrap'), ordenCompra);
}

// Validar email
function validarEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    cargarConfirmacion();
    
    // Asegurar que CertificadoManager esté disponible
    if (typeof CertificadoManager === 'undefined') {
        console.warn('CertificadoManager no está disponible. Los certificados no se generarán.');
    }
});
