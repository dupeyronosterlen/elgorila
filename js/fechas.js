// Últimas dos funciones de la temporada — domingos 17:30 hrs
const FUNCIONES_TEMPORADA = [
  {
    id: 'domingo_20260524',
    fecha: new Date('2026-05-24T17:30:00'),
    nombre: 'Domingo 24 May 2026 - 17:30 hrs',
    clave: 'domingo_20260524',
    tipo: 'regular',
    activa: true,
    bloqueada: false
  },
  {
    id: 'domingo_20260531',
    fecha: new Date('2026-05-31T17:30:00'),
    nombre: 'Domingo 31 May 2026 - 17:30 hrs',
    clave: 'domingo_20260531',
    tipo: 'regular',
    activa: true,
    bloqueada: false
  }
];

const FechasManager = {
  CONFIG: {
    HORA_FUNCION: 17,
    MINUTOS_FUNCION: 30,
    MINUTOS_BLOQUEO: 30,
    TOTAL_BOLETOS: 200,
    CANTIDAD_SABADOS_VISIBLES: 2
  },

  formatearFecha(fecha) {
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const d = dias[fecha.getDay()];
    const dia = fecha.getDate();
    const mes = meses[fecha.getMonth()];
    const año = fecha.getFullYear();
    const h = fecha.getHours().toString().padStart(2,'0');
    const m = fecha.getMinutes().toString().padStart(2,'0');
    return `${d} ${dia} ${mes} ${año} - ${h}:${m} hrs`;
  },

  estaBloqueada(funcion) {
    const ahora = new Date();
    const diff = (new Date(funcion.fecha) - ahora) / (1000 * 60);
    return diff <= this.CONFIG.MINUTOS_BLOQUEO;
  },

  yaPaso(funcion) {
    return new Date() > new Date(funcion.fecha);
  },

  obtenerFunciones() {
    const activas = FUNCIONES_TEMPORADA
      .filter(f => !this.yaPaso(f))
      .map(f => ({ ...f, bloqueada: this.estaBloqueada(f) }));

    return { regulares: activas, especiales: [] };
  },

  // Compatibilidad con código existente que llama estos métodos
  obtenerFuncionesEspeciales() { return []; },
  guardarFuncionesEspeciales() {},
  crearFuncionEspecial() { return null; },
  actualizarFuncionEspecial() { return { exito: false }; },
  eliminarFuncionEspecial() { return { exito: false }; },
  toggleFuncionEspecial() { return { exito: false }; },
  limpiarFuncionesPasadas() { return { eliminadas: 0 }; },
  verificarYLimpiar() {},

  inicializarInventarioFuncion(clave) {
    const inv = JSON.parse(localStorage.getItem('inventario_boletos') || '{}');
    if (!inv[clave]) {
      inv[clave] = { total: this.CONFIG.TOTAL_BOLETOS, vendidos: 0, reservados: 0 };
      localStorage.setItem('inventario_boletos', JSON.stringify(inv));
    }
  }
};

if (typeof window !== 'undefined') {
  window.FechasManager = FechasManager;
}
