/**
 * Copy de temporada dinámico.
 *
 * Rellena en el DOM lo que "se pudre" con el tiempo (cuántas funciones quedan y
 * entre qué fechas) a partir de FechasManager.resumenTemporada(), que a su vez
 * sale de FUNCIONES_TEMPORADA en fechas.js.
 *
 * Regla de uso: solo para copy de OFERTA (lo que el visitante puede comprar hoy).
 * El texto editorial que describe la temporada tal como fue programada
 * ("9 funciones, 25 jul – 19 sep") es histórico y NO lleva estos atributos.
 *
 * Atributos soportados — el contenido que ya trae el HTML queda como respaldo
 * si el JS no corre, así que siempre debe ser una frase neutra y verdadera:
 *   data-temporada-conteo       → "6 sábados" / "último sábado" / "Temporada finalizada"
 *   data-temporada-conteo-solo  → "solo 6 sábados" (para frases que ya dicen "Sí: …")
 *   data-temporada-rango        → "del 15 de agosto al 19 de septiembre"
 *
 * Alargar la temporada = agregar fechas en fechas.js. Nada más.
 */
(function () {
  'use strict';

  function resumen() {
    var FM = window.FechasManager;
    if (!FM || typeof FM.resumenTemporada !== 'function') return null;
    try { return FM.resumenTemporada(); } catch (_) { return null; }
  }

  /** Conteo para barra de escasez: baja el mismo sábado a las 20:00. */
  function conteoEscasez() {
    var FM = window.FechasManager;
    var lista = window.FUNCIONES_TEMPORADA;
    if (!FM || !Array.isArray(lista) || typeof FM.pasadaParaConteoOferta !== 'function') return null;
    var fns = lista.filter(function (f) {
      return f.activa !== false && !f.atenuada && !FM.pasadaParaConteoOferta(f.fecha_iso, f);
    });
    var soloSabados = fns.length > 0 && fns.every(function (f) {
      var p = f.fecha_iso.split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2]).getDay() === 6;
    });
    return { n: fns.length, soloSabados: soloSabados };
  }

  function textoEscasez(n, soloSabados) {
    if (n === 0) return 'Temporada finalizada en CDMX';
    var sust = soloSabados ? 'sábado' : 'función';
    var sustPl = soloSabados ? 'sábados' : 'funciones';
    if (n === 1) return 'Queda 1 ' + sust + ' — cupo limitado';
    return 'Quedan ' + n + ' ' + sustPl + ' — cupo limitado';
  }

  function aplicar() {
    var r = resumen();
    if (!r) return null; // sin datos: se respeta el texto de respaldo del HTML

    var mapa = {
      'data-temporada-conteo':      r.conteo,
      'data-temporada-conteo-solo': r.conteoConSolo,
      'data-temporada-rango':       r.rango,
    };

    var proxima = '';
    if (window.FechasManager && typeof window.FechasManager.etiquetaProximaFuncion === 'function') {
      proxima = window.FechasManager.etiquetaProximaFuncion();
    }
    if (proxima) {
      document.querySelectorAll('[data-proxima-funcion]').forEach(function (el) {
        el.textContent = proxima;
      });
    }

    if (window.FechasManager && typeof window.FechasManager.etiquetaCountdownProxima === 'function') {
      var countdown = window.FechasManager.etiquetaCountdownProxima();
      document.querySelectorAll('[data-countdown-proxima]').forEach(function (el) {
        if (countdown) {
          el.textContent = countdown;
          el.hidden = false;
        } else {
          el.hidden = true;
        }
      });
    }

    if (r.n === 0) {
      document.querySelectorAll('[data-escasez-funciones]').forEach(function (el) {
        el.textContent = textoEscasez(0, false);
      });
    } else {
      var esc = conteoEscasez();
      var n = esc && typeof esc.n === 'number' ? esc.n : r.n;
      var soloSabados = esc ? esc.soloSabados : r.soloSabados;
      document.querySelectorAll('[data-escasez-funciones]').forEach(function (el) {
        el.textContent = textoEscasez(n, soloSabados);
      });
    }

    Object.keys(mapa).forEach(function (attr) {
      var valor = mapa[attr];
      // rango vacío (temporada terminada): dejar el respaldo, no vaciar la frase
      if (!valor) return;
      document.querySelectorAll('[' + attr + ']').forEach(function (el) {
        // data-temporada-cap: la frase arranca oración ("Solo 6 sábados.")
        var v = el.hasAttribute('data-temporada-cap')
          ? valor.charAt(0).toUpperCase() + valor.slice(1)
          : valor;
        if (el.textContent !== v) el.textContent = v;
      });
    });

    document.querySelectorAll('.barra-compra-fija [data-temporada-conteo]').forEach(function (el) {
      var a = el.closest('.barra-compra-fija');
      if (a) {
        a.setAttribute('aria-label', 'Ver fechas — ' + el.textContent + '. Desde $400. Credencial $280');
      }
    });

    // aria-label de los CTA de venta: se arma aparte porque lleva precio.
    document.querySelectorAll('.link-venta-boletos[aria-label]').forEach(function (a) {
      a.setAttribute('aria-label', a.getAttribute('aria-label').replace(/\d+\s+sábados|solo\s+\d+\s+sábados|último sábado|\d+\s+funciones|última función/i, r.conteo));
    });

    return r;
  }

  window.aplicarCopyTemporada = aplicar;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicar);
  } else {
    aplicar();
  }

  // El backend puede desactivar fechas (admin) — recalcular al sincronizar.
  window.addEventListener('temporada:sincronizada', aplicar);
})();
