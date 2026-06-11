// URL base del Worker API. Debe cargarse antes que auth.js y cualquier script
// que haga fetch al backend.
window.API_BASE = 'https://elgorila-api.dupeyronosterlen.workers.dev';

/** Teatro activo en taquilla (Teatro Wilberto Cantón). CCC se conserva sin funciones. */
window.TEATRO_ID = 'wilberto';

/** false = admin.html exige usuario y contraseña (recomendado en producción). */
window.ADMIN_SIN_LOGIN = false;

/** Precios por zona (deben coincidir con KV config / scripts/init-config.js) */
window.SECCIONES_VENTA = {
  platea:  { id: 'platea',  nombre: 'Platea (abajo)',  precio_general: 350, precio_descuento: 245 },
  galeria: { id: 'galeria', nombre: 'Galería (arriba)', precio_general: 350, precio_descuento: 245 },
};

window.teatroApi = function teatroApi(subpath) {
  const tid = window.TEATRO_ID || 'wilberto';
  const path = subpath.startsWith('/') ? subpath.slice(1) : subpath;
  return `${window.API_BASE}/api/${tid}/${path}`;
};

window.teatroAdminApi = function teatroAdminApi(subpath) {
  const tid = window.TEATRO_ID || 'wilberto';
  const path = subpath.startsWith('/') ? subpath.slice(1) : subpath;
  return `${window.API_BASE}/api/admin/${tid}/${path}`;
};

window.teatroAdminSistemaApi = function teatroAdminSistemaApi(subpath) {
  const path = subpath.startsWith('/') ? subpath.slice(1) : subpath;
  return `${window.API_BASE}/api/admin/sistema/${path}`;
};

window.teatroIdFromUrl = function teatroIdFromUrl() {
  try {
    const t = new URLSearchParams(window.location.search).get('teatro');
    if (t === 'gorila') return 'wilberto';
    if (t && ['wilberto', 'ccc'].includes(t)) return t;
  } catch (_) {}
  return window.TEATRO_ID || 'wilberto';
};
