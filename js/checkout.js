// --- SISTEMA DE CHECKOUT ---
// Carga los datos de la orden y maneja el proceso de pago

let ordenCompra = null;

// Cargar datos de la orden
function cargarOrden() {
    const ordenGuardada = localStorage.getItem('orden_compra');
    
    if (!ordenGuardada) {
        // Si no hay orden, redirigir a boletos
        alert('No hay una orden de compra. Redirigiendo a la página de boletos...');
        window.location.href = 'boletos.html';
        return;
    }
    
    try {
        ordenCompra = JSON.parse(ordenGuardada);
        mostrarDatosOrden();
        if (window.ElGorilaAnalytics) ElGorilaAnalytics.beginCheckout(ordenCompra);
    } catch (error) {
        console.error('Error al cargar la orden:', error);
        alert('Error al cargar los datos de la orden. Por favor, intenta de nuevo.');
        window.location.href = 'boletos.html';
    }
}

// Mostrar datos de la orden en la página
function mostrarDatosOrden() {
    if (!ordenCompra) return;

    // Función
    const funcionElement = document.getElementById('checkout-funcion');
    if (funcionElement) funcionElement.textContent = ordenCompra.fecha || 'No especificada';

    // Boletos: mostrar desglose por tipo
    const boletosElement = document.getElementById('checkout-boletos');
    if (boletosElement && Array.isArray(ordenCompra.items)) {
        boletosElement.textContent = ordenCompra.items
            .map(i => `${i.cantidad} × ${i.tipo.charAt(0).toUpperCase() + i.tipo.slice(1)}`)
            .join(', ');
    }

    const subtotal       = ordenCompra.subtotal       || ordenCompra.total || 0;
    const total          = ordenCompra.total          || 0;
    const descuentoMonto = ordenCompra.descuentoMonto || 0;

    // Subtotal
    const subtotalElement = document.getElementById('checkout-subtotal');
    if (subtotalElement) subtotalElement.textContent = `$${subtotal.toFixed(2)}`;

    // Descuento (promo 5+ generales)
    const descuentoContainer = document.getElementById('checkout-descuento-container');
    if (descuentoContainer) {
        if (descuentoMonto > 0) {
            descuentoContainer.classList.remove('hidden');
            const descuentoEl = document.getElementById('checkout-descuento');
            if (descuentoEl) descuentoEl.textContent = `-$${descuentoMonto.toFixed(2)}`;
            const codigoInfo = document.getElementById('checkout-codigo-info');
            if (codigoInfo) codigoInfo.textContent = '(5+ generales)';
        } else {
            descuentoContainer.classList.add('hidden');
        }
    }

    // Cargo por servicio: ocultar (no aplica)
    const cargoElement = document.getElementById('checkout-cargo');
    if (cargoElement && cargoElement.closest('.flex')) cargoElement.closest('.flex').style.display = 'none';

    // Total
    const totalElement = document.getElementById('checkout-total');
    if (totalElement) totalElement.textContent = `$${total.toFixed(2)} MXN`;
}

