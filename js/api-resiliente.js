/**
 * Capa de resiliencia para taquilla y panel: reintentos, red caída, errores legibles.
 */
(function (global) {
  const DEFAULT_RETRIES = 3;
  const BASE_DELAY_MS = 600;

  function enLinea() {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function esReintentable(status, err) {
    if (err && (err.code === 'INTERCEPT' || err.name === 'AbortError' || err.code === 'TIMEOUT')) return false;
    if (!enLinea()) return true;
    if (err && (err.name === 'TypeError' || err.message === 'Failed to fetch')) return true;
    if (status === 429 || status === 502 || status === 503 || status === 504) return true;
    return false;
  }

  function mensajeError(err, res, data) {
    if (!enLinea()) {
      return 'Sin conexión a internet. Revisa Wi‑Fi o datos móviles e intenta de nuevo.';
    }
    if (data && data.error) return data.error;
    if (res && res.status === 401) return 'Sesión expirada. Vuelve a entrar a taquilla.';
    if (res && res.status === 409) return (data && data.error) || 'Sin cupo o conflicto de inventario.';
    if (res && res.status === 503) return 'Servidor ocupado. Espera unos segundos e intenta otra vez.';
    if (err && (err.name === 'AbortError' || err.code === 'TIMEOUT')) {
      return 'La conexión tardó demasiado. Prueba con datos móviles (sin Wi‑Fi) e intenta de nuevo.';
    }
    if (err && (err.name === 'TypeError' || err.message === 'Failed to fetch')) {
      return 'No se pudo contactar al servidor. Revisa la red e intenta de nuevo.';
    }
    return (err && err.message) || 'Error de conexión. Intenta de nuevo.';
  }

  async function fetchJson(url, opts, cfg) {
    const retries = cfg?.retries ?? DEFAULT_RETRIES;
    const idempotencyKey = cfg?.idempotencyKey;
    let lastErr = null;
    let lastRes = null;
    let lastData = null;

    for (let i = 0; i < retries; i++) {
      if (!enLinea()) {
        lastErr = new Error('offline');
        if (i < retries - 1) await esperar(BASE_DELAY_MS * (i + 1));
        continue;
      }
      try {
        const headers = { ...(opts.headers || {}) };
        if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
        const timeoutMs = cfg?.timeoutMs ?? 15000;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        let res;
        try {
          res = await fetch(url, { ...opts, headers, signal: opts.signal || ctrl.signal });
        } finally {
          clearTimeout(t);
        }
        lastRes = res;
        let data = null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          data = await res.json().catch(() => ({}));
        } else {
          const intercept = new Error('Tu red interceptó la conexión. Prueba con datos móviles e intenta de nuevo.');
          intercept.code = 'INTERCEPT';
          throw intercept;
        }
        lastData = data;
        if (res.ok) return { res, data };
        if (!esReintentable(res.status, null) || i === retries - 1) {
          const e = new Error(mensajeError(null, res, data));
          e.status = res.status;
          e.data = data;
          throw e;
        }
      } catch (err) {
        lastErr = err;
        if (err.code === 'INTERCEPT' || err.name === 'AbortError' || err.code === 'TIMEOUT') throw err;
        if (err.status && !esReintentable(err.status, err)) throw err;
        if (i === retries - 1) break;
      }
      await esperar(BASE_DELAY_MS * (i + 1));
    }

    if (lastErr && lastErr.status) throw lastErr;
    const e = new Error(mensajeError(lastErr, lastRes, lastData));
    e.status = lastRes?.status;
    e.data = lastData;
    throw e;
  }

  function crearIdempotencyKey() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  let bannerEl = null;
  let _monitorIniciado = false;

  function actualizarBannerRed() {
    if (!bannerEl) {
      bannerEl = document.getElementById('red-estado-banner');
    }
    if (!bannerEl) return;
    const ok = enLinea();
    bannerEl.classList.toggle('hidden', ok);
    bannerEl.dataset.estado = ok ? 'ok' : 'offline';
  }

  function iniciarMonitorRed() {
    if (_monitorIniciado) return;
    _monitorIniciado = true;
    actualizarBannerRed();
    window.addEventListener('online', actualizarBannerRed);
    window.addEventListener('offline', actualizarBannerRed);
    setInterval(actualizarBannerRed, 15000);
  }

  async function pingApi(baseUrl) {
    const url = (baseUrl || global.API_BASE || '').replace(/\/$/, '') + '/api/health';
    if (!url || url === '/api/health') return false;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  global.ElGorilaApi = {
    enLinea,
    fetchJson,
    mensajeError,
    crearIdempotencyKey,
    iniciarMonitorRed,
    pingApi,
  };
})(window);
