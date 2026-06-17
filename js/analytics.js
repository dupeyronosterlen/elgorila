/**
 * Analytics centralizado — GA4 + Google Ads + Meta Pixel (solo eventos de funnel).
 * Cargar en <head> (antes de main.js / confirmacion.js) en páginas del funnel.
 *
 * Layer contract:
 *   GTM  → page_view, Meta init/PageView, engagement (whatsapp, FAQ, CTA click…)
 *   Aquí → add_to_cart, begin_checkout, add_payment_info, purchase (+ fbq track)
 *   purchase SOLO en confirmacion.html (QR) — gracias.html no dispara conversión
 *   GA4 page_view: GTM (analytics.js usa send_page_view: false)
 *   Meta init:     GTM únicamente; trackMeta() asume que fbq ya existe
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
    // GTM (GTM-P4BDXRN9) ya envía page_view; aquí solo eventos del funnel.
    gtag('config', GA4_ID, { send_page_view: false });
    gtag('config', AW_ID);
  }

  function initMetaPixel() {
    // Meta base (init + PageView) lo carga GTM en All Pages.
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

  function trackMeta(eventName, payload) {
    if (typeof fbq !== 'function') return;
    try {
      var p = payload || {};
      if (p.value != null) {
        fbq('track', eventName, { value: p.value, currency: p.currency || 'MXN' });
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

    grupoGrande: function (cantidad) {
      if (typeof gtag === 'function') {
        gtag('event', 'grupo_grande', { cantidad: cantidad });
      }
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
      var txId = transactionId || (orden && (orden.numeroOrden || orden.sessionId)) || '';
      if (!txId) return false;
      try {
        if (sessionStorage.getItem(purchaseKey(txId))) return false;
        sessionStorage.setItem(purchaseKey(txId), '1');
      } catch (_) {}

      var p = ecommercePayload(orden);
      p.transaction_id = txId;
      if (typeof gtag === 'function') gtag('event', 'purchase', p);
      trackMeta('Purchase', p);
      return true;
    },
  };

  var script = document.currentScript;
  var withMeta = script && script.getAttribute('data-meta') === '1';
  window.ElGorilaAnalytics.init({ meta: withMeta });
})();
