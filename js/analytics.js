/**
 * Analytics centralizado — GA4 + Google Ads + Meta Pixel.
 * Cargar en <head> (antes de main.js / confirmacion.js) en páginas del funnel.
 */
(function () {
  var GA4_ID = 'G-NXF8093MDJ';
  var AW_ID = 'AW-17961021514';
  var FB_PIXEL_ID = '24471801772518505';

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
    if (window._egFBInit || typeof window.fbq === 'function') {
      window._egFBInit = true;
      return;
    }
    window._egFBInit = true;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', FB_PIXEL_ID);
    fbq('track', 'PageView');
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
