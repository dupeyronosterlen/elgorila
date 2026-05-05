// --- CONFIGURACIÓN ---
let precioUnitario = 299; // Precio de un boleto
let cantidadActual = 0;   // Empezamos con 0 boletos
let fechaSeleccionada = null; // Aquí guardaremos "viernes" o "sabado"
let nombreFecha = "";     // Aquí guardaremos el texto bonito "Viernes 20..."
let codigoDescuento = ""; // Código de descuento aplicado
let reservaId = null;     // ID de la reserva temporal
let disponibilidadInfo = null; // Información de disponibilidad

// --- FUNCIÓN 1: SUMAR Y RESTAR BOLETOS ---
function cambiarCantidad(numero) {
    // Sumamos lo que llegue (1 o -1) a la cantidad actual
    const nuevaCantidad = cantidadActual + numero;

    // Regla 1: No pueden bajar de 0 boletos
    if (nuevaCantidad < 0) {
        return; // No hacer nada si intenta bajar de 0
    }

    // Regla 2: Máximo 10 boletos por persona
    if (nuevaCantidad > 10) {
        alert("El máximo es 10 boletos por compra");
        return;
    }

    // Actualizar cantidad
    cantidadActual = nuevaCantidad;

    // Si la cantidad es 0, liberar reserva si existe
    if (cantidadActual === 0 && reservaId) {
        InventarioManager.liberarReserva(reservaId);
        reservaId = null;
    }

    // Actualizamos los números en la pantalla inmediatamente (sin esperar)
    actualizarPantalla();

    // Verificar disponibilidad después de actualizar (solo si hay fecha y cantidad > 0)
    if (fechaSeleccionada && cantidadActual > 0) {
        verificarDisponibilidad();
    }
}

// --- FUNCIÓN 2: CUANDO ELIGEN UNA FECHA ---
function seleccionarFecha(clave, texto, funcion = null) {
    // Verificar si la función está bloqueada
    if (funcion && funcion.bloqueada) {
        alert('Las ventas para esta función están bloqueadas. La función comenzará pronto.');
        return;
    }
    
    // Liberar reserva anterior si existe
    if (reservaId) {
        InventarioManager.liberarReserva(reservaId);
        reservaId = null;
    }

    fechaSeleccionada = clave; // Guardamos la clave dinámica
    nombreFecha = texto;       // Guardamos el texto largo

    // Actualizar la pantalla (muestra la fecha en el resumen)
    actualizarPantalla();
    
    // Resaltar el botón seleccionado
    resaltarBotonFecha(clave);

    // Solo verificar disponibilidad y crear reserva si hay boletos seleccionados
    if (cantidadActual > 0) {
        verificarDisponibilidad();
    }
}

// --- FUNCIÓN: RESALTAR BOTÓN DE FECHA SELECCIONADO ---
function resaltarBotonFecha(clave) {
    // Remover resaltado de todos los botones
    const botones = document.querySelectorAll('#botones-fecha button');
    botones.forEach(btn => {
        btn.style.border = '';
        btn.style.boxShadow = '';
    });
    
    // Agregar resaltado al botón seleccionado
    const botonSeleccionado = document.querySelector(`#botones-fecha button[data-fecha-clave="${clave}"]`);
    if (botonSeleccionado && !botonSeleccionado.disabled) {
        botonSeleccionado.style.border = '3px solid white';
        botonSeleccionado.style.boxShadow = '0 0 0 3px rgba(255, 255, 255, 0.5)';
    }
}

