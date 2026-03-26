/**
 * Configuración de la API de boletera
 * En producción: añade <meta name="api-base" content="https://tu-api.onrender.com">
 * o define window.API_BASE_URL antes de cargar este script
 */
(function() {
  const meta = document.querySelector('meta[name="api-base"]');
  const fromMeta = meta ? meta.getAttribute('content')?.trim() : '';
  const fromWindow = typeof window.API_BASE_URL === 'string' ? window.API_BASE_URL.trim() : '';
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const API_BASE = fromWindow || fromMeta || (isLocal ? 'http://localhost:3001' : '');

  window.API_BASE = API_BASE;
  window.API_DISPONIBLE = !!API_BASE;
})();
