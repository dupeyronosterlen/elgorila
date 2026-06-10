/**
 * Captura de atribución de marketing (UTM).
 * Se ejecuta lo antes posible en cada página de entrada y guarda los parámetros
 * utm_* en localStorage para que sobrevivan la navegación hasta el checkout.
 *
 * Estrategia: last-touch — la campaña que trae la visita actual sobrescribe la
 * anterior. Si la URL no trae UTM, se conserva lo que ya estaba guardado.
 *
 * Expone window.obtenerUTM() → { source, medium, campaign, content, term }
 */
(function () {
  var STORAGE_KEY = 'eg_utm';
  var CLAVES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  try {
    var params = new URLSearchParams(window.location.search);
    var encontrados = {};
    var hayAlguno = false;

    CLAVES.forEach(function (clave) {
      var valor = params.get(clave);
      if (valor) {
        encontrados[clave.replace('utm_', '')] = String(valor).substring(0, 200);
        hayAlguno = true;
      }
    });

    if (hayAlguno) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(encontrados));
    }
  } catch (e) {
    /* localStorage / URL no disponibles: no romper la página */
  }

  window.obtenerUTM = function () {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  };
})();
