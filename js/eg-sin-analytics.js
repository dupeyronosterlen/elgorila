/**
 * Exclusión de medición (GA4, GTM, Meta vía dataLayer/fbq).
 *
 * Se activa automáticamente en:
 *   - localhost, *.local, file://, *.workers.dev, *.pages.dev
 *   - páginas *-preview.html
 *   - navegadores automatizados (Cursor, Playwright, Puppeteer, Selenium…)
 *   - opt-out guardado: ?eg_no_track=1  o  ?eg_internal=1
 *
 * Reactivar medición real en este navegador: ?eg_track=1
 *
 * Debe cargarse ANTES de js/gtm.js (síncrono en <head>).
 */
(function () {
  var STORAGE_KEY = 'eg_no_analytics';
  var GA4_ID = 'G-NXF8093MDJ';

  function readParam(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (_) { return null; }
  }

  function cookieGet(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_) { return null; }
  }
  function cookieSet(name, val) {
    try { document.cookie = name + '=' + encodeURIComponent(val) + ';path=/;max-age=31536000;SameSite=Lax'; } catch (_) {}
  }
  function cookieRemove(name) {
    try { document.cookie = name + '=;path=/;max-age=0'; } catch (_) {}
  }

  function storageGet(key) {
    try { return localStorage.getItem(key) || cookieGet(key); } catch (_) { return cookieGet(key); }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
    cookieSet(key, val);
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
    cookieRemove(key);
  }

  if (readParam('eg_no_track') === '1' || readParam('eg_internal') === '1') {
    storageSet(STORAGE_KEY, '1');
  }
  if (readParam('eg_track') === '1') {
    storageRemove(STORAGE_KEY);
  }

  function esHostLocal(host, protocol) {
    host = String(host || '').toLowerCase();
    if (protocol === 'file:') return true;
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]') return true;
    if (host.slice(-6) === '.local') return true;
    if (host.slice(-12) === '.workers.dev') return true;
    if (host.slice(-10) === '.pages.dev') return true;
    return false;
  }

  function esPaginaPreview(pathname) {
    pathname = String(pathname || '');
    return /-preview\.html$/i.test(pathname) || /\/preview\//i.test(pathname);
  }

  function esAutomatizado() {
    try {
      if (navigator.webdriver) return true;
      if (window.Cypress || window.__playwright || window.__nightmare || window._phantom) return true;

      var ua = navigator.userAgent || '';
      if (/HeadlessChrome|Playwright|Puppeteer|PhantomJS|Selenium|WebDriver|automation/i.test(ua)) return true;
      if (/Cursor\//i.test(ua) || /\bCursor\b/i.test(ua)) return true;
      // Cursor / Claude / VS Code Simple Browser van sobre Electron.
      if (/Electron\//i.test(ua)) return true;
    } catch (_) {}
    return false;
  }

  function detectarMotivo() {
    if (storageGet(STORAGE_KEY) === '1') return 'equipo-interno';
    if (esHostLocal(location.hostname, location.protocol)) return 'entorno-local';
    if (esPaginaPreview(location.pathname)) return 'pagina-preview';
    if (esAutomatizado()) return 'navegador-automatizado';
    return '';
  }

  var motivo = detectarMotivo();
  var noTrack = !!motivo;

  // Cursor / agentes: persistir para que siguientes páginas en el mismo perfil queden fuera.
  if (motivo === 'navegador-automatizado') {
    storageSet(STORAGE_KEY, '1');
    motivo = 'equipo-interno';
  }

  window.egSinAnalyticsMotivo = function () { return motivo; };
  window.egSinAnalytics = function () { return noTrack; };

  if (noTrack) {
    window._egNoAnalytics = true;
    window['ga-disable-' + GA4_ID] = true;
    if (window.console && console.info) {
      console.info(
        '[analytics] sin medición (' + motivo + '). Para medir de verdad en este navegador: ?eg_track=1'
      );
    }
  }
})();