// --- FUNCIÓN: VERIFICAR DISPONIBILIDAD Y CREAR RESERVA ---
function verificarDisponibilidad() {
    if (!fechaSeleccionada) return;

    // Obtener disponibilidad actual
    disponibilidadInfo = InventarioManager.obtenerDisponibilidad(fechaSeleccionada);

    // Verificar si hay suficientes boletos (solo si cantidad > 0)
    if (cantidadActual > 0 && cantidadActual > disponibilidadInfo.disponible) {
        const cantidadAnterior = cantidadActual;
        cantidadActual = Math.max(0, disponibilidadInfo.disponible);
        if (disponibilidadInfo.disponible === 0) {
            alert("Lo sentimos, esta función está agotada");
            cantidadActual = 0;
        } else if (cantidadAnterior !== cantidadActual) {
            alert(`Solo hay ${disponibilidadInfo.disponible} boletos disponibles. Se ajustó la cantidad.`);
        }
    }

    // Crear o actualizar reserva temporal
    if (cantidadActual > 0 && disponibilidadInfo.disponible >= cantidadActual) {
        // Liberar reserva anterior si existe
        if (reservaId) {
            InventarioManager.liberarReserva(reservaId);
        }

        // Crear nueva reserva
        const resultado = InventarioManager.crearReserva(fechaSeleccionada, cantidadActual);
        if (resultado.exito) {
            reservaId = resultado.reservaId;
            // Actualizar disponibilidad después de reservar
            disponibilidadInfo = InventarioManager.obtenerDisponibilidad(fechaSeleccionada);
        } else {
            alert(resultado.mensaje);
            reservaId = null;
        }
    }

    // Actualizar indicador de disponibilidad en la UI
    actualizarIndicadorDisponibilidad();
}

// --- FUNCIÓN: ACTUALIZAR INDICADOR DE DISPONIBILIDAD ---
function actualizarIndicadorDisponibilidad() {
    const indicador = document.getElementById('disponibilidad-info');
    const mensajeAgotado = document.getElementById('mensaje-agotado');
    
    if (disponibilidadInfo) {
        if (disponibilidadInfo.disponible > 0) {
            if (indicador) {
                indicador.innerHTML = `<p class="text-xs text-green-400">✓ ${disponibilidadInfo.disponible} boletos disponibles</p>`;
            }
            if (mensajeAgotado) {
                mensajeAgotado.classList.add('hidden');
            }
        } else {
            if (indicador) {
                indicador.innerHTML = `<p class="text-xs text-red-400">✗ Agotado</p>`;
            }
            if (mensajeAgotado) {
                mensajeAgotado.classList.remove('hidden');
            }
        }
    } else {
        if (indicador) {
            indicador.innerHTML = `<p class="text-xs text-text-muted-dark">Selecciona una fecha para ver disponibilidad</p>`;
        }
        if (mensajeAgotado) {
            mensajeAgotado.classList.add('hidden');
        }
    }
}

// --- FUNCIÓN: APLICAR CÓDIGO DE DESCUENTO ---
function aplicarCodigoDescuento() {
    const inputCodigo = document.getElementById('codigo-descuento-input');
    const mensajeCodigo = document.getElementById('mensaje-codigo');
    
    if (!inputCodigo) return;

    const codigo = inputCodigo.value.trim();
    
    if (!codigo) {
        codigoDescuento = "";
        actualizarPantalla();
        if (mensajeCodigo) {
            mensajeCodigo.innerHTML = "";
            mensajeCodigo.className = "hidden";
        }
        return;
    }

    const validacion = InventarioManager.validarCodigoDescuento(codigo);
    
    if (validacion.valido) {
        codigoDescuento = codigo.toUpperCase();
        if (mensajeCodigo) {
            mensajeCodigo.innerHTML = `<span class="text-green-400">✓ ${validacion.datos.nombre} aplicado</span>`;
            mensajeCodigo.className = "text-sm mt-1";
        }
        actualizarPantalla();
    } else {
        codigoDescuento = "";
        if (mensajeCodigo) {
            mensajeCodigo.innerHTML = `<span class="text-red-400">✗ ${validacion.mensaje || 'Código no válido'}</span>`;
            mensajeCodigo.className = "text-sm mt-1";
        }
        actualizarPantalla();
    }
}

