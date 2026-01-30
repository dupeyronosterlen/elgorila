// --- INTERFAZ PARA ACOMODADORES ---
// App tipo móvil para validación de boletos con información útil

let funcionActual = 'viernes';
let boletoActual = null;

// Cargar selector de funciones
function cargarSelectorFunciones() {
    const selector = document.getElementById('selector-funcion');
    if (!selector) return;
    
    if (typeof FechasManager === 'undefined') {
        console.error('FechasManager no está disponible');
        return;
    }
    
    const funciones = FechasManager.obtenerFunciones();
    const todasLasFunciones = [...funciones.especiales, ...funciones.regulares];
    
    selector.innerHTML = '';
    
    todasLasFunciones.forEach(funcion => {
        const option = document.createElement('option');
        option.value = funcion.clave;
        option.textContent = funcion.nombre;
        if (funcion.clave === funcionActual) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
    
    // Si no hay función seleccionada, seleccionar la primera
    if (!funcionActual && todasLasFunciones.length > 0) {
        funcionActual = todasLasFunciones[0].clave;
        selector.value = funcionActual;
    }
}

// Cargar datos de la función
function cargarDatosFuncion() {
    if (typeof FechasManager === 'undefined') {
        console.error('FechasManager no está disponible');
        return;
    }
    
    const funciones = FechasManager.obtenerFunciones();
    const todasLasFunciones = [...funciones.especiales, ...funciones.regulares];
    
    // Si no hay función seleccionada, usar la primera
    if (!funcionActual && todasLasFunciones.length > 0) {
        funcionActual = todasLasFunciones[0].clave;
    }
    
    const funcion = todasLasFunciones.find(f => f.clave === funcionActual);
    
    if (!funcion) {
        if (todasLasFunciones.length > 0) {
            funcionActual = todasLasFunciones[0].clave;
            cargarDatosFuncion();
        }
        return;
    }
    
    const nombreFecha = funcion.nombre;
    
    // Obtener certificados digitales
    let certificados = [];
    if (typeof CertificadoManager !== 'undefined') {
        const db = JSON.parse(localStorage.getItem('certificados_db') || '{}');
        if (db.certificados) {
            certificados = Object.values(db.certificados).filter(c => c.fecha === nombreFecha);
        }
    }
    
    // Obtener boletos en efectivo
    let boletosEfectivo = [];
    if (typeof TaquillaManager !== 'undefined') {
        boletosEfectivo = TaquillaManager.obtenerBoletosPorFecha(nombreFecha);
    }
    
    // Calcular estadísticas
    const totalEsperado = certificados.length + boletosEfectivo.length;
    const ingresados = certificados.filter(c => c.estado === 'usado').length + 
                      boletosEfectivo.filter(b => b.usado).length;
    const pendientes = totalEsperado - ingresados;
    
    // Contar personas con discapacidad
    const conDiscapacidad = boletosEfectivo.filter(b => b.metadata && b.metadata.discapacidad).length;
    
    // Actualizar UI
    document.getElementById('total-esperado').textContent = totalEsperado;
    document.getElementById('total-ingresados').textContent = ingresados;
    document.getElementById('total-pendientes').textContent = pendientes;
    document.getElementById('total-discapacidad').textContent = conDiscapacidad;
    
    // Mostrar alerta de discapacidad
    const alertaDiscapacidad = document.getElementById('alerta-discapacidad');
    if (conDiscapacidad > 0) {
        alertaDiscapacidad.classList.remove('hidden');
        document.getElementById('info-discapacidad').textContent = 
            `Se esperan ${conDiscapacidad} persona(s) con discapacidad. Preparar acceso y acomodación especial.`;
    } else {
        alertaDiscapacidad.classList.add('hidden');
    }
    
    // Cargar lista de pendientes
    cargarListaPendientes(certificados, boletosEfectivo);
}

// Cargar lista de pendientes
function cargarListaPendientes(certificados, boletosEfectivo) {
    const pendientes = [];
    
    // Certificados pendientes
    certificados.filter(c => c.estado === 'activo').forEach(cert => {
        pendientes.push({
            tipo: 'digital',
            codigo: cert.id,
            cantidad: 1,
            fecha: cert.fecha,
            discapacidad: false
        });
    });
    
    // Boletos en efectivo pendientes
    boletosEfectivo.filter(b => !b.usado).forEach(boleto => {
        pendientes.push({
            tipo: 'efectivo',
            codigo: boleto.id,
            cantidad: boleto.cantidad || 1,
            fecha: boleto.fecha,
            discapacidad: boleto.metadata && boleto.metadata.discapacidad,
            acompanantes: boleto.metadata && boleto.metadata.acompanantes || 0
        });
    });
    
    const listaContainer = document.getElementById('lista-pendientes');
    
    if (pendientes.length === 0) {
        listaContainer.innerHTML = `
            <div class="bg-gray-800 rounded-xl p-6 text-center">
                <span class="material-symbols-outlined text-6xl text-gray-600 mb-2">check_circle</span>
                <p class="text-gray-400">Todos los boletos han ingresado</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    pendientes.forEach(boleto => {
        const tipoClass = boleto.tipo === 'efectivo' ? 'bg-blue-900/30 border-blue-500/50' : 'bg-gray-800 border-gray-700';
        const tipoIcon = boleto.tipo === 'efectivo' ? 'money' : 'confirmation_number';
        
        html += `
            <div class="bg-gray-800 rounded-xl p-4 border ${tipoClass}">
                <div class="flex items-start justify-between">
                    <div class="flex-grow">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="material-symbols-outlined text-primary">${tipoIcon}</span>
                            <span class="font-mono text-sm font-semibold">${boleto.codigo.substring(0, 20)}...</span>
                        </div>
                        <p class="text-sm text-gray-400">${boleto.cantidad} persona(s)</p>
                        ${boleto.discapacidad ? `
                            <div class="mt-2 flex items-center gap-2 text-blue-400">
                                <span class="material-symbols-outlined text-sm">accessible</span>
                                <span class="text-xs font-semibold">Con discapacidad</span>
                            </div>
                        ` : ''}
                    </div>
                    <button 
                        onclick="verificarCodigo('${boleto.codigo}')" 
                        class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90"
                    >
                        Verificar
                    </button>
                </div>
            </div>
        `;
    });
    
    listaContainer.innerHTML = html;
}

// Verificar boleto
function verificarBoleto() {
    const codigo = document.getElementById('codigo-verificar').value.trim().toUpperCase();
    
    if (!codigo) {
        alert('Por favor, ingrese un código');
        return;
    }
    
    verificarCodigo(codigo);
}

// Verificar código específico
function verificarCodigo(codigo) {
    const resultadoContainer = document.getElementById('resultado-verificacion');
    const resultadoValido = document.getElementById('resultado-valido');
    const resultadoInvalido = document.getElementById('resultado-invalido');
    
    resultadoContainer.classList.remove('hidden');
    resultadoValido.classList.add('hidden');
    resultadoInvalido.classList.add('hidden');
    
    // Intentar verificar como certificado digital
    if (typeof CertificadoManager !== 'undefined' && codigo.startsWith('CERT-')) {
        const resultado = CertificadoManager.verificarCertificado(codigo);
        
        if (resultado.valido) {
            boletoActual = { tipo: 'certificado', codigo: codigo, certificado: resultado.certificado };
            mostrarResultadoValido(resultado.certificado, 'certificado');
        } else {
            mostrarResultadoInvalido(resultado.error);
        }
        return;
    }
    
    // Intentar verificar como boleto en efectivo
    if (typeof TaquillaManager !== 'undefined' && codigo.startsWith('EFECT-')) {
        const resultado = TaquillaManager.verificarCodigo(codigo);
        
        if (resultado.valido) {
            boletoActual = { tipo: 'efectivo', codigo: codigo, boleto: resultado.boleto };
            mostrarResultadoValido(resultado.boleto, 'efectivo');
        } else {
            mostrarResultadoInvalido(resultado.error);
        }
        return;
    }
    
    // Código no reconocido
    mostrarResultadoInvalido('Código no reconocido. Debe comenzar con CERT- o EFECT-');
}

// Mostrar resultado válido
function mostrarResultadoValido(datos, tipo) {
    const resultadoValido = document.getElementById('resultado-valido');
    const resCodigo = document.getElementById('res-codigo');
    const resFecha = document.getElementById('res-fecha');
    const resCantidad = document.getElementById('res-cantidad');
    const resDiscapacidad = document.getElementById('res-discapacidad-container');
    
    resultadoValido.classList.remove('hidden');
    
    if (tipo === 'certificado') {
        resCodigo.textContent = datos.id;
        resFecha.textContent = datos.fecha;
        resCantidad.textContent = '1';
        resDiscapacidad.classList.add('hidden');
    } else if (tipo === 'efectivo') {
        resCodigo.textContent = datos.id;
        resFecha.textContent = datos.fecha;
        resCantidad.textContent = datos.cantidad || 1;
        
        if (datos.metadata && datos.metadata.discapacidad) {
            resDiscapacidad.classList.remove('hidden');
        } else {
            resDiscapacidad.classList.add('hidden');
        }
    }
    
    // Limpiar input
    document.getElementById('codigo-verificar').value = '';
}

// Mostrar resultado inválido
function mostrarResultadoInvalido(error) {
    const resultadoInvalido = document.getElementById('resultado-invalido');
    const resError = document.getElementById('res-error');
    
    resultadoInvalido.classList.remove('hidden');
    resError.textContent = error;
    
    boletoActual = null;
}

// Marcar ingreso
function marcarIngreso() {
    if (!boletoActual) {
        alert('No hay un boleto seleccionado');
        return;
    }
    
    let resultado;
    
    if (boletoActual.tipo === 'certificado') {
        resultado = CertificadoManager.marcarComoUsado(boletoActual.codigo);
    } else if (boletoActual.tipo === 'efectivo') {
        resultado = TaquillaManager.marcarComoUsado(boletoActual.codigo);
    }
    
    if (resultado && resultado.exito) {
        alert('Ingreso confirmado exitosamente');
        
        // Ocultar resultado
        document.getElementById('resultado-verificacion').classList.add('hidden');
        boletoActual = null;
        
        // Actualizar datos
        cargarDatosFuncion();
    } else {
        alert('Error al confirmar ingreso: ' + (resultado.error || 'Error desconocido'));
    }
}

// Actualizar datos
function actualizarDatos() {
    cargarDatosFuncion();
    
    // Feedback visual
    const btn = event.target.closest('button');
    if (btn) {
        btn.style.transform = 'rotate(360deg)';
        btn.style.transition = 'transform 0.5s';
        setTimeout(() => {
            btn.style.transform = 'rotate(0deg)';
        }, 500);
    }
}

// Instalar app
function instalarApp() {
    // Para PWA
    if ('serviceWorker' in navigator) {
        // En el futuro, aquí se puede instalar un service worker
        alert('Para instalar la app:\n\nEn iOS: Compartir → Agregar a Pantalla de Inicio\n\nEn Android: Menú → Agregar a Pantalla de Inicio');
    } else {
        alert('Tu navegador no soporta instalación de apps. Puedes agregar esta página a favoritos.');
    }
}

// Cambiar función
function cambiarFuncion() {
    funcionActual = document.getElementById('selector-funcion').value;
    cargarDatosFuncion();
}

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    // Cargar selector de funciones primero
    cargarSelectorFunciones();
    
    // Cargar datos de la función
    cargarDatosFuncion();
    
    // Event listeners
    const selectorFuncion = document.getElementById('selector-funcion');
    if (selectorFuncion) {
        selectorFuncion.addEventListener('change', cambiarFuncion);
    }
    
    const codigoInput = document.getElementById('codigo-verificar');
    if (codigoInput) {
        codigoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                verificarBoleto();
            }
        });
    }
    
    // Actualizar cada 30 segundos
    setInterval(cargarDatosFuncion, 30000);
    
    // Auto-focus en input
    if (codigoInput) {
        codigoInput.focus();
    }
});

// Exportar funciones
window.verificarBoleto = verificarBoleto;
window.verificarCodigo = verificarCodigo;
window.marcarIngreso = marcarIngreso;
window.actualizarDatos = actualizarDatos;
window.instalarApp = instalarApp;
