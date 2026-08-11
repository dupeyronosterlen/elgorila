/**
 * Landing TOFU (sobre-la-obra): video diferido, tracking de CTAs, sync temporada.
 */
(function () {
  'use strict';

  var LANDING_EVENTS_KEY = 'elgorila_landing_events';
  var MAX_EVENTS = 500;

  function pushEvent(type, data) {
    try {
      var payload = data || {};
      var raw = localStorage.getItem(LANDING_EVENTS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      list.push({ t: Date.now(), type: type, page: 'sobre-la-obra', data: payload });
      if (list.length > MAX_EVENTS) list = list.slice(-MAX_EVENTS);
      localStorage.setItem(LANDING_EVENTS_KEY, JSON.stringify(list));
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: type, landing_data: payload });
    } catch (_) {}
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
        pushEvent('cta_tofu_click', { position: pos, href: a.href || '' });
        pushEvent('cta_comprar_click', { position: pos, href: a.href || '', source: 'sobre-la-obra' });
        a.classList.add('is-navigating');
      }, false);
    });
  }

  function pickVideoCandidates() {
    var mobile = window.matchMedia('(max-width: 767px)').matches;
    if (mobile) {
      return ['video/tofu-hero-mobile-lite.mp4', 'video/tofu-hero-mobile.mp4'];
    }
    return ['video/tofu-hero-desktop-lite.mp4', 'video/tofu-hero-desktop.mp4'];
  }

  function resolveVideoSrc(candidates, idx, cb) {
    if (idx >= candidates.length) {
      cb(null);
      return;
    }
    var url = candidates[idx];
    fetch(url, { method: 'HEAD', cache: 'force-cache' })
      .then(function (res) {
        if (res.ok) cb(url);
        else resolveVideoSrc(candidates, idx + 1, cb);
      })
      .catch(function () {
        resolveVideoSrc(candidates, idx + 1, cb);
      });
  }

  function initHeroVideo() {
    var video = document.getElementById('hero-video');
    var media = document.querySelector('.hero-media');
    if (!video) return;

    function start(src) {
      if (!src) {
        if (media) media.classList.add('poster-only');
        video.remove();
        return;
      }
      video.muted = true;
      video.autoplay = true;
      video.setAttribute('autoplay', '');
      video.src = src;
      video.load();
      var onPlay = function () {
        if (media) media.classList.add('is-playing');
      };
      var play = function () {
        video.play().then(onPlay).catch(function () {});
      };
      if (video.readyState >= 2) play();
      else video.addEventListener('canplay', play, { once: true });
    }

    function deferLoad() {
      resolveVideoSrc(pickVideoCandidates(), 0, start);
    }

    if ('requestIdleCallback' in window) {
      requestIdleCallback(deferLoad, { timeout: 3000 });
    } else {
      window.addEventListener('load', function () {
        setTimeout(deferLoad, 500);
      }, { once: true });
    }
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
