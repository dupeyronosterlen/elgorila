/**
 * Banner de invitación en boletos.html — descuento INVITADO25 solo al pulsar el botón.
 * Rastrea certificado origen (referidoDe) para conectar ventas referidas.
 */
(function () {
  const CUPON       = 'INVITADO25';
  const STORAGE_DE  = 'elgorila_invitacion_de';
  const STORAGE_OK  = 'elgorila_invitacion_cupon_activo';

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function entradasLabel(n) {
    const num = parseInt(n, 10) || 1;
    return num === 1 ? '1 entrada' : `${num} entradas`;
  }

  function guardarReferido(de) {
    if (!de) return;
    try { sessionStorage.setItem(STORAGE_DE, de.trim().toUpperCase()); } catch (_) {}
  }

  function referidoGuardado() {
    try { return sessionStorage.getItem(STORAGE_DE) || ''; } catch (_) { return ''; }
  }

  function marcarCuponActivo() {
    try { sessionStorage.setItem(STORAGE_OK, '1'); } catch (_) {}
  }

  function cuponYaActivo() {
    try { return sessionStorage.getItem(STORAGE_OK) === '1'; } catch (_) { return false; }
  }

  function limpiarUrlInvita() {
    const p = params();
    if (!p.has('invita')) return;
    p.delete('invita');
    p.delete('cupon');
    const q = p.toString();
    history.replaceState(null, '', 'boletos.html' + (q ? '?' + q : ''));
  }

  function bannerEl() {
    return document.getElementById('banner-invitacion');
  }

  function mostrarBanner(html) {
    const el = bannerEl();
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove('hidden');
  }

  function ocultarBanner() {
    const el = bannerEl();
    if (el) el.classList.add('hidden');
  }

  async function cargarInfo(de) {
    if (!window.API_BASE || !window.teatroApi) throw new Error('API no configurada.');
    const res = await fetch(window.teatroApi(`invitacion/${encodeURIComponent(de)}`));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Invitación no válida.');
    return data;
  }

  function htmlBanner(info, estado) {
    const ref = info.certificadoRef || '—';
    const fn  = info.funcionNombre || info.fecha || 'EL GORILA';
    const ent = entradasLabel(info.entradas);

    if (estado === 'activo') {
      return `
        <div class="invitacion-banner-inner activo">
          <p class="invitacion-kicker">Invitación personal</p>
          <h3 class="invitacion-titulo">Descuento de invitado activado</h3>
          <p class="invitacion-texto">
            Te invitaron desde el certificado <strong>${ref}</strong>
            (${fn}, ${ent}). Al pagar se aplicará <strong>−25%</strong>.
          </p>
        </div>`;
    }

    return `
      <div class="invitacion-banner-inner">
        <p class="invitacion-kicker">Invitación personal · no es un cupón público</p>
        <h3 class="invitacion-titulo">Alguien te invita a ver <em>EL GORILA</em></h3>
        <p class="invitacion-texto">
          Esta invitación proviene del certificado <strong>${ref}</strong>
          (${fn}, ${ent}). No aparece en buscadores ni se activa sola.
        </p>
        <button type="button" class="invitacion-btn-activar" id="btn-activar-invitacion">
          Activar descuento de invitado (−25%)
        </button>
        <p class="invitacion-nota">Solo al pulsar este botón. Luego elige fecha y boletos como siempre.</p>
      </div>`;
  }

  async function aplicarCuponInvitado() {
    const input = document.getElementById('ichk-cupon-input');
    if (input) input.value = CUPON;

    const ordenRaw = localStorage.getItem('orden_compra');
    if (!ordenRaw) return false;

    if (typeof window.aplicarCuponInline === 'function') {
      await window.aplicarCuponInline();
      return true;
    }
    return false;
  }

  function persistirReferidoEnOrden() {
    const de = referidoGuardado();
    if (!de) return;
    try {
      const raw = localStorage.getItem('orden_compra');
      if (!raw) return;
      const orden = JSON.parse(raw);
      orden.referidoDe = de;
      localStorage.setItem('orden_compra', JSON.stringify(orden));
    } catch (_) {}
  }

  async function activarDescuento(info) {
    const de = info.referidoDe || referidoGuardado();
    guardarReferido(de);
    marcarCuponActivo();

    const panel = document.getElementById('inline-checkout');
    const checkoutVisible = panel && panel.style.display !== 'none';

    if (checkoutVisible) {
      await aplicarCuponInvitado();
      persistirReferidoEnOrden();
    }

    mostrarBanner(htmlBanner(info, 'activo'));
  }

  function engancharCheckout() {
    const orig = window.mostrarCheckoutInline;
    if (typeof orig !== 'function' || orig._invitacionHook) return;

    window.mostrarCheckoutInline = function (orden) {
      orig(orden);
      if (cuponYaActivo()) {
        setTimeout(async function () {
          await aplicarCuponInvitado();
          persistirReferidoEnOrden();
        }, 80);
      }
    };
    window.mostrarCheckoutInline._invitacionHook = true;
  }

  async function init() {
    engancharCheckout();

    let de = params().get('invita') || params().get('de') || '';
    if (de) {
      guardarReferido(de);
      limpiarUrlInvita();
    } else {
      de = referidoGuardado();
    }

    if (!de) {
      ocultarBanner();
      return;
    }

    try {
      const info = await cargarInfo(de);
      guardarReferido(info.referidoDe || de);

      if (cuponYaActivo()) {
        mostrarBanner(htmlBanner(info, 'activo'));
        return;
      }

      mostrarBanner(htmlBanner(info, 'pendiente'));
      const btn = document.getElementById('btn-activar-invitacion');
      if (btn) {
        btn.addEventListener('click', async function () {
          btn.disabled = true;
          btn.textContent = 'Activando…';
          try {
            await activarDescuento(info);
          } catch (e) {
            alert(e.message || 'No se pudo activar el descuento.');
            btn.disabled = false;
            btn.textContent = 'Activar descuento de invitado (−25%)';
          }
        });
      }
    } catch (e) {
      mostrarBanner(`
        <div class="invitacion-banner-inner error">
          <p class="invitacion-kicker">Invitación</p>
          <p class="invitacion-texto">${e.message || 'Enlace de invitación no válido.'}</p>
          <a href="boletos.html" class="invitacion-link">Comprar boletos sin invitación</a>
        </div>`);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
