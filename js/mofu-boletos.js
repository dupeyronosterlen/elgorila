/**
 * Funnel MOFU (/boletos): dónde se atasca la compra.
 *
 * Eventos dataLayer (GA4 vía GTM) — no duplican ecommerce:
 *   mofu_scroll, mofu_fecha_select, mofu_qty, mofu_faq,
 *   mofu_cupon, mofu_fechas_mas, mofu_footer_click
 *
 * Ya existen: view_item, add_to_cart, begin_checkout, purchase.
 */
(function () {
  'use strict';

  var SCROLL_MARKS = [25, 50, 75, 90];
  var firstFecha = true;

  function atribExtras() {
    try {
      if (typeof window.obtenerAtribucion === 'function') {
        var a = window.obtenerAtribucion() || {};
        return {
          eg_campaign: a.campaign || '',
          eg_ad: a.content || '',
          eg_adset: a.term || '',
          eg_source: a.source || '',
          eg_medium: a.medium || '',
          eg_page_type: a.page_type || 'boletos',
          eg_funcion_fecha: a.eg_funcion_fecha || '',
        };
      }
    } catch (_) {}
    return { eg_page_type: 'boletos' };
  }

  function fechaIsoFromStorage() {
    try {
      var raw = localStorage.getItem('orden_compra');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.fechaIso) return String(o.fechaIso);
      }
    } catch (_) {}
    return '';
  }

  function pushEvent(type, data) {
    try {
      if (typeof window.egSinAnalytics === 'function' && window.egSinAnalytics()) return;
      window.dataLayer = window.dataLayer || [];
      var extra = atribExtras();
      if (!extra.eg_funcion_fecha) extra.eg_funcion_fecha = fechaIsoFromStorage();
      var flat = Object.assign({ event: type }, extra, data || {});
      flat.event = type;
      window.dataLayer.push(flat);
    } catch (_) {}
  }

  function initScroll() {
    var fired = {};
    function check() {
      var doc = document.documentElement;
      var h = doc.scrollHeight - doc.clientHeight;
      if (h <= 0) return;
      var pct = Math.round((window.scrollY || doc.scrollTop) / h * 100);
      SCROLL_MARKS.forEach(function (mark) {
        if (pct >= mark && !fired[mark]) {
          fired[mark] = true;
          pushEvent('mofu_scroll', { percent: mark, page: 'boletos' });
        }
      });
    }
    window.addEventListener('scroll', check, { passive: true });
    setTimeout(check, 400);
  }

  function wrapFns() {
    if (typeof window.seleccionarFecha === 'function' && !window.seleccionarFecha._egMofu) {
      var origFecha = window.seleccionarFecha;
      window.seleccionarFecha = function (clave, texto, funcion) {
        origFecha.apply(this, arguments);
        var iso = (funcion && funcion.fecha_iso) || (clave && /^\d{4}-\d{2}-\d{2}$/.test(clave) ? clave : '') || fechaIsoFromStorage();
        var auto = firstFecha ? 1 : 0;
        firstFecha = false;
        pushEvent('mofu_fecha_select', {
          eg_funcion_fecha: iso,
          fecha_auto: auto,
          fecha_label: String(texto || '').substring(0, 80),
        });
      };
      window.seleccionarFecha._egMofu = true;
    }

    if (typeof window.cambiarCantidad === 'function' && !window.cambiarCantidad._egMofu) {
      var origQty = window.cambiarCantidad;
      window.cambiarCantidad = function (tipo, delta) {
        origQty.apply(this, arguments);
        var el = document.getElementById('cantidad-' + tipo);
        var qtyTipo = el ? (parseInt(el.textContent, 10) || 0) : 0;
        var total = 0;
        ['general', 'estudiante', 'inapam', 'maestro'].forEach(function (t) {
          var n = document.getElementById('cantidad-' + t);
          total += n ? (parseInt(n.textContent, 10) || 0) : 0;
        });
        pushEvent('mofu_qty', {
          ticket_type: tipo,
          qty_delta: delta,
          qty_tipo: qtyTipo,
          qty_total: total,
        });
      };
      window.cambiarCantidad._egMofu = true;
    }

    if (typeof window.aplicarCuponInline === 'function' && !window.aplicarCuponInline._egMofu) {
      var origCupon = window.aplicarCuponInline;
      window.aplicarCuponInline = function () {
        var input = document.getElementById('ichk-cupon-input');
        var codigo = input ? String(input.value || '').trim().toUpperCase().substring(0, 40) : '';
        var ret = origCupon.apply(this, arguments);
        function leerResultado() {
          var msg = document.getElementById('ichk-cupon-msg');
          var ok = !!(msg && msg.className && msg.className.indexOf('ichk-cupon-ok') !== -1);
          var err = !!(msg && msg.className && msg.className.indexOf('ichk-cupon-err') !== -1);
          if (!ok && !err) return false;
          pushEvent('mofu_cupon', { cupon_code: codigo, cupon_ok: ok ? 1 : 0 });
          return true;
        }
        if (ret && typeof ret.then === 'function') {
          ret.then(function () { setTimeout(leerResultado, 50); }).catch(function () {
            pushEvent('mofu_cupon', { cupon_code: codigo, cupon_ok: 0 });
          });
        } else {
          setTimeout(function () {
            if (!leerResultado()) setTimeout(leerResultado, 400);
          }, 80);
        }
        return ret;
      };
      window.aplicarCuponInline._egMofu = true;
    }
  }

  function initFaq() {
    document.querySelectorAll('.ayuda-colapsada details.faq-item').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        var sum = d.querySelector('summary');
        var q = sum ? String(sum.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 80) : '';
        pushEvent('mofu_faq', { faq_question: q });
      });
    });
  }

  function initFechasMas() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.btn-fechas-toggle');
      if (!btn) return;
      var expand = btn.className.indexOf('menos') === -1;
      pushEvent('mofu_fechas_mas', { fechas_expand: expand ? 1 : 0 });
    }, true);
  }

  function initFooter() {
    var foot = document.querySelector('footer.bol-footer');
    if (!foot) return;
    foot.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a');
      if (!a) return;
      var dest = a.getAttribute('data-footer-dest') || '';
      if (!dest) {
        var href = a.getAttribute('href') || '';
        if (href.indexOf('mailto:') === 0) dest = 'email';
        else if (href.indexOf('instagram') !== -1) dest = 'instagram';
        else if (href.indexOf('facebook') !== -1) dest = 'facebook';
        else if (href.indexOf('admin') !== -1) dest = 'admin';
        else dest = href.replace(/^https?:\/\/[^/]+/, '').substring(0, 60) || 'other';
      }
      pushEvent('mofu_footer_click', { footer_dest: dest });
    });
  }

  function hideAdminIfNeeded() {
    try {
      var show = localStorage.getItem('elgorila_mostrar_admin_footer') || '1';
      var el = document.getElementById('footer-admin-link');
      if (el && show === '0') el.style.display = 'none';
    } catch (_) {}
  }

  function boot() {
    wrapFns();
    initScroll();
    initFaq();
    initFechasMas();
    initFooter();
    hideAdminIfNeeded();
    setTimeout(wrapFns, 0);
    setTimeout(wrapFns, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
