// URL base del Worker API. Debe cargarse antes que auth.js y cualquier script
// que haga fetch al backend.
window.API_BASE = 'https://elgorila-api.dupeyronosterlen.workers.dev';

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

/** false = admin.html exige usuario y contraseña (recomendado en producción). */
window.ADMIN_SIN_LOGIN = false;

/** Precios por zona (deben coincidir con KV config / scripts/init-config.js) */
window.SECCIONES_VENTA = {
  platea:  { id: 'platea',  nombre: 'Platea (abajo)',  precio_general: 350, precio_descuento: 245 },
  galeria: { id: 'galeria', nombre: 'Galería (arriba)', precio_general: 350, precio_descuento: 245 },
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
