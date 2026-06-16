/**
 * Rutas absolutas desde la raíz del sitio.
 * Evita enlaces rotos cuando la URL visible incluye slug (/el-gorila-…/) o subcarpetas.
 */
(function () {
  function rutaAbsoluta(path) {
    if (!path) return '/';
    if (/^https?:\/\//i.test(path) || path.indexOf('//') === 0) return path;
    if (location.protocol === 'file:') return String(path).replace(/^\//, '');
    var p = String(path);
    if (p.charAt(0) !== '/') p = '/' + p;
    try {
      return new URL(p, location.origin).href;
    } catch (e) {
      return p;
    }
  }

  window.rutaAbsoluta = rutaAbsoluta;
  window.irA = function irA(path) {
    location.href = rutaAbsoluta(path);
  };
})();