// --- FUNCIÓN 3: ACTUALIZAR TEXTOS Y PRECIOS ---
function actualizarPantalla() {
    // 1. Buscar la cajita del número y poner la cantidad actual (puede ser 0)
    let cajitaNumero = document.getElementById('cantidad-boletos');
    if (cajitaNumero) {
        cajitaNumero.textContent = cantidadActual.toString();
    } else {
        console.warn('No se encontró el elemento cantidad-boletos');
    }

    // 2. Actualizar la fecha seleccionada si hay una
    let cajitaFecha = document.getElementById('fecha-seleccionada-texto');
    if (cajitaFecha) {
        if (nombreFecha) {
            cajitaFecha.innerText = nombreFecha;
        } else {
            cajitaFecha.innerText = "Selecciona una fecha";
        }
    }

    // 2b. Actualizar cantidad de boletos en el resumen (solo si hay boletos)
    let cajitaCantidadResumen = document.getElementById('cantidad-boletos-resumen');
    let contenedorCantidad = document.getElementById('cantidad-boletos-container');
    if (cajitaCantidadResumen && contenedorCantidad) {
        if (cantidadActual > 0) {
            cajitaCantidadResumen.textContent = cantidadActual + "x boleto" + (cantidadActual > 1 ? "s" : "");
            contenedorCantidad.style.display = "block";
        } else {
            contenedorCantidad.style.display = "none";
        }
    }

    // 3. Calcular precios con descuento (solo si hay boletos)
    let calculoPrecio;
    if (cantidadActual > 0) {
        if (typeof InventarioManager !== 'undefined' && InventarioManager.calcularPrecioConDescuento) {
            calculoPrecio = InventarioManager.calcularPrecioConDescuento(
                precioUnitario, 
                cantidadActual, 
                codigoDescuento
            );
        } else {
            // Fallback si InventarioManager no está disponible
            const subtotal = precioUnitario * cantidadActual;
            const descuento = 0;
            calculoPrecio = {
                subtotal: subtotal,
                descuento: descuento,
                total: subtotal - descuento,
                descuentoAplicado: null
            };
        }
    } else {
        // Si no hay boletos, precios en 0
        calculoPrecio = {
            subtotal: 0,
            descuento: 0,
            total: 0,
            descuentoAplicado: null
        };
    }
    
    // 4. Actualizar el subtotal
    let cajitaSubtotal = document.getElementById('subtotal-precio');
    if (cajitaSubtotal) {
        cajitaSubtotal.textContent = "$" + calculoPrecio.subtotal.toFixed(2);
    } else {
        console.warn('No se encontró el elemento subtotal-precio');
    }

    // 5. Mostrar descuento si hay uno aplicado
    let cajitaDescuento = document.getElementById('descuento-precio');
    let contenedorDescuento = document.getElementById('contenedor-descuento');
    if (calculoPrecio.descuentoAplicado && calculoPrecio.descuento > 0) {
        if (cajitaDescuento) {
            cajitaDescuento.textContent = "-$" + calculoPrecio.descuento.toFixed(2);
        }
        if (contenedorDescuento) {
            contenedorDescuento.classList.remove('hidden');
        }
    } else {
        if (contenedorDescuento) {
            contenedorDescuento.classList.add('hidden');
        }
    }
    
    // 6. Poner el total donde va el precio
    let cajitaPrecio = document.getElementById('total-precio');
    if (cajitaPrecio) {
        cajitaPrecio.textContent = "$" + calculoPrecio.total.toFixed(2) + " MXN";
    } else {
        console.warn('No se encontró el elemento total-precio');
    }

    // 7. Controlar el botón de "Continuar"
    let boton = document.getElementById('btn-continuar');
    if (boton) {
        if (fechaSeleccionada === null) {
            // Si NO ha elegido fecha, bloqueamos el botón
            boton.textContent = "Selecciona una fecha";
            boton.disabled = true;
            boton.classList.remove('bg-[#A97C22]', 'hover:bg-[#B88A2F]', 'text-white');
            boton.classList.add('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
            boton.style.backgroundColor = '';
            boton.style.color = '';
        } else if (cantidadActual === 0) {
            // Si NO hay boletos, bloqueamos el botón
            boton.textContent = "Selecciona al menos 1 boleto";
            boton.disabled = true;
            boton.classList.remove('bg-[#A97C22]', 'hover:bg-[#B88A2F]', 'text-white');
            boton.classList.add('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
            boton.style.backgroundColor = '';
            boton.style.color = '';
        } else if (!calculoPrecio || typeof calculoPrecio.total !== 'number') {
            // Si no hay cálculo de precio válido, mantener deshabilitado
            boton.textContent = "Calculando...";
            boton.disabled = true;
            boton.classList.remove('bg-[#A97C22]', 'hover:bg-[#B88A2F]', 'text-white');
            boton.classList.add('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
            boton.style.backgroundColor = '';
            boton.style.color = '';
        } else {
            // Si YA eligió fecha Y hay boletos Y hay precio válido, activamos el botón
            boton.textContent = "Adquiere tus boletos - $" + calculoPrecio.total.toFixed(2);
            boton.disabled = false;
            boton.classList.remove('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
            boton.classList.add('bg-[#A97C22]', 'hover:bg-[#B88A2F]', 'text-white', 'cursor-pointer');
            boton.style.backgroundColor = '#A97C22';
            boton.style.color = '#FFFFFF';
        }
    } else {
        console.warn('No se encontró el botón btn-continuar');
    }
    
}

// --- FUNCIÓN 4: IR A CONFIRMACIÓN (PAGO FINAL) ---
function irAConfirmacion() {
    if (fechaSeleccionada === null) {
        alert("Por favor selecciona una fecha para continuar");
        return false;
    }

    if (cantidadActual < 1) {
        alert("Por favor selecciona al menos un boleto");
        return false;
    }

    verificarDisponibilidad();
    
    if (!reservaId) {
        const resultado = InventarioManager.crearReserva(fechaSeleccionada, cantidadActual);
        if (resultado.exito) {
            reservaId = resultado.reservaId;
        } else {
            alert("No se pudo crear la reserva. Por favor intenta de nuevo.");
            return false;
        }
    }

    const calculoPrecio = InventarioManager.calcularPrecioConDescuento(
        precioUnitario, 
        cantidadActual, 
        codigoDescuento
    );

    let orden = {
        fecha: nombreFecha,
        clave: fechaSeleccionada,
        cantidad: cantidadActual,
        precioUnitario: precioUnitario,
        subtotal: calculoPrecio.subtotal,
        descuento: calculoPrecio.descuento,
        codigoDescuento: codigoDescuento || null,
        descuentoAplicado: calculoPrecio.descuentoAplicado,
        total: calculoPrecio.total,
        reservaId: reservaId,
        timestamp: Date.now()
    };
    
    try {
        localStorage.setItem('orden_compra', JSON.stringify(orden));
        navegandoACheckout = true;
        window.location.href = 'checkout.html';
        return true;
    } catch (error) {
        console.error('Error al guardar la orden:', error);
        alert('Error al guardar la orden. Por favor intenta de nuevo.');
        return false;
    }
}

// --- FUNCIÓN: LIMPIAR RESERVA AL SALIR ---
let navegandoACheckout = false;

function limpiarReserva() {
    if (reservaId && !navegandoACheckout) {
        InventarioManager.liberarReserva(reservaId);
        reservaId = null;
    }
}

window.addEventListener('beforeunload', limpiarReserva);

// --- FUNCIÓN: CARGAR FECHAS DINÁMICAS ---
function cargarFechas() {
    if (typeof FechasManager === 'undefined') {
        console.error('FechasManager no está disponible');
        return;
    }

    const funciones = FechasManager.obtenerFunciones();
    const botonesContainer = document.getElementById('botones-fecha');
    
    if (!botonesContainer) return;

    let html = '';

    funciones.especiales.forEach(funcion => {
        const bloqueada = funcion.bloqueada;
        const esSeleccionada = fechaSeleccionada === funcion.clave;
        const claseBoton = bloqueada 
            ? 'p-4 rounded-lg text-center border border-slate-700/50 bg-slate-800/40 text-slate-400 cursor-not-allowed backdrop-blur-sm'
            : `p-3 sm:p-4 rounded-lg text-center border-2 ${esSeleccionada ? 'border-white border-4' : 'border-[#967d3d]'} bg-[#c69c3a] text-[#3e1116] transition-all duration-200 hover:bg-[#dcb048] hover:text-[#2a080d] active:bg-[#b88a2f] hover:shadow-md hover:border-[#bda056] group focus:ring-2 focus:ring-white touch-manipulation`;
        
        const fechaCorta = funcion.nombre.split(' - ')[0];
        const hora = funcion.nombre.split(' - ')[1] || '';
        const estiloBoton = bloqueada ? '' : (esSeleccionada ? 'border: 3px solid white; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5); -webkit-tap-highlight-color: transparent;' : '-webkit-tap-highlight-color: transparent;');
        
        html += `
            <button 
                type="button" 
                data-fecha-clave="${funcion.clave}"
                onclick="${bloqueada ? '' : `seleccionarFecha('${funcion.clave}', '${funcion.nombre}', ${JSON.stringify(funcion).replace(/"/g, '&quot;')})`}"
                class="${claseBoton}"
                ${bloqueada ? 'disabled' : ''}
                style="${estiloBoton}"
            >
                <span class="block font-bold ${bloqueada ? 'opacity-60' : ''}">${fechaCorta}</span>
                <span class="text-sm ${bloqueada ? 'opacity-60' : 'font-medium opacity-90'}">
                    ${bloqueada ? 'Ventas bloqueadas' : hora}
                </span>
            </button>
        `;
    });

    funciones.regulares.forEach(funcion => {
        const bloqueada = funcion.bloqueada;
        const esSeleccionada = fechaSeleccionada === funcion.clave;
        const claseBoton = bloqueada 
            ? 'p-4 rounded-lg text-center border border-slate-700/50 bg-slate-800/40 text-slate-400 cursor-not-allowed backdrop-blur-sm'
            : `p-3 sm:p-4 rounded-lg text-center border-2 ${esSeleccionada ? 'border-white border-4' : 'border-[#967d3d]'} bg-[#c69c3a] text-[#3e1116] transition-all duration-200 hover:bg-[#dcb048] hover:text-[#2a080d] active:bg-[#b88a2f] hover:shadow-md hover:border-[#bda056] group focus:ring-2 focus:ring-white touch-manipulation`;
        
        const fechaCorta = funcion.nombre.split(' - ')[0];
        const hora = funcion.nombre.split(' - ')[1] || '';
        const estiloBoton = bloqueada ? '' : (esSeleccionada ? 'border: 3px solid white; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5); -webkit-tap-highlight-color: transparent;' : '-webkit-tap-highlight-color: transparent;');
        
        html += `
            <button 
                type="button" 
                data-fecha-clave="${funcion.clave}"
                onclick="${bloqueada ? '' : `seleccionarFecha('${funcion.clave}', '${funcion.nombre}', ${JSON.stringify(funcion).replace(/"/g, '&quot;')})`}"
                class="${claseBoton}"
                ${bloqueada ? 'disabled' : ''}
                style="${estiloBoton}"
            >
                <span class="block font-bold ${bloqueada ? 'opacity-60' : ''}">${fechaCorta}</span>
                <span class="text-sm ${bloqueada ? 'opacity-60' : ''}">
                    ${bloqueada ? 'Ventas bloqueadas' : hora}
                </span>
            </button>
        `;
    });

    botonesContainer.innerHTML = html;
    
    if (fechaSeleccionada) {
        resaltarBotonFecha(fechaSeleccionada);
    }
}

// --- INICIALIZACIÓN AL CARGAR LA PÁGINA ---
function inicializar() {
    if (typeof InventarioManager !== 'undefined') {
        InventarioManager.inicializar();
    }
    
    cargarFechas();
    
    if (typeof FechasManager !== 'undefined') {
        const funciones = FechasManager.obtenerFunciones();
        [...funciones.regulares, ...funciones.especiales].forEach(funcion => {
            FechasManager.inicializarInventarioFuncion(funcion.clave);
        });
    }
    
    actualizarPantalla();
    
    setInterval(() => {
        if (fechaSeleccionada) {
            verificarDisponibilidad();
            actualizarPantalla();
        }
    }, 30000);
    
    setInterval(() => {
        cargarFechas();
    }, 60000);
    
    const inputCodigo = document.getElementById('codigo-descuento-input');
    if (inputCodigo) {
        inputCodigo.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                aplicarCodigoDescuento();
            }
        });
    }
}

window.irAConfirmacion = irAConfirmacion;
window.cambiarCantidad = cambiarCantidad;
window.seleccionarFecha = seleccionarFecha;
window.aplicarCodigoDescuento = aplicarCodigoDescuento;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
