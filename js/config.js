// URL base del Worker API. Debe cargarse antes que auth.js y cualquier script
// que haga fetch al backend.
// En el sitio público usamos el mismo origen (elgorilateatro.com.mx/api/…)
// para no depender de *.workers.dev: algunos ISPs (p. ej. Izzi) lo interceptan
// o lo dejan colgado, y el botón de pagar se queda en «Un momento…».
(function () {
  var WORKERS_DEV = 'https://elgorila-api.dupeyronosterlen.workers.dev';
  var host = '';
  try { host = String(window.location.hostname || '').toLowerCase(); } catch (e) {}
  var isProd = host === 'elgorilateatro.com.mx' || host === 'www.elgorilateatro.com.mx';
  window.API_BASE = isProd ? window.location.origin : WORKERS_DEV;
})();

window.egFetchJson = async function egFetchJson(url, opts, timeoutMs) {
  var ctrl = new AbortController();
  var ms = typeof timeoutMs === 'number' ? timeoutMs : 15000;
  var timer = setTimeout(function () { ctrl.abort(); }, ms);
  var redMsg = 'La conexión tardó demasiado o tu red bloqueó el pago. Prueba con datos móviles (sin Wi‑Fi) e intenta de nuevo.';
  try {
    var res = await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
    var ct = String(res.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('application/json') === -1) {
      var err = new Error(redMsg);
      err.code = 'INTERCEPT';
      throw err;
    }
    var data = await res.json();
    return { res: res, data: data };
  } catch (err) {
    if (err && err.code === 'INTERCEPT') throw err;
    if (err && (err.name === 'AbortError' || err.code === 'TIMEOUT')) {
      var timeoutErr = new Error(redMsg);
      timeoutErr.code = 'TIMEOUT';
      throw timeoutErr;
    }
    if (err && (err.name === 'TypeError' || err.message === 'Failed to fetch')) {
      var netErr = new Error(redMsg);
      netErr.code = 'NETWORK';
      throw netErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

/** Teatro activo (Teatro Wilberto Cantón). CCC se conserva sin funciones. */
window.TEATRO_ID = 'wilberto';

/** IDs aceptados en URL (?teatro=) y alias históricos → canónico wilberto */
window.TEATRO_ALIASES = { gorila: 'wilberto', elgorila: 'wilberto' };

window.teatroIdActivo = function teatroIdActivo() {
  try {
    const t = new URLSearchParams(window.location.search).get('teatro');
    if (t) {
      const norm = t.toLowerCase().trim();
      if (window.TEATRO_ALIASES[norm]) return window.TEATRO_ALIASES[norm];
      if (['wilberto', 'ccc'].includes(norm)) return norm;
    }
  } catch (_) {}
  return window.TEATRO_ID || 'wilberto';
};

window.TEATRO_ID = window.teatroIdActivo();

/** Sitekey pública de Turnstile (solo se usa en el login de admin.html). */
window.TURNSTILE_SITEKEY = '0x4AAAAAAEUiokgcKxJEYqYQ';

/** false = admin.html exige usuario y contraseña (recomendado en producción). */
window.ADMIN_SIN_LOGIN = false;

/** true = venta en boletos.html. false = portada «Próximamente» → Instagram. */
window.VENTA_PUBLICA_ABIERTA = true;
window.INSTAGRAM_BOLETOS_URL = 'https://www.instagram.com/elgorilateatro';

/** Precios por zona (deben coincidir con el Worker). Preventa $350 hasta 26 jul 2026 15:00 CDMX; luego $400. */
window.PRECIO_GENERAL_PREVENTA = 350;
window.PRECIO_GENERAL_TEMPORADA = 400;
window.PRECIO_CREDENCIAL = 280;
/** 26 jul 2026 15:00 America/Mexico_City = 21:00 UTC (CDMX sin DST). */
window.FIN_PREVENTA_UTC_MS = Date.parse('2026-07-26T21:00:00.000Z');

window.esPreventaVigente = function esPreventaVigente() {
  return Date.now() < window.FIN_PREVENTA_UTC_MS;
};

window.precioGeneralVigente = function precioGeneralVigente() {
  return window.esPreventaVigente()
    ? window.PRECIO_GENERAL_PREVENTA
    : window.PRECIO_GENERAL_TEMPORADA;
};

window.seccionesVentaVigentes = function seccionesVentaVigentes() {
  const g = window.precioGeneralVigente();
  const c = window.PRECIO_CREDENCIAL;
  return {
    platea:  { id: 'platea',  nombre: 'Platea (abajo)',  precio_general: g, precio_descuento: c },
    galeria: { id: 'galeria', nombre: 'Galería (arriba)', precio_general: g, precio_descuento: c },
  };
};

window.SECCIONES_VENTA = window.seccionesVentaVigentes();

/** Aforo total Wilberto Cantón (250 platea + 75 galería). Solo uso interno. */
window.AFORO_TOTAL_WILBERTO = 325;

/**
 * Cupo restante en todo el teatro (suma platea + galería).
 * `disponibles` del API es solo la zona en venta ahora (platea hasta agotar).
 */
window.disponiblesAforoTotal = function disponiblesAforoTotal(data) {
  if (!data) return 0;
  if (typeof data.disponibles_total === 'number') return data.disponibles_total;
  const secs = data.secciones;
  if (secs && typeof secs === 'object') {
    const sum = Object.values(secs).reduce((s, x) => s + (Number(x?.disponibles) || 0), 0);
    if (Object.keys(secs).length) return sum;
  }
  if (typeof data.capacidad === 'number') {
    return Math.max(0, data.capacidad - (data.vendidos || 0) - (data.reservados || 0));
  }
  return typeof data.disponibles === 'number' ? data.disponibles : 0;
};

window.teatroApi = function teatroApi(subpath) {
  const tid = window.teatroIdActivo();
  const path = subpath.startsWith('/') ? subpath.slice(1) : subpath;
  return `${window.API_BASE}/api/${tid}/${path}`;
};

window.teatroAdminApi = function teatroAdminApi(subpath) {
  const tid = window.teatroIdActivo();
  const path = subpath.startsWith('/') ? subpath.slice(1) : subpath;
  return `${window.API_BASE}/api/admin/${tid}/${path}`;
};

window.teatroAdminSistemaApi = function teatroAdminSistemaApi(subpath) {
  const path = subpath.startsWith('/') ? subpath.slice(1) : subpath;
  return `${window.API_BASE}/api/admin/sistema/${path}`;
};

window.teatroIdFromUrl = function teatroIdFromUrl() {
  return window.teatroIdActivo();
};
