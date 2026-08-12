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
 *   purchase SOLO en confirmacion.html (QR). Dedup por transaction_id en
 *   localStorage: sessionStorage se vaciaba al cerrar la pestaña, así que
 *   reabrir el enlace de confirmación volvía a disparar Purchase.
 */
(function () {
  window.dataLayer = window.dataLayer || [];

  // Sin medición: eg-sin-analytics.js (local, Cursor, opt-out equipo) o fallback.
  function sinMedicion() {
    if (typeof window.egSinAnalytics === 'function') return window.egSinAnalytics();
    if (window._egNoAnalytics === true) return true;
    var h = location.hostname;
    return location.protocol === 'file:' || !h || h === 'localhost' || h === '127.0.0.1' ||
           h.slice(-6) === '.local';
  }
  var NO_TRACK = sinMedicion();

  // Página que declara `data-viewcontent="<nombre>"` en el <script> dispara
  // ViewContent / view_item al cargar. Necesario para optimizar campañas de
  // prospección a "Ver contenido": sin esto el evento nunca existe.
  var _egScript = document.currentScript;
  var _egViewContent = _egScript && _egScript.getAttribute('data-viewcontent');

  function atribucionActual() {
    if (typeof window.obtenerAtribucion === 'function') {
      try { return window.obtenerAtribucion() || {}; } catch (e) { /* ignore */ }
    }
    if (typeof window.obtenerUTM === 'function') {
      try {
        var u = window.obtenerUTM() || {};
        return {
          source: u.source || '', medium: u.medium || '', campaign: u.campaign || '',
          content: u.content || '', term: u.term || '',
        };
      } catch (e) { /* ignore */ }
    }
    return {};
  }

  function atribucionFields() {
    var a = atribucionActual();
    return {
      eg_source: a.source || '',
      eg_medium: a.medium || '',
      eg_campaign: a.campaign || '',
      eg_ad: a.content || '',
      eg_adset: a.term || '',
      eg_touch: a.touch || '',
      eg_page_type: a.page_type || '',
      eg_production: a.production || 'el-gorila',
      eg_venue: a.venue || 'wilberto',
      eg_market: a.market || 'cdmx',
    };
  }

  // Empuja un evento de ecommerce al dataLayer para que lo recoja GTM.
  // Limpia `ecommerce` antes (evita que items de un push previo se mezclen).
  // Siempre adjunta eg_* para que GA4 no pierda el ad/adset aunque el page_view
  // haya llegado sin UTM en la URL (atribución last-touch desde localStorage).
  function pushEcommerce(eventName, ecommerce, extra) {
    if (NO_TRACK) return;
    window.dataLayer.push({ ecommerce: null });
    var payload = Object.assign({ event: eventName }, atribucionFields(), extra || {});
    if (ecommerce) payload.ecommerce = ecommerce;
    window.dataLayer.push(payload);
  }

  function fechaOrden(orden) {
    if (!orden) return '';
    if (orden.fechaIso && /^\d{4}-\d{2}-\d{2}$/.test(String(orden.fechaIso))) return String(orden.fechaIso);
    if (orden.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(orden.fecha))) return String(orden.fecha);
    return '';
  }

  function mapItems(orden) {
    if (!orden || !Array.isArray(orden.items)) return [];
    var fecha = fechaOrden(orden);
    return orden.items.map(function (i) {
      var precio = i.precio;
      if (precio == null) {
        precio = i.tipo === 'general'
          ? (typeof window.precioGeneralVigente === 'function' ? window.precioGeneralVigente() : 400)
          : (window.PRECIO_CREDENCIAL || 280);
      }
      var tipo = i.tipo || 'general';
      var catalogId = fecha ? ('gorila-' + fecha) : tipo;
      return {
        item_id: catalogId,
        item_name: 'El Gorila — ' + tipo.charAt(0).toUpperCase() + tipo.slice(1),
        item_category: 'teatro',
        item_category2: 'el-gorila',
        item_variant: tipo,
        item_list_name: fecha || undefined,
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

  function funcionExtra(orden) {
    var fecha = fechaOrden(orden);
    return fecha ? { eg_funcion_fecha: fecha } : {};
  }

  function purchaseEventId(orden, transactionId) {
    if (orden && orden.sessionId) return 'purchase_' + String(orden.sessionId);
    var txId = transactionId || (orden && (orden.numeroOrden || orden.certificado)) || '';
    if (!txId) return '';
    return 'purchase_' + String(txId).replace(/[^a-zA-Z0-9_-]/g, '');
  }

  // ID de catálogo Actividades Meta — debe coincidir EXACTO con columna `id` del feed CSV.
  function catalogContentId(fechaIso) {
    if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaIso))) return null;
    return 'gorila-' + String(fechaIso);
  }

  function ticketQuantity(orden) {
    if (!orden) return 1;
    if (orden.cantidadTotal != null && orden.cantidadTotal > 0) return orden.cantidadTotal;
    if (!Array.isArray(orden.items)) return 1;
    var n = orden.items.reduce(function (s, i) { return s + (Number(i.cantidad) || 0); }, 0);
    return n > 0 ? n : 1;
  }

  function metaCatalogParams(ordenOrFechaIso) {
    var fechaIso = typeof ordenOrFechaIso === 'string'
      ? ordenOrFechaIso
      : (ordenOrFechaIso && ordenOrFechaIso.fechaIso);
    if (!fechaIso && ordenOrFechaIso && ordenOrFechaIso.fecha
        && /^\d{4}-\d{2}-\d{2}$/.test(String(ordenOrFechaIso.fecha))) {
      fechaIso = ordenOrFechaIso.fecha;
    }
    var id = catalogContentId(fechaIso);
    if (!id) return {};
    var qty = typeof ordenOrFechaIso === 'string' ? 1 : ticketQuantity(ordenOrFechaIso);
    return {
      content_type: 'product',
      content_ids: [id],
      contents: [{ id: id, quantity: qty }],
    };
  }

  function catalogContentIds(ids) {
    if (!Array.isArray(ids)) return [];
    return ids.filter(function (id) {
      return typeof id === 'string' && /^gorila-\d{4}-\d{2}-\d{2}$/.test(id);
    });
  }

  // Pixel ID canónico (mismo que GTM Tag 1 / Zaraz). Z1: Zaraz = PageView.
  // Si Tag 1 está pausado, HAY que cargar fbevents.js nosotros. Ojo: Zaraz a
  // veces deja un `fbq` wrapper que NO es el pixel oficial — no confiar en
  // `typeof fbq === 'function'` solo; forzar script oficial + init (sin PageView).
  var META_PIXEL_ID = '24471801772518505';
  var _egMetaReady = false;

  function ensureMetaPixel() {
    try {
      var f = window;
      var b = document;
      var hasOfficial = !!b.querySelector('script[src*="connect.facebook.net"][src*="fbevents"]');
      if (!f.fbq || !hasOfficial) {
        var n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = '2.0';
        n.queue = n.queue || [];
        if (!hasOfficial) {
          var t = b.createElement('script');
          t.async = !0;
          t.src = 'https://connect.facebook.net/en_US/fbevents.js';
          var s = b.getElementsByTagName('script')[0];
          if (s && s.parentNode) s.parentNode.insertBefore(t, s);
          else (b.head || b.documentElement).appendChild(t);
        }
      }
      // init es idempotente para el mismo pixel id; necesario tras Z1.
      fbq('init', META_PIXEL_ID);
      _egMetaReady = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  // Reintentos si el script oficial aún no cargó (carrera async).
  // 2026-08-06: VC se perdía ~97% por carrera GTM.
  // 2026-08-12: Z1 pausó Tag 1; Zaraz no sirve VC → self-init aquí.
  function fireMetaPixel(eventName, params, eventId) {
    ensureMetaPixel();
    if (typeof fbq !== 'function') return false;
    try {
      if (eventId) {
        fbq('track', eventName, params, { eventID: eventId });
      } else if (params && Object.keys(params).length) {
        fbq('track', eventName, params);
      } else {
        fbq('track', eventName);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // Devuelve una promesa (se resuelve en cuanto el pixel dispara, o tras
  // agotar reintentos) para que llamadas críticas como beginCheckout puedan
  // esperar un poco antes de dejar navegar la página — sin esto, un
  // fetch()+redirect rápido a Stripe puede ganarle la carrera al primer
  // reintento de 250ms y el evento se pierde en silencio (fix 2026-08-07,
  // encontrado al ver más Purchase que InitiateCheckout en AS-P2).
  function trackMeta(eventName, payload, eventId) {
    if (NO_TRACK) return Promise.resolve(false);
    var p = payload || {};
    var params = {};
    if (p.value != null) {
      params.value = p.value;
      params.currency = p.currency || 'MXN';
    }
    if (p.content_type) params.content_type = p.content_type;
    if (p.content_ids && p.content_ids.length) params.content_ids = p.content_ids;
    if (p.contents && p.contents.length) params.contents = p.contents;
    if (p.content_name) params.content_name = p.content_name;

    if (fireMetaPixel(eventName, params, eventId)) return Promise.resolve(true);

    return new Promise(function (resolve) {
      var attempts = 0;
      var timer = setInterval(function () {
        attempts += 1;
        var ok = fireMetaPixel(eventName, params, eventId);
        if (ok || attempts >= 24) {
          clearInterval(timer);
          resolve(ok);
        }
      }, 250);
    });
  }

  // Espera como máximo `maxMs` a que `promise` resuelva; si no, sigue de
  // largo (nunca debe retrasar una compra real por un problema de tracking).
  function waitBriefly(promise, maxMs) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(); } };
      promise.then(finish, finish);
      setTimeout(finish, maxMs);
    });
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
    catalogContentId: catalogContentId,

    grupoGrande: function (cantidad) {
      if (NO_TRACK) return;
      window.dataLayer.push({ ecommerce: null });
      window.dataLayer.push(Object.assign({ event: 'grupo_grande', cantidad: cantidad }, atribucionFields()));
    },

    viewContent: function (opts) {
      opts = opts || {};
      var ids = catalogContentIds(opts.content_ids || []);
      var contentName = opts.content_name || 'landing';
      pushEcommerce('view_item', {
        items: ids.length
          ? ids.map(function (id) {
              return {
                item_id: id,
                item_name: 'El Gorila — ' + contentName,
                item_category: 'teatro',
                item_category2: 'el-gorila',
                item_variant: contentName,
              };
            })
          : [{
              item_id: contentName,
              item_name: 'El Gorila — ' + contentName,
              item_category: 'teatro',
              item_category2: 'el-gorila',
              item_variant: contentName,
            }],
      }, { eg_content_name: contentName });
      var meta = { content_name: contentName };
      if (ids.length) {
        meta.content_type = 'product';
        meta.content_ids = ids;
        meta.contents = [{ id: ids[0], quantity: 1 }];
      }
      trackMeta('ViewContent', meta);
    },

    addToCart: function (orden) {
      var p = ecommercePayload(orden);
      pushEcommerce('add_to_cart', p, funcionExtra(orden));
      var cat = metaCatalogParams(orden);
      trackMeta('AddToCart', Object.assign({ value: p.value, currency: p.currency }, cat));
    },

    // Devuelve una promesa: el caller (boletos.html) debe hacer `await` antes
    // de redirigir a Stripe, para darle al pixel una ventana real de disparo.
    beginCheckout: function (orden) {
      var p = ecommercePayload(orden);
      pushEcommerce('begin_checkout', p, funcionExtra(orden));
      var cat = metaCatalogParams(orden);
      return waitBriefly(
        trackMeta('InitiateCheckout', Object.assign({ value: p.value, currency: p.currency }, cat)),
        400
      );
    },

    addPaymentInfo: function (orden) {
      var p = ecommercePayload(orden);
      pushEcommerce('add_payment_info', p, funcionExtra(orden));
      var cat = metaCatalogParams(orden);
      trackMeta('AddPaymentInfo', Object.assign({ value: p.value, currency: p.currency }, cat));
    },

    purchase: function (orden, transactionId) {
      var txId = transactionId || (orden && (orden.numeroOrden || orden.sessionId || orden.certificado)) || '';
      var eventId = purchaseEventId(orden, txId);
      if (!txId && !eventId) return false;
      var storageKey = purchaseKey(eventId || txId);
      try {
        if (localStorage.getItem(storageKey)) return false;
      } catch (_) {}
      try {
        if (sessionStorage.getItem(storageKey)) return false;
      } catch (_) {}

      var p = ecommercePayload(orden);
      p.transaction_id = txId;

      function markSent() {
        try { localStorage.setItem(storageKey, '1'); } catch (_) {}
        try { sessionStorage.setItem(storageKey, '1'); } catch (_) {}
      }

      // 1) GA4 + Google Ads vía GTM (dataLayer) — exactamente una vez.
      pushEcommerce('purchase', p, funcionExtra(orden));
      markSent();

      // 2) Meta Pixel directo (fbq) con reintento SOLO para fbq (GTM lo carga async).
      function sendMeta() {
        if (NO_TRACK) return true;
        if (typeof fbq !== 'function') return false;
        try {
          var cat = metaCatalogParams(orden);
          var params = Object.assign(
            { value: p.value, currency: p.currency || 'MXN' },
            cat
          );
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
      // TOFU / landing genérica: sin content_ids (no hay ítem de catálogo aún).
      window.ElGorilaAnalytics.viewContent({
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
