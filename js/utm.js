/**
 * Atribución de marketing (UTM) → localStorage + dataLayer (GA4/GTM).
 *
 * Last-touch: si la URL trae utm_*, sobrescribe. Si no, conserva storage.
 * Empuja `eg_attribution` al dataLayer ANTES de que GTM/GA4 procesen el
 * page_view (este archivo debe ir justo después del snippet GTM, síncrono).
 *
 * Convención Platea:
 *   utm_campaign = nombre campaña (EG_S2_TOFU_VC, EG_S2_MOFU_VC, …)
 *   utm_term     = ad set (as-tofu-espejo, as-mofu-social90, …)
 *   utm_content  = pieza / ad (espejo_mofu_01, …)
 *
 * Expone:
 *   window.obtenerUTM() → { source, medium, campaign, content, term }
 *   window.obtenerAtribucion() → objeto completo (page_type, production, …)
 */
(function () {
  var STORAGE_KEY = 'eg_utm';
  var CLAVES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function pageTypeFromPath(path) {
    path = String(path || '').toLowerCase();
    if (!path || path === '/' || path === '/index.html') return 'home';
    if (path.indexOf('sobre-la-obra') !== -1) return 'sobre_obra';
    if (path.indexOf('boletos') !== -1) return 'boletos';
    if (path.indexOf('confirmacion') !== -1) return 'confirmacion';
    if (path.indexOf('funciones') !== -1) return 'funciones';
    if (path.indexOf('/programa') !== -1) return 'programa';
    if (path.indexOf('presskit') !== -1) return 'presskit';
    if (path.indexOf('invitacion') !== -1) return 'invitacion';
    if (path.indexOf('acta') !== -1) return 'acta';
    return 'other';
  }

  function readFromUrl() {
    var encontrados = {};
    var hay = false;
    try {
      var params = new URLSearchParams(window.location.search);
      CLAVES.forEach(function (clave) {
        var valor = params.get(clave);
        if (valor) {
          encontrados[clave.replace('utm_', '')] = String(valor).substring(0, 200);
          hay = true;
        }
      });
    } catch (e) { /* ignore */ }
    return hay ? encontrados : null;
  }

  function readFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      if (!(o.source || o.medium || o.campaign || o.content || o.term)) return null;
      return o;
    } catch (e) {
      return null;
    }
  }

  function save(utm) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
    } catch (e) { /* ignore */ }
  }

  var fromUrl = readFromUrl();
  var touch = 'none';
  var utm = {};

  if (fromUrl) {
    utm = fromUrl;
    touch = 'url';
    save(utm);
  } else {
    var stored = readFromStorage();
    if (stored) {
      utm = stored;
      touch = 'storage';
    }
  }

  var atribucion = {
    source: utm.source || '',
    medium: utm.medium || '',
    campaign: utm.campaign || '',
    content: utm.content || '',
    term: utm.term || '',
    touch: touch,
    page_type: pageTypeFromPath(window.location && window.location.pathname),
    // Multi-plaza futuro (Guatemala, etc.): hoy fijo S2 CDMX
    production: 'el-gorila',
    venue: 'wilberto',
    market: 'cdmx',
  };

  window.obtenerUTM = function () {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  };

  window.obtenerAtribucion = function () {
    var fresh = window.obtenerUTM() || {};
    return {
      source: fresh.source || atribucion.source || '',
      medium: fresh.medium || atribucion.medium || '',
      campaign: fresh.campaign || atribucion.campaign || '',
      content: fresh.content || atribucion.content || '',
      term: fresh.term || atribucion.term || '',
      touch: atribucion.touch,
      page_type: pageTypeFromPath(window.location && window.location.pathname),
      production: atribucion.production,
      venue: atribucion.venue,
      market: atribucion.market,
    };
  };

  // dataLayer: GTM lee esto en page_view y en eventos ecommerce
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'eg_attribution',
    eg_attribution: atribucion,
    // Alias planos (más fáciles como DLV en GTM)
    eg_source: atribucion.source,
    eg_medium: atribucion.medium,
    eg_campaign: atribucion.campaign,
    eg_ad: atribucion.content,
    eg_adset: atribucion.term,
    eg_touch: atribucion.touch,
    eg_page_type: atribucion.page_type,
    eg_production: atribucion.production,
    eg_venue: atribucion.venue,
    eg_market: atribucion.market,
  });
})();
