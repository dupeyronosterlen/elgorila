/**
 * Analytics centralizado — eventos de funnel (consolidado a GTM, 2026-06).
 *
 * Contrato de capas (UNA sola fuente de verdad = GTM):
 *   GTM  → carga GA4 (G-NXF8093MDJ) + Google Ads (AW-17961021514) + Meta base,
 *          page_view, engagement y AHORA TAMBIÉN todo el ecommerce
 *          (view_item, add_to_cart, begin_checkout, add_payment_info, purchase, grupo_grande).
 *   Aquí → empuja los eventos de ecommerce al dataLayer; GTM los envía a GA4/Ads
 *          (tags "GA4 EC - *" leyendo {{DLV - ecommerce}}). Ya NO usa gtag() directo,
 *          eso eliminaba la carrera del 2º cargador que perdía conversiones.
 *        → dispara Meta Pixel (fbq) directo con eventID para dedup con CAPI del servidor.
 *
 *   purchase SOLO en confirmacion.html (QR). Dedup por transaction_id (sessionStorage).
 */
(function () {
  window.dataLayer = window.dataLayer || [];

  // Desarrollo local: no contaminar el píxel ni GA4 de producción.
  // El desglose por URL del píxel mostraba eventos desde localhost/127.0.0.1.
  // Se silencian los envíos, NO la API: el resto del sitio sigue llamando a
  // ElGorilaAnalytics con normalidad y el checkout local no se rompe.
  var _egHost = location.hostname;
  var ES_LOCAL = _egHost === 'localhost' || _egHost === '127.0.0.1' ||
                 _egHost === '' || _egHost.slice(-6) === '.local';
  if (ES_LOCAL && window.console && console.info) {
    console.info('[analytics] entorno local: no se envían eventos a GA4 ni Meta');
  }

  // Página que declara `data-viewcontent="<nombre>"` en el <script> dispara
  // ViewContent / view_item al cargar. Necesario para optimizar campañas de
  // prospección a "Ver contenido": sin esto el evento nunca existe.
  var _egScript = document.currentScript;
  var _egViewContent = _egScript && _egScript.getAttribute('data-viewcontent');

  // Empuja un evento de ecommerce al dataLayer para que lo recoja GTM.
  // Limpia `ecommerce` antes (evita que items de un push previo se mezclen).
  function pushEcommerce(eventName, ecommerce) {
    if (ES_LOCAL) return;
    window.dataLayer.push({ ecommerce: null });
    var payload = { event: eventName };
    if (ecommerce) payload.ecommerce = ecommerce;
    window.dataLayer.push(payload);
  }

  function mapItems(orden) {
    if (!orden || !Array.isArray(orden.items)) return [];
    return orden.items.map(function (i) {
      var precio = i.precio;
      if (precio == null) {
        precio = i.tipo === 'general'
          ? (typeof window.precioGeneralVigente === 'function' ? window.precioGeneralVigente() : 400)
          : (window.PRECIO_CREDENCIAL || 280);
      }
      return {
        item_id: i.tipo,
        item_name: (i.tipo || '').charAt(0).toUpperCase() + (i.tipo || '').slice(1),
        quantity: i.cantidad,
        price: precio,
        currency: 'MXN',
      };
    });
  }

  function ecommercePayload(orden) {
    return {
      currency: 'MXN',
      value: orden && orden.total != null ? Number(orden.total) : 0,
      items: mapItems(orden),
      coupon: orden && orden.codigoCupon ? orden.codigoCupon : undefined,
    };
  }

  function purchaseEventId(orden, transactionId) {
    if (orden && orden.sessionId) return 'purchase_' + String(orden.sessionId);
    var txId = transactionId || (orden && (orden.numeroOrden || orden.certificado)) || '';
    if (!txId) return '';
    return 'purchase_' + String(txId).replace(/[^a-zA-Z0-9_-]/g, '');
  }

  function trackMeta(eventName, payload, eventId) {
    if (ES_LOCAL) return;
    if (typeof fbq !== 'function') return;
    try {
      var p = payload || {};
      var params = {};
      if (p.value != null) {
        params.value = p.value;
        params.currency = p.currency || 'MXN';
      }
      if (p.content_type) params.content_type = p.content_type;
      if (p.content_ids) params.content_ids = p.content_ids;
      if (p.content_name) params.content_name = p.content_name;
      if (eventId) {
        fbq('track', eventName, params, { eventID: eventId });
      } else if (Object.keys(params).length) {
        fbq('track', eventName, params);
      } else {
        fbq('track', eventName);
      }
    } catch (_) {}
  }

  function purchaseKey(id) {
    return 'eg_purchase_' + String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  window.ElGorilaAnalytics = {
    // Meta y GA4 los carga GTM; init se mantiene por compatibilidad de API.
    init: function () {
      window._egFBInit = true;
    },

    purchaseEventId: purchaseEventId,

    grupoGrande: function (cantidad) {
      if (ES_LOCAL) return;
      window.dataLayer.push({ ecommerce: null });
      window.dataLayer.push({ event: 'grupo_grande', cantidad: cantidad });
    },

    viewContent: function (opts) {
      opts = opts || {};
      var ids = opts.content_ids || [];
      pushEcommerce('view_item', {
        items: ids.map(function (id) {
          return { item_id: id, item_name: opts.content_name || id };
        }),
      });
      trackMeta('ViewContent', {
        content_type: opts.content_type || 'funcion',
        content_ids: ids,
        content_name: opts.content_name || '',
      });
    },

    addToCart: function (orden) {
      var p = ecommercePayload(orden);
      pushEcommerce('add_to_cart', p);
      trackMeta('AddToCart', p);
    },

    beginCheckout: function (orden) {
      var p = ecommercePayload(orden);
      pushEcommerce('begin_checkout', p);
      trackMeta('InitiateCheckout', p);
    },

    addPaymentInfo: function (orden) {
      var p = ecommercePayload(orden);
      pushEcommerce('add_payment_info', p);
      trackMeta('AddPaymentInfo', p);
    },

    purchase: function (orden, transactionId) {
      var txId = transactionId || (orden && (orden.numeroOrden || orden.sessionId || orden.certificado)) || '';
      var eventId = purchaseEventId(orden, txId);
      if (!txId && !eventId) return false;
      var storageKey = purchaseKey(eventId || txId);
      try {
        if (sessionStorage.getItem(storageKey)) return false;
      } catch (_) {}

      var p = ecommercePayload(orden);
      p.transaction_id = txId;

      function markSent() {
        try { sessionStorage.setItem(storageKey, '1'); } catch (_) {}
      }

      // 1) GA4 + Google Ads vía GTM (dataLayer) — exactamente una vez.
      pushEcommerce('purchase', p);
      markSent();

      // 2) Meta Pixel directo (fbq) con reintento SOLO para fbq (GTM lo carga async).
      function sendMeta() {
        if (ES_LOCAL) return true;
        if (typeof fbq !== 'function') return false;
        try {
          var params = { value: p.value, currency: p.currency || 'MXN' };
          if (eventId) {
            fbq('track', 'Purchase', params, { eventID: eventId });
          } else {
            fbq('track', 'Purchase', params);
          }
          return true;
        } catch (_) { return false; }
      }

      if (!sendMeta()) {
        var attempts = 0;
        var timer = setInterval(function () {
          attempts += 1;
          if (sendMeta() || attempts >= 24) clearInterval(timer);
        }, 250);
      }
      return true;
    },
  };

  window.ElGorilaAnalytics.init();

  if (_egViewContent) {
    var dispararViewContent = function () {
      window.ElGorilaAnalytics.viewContent({
        content_type: 'obra',
        content_ids: [_egViewContent],
        content_name: _egViewContent,
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', dispararViewContent);
    } else {
      dispararViewContent();
    }
  }
})();
