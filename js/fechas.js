// --- SISTEMA DE GESTIÓN DE FECHAS DINÁMICAS ---
// Maneja fechas de sábados regulares y funciones especiales (viernes)

const FechasManager = {
    // Configuración
    CONFIG: {
        HORA_FUNCION: 19, // 7 PM (19:00)
        MINUTOS_FUNCION: 10, // 10 minutos (7:10 PM)
        MINUTOS_BLOQUEO: 5, // Bloquear 5 minutos antes
        TOTAL_BOLETOS: 200, // Total de boletos por función (200 códigos QR por función)
        CANTIDAD_SABADOS_VISIBLES: 3 // Mostrar 3 sábados
    },

    // Obtener próximo sábado desde una fecha
    obtenerProximoSabado(desdeFecha = null) {
        const fecha = desdeFecha ? new Date(desdeFecha) : new Date();
        
        // Ir al próximo sábado
        const diaSemana = fecha.getDay(); // 0 = domingo, 6 = sábado
        const diasHastaSabado = (6 - diaSemana + 7) % 7 || 7; // Si es sábado, siguiente sábado
        
        fecha.setDate(fecha.getDate() + diasHastaSabado);
        fecha.setHours(this.CONFIG.HORA_FUNCION, this.CONFIG.MINUTOS_FUNCION, 0, 0);
        
        return fecha;
    },

    // Generar 3 sábados consecutivos
    generarSabados() {
        const sabados = [];
        let fechaBase = new Date();
        
        // Si ya pasó la hora de hoy, empezar desde mañana
        const horaActual = fechaBase.getHours();
        const minutosActual = fechaBase.getMinutes();
        if (horaActual > this.CONFIG.HORA_FUNCION || 
            (horaActual === this.CONFIG.HORA_FUNCION && minutosActual >= this.CONFIG.MINUTOS_FUNCION)) {
            fechaBase.setDate(fechaBase.getDate() + 1);
        }
        
        for (let i = 0; i < this.CONFIG.CANTIDAD_SABADOS_VISIBLES; i++) {
            const sabado = this.obtenerProximoSabado(fechaBase);
            sabados.push({
                id: `sabado_${i + 1}`,
                fecha: sabado,
                nombre: this.formatearFecha(sabado),
                clave: `sabado_${sabado.getTime()}`,
                tipo: 'regular',
                activa: true,
                bloqueada: false
            });
            
            // Siguiente semana
            fechaBase = new Date(sabado);
            fechaBase.setDate(fechaBase.getDate() + 7);
        }
        
        return sabados;
    },

    // Formatear fecha para mostrar
    formatearFecha(fecha) {
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        const diaSemana = dias[fecha.getDay()];
        const dia = fecha.getDate();
        const mes = meses[fecha.getMonth()];
        const año = fecha.getFullYear();
        const hora = fecha.getHours().toString().padStart(2, '0');
        const minutos = fecha.getMinutes().toString().padStart(2, '0');
        
        return `${diaSemana} ${dia} ${mes} ${año} - ${hora}:${minutos} hrs`;
    },

    // Verificar si una función está bloqueada (2da llamada)
    estaBloqueada(funcion) {
        const ahora = new Date();
        const fechaFuncion = new Date(funcion.fecha);
        
        // Calcular tiempo hasta la función
        const minutosHastaFuncion = (fechaFuncion - ahora) / (1000 * 60);
        
        // Bloquear si faltan menos de 30 minutos
        return minutosHastaFuncion <= this.CONFIG.MINUTOS_BLOQUEO;
    },

    // Verificar si una función ya pasó
    yaPaso(funcion) {
        const ahora = new Date();
        const fechaFuncion = new Date(funcion.fecha);
        
        // Considerar pasada si ya pasó la hora de la función
        return ahora > fechaFuncion;
    },

    // Obtener todas las funciones (sábados + especiales)
    obtenerFunciones() {
        const funciones = {
            regulares: [],
            especiales: []
        };
        
        // Obtener sábados regulares
        funciones.regulares = this.generarSabados();
        
        // Obtener funciones especiales (viernes) desde configuración
        const especiales = this.obtenerFuncionesEspeciales();
        funciones.especiales = especiales.filter(f => f.activa);
        
        // Filtrar funciones que ya pasaron
        funciones.regulares = funciones.regulares.filter(f => !this.yaPaso(f));
        funciones.especiales = funciones.especiales.filter(f => !this.yaPaso(f));
        
        // Marcar funciones bloqueadas
        funciones.regulares.forEach(f => {
            f.bloqueada = this.estaBloqueada(f);
        });
        funciones.especiales.forEach(f => {
            f.bloqueada = this.estaBloqueada(f);
        });
        
        return funciones;
    },

    // Obtener funciones especiales desde localStorage
    obtenerFuncionesEspeciales() {
        try {
            const especiales = localStorage.getItem('funciones_especiales');
            return especiales ? JSON.parse(especiales) : [];
        } catch (error) {
            console.error('Error al obtener funciones especiales:', error);
            return [];
        }
    },

    // Guardar funciones especiales
    guardarFuncionesEspeciales(especiales) {
        try {
            localStorage.setItem('funciones_especiales', JSON.stringify(especiales));
            return true;
        } catch (error) {
            console.error('Error al guardar funciones especiales:', error);
            return false;
        }
    },

    // Crear función especial (viernes)
    crearFuncionEspecial(fecha, nombre = null, hora = 20, minutos = 10) {
        const fechaObj = new Date(fecha);
        fechaObj.setHours(hora, minutos, 0, 0);
        
        const funcion = {
            id: `especial_${Date.now()}`,
            fecha: fechaObj.toISOString(),
            nombre: nombre || this.formatearFecha(fechaObj),
            clave: `especial_${fechaObj.getTime()}`,
            tipo: 'especial',
            activa: true,
            bloqueada: false,
            hora: hora,
            minutos: minutos
        };
        
        const especiales = this.obtenerFuncionesEspeciales();
        especiales.push(funcion);
        this.guardarFuncionesEspeciales(especiales);
        
        // Inicializar inventario para esta función
        this.inicializarInventarioFuncion(funcion.clave);
        
        return funcion;
    },

    // Actualizar función especial
    actualizarFuncionEspecial(id, cambios) {
        const especiales = this.obtenerFuncionesEspeciales();
        const index = especiales.findIndex(f => f.id === id);
        
        if (index === -1) return { exito: false, error: 'Función no encontrada' };
        
        Object.assign(especiales[index], cambios);
        
        // Si cambió la fecha, actualizar clave
        if (cambios.fecha) {
            const fechaObj = new Date(cambios.fecha);
            especiales[index].clave = `especial_${fechaObj.getTime()}`;
            especiales[index].nombre = cambios.nombre || this.formatearFecha(fechaObj);
        }
        
        this.guardarFuncionesEspeciales(especiales);
        
        return { exito: true, funcion: especiales[index] };
    },

    // Eliminar función especial
    eliminarFuncionEspecial(id) {
        const especiales = this.obtenerFuncionesEspeciales();
        const filtradas = especiales.filter(f => f.id !== id);
        this.guardarFuncionesEspeciales(filtradas);
        
        return { exito: true };
    },

    // Activar/desactivar función especial
    toggleFuncionEspecial(id) {
        const especiales = this.obtenerFuncionesEspeciales();
        const funcion = especiales.find(f => f.id === id);
        
        if (!funcion) return { exito: false, error: 'Función no encontrada' };
        
        funcion.activa = !funcion.activa;
        this.guardarFuncionesEspeciales(especiales);
        
        return { exito: true, funcion: funcion };
    },

    // Inicializar inventario para una función
    inicializarInventarioFuncion(clave) {
        const inventario = JSON.parse(localStorage.getItem('inventario_boletos') || '{}');
        
        if (!inventario[clave]) {
            inventario[clave] = {
                total: this.CONFIG.TOTAL_BOLETOS,
                vendidos: 0,
                reservados: 0
            };
            localStorage.setItem('inventario_boletos', JSON.stringify(inventario));
        }
    },

    // Limpiar funciones pasadas (se ejecuta a las 12am)
    limpiarFuncionesPasadas() {
        const ahora = new Date();
        const especiales = this.obtenerFuncionesEspeciales();
        
        // Eliminar funciones especiales que ya pasaron
        const activas = especiales.filter(f => {
            const fechaFuncion = new Date(f.fecha);
            return fechaFuncion > ahora;
        });
        
        this.guardarFuncionesEspeciales(activas);
        
        // Limpiar inventario de funciones pasadas
        const inventario = JSON.parse(localStorage.getItem('inventario_boletos') || '{}');
        const inventarioLimpio = {};
        
        // Mantener solo funciones activas
        const funciones = this.obtenerFunciones();
        const todasLasClaves = [
            ...funciones.regulares.map(f => f.clave),
            ...funciones.especiales.map(f => f.clave)
        ];
        
        todasLasClaves.forEach(clave => {
            if (inventario[clave]) {
                inventarioLimpio[clave] = inventario[clave];
            }
        });
        
        localStorage.setItem('inventario_boletos', JSON.stringify(inventarioLimpio));
        
        return { eliminadas: especiales.length - activas.length };
    },

    // Verificar y limpiar automáticamente (se debe llamar periódicamente)
    verificarYLimpiar() {
        const ahora = new Date();
        const hora = ahora.getHours();
        
        // Si es medianoche (0:00 - 0:59), limpiar funciones pasadas
        if (hora === 0) {
            const ultimaLimpieza = localStorage.getItem('ultima_limpieza_fechas');
            const hoy = ahora.toDateString();
            
            if (ultimaLimpieza !== hoy) {
                this.limpiarFuncionesPasadas();
                localStorage.setItem('ultima_limpieza_fechas', hoy);
            }
        }
    }
};

// Inicializar limpieza automática
if (typeof window !== 'undefined') {
    window.FechasManager = FechasManager;
    
    // Verificar y limpiar al cargar
    document.addEventListener('DOMContentLoaded', function() {
        FechasManager.verificarYLimpiar();
        
        // Verificar cada hora
        setInterval(() => {
            FechasManager.verificarYLimpiar();
        }, 60 * 60 * 1000); // Cada hora
    });
}
