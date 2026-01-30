// --- SISTEMA DE VERIFICACIÓN DE BOLETOS ---
// Página para verificar boletos por código QR
// Optimizado para validar 200 boletos en <30 minutos

let certificadoActual = null;

// Verificar boleto (mejorado para soportar efectivo)
function verificarBoleto() {
    verificarBoletoMejorado();
}

// Mostrar resultado de verificación
function mostrarResultado(resultado) {
    const resultadoContainer = document.getElementById('resultado-verificacion');
    const resultadoValido = document.getElementById('resultado-valido');
    const resultadoInvalido = document.getElementById('resultado-invalido');
    
    // Mostrar contenedor
    resultadoContainer.classList.remove('hidden');
    
    if (resultado.valido) {
        // Mostrar resultado válido
        resultadoValido.classList.remove('hidden');
        resultadoInvalido.classList.add('hidden');
        
        // Llenar información
        document.getElementById('resultado-codigo').textContent = resultado.certificado.id;
        document.getElementById('resultado-fecha').textContent = resultado.certificado.fecha || 'No especificada';
        document.getElementById('resultado-orden').textContent = resultado.certificado.numeroOrden;
        document.getElementById('resultado-email').textContent = resultado.certificado.email || 'No especificado';
        document.getElementById('resultado-estado').textContent = 'Activo';
        
        // Mostrar tiempo de verificación (debug)
        console.log(`Verificación completada en ${resultado.tiempo.toFixed(2)}ms`);
        
    } else {
        // Mostrar resultado inválido
        resultadoValido.classList.add('hidden');
        resultadoInvalido.classList.remove('hidden');
        
        // Mostrar error
        document.getElementById('resultado-error').textContent = resultado.error || 'Error desconocido';
        
        // Si el certificado existe pero está usado, mostrar información adicional
        const infoAdicional = document.getElementById('resultado-info-adicional');
        if (resultado.certificado && resultado.certificado.fechaUso) {
            infoAdicional.classList.remove('hidden');
            infoAdicional.innerHTML = `
                <div class="flex justify-between">
                    <span>Fecha de uso:</span>
                    <span>${new Date(resultado.certificado.fechaUso).toLocaleString('es-MX')}</span>
                </div>
                <div class="flex justify-between">
                    <span>Número de orden:</span>
                    <span>${resultado.certificado.numeroOrden}</span>
                </div>
            `;
        } else {
            infoAdicional.classList.add('hidden');
        }
    }
}

// Marcar boleto como usado (mejorado para soportar efectivo)
function marcarComoUsado() {
    if (!certificadoActual) {
        alert('No hay un boleto seleccionado');
        return;
    }
    
    // Confirmar acción
    if (!confirm('¿Está seguro de marcar este boleto como usado? Esta acción no se puede deshacer.')) {
        return;
    }
    
    let resultado;
    
    // Verificar tipo de boleto
    if (certificadoActual.tipo === 'efectivo') {
        resultado = TaquillaManager.marcarComoUsado(certificadoActual.id);
    } else {
        resultado = CertificadoManager.marcarComoUsado(certificadoActual.id);
    }
    
    if (resultado.exito) {
        alert('Boleto marcado como usado exitosamente');
        
        // Actualizar visualización
        document.getElementById('resultado-estado').textContent = 'Usado';
        document.getElementById('resultado-estado').classList.remove('text-green-400');
        document.getElementById('resultado-estado').classList.add('text-yellow-400');
        
        // Ocultar botón
        document.getElementById('btn-marcar-usado').disabled = true;
        document.getElementById('btn-marcar-usado').classList.add('opacity-50', 'cursor-not-allowed');
        
        // Limpiar certificado actual
        certificadoActual = null;
    } else {
        alert('Error al marcar boleto: ' + (resultado.error || 'Error desconocido'));
    }
}