// Procesar pago: Stripe (si API disponible) o modo simulado
async function procesarPago() {
    if (!ordenCompra) {
        alert('Error: No se encontró la orden de compra');
        window.location.href = 'boletos.html';
        return;
    }

    // Validar que haya items y fecha ISO
    if (!Array.isArray(ordenCompra.items) || ordenCompra.items.length === 0) {
        alert('El carrito está vacío. Regresa y selecciona boletos.');
        window.location.href = 'boletos.html';
        return;
    }
    if (!ordenCompra.fechaIso) {
        alert('Error: selecciona una fecha desde la página de boletos.');
        window.location.href = 'boletos.html';
        return;
    }

    const emailInput = document.getElementById('email-input');
    if (!emailInput) return;
    let email = emailInput.value.trim().substring(0, 254).replace(/[<>]/g, '');
    if (!email || !validarEmail(email)) {
        alert('Por favor, ingresa un correo electrónico válido');
        return;
    }

    if (window.ElGorilaAnalytics) ElGorilaAnalytics.addPaymentInfo(ordenCompra);

    // --- CHECKOUT: llamar al Worker ---
    if (window.API_BASE) {
        const btn = document.getElementById('btn-pagar');
        if (btn) { btn.disabled = true; btn.querySelector('span:last-child').textContent = 'Procesando...'; }
        try {
            const res = await fetch(window.teatroApi('checkout'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: ordenCompra.items,
                    fecha: ordenCompra.fechaIso,
                    utm: (typeof window.obtenerUTM === 'function' ? window.obtenerUTM() : {}),
                }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
                return;
            }
            alert(data.error || 'Error al procesar el pago. Intenta de nuevo.');
        } catch (err) {
            console.error(err);
            alert('Error de conexión. Verifica tu internet e intenta de nuevo.');
        }
        if (btn) { btn.disabled = false; btn.querySelector('span:last-child').textContent = 'Continuar al pago'; }
        return;
    }

    // --- MODO SIMULADO (sin backend) ---
    if (typeof InventarioManager !== 'undefined') {
        const resultado = InventarioManager.confirmarCompra(ordenCompra.clave, ordenCompra.cantidad, ordenCompra.reservaId);
        if (!resultado.exito) {
            alert(resultado.mensaje || 'Error al confirmar la compra');
            return;
        }
    }

    const numeroOrden = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    ordenCompra.email = email;
    ordenCompra.numeroOrden = numeroOrden;
    ordenCompra.fechaCompra = new Date().toISOString();
    ordenCompra.estado = 'completada';
    localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
    localStorage.setItem('ultima_compra', JSON.stringify(ordenCompra));

    if (typeof window.guardarVentaEnHistorial === 'function') {
        window.guardarVentaEnHistorial(ordenCompra);
    } else {
        const ventas = JSON.parse(localStorage.getItem('historial_ventas') || '[]');
        ventas.push(ordenCompra);
        localStorage.setItem('historial_ventas', JSON.stringify(ventas));
    }

    if (typeof CertificadoManager !== 'undefined') {
        const resultadoCertificados = CertificadoManager.generarCertificadosParaOrden(ordenCompra);
        if (resultadoCertificados.exito) {
            ordenCompra.certificados = resultadoCertificados.certificados.map(c => c.id);
            localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
        }
    }

    window.location.href = 'confirmacion.html';
}

// Validar email
function validarEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Verificar disponibilidad periódicamente mientras el usuario está en checkout
function verificarDisponibilidadPeriodica() {
    if (!ordenCompra) return;
    
    if (typeof InventarioManager !== 'undefined') {
        const disponibilidad = InventarioManager.obtenerDisponibilidad(ordenCompra.clave);
        
        if (disponibilidad.disponible < ordenCompra.cantidad) {
            // Mostrar advertencia si la disponibilidad cambió
            const mensajeError = document.getElementById('mensajes-error');
            if (mensajeError) {
                mensajeError.classList.remove('hidden');
                const errorPago = document.getElementById('error-pago');
                if (errorPago) {
                    errorPago.classList.remove('hidden');
                    errorPago.querySelector('p').textContent = 
                        `La disponibilidad cambió. Solo hay ${disponibilidad.disponible} boletos disponibles.`;
                }
            }
        }
    }
}

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    // Si volvió de Stripe cancelando
    const params = new URLSearchParams(window.location.search);
    if (params.get('cancelado') === '1') {
        const err = document.getElementById('mensajes-error');
        const errPago = document.getElementById('error-pago');
        if (err && errPago) {
            err.classList.remove('hidden');
            errPago.classList.remove('hidden');
            errPago.querySelector('p').textContent = 'Pago cancelado. Puedes intentar de nuevo cuando quieras.';
        }
    }
    cargarOrden();
    
    // Configurar botón de pago
    const botonPago = document.getElementById('btn-pagar');
    if (botonPago) {
        botonPago.addEventListener('click', procesarPago);
    }
    
    // Verificar disponibilidad cada 5 segundos
    setInterval(verificarDisponibilidadPeriodica, 5000);
    
    // Escuchar cambios en el inventario desde otras pestañas
    window.addEventListener('inventario-actualizado', function() {
        verificarDisponibilidadPeriodica();
    });
});
