/**
 * Landing TOFU (sobre-la-obra): video diferido, CTAs, scroll %, sync temporada.
 *
 * Eventos dataLayer (GA4 vía GTM):
 *   visit | tofu_cta_click | cta_comprar_click | tofu_scroll
 *   tofu_video_start | tofu_video_50 | tofu_video_complete
 * CTA: data-cta-position en el HTML (hero | medio | final | nav | …).
 */
(function () {
  'use strict';

  var LANDING_EVENTS_KEY = 'elgorila_landing_events';
  var MAX_EVENTS = 500;
  var SCROLL_MARKS = [25, 50, 75, 90];

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
          eg_page_type: a.page_type || 'sobre_obra',
        };
      }
      if (typeof window.obtenerUTM === 'function') {
        var u = window.obtenerUTM() || {};
        return {
          eg_campaign: u.campaign || '',
          eg_ad: u.content || '',
          eg_adset: u.term || '',
          eg_source: u.source || '',
          eg_medium: u.medium || '',
          eg_page_type: 'sobre_obra',
        };
      }
    } catch (_) {}
    return { eg_page_type: 'sobre_obra' };
  }

  function pushEvent(type, data) {
    try {
      var payload = data || {};
      var raw = localStorage.getItem(LANDING_EVENTS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      list.push({ t: Date.now(), type: type, page: 'sobre-la-obra', data: payload });
      if (list.length > MAX_EVENTS) list = list.slice(-MAX_EVENTS);
      localStorage.setItem(LANDING_EVENTS_KEY, JSON.stringify(list));
      if (typeof window.egSinAnalytics === 'function' && window.egSinAnalytics()) return;
      window.dataLayer = window.dataLayer || [];
      var flat = Object.assign({ event: type, landing_data: payload }, atribExtras(), payload);
      flat.event = type;
      window.dataLayer.push(flat);
    } catch (_) {}
  }

  /** Normaliza data-cta-position → bucket hero|medio|final|otros */
  function ctaBucket(pos) {
    pos = String(pos || '').toLowerCase();
    if (pos === 'hero' || pos === 'hero-primary' || pos.indexOf('hero') === 0) return 'hero';
    if (pos === 'medio' || pos === 'reviews-mid' || pos === 'mid' || pos === 'promo') return 'medio';
    if (pos === 'final' || pos === 'cta-final') return 'final';
    if (pos === 'nav' || pos === 'sticky-bar' || pos === 'footer' || pos === 'lib-ficha') return pos;
    return pos || 'unknown';
  }

  function utmQueryString() {
    try {
      if (!window.obtenerUTM) return '';
      var u = window.obtenerUTM() || {};
      var parts = [];
      ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) {
        if (u[k]) parts.push('utm_' + k + '=' + encodeURIComponent(String(u[k]).substring(0, 200)));
      });
      return parts.length ? parts.join('&') : '';
    } catch (_) {
      return '';
    }
  }

  function hrefBoletos() {
    var base = typeof window.rutaAbsoluta === 'function'
      ? window.rutaAbsoluta('/boletos.html#fechas-fecha-wrap')
      : '/boletos.html#fechas-fecha-wrap';
    var qs = utmQueryString();
    if (!qs) return base;

    var hashIdx = base.indexOf('#');
    var hash = hashIdx !== -1 ? base.slice(hashIdx) : '';
    var pathPart = hashIdx !== -1 ? base.slice(0, hashIdx) : base;
    var qIdx = pathPart.indexOf('?');
    if (qIdx !== -1) {
      return pathPart.slice(0, qIdx + 1) + pathPart.slice(qIdx + 1) + '&' + qs + hash;
    }
    return pathPart + '?' + qs + hash;
  }

  function wireLinks() {
    document.querySelectorAll('.link-venta-boletos').forEach(function (a) {
      a.href = hrefBoletos();
      if (a.dataset.tofuWired) return;
      a.dataset.tofuWired = '1';
      a.addEventListener('click', function () {
        var pos = a.getAttribute('data-cta-position') || 'unknown';
        var bucket = ctaBucket(pos);
        var meta = {
          position: pos,
          cta_bucket: bucket,
          href: a.href || '',
          source: 'sobre-la-obra',
        };
        pushEvent('tofu_cta_click', meta);
        pushEvent('cta_tofu_click', meta);
        pushEvent('cta_comprar_click', meta);
        if (bucket === 'hero') pushEvent('tofu_cta_hero', meta);
        else if (bucket === 'medio') pushEvent('tofu_cta_medio', meta);
        else if (bucket === 'final') pushEvent('tofu_cta_final', meta);
        a.classList.add('is-navigating');
      }, false);
    });
  }

  function initScrollDepth() {
    var fired = {};
    var ticking = false;

    function measure() {
      ticking = false;
      var doc = document.documentElement;
      var body = document.body;
      var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
      var docHeight = Math.max(
        body.scrollHeight, doc.scrollHeight,
        body.offsetHeight, doc.offsetHeight,
        body.clientHeight, doc.clientHeight
      );
      var winH = window.innerHeight || doc.clientHeight || 0;
      var trackable = docHeight - winH;
      if (trackable <= 0) return;
      var pct = Math.min(100, Math.round((scrollTop / trackable) * 100));
      SCROLL_MARKS.forEach(function (mark) {
        if (pct >= mark && !fired[mark]) {
          fired[mark] = true;
          pushEvent('tofu_scroll', { percent: mark, page: 'sobre-la-obra' });
          pushEvent('tofu_scroll_' + mark, { page: 'sobre-la-obra' });
        }
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    measure();
  }

  function pickVideoCandidates() {
    var mobile = window.matchMedia('(max-width: 767px)').matches;
    if (mobile) {
      return ['video/tofu-hero-mobile.mp4'];
    }
    return ['video/tofu-hero-desktop.mp4', 'video/tofu-hero-desktop-lite.mp4'];
  }

  function resolveVideoSrc(candidates, idx, cb) {
    if (idx >= candidates.length) {
      cb(null);
      return;
    }
    var url = candidates[idx];
    var probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    probe.playsInline = true;
    function cleanup() {
      probe.removeAttribute('src');
      probe.load();
    }
    probe.addEventListener('loadedmetadata', function () {
      cleanup();
      cb(url);
    }, { once: true });
    probe.addEventListener('error', function () {
      cleanup();
      resolveVideoSrc(candidates, idx + 1, cb);
    }, { once: true });
    probe.src = url;
  }

  function initHeroVideo() {
    var video = document.getElementById('hero-video');
    var media = document.querySelector('.hero-media');
    if (!video) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (media) media.classList.add('poster-only');
      video.remove();
      return;
    }

    function onPlaying() {
      if (media) media.classList.add('is-playing');
      pushEvent('tofu_video_start', { page: 'sobre-la-obra' });
    }

    function start(src) {
      if (!src) {
        if (media) media.classList.add('poster-only');
        video.remove();
        return;
      }
      if (media) media.classList.add('video-armed');
      video.muted = true;
      video.autoplay = true;
      video.setAttribute('autoplay', '');
      video.playsInline = true;
      video.setAttribute('webkit-playsinline', '');
      video.src = src;
      video.load();
      video.addEventListener('playing', onPlaying, { once: true });

      var hit50 = false;
      video.addEventListener('timeupdate', function () {
        if (!video.duration || !isFinite(video.duration)) return;
        var p = video.currentTime / video.duration;
        if (!hit50 && p >= 0.5) {
          hit50 = true;
          pushEvent('tofu_video_50', { page: 'sobre-la-obra' });
        }
      });
      video.addEventListener('ended', function () {
        pushEvent('tofu_video_complete', { page: 'sobre-la-obra' });
      }, { once: true });

      var play = function () {
        video.play().catch(function () {
          if (media) {
            media.classList.remove('video-armed', 'is-playing');
            media.classList.add('poster-only');
          }
          video.remove();
        });
      };
      if (video.readyState >= 2) play();
      else video.addEventListener('canplay', play, { once: true });
    }

    resolveVideoSrc(pickVideoCandidates(), 0, start);
  }

  function refreshCountdown() {
    var FM = window.FechasManager;
    if (!FM || typeof FM.etiquetaCountdownProxima !== 'function') return;
    var txt = FM.etiquetaCountdownProxima();
    document.querySelectorAll('[data-countdown-proxima]').forEach(function (el) {
      if (txt) {
        el.textContent = txt;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
  }

  function syncSiteHeaderOffset() {
    var header = document.getElementById('site-header');
    if (!header) return;
    var h = header.offsetHeight;
    document.documentElement.style.setProperty('--site-header-height', h + 'px');
  }

  function aplicarEscasezAsientos(disponibles) {
    document.querySelectorAll('[data-escasez-asientos]').forEach(function (el) {
      if (!disponibles || disponibles <= 0) {
        el.hidden = true;
        el.textContent = '';
        return;
      }
      if (disponibles <= 80) {
        el.textContent = 'Quedan ' + disponibles + ' lugares para la próxima función';
        el.hidden = false;
      } else if (disponibles <= 150) {
        el.textContent = 'Alta demanda — lugares limitados para el próximo sábado';
        el.hidden = false;
      } else {
        el.hidden = true;
        el.textContent = '';
      }
    });
    syncSiteHeaderOffset();
  }

  var DISP_CACHE_KEY = 'eg_tofu_disp';
  var DISP_CACHE_TTL = 90000;

  function fetchDisponibilidadProxima() {
    var FM = window.FechasManager;
    if (!FM || typeof FM.proximaFuncion !== 'function') return;
    var p = FM.proximaFuncion();
    if (!p || !p.fecha_iso || typeof window.teatroApi !== 'function') return;

    try {
      var raw = sessionStorage.getItem(DISP_CACHE_KEY);
      if (raw) {
        var cached = JSON.parse(raw);
        if (cached && cached.fecha === p.fecha_iso && Date.now() - cached.t < DISP_CACHE_TTL) {
          aplicarEscasezAsientos(cached.n);
          return;
        }
      }
    } catch (_) {}

    fetch(window.teatroApi('disponibilidad?fecha=' + encodeURIComponent(p.fecha_iso)))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;
        var n = data.disponibles_total != null ? data.disponibles_total : data.disponibles;
        if (typeof n === 'number') {
          aplicarEscasezAsientos(n);
          try {
            sessionStorage.setItem(DISP_CACHE_KEY, JSON.stringify({ t: Date.now(), fecha: p.fecha_iso, n: n }));
          } catch (_) {}
        }
      })
      .catch(function () {});
  }

  function boot() {
    wireLinks();
    initScrollDepth();
    syncSiteHeaderOffset();
    window.addEventListener('resize', syncSiteHeaderOffset, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      var header = document.getElementById('site-header');
      if (header) {
        new ResizeObserver(syncSiteHeaderOffset).observe(header);
      }
    }
    var utm = {};
    try {
      if (window.obtenerUTM) utm = window.obtenerUTM() || {};
    } catch (_) {}
    pushEvent('visit', {
      ua: navigator.userAgent.substring(0, 80),
      w: window.innerWidth,
      page: 'sobre-la-obra',
      utm_campaign: utm.campaign || '',
      utm_content: utm.content || '',
      utm_term: utm.term || '',
    });
    pushEvent('tofu_landing', {
      page: 'sobre-la-obra',
      utm_campaign: utm.campaign || '',
      utm_content: utm.content || '',
      utm_term: utm.term || '',
    });
    refreshCountdown();
    setInterval(refreshCountdown, 60000);
    initHeroVideo();

    var sync = window.sincronizarFuncionesActivas;
    if (typeof sync === 'function') {
      sync().then(function () {
        if (window.aplicarCopyTemporada) window.aplicarCopyTemporada();
        refreshCountdown();
        syncSiteHeaderOffset();
        wireLinks();
        fetchDisponibilidadProxima();
      });
    } else {
      fetchDisponibilidadProxima();
    }

    window.addEventListener('temporada:sincronizada', function () {
      refreshCountdown();
      syncSiteHeaderOffset();
      wireLinks();
      fetchDisponibilidadProxima();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
