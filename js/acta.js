(function () {
  const DL_ICON = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  let token = '';
  let sessionData = null;
  let guardado = false;

  function $(id) { return document.getElementById(id); }

  function tokenFromUrl() {
    return (new URLSearchParams(window.location.search).get('t') || '').trim();
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function show(id) {
    ['estado-carga', 'estado-error', 'contenido-acta'].forEach(x => {
      const el = $(x);
      if (el) el.classList.toggle('hidden', x !== id);
    });
  }

  function leerActa() {
    return {
      libertad: ($('rev-libertad')?.value || '').trim(),
      jaulas:   ($('rev-jaulas')?.value || '').trim(),
      salidas:  ($('rev-salidas')?.value || '').trim(),
      actitud:  ($('rev-actitud')?.value || '').trim(),
    };
  }

  function pintarNombreEnFrente(nombre) {
    const el = $('campo-nombre-valor');
    if (el) el.textContent = (nombre || '').trim().toUpperCase();
  }

  function syncNombrePreview() {
    pintarNombreEnFrente($('input-mi-nombre')?.value || '');
  }

  async function apiGet() {
    const res = await fetch(window.teatroApi(`encuesta/${encodeURIComponent(token)}`));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Enlace no válido.');
    return data;
  }

  async function apiPost(body) {
    const res = await fetch(window.teatroApi(`encuesta/${encodeURIComponent(token)}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar.');
    return data;
  }

  async function guardarSiFalta() {
    if (guardado || !token) return sessionData;
    const acta = leerActa();
    const nombrePortador = ($('input-mi-nombre')?.value || '').trim();
    const nombreRegalo = ($('input-regalo-nombre')?.value || '').trim();
    if (!acta.libertad || !nombrePortador) return null;

    const data = await apiPost({ acta, nombrePortador, nombreRegalo });
    guardado = true;
    sessionData = { ...sessionData, completada: true, regalos: data.regalos || [] };
    mostrarRegaloLink(data.regalos || []);
    return data;
  }

  function mostrarRegaloLink(regalos) {
    const box = $('regalo-link-box');
    if (!box || !regalos.length) return;
    const r = regalos[0];
    box.classList.remove('hidden');
    box.innerHTML = `
      <p class="flujo-hint">También puedes invitar con descuento:</p>
      <a class="flujo-link" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.titulo)} · −${r.porcentaje}% →</a>`;
  }

  function restaurarPagina(el, savedTransform, savedPosition) {
    el.style.transform = savedTransform;
    el.style.position = savedPosition;
    if (typeof scale === 'function') scale();
  }

  function descargarPagina(btn, pageId, filename, antesCaptura) {
    if (typeof html2canvas === 'undefined') {
      alert('La librería de captura no cargó. Revisa tu conexión e intenta de nuevo.');
      return Promise.reject();
    }

    const labelText = btn.dataset.label || btn.textContent.trim();
    btn.classList.add('is-loading');
    btn.innerHTML = 'Generando…';

    const el = $(pageId);
    const savedTransform = el.style.transform;
    const savedPosition = el.style.position;

    if (typeof antesCaptura === 'function') antesCaptura();

    el.style.transform = 'none';
    el.style.position = 'static';

    return html2canvas(el, {
      width: 816,
      height: 1056,
      scale: 3,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    }).then(canvas => {
      restaurarPagina(el, savedTransform, savedPosition);
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Sin imagen')); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename + '.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          resolve();
        }, 'image/png');
      });
    }).catch(err => {
      console.error('html2canvas error:', err);
      restaurarPagina(el, savedTransform, savedPosition);
      throw err;
    }).finally(() => {
      btn.classList.remove('is-loading');
      btn.innerHTML = DL_ICON + ' ' + labelText;
    });
  }

  async function descargarMiActa(btn) {
    const acta = leerActa();
    const nombre = ($('input-mi-nombre')?.value || '').trim();
    if (!acta.libertad) {
      alert('Responde en el reverso: ¿qué es la libertad?');
      $('rev-libertad')?.focus();
      return;
    }
    if (!nombre) {
      alert('Escribe tu nombre para el acta.');
      $('input-mi-nombre')?.focus();
      return;
    }

    try {
      await guardarSiFalta();
      await descargarPagina(btn, 'page-frente', 'acta-gorila-' + slug(nombre), () => {
        pintarNombreEnFrente(nombre);
      });
    } catch (e) {
      alert(e.message || 'No se pudo generar el acta.');
    }
  }

  async function descargarActaRegalo(btn) {
    const acta = leerActa();
    const miNombre = ($('input-mi-nombre')?.value || '').trim();
    const regalo = ($('input-regalo-nombre')?.value || '').trim();
    if (!acta.libertad) {
      alert('Primero responde el cuestionario del reverso.');
      return;
    }
    if (!miNombre) {
      alert('Escribe tu nombre antes de regalar el acta.');
      $('input-mi-nombre')?.focus();
      return;
    }
    if (!regalo) {
      alert('Escribe el nombre de quien recibirá el acta.');
      $('input-regalo-nombre')?.focus();
      return;
    }

    try {
      await guardarSiFalta();
      await descargarPagina(btn, 'page-frente', 'acta-gorila-' + slug(regalo), () => {
        pintarNombreEnFrente(regalo);
      });
      syncNombrePreview();
    } catch (e) {
      alert(e.message || 'No se pudo generar el acta regalo.');
      syncNombrePreview();
    }
  }

  function slug(s) {
    return String(s || 'gorila').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gorila';
  }

  function rellenarDesdeSesion(data) {
    const kicker = $('kicker-funcion');
    if (kicker) kicker.textContent = data.funcionNombre || 'EL GORILA';

    const nombreInicial = data.nombre || (data.saludo ? data.saludo : '');
    const mi = $('input-mi-nombre');
    if (mi && nombreInicial && !mi.value) mi.value = nombreInicial;
    syncNombrePreview();

    const acta = data.acta;
    if (acta) {
      if ($('rev-libertad') && acta.libertad) $('rev-libertad').value = acta.libertad;
      if ($('rev-jaulas') && acta.jaulas) $('rev-jaulas').value = acta.jaulas;
      if ($('rev-salidas') && acta.salidas) $('rev-salidas').value = acta.salidas;
      if ($('rev-actitud') && acta.actitud) $('rev-actitud').value = acta.actitud;
    }

    if (data.completada) {
      guardado = true;
      if (data.regalos) mostrarRegaloLink(data.regalos);
    }
  }

  function bindUi() {
    $('input-mi-nombre')?.addEventListener('input', syncNombrePreview);

    $('btn-descargar-mia')?.addEventListener('click', e => {
      descargarMiActa(e.currentTarget);
    });

    $('btn-descargar-regalo')?.addEventListener('click', e => {
      descargarActaRegalo(e.currentTarget);
    });
  }

  async function init() {
    token = tokenFromUrl();
    bindUi();

    if (!token) {
      show('contenido-acta');
      return;
    }

    if (token.length < 32) {
      $('error-text').textContent = 'Abre el enlace desde el correo que te enviamos esta noche.';
      show('estado-error');
      return;
    }

    if (!window.API_BASE) {
      $('error-text').textContent = 'Servicio no disponible.';
      show('estado-error');
      return;
    }

    try {
      sessionData = await apiGet();
      show('contenido-acta');
      rellenarDesdeSesion(sessionData);
    } catch (e) {
      $('error-text').textContent = e.message || 'Este enlace no está disponible.';
      show('estado-error');
    }
  }

  window.descargarEstatico = function descargarEstatico(btn, pageId, filename) {
    descargarPagina(btn, pageId, filename).catch(() => {
      alert('No se pudo descargar. Intenta de nuevo.');
    });
  };

  document.addEventListener('DOMContentLoaded', init);
})();
