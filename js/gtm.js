/**
 * Carga GTM solo si eg-sin-analytics.js no bloqueó la medición.
 */
(function () {
  var GTM_ID = 'GTM-P4BDXRN9';

  if (window._egNoAnalytics || (typeof window.egSinAnalytics === 'function' && window.egSinAnalytics())) {
    return;
  }

  function loadGtm() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var scripts = document.getElementsByTagName('script');
    var ref = scripts[scripts.length - 1];
    var j = document.createElement('script');
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    ref.parentNode.insertBefore(j, ref);
  }

  var script = document.currentScript;
  var modo = script && script.getAttribute('data-defer');
  if (modo === 'interaccion') {
    // 3 s después de `load`, o antes si hay toque/scroll/tecla (lo que ocurra primero).
    var cargado = false;
    var disparar = function () {
      if (cargado) return;
      cargado = true;
      loadGtm();
    };
    window.addEventListener('load', function () { setTimeout(disparar, 3000); });
    ['touchstart', 'scroll', 'keydown', 'mousemove', 'click'].forEach(function (ev) {
      window.addEventListener(ev, disparar, { once: true, passive: true });
    });
  } else if (modo === 'load') {
    window.addEventListener('load', loadGtm);
  } else {
    loadGtm();
  }
})();
