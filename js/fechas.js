/** Sedes — cada una con paleta propia para futuros teatros simultáneos */
const SEDES = {
  'teatro-wilberto-canton': {
    id:        'teatro-wilberto-canton',
    nombre:    'Teatro Wilberto Cantón',
    direccion: 'José María Velasco 59, San José Insurgentes, CDMX',
    zona:      'Ciudad de México',
    palette:   'cafe',
    teatroId:  'wilberto',
  },
  'ccc': {
    id:        'ccc',
    nombre:    'Centro Cultural Coyoacanense',
    direccion: 'Felipe Carrillo Puerto 54, Coyoacán, CDMX',
    zona:      'Ciudad de México',
    palette:   'ccc',
    teatroId:  'ccc',
    activo:    false,
  },
};

const SEDE_TEMPORADA = 'teatro-wilberto-canton';

/** Temporada 2026 — 13 funciones, jul–sep (miércoles 20:30) */
const FUNCIONES_TEMPORADA = [
  { fecha_iso: '2026-07-08', nombre: 'Miércoles 8 Jul — 20:30 hrs',  sede: SEDE_TEMPORADA, estreno: true,  activa: true },
  { fecha_iso: '2026-07-15', nombre: 'Miércoles 15 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-07-22', nombre: 'Miércoles 22 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-07-29', nombre: 'Miércoles 29 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-08-05', nombre: 'Miércoles 5 Ago — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-08-12', nombre: 'Miércoles 12 Ago — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-08-19', nombre: 'Miércoles 19 Ago — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-08-26', nombre: 'Miércoles 26 Ago — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-02', nombre: 'Miércoles 2 Sep — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-09', nombre: 'Miércoles 9 Sep — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-16', nombre: 'Miércoles 16 Sep — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-23', nombre: 'Miércoles 23 Sep — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-30', nombre: 'Miércoles 30 Sep — 20:30 hrs', sede: SEDE_TEMPORADA, activa: true },
];

const FechasManager = {
  CONFIG: {
    HORA_FUNCION:              20,
    MINUTOS_FUNCION:           30,
    MINUTOS_BLOQUEO:           30,
    TOTAL_BOLETOS:            325,
  },

  formatearFecha(fechaIso) {
    const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
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

  obtenerSede(sedeId) {
    return SEDES[sedeId] || null;
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
  window.SEDES = SEDES;
  window.FUNCIONES_TEMPORADA = FUNCIONES_TEMPORADA;
}
