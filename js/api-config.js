/**
 * Configuración de la API de boletera
 * En producción: añade <meta name="api-base" content="https://elgorila-api.dupeyronosterlen.workers.dev">
 * o define window.API_BASE_URL antes de cargar este script
 */
(function() {
  const meta = document.querySelector('meta[name="api-base"]');
  const fromMeta = meta ? meta.getAttribute('content')?.trim() : '';
  const fromWindow = typeof window.API_BASE_URL === 'string' ? window.API_BASE_URL.trim() : '';
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const API_BASE = fromWindow || fromMeta || (isLocal ? 'http://localhost:3001' : '');

  window.API_BASE = window.API_BASE || API_BASE;
  window.API_DISPONIBLE = !!window.API_BASE;

  if (!window.TEATRO_ID) window.TEATRO_ID = 'wilberto';

  if (!window.teatroApi) {
    window.teatroApi = function teatroApi(subpath) {
      const tid = window.TEATRO_ID || 'wilberto';
      const path = subpath.startsWith('/') ? subpath.slice(1) : subpath;
      return `${window.API_BASE}/api/${tid}/${path}`;
    };
  }

  if (!window.teatroAdminApi) {
    window.teatroAdminApi = function teatroAdminApi(subpath) {
      const tid = window.TEATRO_ID || 'wilberto';
      const path = subpath.startsWith('/') ? subpath.slice(1) : subpath;
      return `${window.API_BASE}/api/admin/${tid}/${path}`;
    };
  }

  if (!window.teatroIdFromUrl) {
    window.teatroIdFromUrl = function teatroIdFromUrl() {
      try {
        const t = new URLSearchParams(window.location.search).get('teatro');
        if (t && ['gorila', 'wilberto', 'ccc'].includes(t)) return t;
      } catch (_) {}
      return window.TEATRO_ID || 'wilberto';
    };
  }
})();
