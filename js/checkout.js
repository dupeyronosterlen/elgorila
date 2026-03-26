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
    if (funcionElement) {
        funcionElement.textContent = ordenCompra.fecha || 'No especificada';
    }

    // Boletos
    const boletosElement = document.getElementById('checkout-boletos');
    if (boletosElement) {
        boletosElement.textContent = `${ordenCompra.cantidad} x General`;
    }

    // Subtotal
    const subtotalElement = document.getElementById('checkout-subtotal');
    if (subtotalElement) {
        subtotalElement.textContent = `$${ordenCompra.subtotal.toFixed(2)}`;
    }

    // Descuento (si existe)
    const descuentoContainer = document.getElementById('checkout-descuento-container');
    const descuentoElement = document.getElementById('checkout-descuento');
    if (ordenCompra.descuento && ordenCompra.descuento > 0) {
        if (descuentoContainer) {
            descuentoContainer.classList.remove('hidden');
        }
        if (descuentoElement) {
            descuentoElement.textContent = `-$${ordenCompra.descuento.toFixed(2)}`;
            if (ordenCompra.codigoDescuento) {
                const codigoInfo = document.getElementById('checkout-codigo-info');
                if (codigoInfo) {
                    codigoInfo.textContent = `(${ordenCompra.codigoDescuento})`;
                }
            }
        }
    } else {
        if (descuentoContainer) {
            descuentoContainer.classList.add('hidden');
        }
    }

    // Cargo por servicio (5% del subtotal)
    const cargoServicio = ordenCompra.subtotal * 0.05;
    const cargoElement = document.getElementById('checkout-cargo');
    if (cargoElement) {
        cargoElement.textContent = `$${cargoServicio.toFixed(2)}`;
    }

    // Total
    const total = ordenCompra.total + cargoServicio;
    const totalElement = document.getElementById('checkout-total');
    if (totalElement) {
        totalElement.textContent = `$${total.toFixed(2)} MXN`;
    }

    // Guardar total actualizado en la orden
    ordenCompra.totalFinal = total;
    ordenCompra.cargoServicio = cargoServicio;
    localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
}

// Procesar pago: Stripe (si API disponible) o modo simulado
async function procesarPago() {
    if (!ordenCompra) {
        alert('Error: No se encontró la orden de compra');
        window.location.href = 'boletos.html';
        return;
    }

    if (typeof ordenCompra.cantidad !== 'number' || ordenCompra.cantidad < 1 || ordenCompra.cantidad > 10) {
        alert('Error: Datos de la orden inválidos');
        window.location.href = 'boletos.html';
        return;
    }
    if (!ordenCompra.clave || typeof ordenCompra.clave !== 'string') {
        alert('Error: Fecha inválida');
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

    // Verificar disponibilidad
    if (typeof InventarioManager !== 'undefined') {
        const disponibilidad = InventarioManager.obtenerDisponibilidad(ordenCompra.clave);
        if (disponibilidad.disponible < ordenCompra.cantidad) {
            alert('Lo sentimos, ya no hay suficientes boletos disponibles para esta función.');
            window.location.href = 'boletos.html';
            return;
        }
    }

    // --- STRIPE: si API disponible, crear sesión y redirigir ---
    if (window.API_BASE) {
        const btn = document.getElementById('btn-pagar');
        if (btn) { btn.disabled = true; btn.querySelector('span:last-child').textContent = 'Procesando...'; }
        try {
            const res = await fetch(window.API_BASE + '/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orden: {
                        clave: ordenCompra.clave,
                        cantidad: ordenCompra.cantidad,
                        total: ordenCompra.total,
                        subtotal: ordenCompra.subtotal,
                        fecha: ordenCompra.fecha,
                        descuento: ordenCompra.descuento || 0,
                        codigoDescuento: ordenCompra.codigoDescuento || ''
                    },
                    email: email
                })
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
                return;
            }
            const msg = data.mensaje || data.error || 'Error al procesar el pago';
            alert(msg);
        } catch (err) {
            console.error(err);
            alert('Error de conexión. Verifica que el servidor esté activo e intenta de nuevo.');
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
