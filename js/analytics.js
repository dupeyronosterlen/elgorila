/**
 * Analytics centralizado — GA4 + Google Ads + Meta Pixel (solo eventos de funnel).
 * Cargar en <head> (antes de main.js / confirmacion.js) en páginas del funnel.
 *
 * Layer contract:
 *   GTM  → page_view, Meta init/PageView, engagement (whatsapp, FAQ, CTA click…)
 *   Aquí → view_content, add_to_cart, begin_checkout, add_payment_info, purchase (+ fbq track)
 *   purchase SOLO en confirmacion.html (QR)
 *   GA4 page_view: GTM (analytics.js usa send_page_view: false)
 *   Meta init:     GTM únicamente; trackMeta() asume que fbq ya existe
 *   eventID purchase: purchase_{sessionId} — dedup con CAPI servidor
 */
(function () {
  var GA4_ID = 'G-NXF8093MDJ';
  var AW_ID = 'AW-17961021514';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (typeof window.gtag !== 'function') window.gtag = gtag;

  function initGA4() {
    if (window._egGA4Init) return;
    window._egGA4Init = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA4_ID, { send_page_view: false });
    gtag('config', AW_ID);
  }

  function initMetaPixel() {
    window._egFBInit = true;
  }

  function mapItems(orden) {
    if (!orden || !Array.isArray(orden.items)) return [];
    return orden.items.map(function (i) {
      var precio = i.precio;
      if (precio == null) {
        precio = i.tipo === 'general' ? 350 : 245;
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
    init: function (opts) {
      initGA4();
      if (!opts || opts.meta !== false) initMetaPixel();
    },

    purchaseEventId: purchaseEventId,

    grupoGrande: function (cantidad) {
      if (typeof gtag === 'function') {
        gtag('event', 'grupo_grande', { cantidad: cantidad });
      }
    },

    viewContent: function (opts) {
      opts = opts || {};
      var ids = opts.content_ids || [];
      if (typeof gtag === 'function') {
        gtag('event', 'view_item', {
          items: ids.map(function (id) {
            return { item_id: id, item_name: opts.content_name || id };
          }),
        });
      }
      trackMeta('ViewContent', {
        content_type: opts.content_type || 'funcion',
        content_ids: ids,
        content_name: opts.content_name || '',
      });
    },

    addToCart: function (orden) {
      var p = ecommercePayload(orden);
      if (typeof gtag === 'function') gtag('event', 'add_to_cart', p);
      trackMeta('AddToCart', p);
    },

    beginCheckout: function (orden) {
      var p = ecommercePayload(orden);
      if (typeof gtag === 'function') gtag('event', 'begin_checkout', p);
      trackMeta('InitiateCheckout', p);
    },

    addPaymentInfo: function (orden) {
      var p = ecommercePayload(orden);
      if (typeof gtag === 'function') gtag('event', 'add_payment_info', p);
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

      function sendPurchase() {
        if (typeof gtag === 'function') gtag('event', 'purchase', p);
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

      function markSent() {
        try { sessionStorage.setItem(storageKey, '1'); } catch (_) {}
      }

      if (sendPurchase()) {
        markSent();
        return true;
      }

      // GTM carga fbq async — reintentar hasta ~6 s antes de rendirse
      var attempts = 0;
      var timer = setInterval(function () {
        attempts += 1;
        if (sendPurchase()) {
          clearInterval(timer);
          markSent();
        } else if (attempts >= 24) {
          clearInterval(timer);
        }
      }, 250);
      return true;
    },
  };

  var script = document.currentScript;
  var withMeta = script && script.getAttribute('data-meta') === '1';
  window.ElGorilaAnalytics.init({ meta: withMeta });
})();
