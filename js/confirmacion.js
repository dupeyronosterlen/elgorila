// --- SISTEMA DE CONFIRMACIÓN Y PAGO ---
// Página de pago final y confirmación (Stripe + modo simulado)

let ordenCompra = null;

function baseUrlSitio() {
    const p = window.location.pathname.replace(/[^/]+$/, '');
    return window.location.origin + p;
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

function pintarQR(container, url, size) {
    if (!container || typeof QRCode === 'undefined') return;
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    QRCode.toCanvas(canvas, url, {
        width: size,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
    }, (err) => {
        if (err) {
            QRCode.toDataURL(url, { width: size, margin: 1 }, (e2, dataUrl) => {
                if (!e2) {
                    container.innerHTML = `<img src="${dataUrl}" width="${size}" height="${size}" alt="QR boleto" style="display:block;">`;
                }
            });
        }
    });
}

async function solicitarEmailBoleto(sessionId) {
    if (!sessionId || !window.API_BASE) return;
    const tid = typeof window.teatroIdFromUrl === 'function' ? window.teatroIdFromUrl() : (window.TEATRO_ID || 'wilberto');
    try {
        await fetch(`${window.API_BASE}/api/${tid}/venta/${encodeURIComponent(sessionId)}/enviar-boleto`, {
            method: 'POST',
        });
    } catch (_) { /* reintento silencioso; el usuario puede pedir reenvío en admin */ }
}

// Cargar datos de la orden
async function cargarConfirmacion() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    // --- Stripe: si hay session_id, obtener venta del backend (reintentar si webhook tarda) ---
    if (sessionId && window.API_BASE) {
        for (let intento = 0; intento < 3; intento++) {
            try {
                const tid = typeof window.teatroIdFromUrl === 'function' ? window.teatroIdFromUrl() : (window.TEATRO_ID || 'wilberto');
                const res = await fetch(`${window.API_BASE}/api/${tid}/venta/` + encodeURIComponent(sessionId));
                if (res.ok) {
                    const venta = await res.json();
                    let local = null;
                    try { local = JSON.parse(localStorage.getItem('orden_compra') || 'null'); } catch (_) {}
                    ordenCompra = {
                        estado: 'completada',
                        email: (local && local.email) || venta.email || '',
                        numeroOrden: venta.certificado || venta.codigo || (local && local.numeroOrden) || sessionId,
                        certificado: venta.certificado || venta.codigo,
                        boletos: venta.boletos || [],
                        sessionId,
                        cantidad: venta.cantidad,
                        cantidadTotal: venta.cantidad,
                        fecha: venta.funcionNombre || venta.fecha,
                        items: venta.items || (local && local.items) || [],
                        total: venta.total,
                        descuentoMonto: (local && local.descuentoMonto) || 0,
                    };
                    try {
                        localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
                    } catch (_) {}
                    solicitarEmailBoleto(sessionId);
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
        if (sessionId) {
            alert('La venta se está procesando. Si ya pagaste, revisa tu correo. Si no, intenta de nuevo.');
        } else {
            alert('No hay una orden de compra. Redirigiendo a la página de boletos...');
        }
        window.location.href = 'boletos.html';
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
        window.location.href = 'boletos.html';
    }
}

// Mostrar formulario de pago
function mostrarFormularioPago() {
    if (!ordenCompra) return;

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
            window.location.href = 'boletos.html';
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
    const contenedorPago = document.getElementById('contenedor-pago');
    const contenedorExito = document.getElementById('contenedor-exito');

    if (contenedorPago) contenedorPago.classList.add('hidden');
    if (contenedorExito) contenedorExito.classList.remove('hidden');

    if (window.ElGorilaAnalytics && ordenCompra) {
        const params = new URLSearchParams(window.location.search);
        const txId = ordenCompra.numeroOrden || params.get('session_id') || '';
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
    const certOrden = ordenCompra && ordenCompra.numeroOrden;
    if (!certOrden || !/^CERT-/i.test(certOrden)) {
        mostrarInfoCertificados();
        return;
    }

    const certificadoInfo = document.getElementById('certificado-info');
    const certificadosLista = document.getElementById('certificados-lista');
    if (!certificadoInfo || !certificadosLista) return;

    const cantTotal = ordenCompra.cantidadTotal || ordenCompra.cantidad || 1;
    const folioTaquilla = folioTaquillaOrden(ordenCompra);
    certificadoInfo.classList.remove('hidden');
    certificadosLista.innerHTML = `
        <div class="bg-black/30 border border-accent-gold/20 rounded-lg p-4 flex items-start gap-4">
            <div class="flex-shrink-0"><div id="qr-folio" class="w-24 h-24 bg-white p-2 rounded flex items-center justify-center"></div></div>
            <div class="flex-grow">
                <p class="text-sm font-semibold text-white mb-1">${cantTotal === 1 ? '1 entrada' : cantTotal + ' entradas'}</p>
                ${folioTaquilla ? `<p class="text-xs text-accent-gold font-mono mb-1">Folio taquilla: ${folioTaquilla}</p>` : ''}
                <p class="text-xs text-text-dark/80 font-mono mb-2">${ordenCompra.numeroOrden}</p>
                <p class="text-xs text-text-dark/80 mb-2">Presenta el QR en la entrada. También lo tienes en tu correo.</p>
            </div>
        </div>`;

    const qrCodigo = codigoQrBoleto(ordenCompra);
    const qrData = window.ElGorilaQr ? window.ElGorilaQr.codigoQrPayload(qrCodigo) : qrCodigo;
    pintarQR(document.getElementById('qr-folio'), qrData, 88);
}

// Mostrar información de certificados (modo simulado / legacy)
function mostrarInfoCertificados() {
    if (!ordenCompra || !ordenCompra.cantidad) return;
    
    const certificadoInfo = document.getElementById('certificado-info');
    const certificadosLista = document.getElementById('certificados-lista');
    
    if (!certificadoInfo || !certificadosLista) return;
    
    // Obtener certificados generados
    let certificados = [];
    if (ordenCompra.certificados && ordenCompra.certificados.length > 0) {
        // Si ya tenemos los IDs, obtener los certificados completos
        if (typeof CertificadoManager !== 'undefined') {
            certificados = ordenCompra.certificados.map(id => {
                const resultado = CertificadoManager.verificarCertificado(id);
                return resultado.certificado;
            }).filter(c => c);
        }
    } else if (typeof CertificadoManager !== 'undefined') {
        // Si no están en la orden, intentar obtenerlos por número de orden
        certificados = CertificadoManager.obtenerCertificadosPorOrden(ordenCompra.numeroOrden);
    }
    
    // Si no hay certificados, generar placeholder
    if (certificados.length === 0) {
        certificados = Array.from({ length: ordenCompra.cantidad }, (_, i) => ({
            id: `CERT-PENDING-${i + 1}`,
            numeroBoleto: i + 1
        }));
    }
    
    certificadoInfo.classList.remove('hidden');
    certificadosLista.innerHTML = '';
    
    // Mostrar cada certificado con su código QR
    certificados.forEach((cert, index) => {
        const certificadoDiv = document.createElement('div');
        certificadoDiv.className = 'bg-black/30 border border-accent-gold/20 rounded-lg p-4 flex items-start gap-4';
        
        const numeroBoleto = cert.numeroBoleto || (index + 1);
        const codigoQR = cert.id || `CERT-${ordenCompra.numeroOrden}-${numeroBoleto}`;
        
        certificadoDiv.innerHTML = `
            <div class="flex-shrink-0">
                <div id="qr-${index}" class="w-20 h-20 bg-white p-2 rounded flex items-center justify-center"></div>
            </div>
            <div class="flex-grow">
                <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined text-accent-gold">confirmation_number</span>
                    <p class="text-sm font-semibold text-white">Boleto #${numeroBoleto}</p>
                </div>
                <p class="text-xs text-text-dark/80 font-mono mb-1">${codigoQR}</p>
                <p class="text-xs text-text-dark/80">Presenta el QR en la entrada del teatro</p>
            </div>
        `;
        certificadosLista.appendChild(certificadoDiv);

        const qrContainer = document.getElementById(`qr-${index}`);
        if (qrContainer) {
            const payload = window.ElGorilaQr
                ? window.ElGorilaQr.codigoQrPayload(codigoQR)
                : codigoQR;
            pintarQR(qrContainer, payload, 80);
        }
    });
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