// Permitir verificar con Enter
function inicializar() {
    const codigoInput = document.getElementById('codigo-qr-input');
    const btnVerificar = document.getElementById('btn-verificar');
    const btnMarcarUsado = document.getElementById('btn-marcar-usado');
    
    // Event listeners
    if (btnVerificar) {
        btnVerificar.addEventListener('click', verificarBoleto);
    }
    
    if (codigoInput) {
        codigoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                verificarBoleto();
            }
        });
        
        // Auto-focus
        codigoInput.focus();
    }
    
    if (btnMarcarUsado) {
        btnMarcarUsado.addEventListener('click', marcarComoUsado);
    }
    
    // Limpiar resultado al cambiar el código
    if (codigoInput) {
        codigoInput.addEventListener('input', function() {
            const resultadoContainer = document.getElementById('resultado-verificacion');
            if (resultadoContainer && !resultadoContainer.classList.contains('hidden')) {
                resultadoContainer.classList.add('hidden');
                certificadoActual = null;
            }
        });
    }
}

// Cargar estadísticas
function cargarEstadisticas() {
    if (typeof CertificadoManager !== 'undefined') {
        const stats = CertificadoManager.obtenerEstadisticas();
        const statsTotal = document.getElementById('stats-total');
        const statsActivos = document.getElementById('stats-activos');
        const statsUsados = document.getElementById('stats-usados');
        
        if (statsTotal) statsTotal.textContent = stats.total;
        if (statsActivos) statsActivos.textContent = stats.activos;
        if (statsUsados) statsUsados.textContent = stats.usados;
    }
}

    // Verificar si hay código en la URL
function verificarCodigoURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const codigo = urlParams.get('codigo');
    
    if (codigo) {
        const codigoInput = document.getElementById('codigo-qr-input');
        if (codigoInput) {
            codigoInput.value = codigo;
            // Verificar automáticamente
            setTimeout(() => {
                verificarBoleto();
            }, 500);
        }
    }
}

// Verificar también boletos en efectivo
function verificarBoletoMejorado() {
    const codigoInput = document.getElementById('codigo-qr-input');
    const codigoQR = codigoInput.value.trim().toUpperCase();
    
    if (!codigoQR) {
        alert('Por favor, ingrese un código QR');
        return;
    }
    
    // Intentar verificar como certificado digital
    if (codigoQR.startsWith('CERT-')) {
        const resultado = CertificadoManager.verificarCertificado(codigoQR);
        mostrarResultado(resultado);
        certificadoActual = resultado.certificado || null;
        return;
    }
    
    // Intentar verificar como boleto en efectivo
    if (codigoQR.startsWith('EFECT-') && typeof TaquillaManager !== 'undefined') {
        const resultado = TaquillaManager.verificarCodigo(codigoQR);
        
        if (resultado.valido) {
            // Mostrar resultado como válido
            const resultadoContainer = document.getElementById('resultado-verificacion');
            const resultadoValido = document.getElementById('resultado-valido');
            const resultadoInvalido = document.getElementById('resultado-invalido');
            
            resultadoContainer.classList.remove('hidden');
            resultadoValido.classList.remove('hidden');
            resultadoInvalido.classList.add('hidden');
            
            document.getElementById('resultado-codigo').textContent = resultado.boleto.id;
            document.getElementById('resultado-fecha').textContent = resultado.boleto.fecha;
            document.getElementById('resultado-orden').textContent = 'EFECTIVO';
            document.getElementById('resultado-email').textContent = 'Venta en taquilla';
            document.getElementById('resultado-estado').textContent = 'Activo';
            
            certificadoActual = { id: resultado.boleto.id, tipo: 'efectivo' };
        } else {
            mostrarResultado({ valido: false, error: resultado.error });
        }
        return;
    }
    
    // Código no reconocido
    mostrarResultado({ valido: false, error: 'Código no reconocido. Debe comenzar con CERT- o EFECT-' });
}

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    inicializar();
    cargarEstadisticas();
    verificarCodigoURL();
    
    // Actualizar estadísticas cada 5 segundos
    setInterval(cargarEstadisticas, 5000);
});
