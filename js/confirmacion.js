// --- SISTEMA DE CONFIRMACIÓN Y PAGO ---
// Página de pago final y confirmación

let ordenCompra = null;

// Cargar datos de la orden
function cargarConfirmacion() {
    const ordenGuardada = localStorage.getItem('orden_compra');
    
    if (!ordenGuardada) {
        // Si no hay orden, redirigir a boletos
        alert('No hay una orden de compra. Redirigiendo a la página de boletos...');
        window.location.href = 'boletos.html';
        return;
    }
    
    try {
        ordenCompra = JSON.parse(ordenGuardada);
        
        // Si ya está completada, mostrar éxito
        if (ordenCompra.estado === 'completada') {
            mostrarExito();
        } else {
            // Mostrar formulario de pago
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

    // Calcular cargo por servicio
    const cargoServicio = ordenCompra.subtotal * 0.05;
    const totalFinal = ordenCompra.total + cargoServicio;

    // Función
    const funcionElement = document.getElementById('confirmacion-funcion');
    if (funcionElement) {
        funcionElement.textContent = ordenCompra.fecha || 'No especificada';
    }

    // Cantidad
    const cantidadElement = document.getElementById('confirmacion-cantidad');
    if (cantidadElement) {
        cantidadElement.textContent = `${ordenCompra.cantidad} x General`;
    }

    // Subtotal
    const subtotalElement = document.getElementById('confirmacion-subtotal');
    if (subtotalElement) {
        subtotalElement.textContent = `$${ordenCompra.subtotal.toFixed(2)}`;
    }

    // Descuento
    if (ordenCompra.descuento && ordenCompra.descuento > 0) {
        const descuentoContainer = document.getElementById('confirmacion-descuento-container');
        const descuentoElement = document.getElementById('confirmacion-descuento');
        if (descuentoContainer) {
            descuentoContainer.classList.remove('hidden');
        }
        if (descuentoElement) {
            descuentoElement.textContent = `-$${ordenCompra.descuento.toFixed(2)}`;
        }
    }

    // Total
    const totalElement = document.getElementById('confirmacion-total');
    if (totalElement) {
        totalElement.textContent = `$${totalFinal.toFixed(2)} MXN`;
    }

    // Guardar total final
    ordenCompra.totalFinal = totalFinal;
    ordenCompra.cargoServicio = cargoServicio;
    localStorage.setItem('orden_compra', JSON.stringify(ordenCompra));
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

    // Mostrar datos finales
    document.getElementById('confirmacion-email-final').textContent = ordenCompra.email || 'No especificado';
    document.getElementById('confirmacion-orden-final').textContent = ordenCompra.numeroOrden || 'No disponible';
    
    // Mostrar cantidad de boletos
    const cantidadFinal = document.getElementById('confirmacion-cantidad-final');
    if (cantidadFinal) {
        cantidadFinal.textContent = `${ordenCompra.cantidad} ${ordenCompra.cantidad === 1 ? 'boleto' : 'boletos'}`;
    }
    
    // Preparar información de certificados (para futura implementación de NFTs)
    mostrarInfoCertificados();
}

// Mostrar información de certificados
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
        certificadoDiv.className = 'bg-surfaceVariant border border-primary/20 rounded p-4 flex items-start gap-4';
        
        const numeroBoleto = cert.numeroBoleto || (index + 1);
        const codigoQR = cert.id || `CERT-${ordenCompra.numeroOrden}-${numeroBoleto}`;
        
        certificadoDiv.innerHTML = `
            <div class="flex-shrink-0">
                <div id="qr-${index}" class="w-20 h-20 bg-white p-2 rounded"></div>
            </div>
            <div class="flex-grow">
                <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined text-primary">confirmation_number</span>
                    <p class="text-sm font-semibold text-onSurface">Boleto #${numeroBoleto}</p>
                </div>
                <p class="text-xs text-onSurfaceMuted font-mono mb-1">${codigoQR}</p>
                <p class="text-xs text-onSurfaceMuted">Certificado digital único</p>
                <a href="verificar.html?codigo=${encodeURIComponent(codigoQR)}" 
                   class="text-xs text-primary hover:underline mt-2 inline-block">
                    Verificar boleto →
                </a>
            </div>
        `;
        certificadosLista.appendChild(certificadoDiv);
        
        // Generar QR code visual
        if (typeof QRCode !== 'undefined') {
            const qrContainer = document.getElementById(`qr-${index}`);
            if (qrContainer) {
                const urlVerificacion = `${window.location.origin}${window.location.pathname.replace('confirmacion.html', '')}verificar.html?codigo=${encodeURIComponent(codigoQR)}`;
                QRCode.toCanvas(qrContainer, urlVerificacion, {
                    width: 80,
                    margin: 1,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                }, function (error) {
                    if (error) {
                        console.error('Error al generar QR:', error);
                        qrContainer.innerHTML = `<div class="text-xs text-onSurfaceMuted text-center">QR</div>`;
                    }
                });
            }
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
