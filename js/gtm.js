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
  if (script && script.getAttribute('data-defer') === 'load') {
    window.addEventListener('load', loadGtm);
  } else {
    loadGtm();
  }
})();
