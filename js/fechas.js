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

/** Temporada 2026 — quedan 6 sábados públicos (15 ago – 19 sep); miércoles ocultos */
const FUNCIONES_TEMPORADA = [
  { fecha_iso: '2026-07-04', nombre: 'Sábado 4 Jul — 18:00 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-08', nombre: 'Miércoles 8 Jul — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-11', nombre: 'Sábado 11 Jul — 18:00 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-15', nombre: 'Miércoles 15 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-18', nombre: 'Sábado 18 Jul — 18:00 hrs', sede: SEDE_TEMPORADA, atenuada: true, etiqueta: 'Prensa', activa: false, precio_especial: 10 },
  { fecha_iso: '2026-07-22', nombre: 'Miércoles 22 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-07-25', nombre: 'Sábado 25 Jul — 18:00 hrs', sede: SEDE_TEMPORADA, etiqueta: 'Estreno', activa: false },
  { fecha_iso: '2026-07-29', nombre: 'Miércoles 29 Jul — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-08-01', nombre: 'Sábado 1 Ago — 18:00 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-08-05', nombre: 'Miércoles 5 Ago — 20:30 hrs',  sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-08-08', nombre: 'Sábado 8 Ago — 18:00 hrs',  sede: SEDE_TEMPORADA, activa: false },
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
  { fecha_iso: '2026-09-26', nombre: 'Sábado 26 Sep — 18:00 hrs', sede: SEDE_TEMPORADA, activa: false },
  { fecha_iso: '2026-09-30', nombre: 'Miércoles 30 Sep — 20:30 hrs', sede: SEDE_TEMPORADA, activa: false },
];

const FechasManager = {
  CONFIG: {
    HORA_FUNCION:              18,
    MINUTOS_FUNCION:           0,
    MINUTOS_BLOQUEO:           30,
    TOTAL_BOLETOS:            325,
    /** Respaldo si la API no trae numero_obra (siguiente función pública). */
    NUMERO_OBRA_FALLBACK:     1048,
    /** Número de función global del monólogo por fecha (KV lo sobreescribe al sincronizar). */
    NUMEROS_OBRA: {
      '2026-07-18': 1044,
      '2026-07-25': 1045,
      '2026-08-01': 1046,
      '2026-08-08': 1047,
      '2026-08-15': 1048,
      '2026-08-22': 1049,
      '2026-08-29': 1050,
      '2026-09-05': 1051,
      '2026-09-12': 1052,
      '2026-09-19': 1053,
    },
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

  /**
   * Resumen de lo que QUEDA de temporada, para el copy de oferta del sitio
   * (barra de compra, FAQ, banners CTA). Se deriva de FUNCIONES_TEMPORADA, así
   * que alargar la temporada = agregar fechas ahí y todo el copy se actualiza
   * solo; al pasar cada función el conteo baja sin tocar nada.
   *
   * - Excluye funciones atenuadas (prensa/invitación): no son oferta al público.
   * - Dice "sábados" solo si TODO lo que queda cae en sábado; si se agregan
   *   miércoles u otros días, cambia a "funciones" en vez de mentir.
   */
  resumenTemporada() {
    const MESES = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const parse = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
    const largo = iso => { const f = parse(iso); return `${f.getDate()} de ${MESES[f.getMonth()]}`; };

    const fns = this.obtenerFunciones().regulares.filter(f => !f.atenuada);
    const n   = fns.length;
    const soloSabados = n > 0 && fns.every(f => parse(f.fecha_iso).getDay() === 6);
    const sust = soloSabados ? 'sábados' : 'funciones';

    let conteo;
    if (n === 0)      conteo = 'Temporada finalizada';
    else if (n === 1) conteo = soloSabados ? 'último sábado' : 'última función';
    else              conteo = `${n} ${sust}`;

    return {
      n,
      conteo,
      soloSabados,
      // "solo 6 sábados" / "última función" — para frases que ya traen el "solo"
      conteoConSolo: n === 0 ? 'Temporada finalizada'
                   : n === 1 ? conteo
                   : `solo ${conteo}`,
      rango: n >= 2 ? `del ${largo(fns[0].fecha_iso)} al ${largo(fns[n - 1].fecha_iso)}`
           : n === 1 ? `el ${largo(fns[0].fecha_iso)}`
           : '',
      primera: n ? fns[0].fecha_iso : null,
      ultima:  n ? fns[n - 1].fecha_iso : null,
      primeraNombre: n ? (fns[0].nombre || '') : '',
    };
  },

  proximaFuncion() {
    const r = this.resumenTemporada();
    if (!r.n || !r.primera) return null;
    const fn = FUNCIONES_TEMPORADA.find(x => x.fecha_iso === r.primera);
    const [y, m, d] = r.primera.split('-').map(Number);
    const { h, min } = this.horaDeFuncion(fn);
    return {
      fecha_iso: r.primera,
      fecha: new Date(y, m - 1, d, h, min),
      fn,
      nRestantes: r.n,
      numeroObra: this.numeroObraDeFuncion(fn, r.primera),
    };
  },

  numeroObraDeFuncion(fn, fechaIso) {
    if (fn && typeof fn.numero_obra === 'number' && fn.numero_obra > 0) return fn.numero_obra;
    const map = this.CONFIG.NUMEROS_OBRA || {};
    if (fechaIso && map[fechaIso]) return map[fechaIso];
    return null;
  },

  numeroObraProxima() {
    const p = this.proximaFuncion();
    if (!p) return null;
    if (p.numeroObra) return p.numeroObra;
    return this.CONFIG.NUMERO_OBRA_FALLBACK || null;
  },

  etiquetaNumeroObraProxima() {
    const n = this.numeroObraProxima();
    if (!n) return '';
    return String(n);
  },

  segundosHastaProximaFuncion() {
    const p = this.proximaFuncion();
    if (!p) return null;
    return Math.max(0, Math.floor((p.fecha - new Date()) / 1000));
  },

  etiquetaCountdownProxima() {
    const sec = this.segundosHastaProximaFuncion();
    if (sec === null) return '';
    if (sec <= 0) return 'La función es hoy — reserva antes de que empiece';
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days >= 1) {
      return days === 1
        ? `Falta 1 día y ${hours} h para la próxima función`
        : `Faltan ${days} días para la próxima función`;
    }
    if (hours >= 1) return `Faltan ${hours} h y ${mins} min para la próxima función`;
    if (mins >= 1) return `Faltan ${mins} min para la próxima función`;
    return 'La función empieza en breve';
  },

  etiquetaProximaFuncion() {
    const r = this.resumenTemporada();
    if (!r.n || !r.primera) return '';
    const MESES = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const [y, m, d] = r.primera.split('-').map(Number);
    const f = new Date(y, m - 1, d);
    const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const dia = dias[f.getDay()];
    const fecha = `${f.getDate()} de ${MESES[f.getMonth()]}`;
    if (r.n === 1) return `Última función · ${dia} ${fecha} · 18:00`;
    if (f.getDay() === 6) return `Próximo sábado ${fecha} · 18:00`;
    return `Próxima función · ${dia} ${fecha} · 18:00`;
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

/**
 * El admin activa/oculta funciones desde el panel (botón "En venta/Oculta"),
 * lo cual escribe en la KV del Worker. Aquí se trae ese estado y se aplica
 * sobre FUNCIONES_TEMPORADA para que boletos.html lo respete sin necesitar
 * un deploy de código por cada cambio de fechas.
 * Si el fetch falla, se conserva `activa` tal como está en este archivo.
 */
async function sincronizarFuncionesActivas() {
  if (typeof window === 'undefined' || typeof window.teatroApi !== 'function') return;
  try {
    const res = await fetch(window.teatroApi('funciones'));
    if (!res.ok) return;
    const remotas = await res.json();
    if (!Array.isArray(remotas)) return;
    const porFecha = new Map(remotas.map(f => [f.fecha_iso, f]));
    FUNCIONES_TEMPORADA.forEach(f => {
      const ocultaLocal = f.activa === false;
      const r = porFecha.get(f.fecha_iso);
      // Ocultar aquí (activa:false en este archivo) es solo de cara al público —
      // no toca el backend, así que taquilla/manual sigue pudiendo vender esa
      // fecha aunque no se muestre en boletos.html. Si el backend la desactiva
      // (admin), eso sí bloquea todo — gana lo más restrictivo de los dos.
      f.activa = ocultaLocal ? false : !!r;
      if (r) {
        if (r.nombre) f.nombre = r.nombre;
        if (r.etiqueta) f.etiqueta = r.etiqueta;
        if (typeof r.atenuada === 'boolean') f.atenuada = r.atenuada;
        if (typeof r.precio_especial === 'number') f.precio_especial = r.precio_especial;
        if (typeof r.numero_obra === 'number' && r.numero_obra > 0) f.numero_obra = r.numero_obra;
      }
    });
  } catch (_) { /* sin conexión: se mantiene la config local como respaldo */ }
  // El backend pudo desactivar fechas: avisar para que el copy de oferta
  // (barra de compra, FAQ, banners) se recalcule con el conteo ya sincronizado.
  try {
    window.dispatchEvent(new CustomEvent('temporada:sincronizada'));
  } catch (_) { /* navegador sin CustomEvent: el copy ya quedó con la config local */ }
}

if (typeof window !== 'undefined') {
  window.FechasManager = FechasManager;
  window.SEDES = SEDES;
  window.FUNCIONES_TEMPORADA = FUNCIONES_TEMPORADA;
  window.sincronizarFuncionesActivas = sincronizarFuncionesActivas;
}
