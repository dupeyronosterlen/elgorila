/** Acceso a boletera solo con pase firmado (admin o enlace por correo). */
(function (global) {
  const STORAGE = 'elgorila_boletera_pase';
  const SESION = 'elgorila_boletera_sesion';

  function apiBase() {
    return window.API_BASE || document.querySelector('meta[name="api-base"]')?.content || '';
  }

  function getToken() {
    return sessionStorage.getItem(STORAGE) || null;
  }

  function getSesion() {
    try {
      return JSON.parse(sessionStorage.getItem(SESION) || 'null');
    } catch { return null; }
  }

  function guardar(pase, data) {
    sessionStorage.setItem(STORAGE, pase);
    sessionStorage.setItem(SESION, JSON.stringify({
      usuario: data.usuario,
      nombre: data.nombre || data.usuario,
      rol: data.rol,
      exp: data.exp,
    }));
  }

  function limpiar() {
    sessionStorage.removeItem(STORAGE);
    sessionStorage.removeItem(SESION);
  }

  async function validarPase(pase) {
    const base = apiBase();
    if (!base || !pase) return { ok: false, error: 'Enlace inválido.' };
    const res = await fetch(`${base}/api/admin/acceso/validar?token=${encodeURIComponent(pase)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Pase no válido o expirado.' };
    return { ok: true, data };
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const paseUrl = params.get('pase');
    if (paseUrl) {
      const r = await validarPase(paseUrl);
      if (r.ok) {
        guardar(paseUrl, r.data);
        params.delete('pase');
        params.set('acceso', paseUrl);
        params.set('view', 'boletera');
        window.location.replace(`admin.html?${params.toString()}`);
        return { ok: false, error: 'Redirigiendo al panel…' };
      } else {
        return { ok: false, error: r.error };
      }
    }

    const token = getToken();
    if (!token) return { ok: false, error: 'Acceso restringido.' };

    const r = await validarPase(token);
    if (!r.ok) {
      limpiar();
      return { ok: false, error: r.error };
    }
    guardar(token, r.data);
    return { ok: true, sesion: getSesion() };
  }

  global.BoleteraGate = { getToken, getSesion, limpiar, init, validarPase };
})(window);
