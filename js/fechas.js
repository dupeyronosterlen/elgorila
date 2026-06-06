const FUNCIONES_TEMPORADA = [
  { fecha_iso: '2026-06-10', nombre: 'Miércoles 10 Jun — 20:30 hrs', activa: true },
  { fecha_iso: '2026-06-17', nombre: 'Miércoles 17 Jun — 20:30 hrs', activa: true },
  { fecha_iso: '2026-06-24', nombre: 'Miércoles 24 Jun — 20:30 hrs', activa: true },
  { fecha_iso: '2026-07-01', nombre: 'Miércoles 1 Jul — 20:30 hrs',  activa: true },
  { fecha_iso: '2026-07-08', nombre: 'Miércoles 8 Jul — 20:30 hrs',  activa: true },
  { fecha_iso: '2026-07-15', nombre: 'Miércoles 15 Jul — 20:30 hrs', activa: true },
  { fecha_iso: '2026-07-22', nombre: 'Miércoles 22 Jul — 20:30 hrs', activa: true },
  { fecha_iso: '2026-07-29', nombre: 'Miércoles 29 Jul — 20:30 hrs', activa: true },
];

const FechasManager = {
  CONFIG: {
    HORA_FUNCION:              20,
    MINUTOS_FUNCION:           30,
    MINUTOS_BLOQUEO:           30,
    TOTAL_BOLETOS:            200,
  },

  formatearFecha(fechaIso) {
    const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    // Parsear como fecha local (sin conversión UTC)
    const [y, m, d] = fechaIso.split('-').map(Number);
    const fecha = new Date(y, m - 1, d, this.CONFIG.HORA_FUNCION, this.CONFIG.MINUTOS_FUNCION);
    const h = String(fecha.getHours()).padStart(2, '0');
    const min = String(fecha.getMinutes()).padStart(2, '0');
    return `${dias[fecha.getDay()]} ${fecha.getDate()} ${meses[fecha.getMonth()]} ${fecha.getFullYear()} - ${h}:${min} hrs`;
  },

  estaBloqueada(fecha_iso) {
    const [y, m, d] = fecha_iso.split('-').map(Number);
    const fechaFuncion = new Date(y, m - 1, d, this.CONFIG.HORA_FUNCION, this.CONFIG.MINUTOS_FUNCION);
    const diff = (fechaFuncion - new Date()) / (1000 * 60);
    return diff <= this.CONFIG.MINUTOS_BLOQUEO;
  },

  yaPaso(fecha_iso) {
    const [y, m, d] = fecha_iso.split('-').map(Number);
    return new Date() > new Date(y, m - 1, d, 23, 59, 59);
  },

  obtenerFunciones() {
    const activas = FUNCIONES_TEMPORADA
      .filter(f => f.activa !== false && !this.yaPaso(f.fecha_iso))
      .map(f => ({
        ...f,
        clave:     f.fecha_iso,
        id:        f.fecha_iso,
        tipo:      'regular',
        bloqueada: this.estaBloqueada(f.fecha_iso),
        agotada:   false,
      }));
    return { regulares: activas, especiales: [] };
  },

  // Compatibilidad con código existente
  obtenerFuncionesEspeciales() { return []; },
  guardarFuncionesEspeciales() {},
  crearFuncionEspecial()       { return null; },
  actualizarFuncionEspecial()  { return { exito: false }; },
  eliminarFuncionEspecial()    { return { exito: false }; },
  toggleFuncionEspecial()      { return { exito: false }; },
  limpiarFuncionesPasadas()    { return { eliminadas: 0 }; },
  verificarYLimpiar()          {},

  inicializarInventarioFuncion(clave) {
    const inv = JSON.parse(localStorage.getItem('inventario_boletos') || '{}');
    if (!inv[clave]) {
      inv[clave] = { total: this.CONFIG.TOTAL_BOLETOS, vendidos: 0, reservados: 0 };
      localStorage.setItem('inventario_boletos', JSON.stringify(inv));
    }
  },
};

if (typeof window !== 'undefined') {
  window.FechasManager = FechasManager;
}
