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

// Procesar pago
function procesarPago() {
    if (!ordenCompra) {
        alert('Error: No se encontró la orden de compra');
        window.location.href = 'boletos.html';
        return;
    }

    // Validar integridad de la orden
    if (typeof ordenCompra.cantidad !== 'number' || 
        ordenCompra.cantidad < 1 || 
        ordenCompra.cantidad > 10) {
        alert('Error: Datos de la orden inválidos');
        window.location.href = 'boletos.html';
        return;
    }
    
    if (!ordenCompra.clave || !['viernes', 'sabado', 'domingo'].includes(ordenCompra.clave)) {
        alert('Error: Fecha inválida');
        window.location.href = 'boletos.html';
        return;
    }

    // Validar formulario
    const emailInput = document.getElementById('email-input');
    if (!emailInput) {
        alert('Error: Campo de email no encontrado');
        return;
    }
    
    let email = emailInput.value.trim();
    
    // Sanitizar email
    email = email.substring(0, 254).replace(/[<>]/g, '');
    
    if (!email || !validarEmail(email)) {
        alert('Por favor, ingresa un correo electrónico válido');
        return;
    }

    // Verificar disponibilidad una última vez
    if (typeof InventarioManager !== 'undefined') {
        const disponibilidad = InventarioManager.obtenerDisponibilidad(ordenCompra.clave);
        if (disponibilidad.disponible < ordenCompra.cantidad) {
            alert('Lo sentimos, ya no hay suficientes boletos disponibles para esta función.');
            window.location.href = 'boletos.html';
            return;
        }
    }

    // Confirmar compra en el inventario
    if (typeof InventarioManager !== 'undefined') {
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

    // Generar número de orden único
    const numeroOrden = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Actualizar orden con datos finales
    ordenCompra.email = email;
    ordenCompra.numeroOrden = numeroOrden;
    ordenCompra.fechaCompra = new Date().toISOString();
    ordenCompra.estado = 'completada';

    // Guardar orden completa
    localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
    localStorage.setItem('ultima_compra', JSON.stringify(ordenCompra));

    // Guardar en historial de ventas (para el panel de admin)
    if (typeof window.guardarVentaEnHistorial === 'function') {
        window.guardarVentaEnHistorial(ordenCompra);
    } else {
        // Si el admin.js no está cargado, guardar directamente
        const ventas = JSON.parse(localStorage.getItem('historial_ventas') || '[]');
        ventas.push(ordenCompra);
        localStorage.setItem('historial_ventas', JSON.stringify(ventas));
    }

    // Generar certificados digitales para los boletos
    if (typeof CertificadoManager !== 'undefined') {
        const resultadoCertificados = CertificadoManager.generarCertificadosParaOrden(ordenCompra);
        if (resultadoCertificados.exito) {
            // Guardar IDs de certificados en la orden
            ordenCompra.certificados = resultadoCertificados.certificados.map(c => c.id);
            localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
            console.log(`Certificados generados: ${resultadoCertificados.certificados.length}`);
        } else {
            console.error('Error al generar certificados:', resultadoCertificados.error);
            // No bloqueamos el flujo si falla la generación de certificados
        }
    }

    // Redirigir a confirmación
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
