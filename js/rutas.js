/**
 * Rutas absolutas desde la raíz del sitio.
 * Evita enlaces rotos con slug SEO (/el-gorila-…/) o al abrir index.html en local (file://).
 */
(function () {
  function rutaAbsoluta(path) {
    if (!path) return location.protocol === 'file:' ? 'index.html' : '/';
    if (/^https?:\/\//i.test(path) || path.indexOf('//') === 0) return path;

    var hash = '';
    var query = '';
    var hi = path.indexOf('#');
    if (hi !== -1) {
      hash = path.slice(hi);
      path = path.slice(0, hi);
    }
    var qi = path.indexOf('?');
    if (qi !== -1) {
      query = path.slice(qi);
      path = path.slice(0, qi);
    }

    var resolved;
    if (location.protocol === 'file:') {
      resolved = String(path).replace(/^\//, '');
    } else {
      var p = String(path);
      if (p.charAt(0) !== '/') p = '/' + p;
      try {
        resolved = new URL(p, location.origin).href;
      } catch (e) {
        resolved = p;
      }
    }
    return resolved + query + hash;
  }

  function normalizarEnlacesInternos(root) {
    (root || document).querySelectorAll('a[href^="/"]').forEach(function (a) {
      var path = a.getAttribute('href');
      if (!path || path.charAt(0) !== '/' || path.indexOf('//') === 0) return;
      a.href = rutaAbsoluta(path);
    });
  }

  window.rutaAbsoluta = rutaAbsoluta;
  window.irA = function irA(path) {
    location.href = rutaAbsoluta(path);
  };
  window.normalizarEnlacesInternos = normalizarEnlacesInternos;

  function run() {
    normalizarEnlacesInternos();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
