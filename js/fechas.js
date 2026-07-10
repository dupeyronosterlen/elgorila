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

/** Temporada 2026 — sábados 18:00 en venta (18 jul función de prensa, atenuada); miércoles 20:30 reservados (ocultos) */
const FUNCIONES_TEMPORADA = [
  { fecha_iso: '2026-07-04', nombre: 'Sábado 4 Jul — 18:00 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-08', nombre: 'Miércoles 8 Jul — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-11', nombre: 'Sábado 11 Jul — 18:00 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-15', nombre: 'Miércoles 15 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-18', nombre: 'Sábado 18 Jul — 18:00 hrs', sede: SEDE_TEMPORADA, atenuada: true, etiqueta: 'Prensa', activa: true },
  { fecha_iso: '2026-07-22', nombre: 'Miércoles 22 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-25', nombre: 'Sábado 25 Jul — 18:00 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-07-29', nombre: 'Miércoles 29 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-08-01', nombre: 'Sábado 1 Ago — 18:00 hrs',  sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-08-05', nombre: 'Miércoles 5 Ago — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-08-08', nombre: 'Sábado 8 Ago — 18:00 hrs',  sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-08-12', nombre: 'Miércoles 12 Ago — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-08-15', nombre: 'Sábado 15 Ago — 18:00 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-08-19', nombre: 'Miércoles 19 Ago — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-08-22', nombre: 'Sábado 22 Ago — 18:00 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-08-26', nombre: 'Miércoles 26 Ago — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-08-29', nombre: 'Sábado 29 Ago — 18:00 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-02', nombre: 'Miércoles 2 Sep — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-09-05', nombre: 'Sábado 5 Sep — 18:00 hrs',  sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-09', nombre: 'Miércoles 9 Sep — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-09-12', nombre: 'Sábado 12 Sep — 18:00 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-16', nombre: 'Miércoles 16 Sep — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-09-19', nombre: 'Sábado 19 Sep — 18:00 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-23', nombre: 'Miércoles 23 Sep — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-09-26', nombre: 'Sábado 26 Sep — 18:00 hrs', sede: SEDE_TEMPORADA, activa: true },
  { fecha_iso: '2026-09-30', nombre: 'Miércoles 30 Sep — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
];

const FechasManager = {
  CONFIG: {
    HORA_FUNCION:              18,
    MINUTOS_FUNCION:           0,
    MINUTOS_BLOQUEO:           30,
    TOTAL_BOLETOS:            325,
  },

  horaDeFuncion(f) {
    const m = (f?.nombre || '').match(/(\d{1,2}):(\d{2})/);
    if (m) return { h: +m[1], min: +m[2] };
    return { h: this.CONFIG.HORA_FUNCION, min: this.CONFIG.MINUTOS_FUNCION };
  },

  formatearFecha(fechaIso, f) {
    const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const [y, m, d] = fechaIso.split('-').map(Number);
    const { h: hh, min: mm } = this.horaDeFuncion(f);
    const fecha = new Date(y, m - 1, d, hh, mm);
    const h = String(fecha.getHours()).padStart(2, '0');
    const min = String(fecha.getMinutes()).padStart(2, '0');
    return `${dias[fecha.getDay()]} ${fecha.getDate()} ${meses[fecha.getMonth()]} ${fecha.getFullYear()} - ${h}:${min} hrs`;
  },

  estaBloqueada(fecha_iso, f) {
    const [y, m, d] = fecha_iso.split('-').map(Number);
    const fn = f || FUNCIONES_TEMPORADA.find(x => x.fecha_iso === fecha_iso);
    const { h: hh, min: mm } = this.horaDeFuncion(fn);
    const fechaFuncion = new Date(y, m - 1, d, hh, mm);
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
        bloqueada: this.estaBloqueada(f.fecha_iso, f),
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
