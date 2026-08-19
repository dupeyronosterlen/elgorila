(function () {
  const DL_ICON = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const PRINT_ICON = '<svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';

  let token = '';
  let sessionData = null;
  let guardado = false;
  let folioActual = 'ACTA —····';

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

  function folioDesde(tokenStr, nombre) {
    const base = (tokenStr || nombre || 'gorila').toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let h = 0;
    for (let i = 0; i < base.length; i++) h = ((h << 5) - h + base.charCodeAt(i)) | 0;
    const n = Math.abs(h % 900000) + 100000;
    return 'ACTA —' + String(n);
  }

  function formatearFecha(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    try {
      return dt.toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch {
      return iso.slice(0, 10);
    }
  }

  function pintarFolio(folio) {
    folioActual = folio || folioActual;
    const a = $('campo-folio');
    const b = $('rev-footer-folio');
    if (a) a.textContent = folioActual;
    if (b) b.textContent = folioActual;
  }

  function pintarMeta(data) {
    const fechaTxt = formatearFecha(data?.fecha);
    const fn = (data?.funcionNombre || '').trim();
    const titulo = $('meta-fecha-titulo');
    const detalle = $('meta-funcion-detalle');
    if (titulo) {
      titulo.textContent = fechaTxt
        ? ('Fecha de ingreso a la especie · ' + fechaTxt)
        : 'Fecha de ingreso a la especie · esta noche';
    }
    if (detalle) {
      const partes = ['Teatro Wilberto Cantón', 'CDMX', 'sesión de la Academia'];
      if (fn) partes.unshift(fn);
      detalle.textContent = partes.join(' · ');
    }
  }

  function pintarNombreEnFrente(nombre) {
    const el = $('campo-nombre-valor');
    const rev = $('rev-portador-nombre');
    const sub = $('campo-nombre-sub');
    const n = (nombre || '').trim();
    if (el) {
      if (n) {
        el.textContent = n.toUpperCase();
        el.classList.remove('campo-valor--placeholder');
      } else {
        el.textContent = 'NOMBRE';
        el.classList.add('campo-valor--placeholder');
      }
    }
    if (rev) rev.textContent = n ? n.toUpperCase() : '—';
    if (sub) {
      sub.textContent = n
        ? 'Conforme al boleto · registro de taquilla'
        : 'Nombre del comprador · registro de taquilla';
    }
  }

  function syncNombrePreview() {
    const nombre = $('input-mi-nombre')?.value || '';
    pintarNombreEnFrente(nombre);
    if (token || nombre) pintarFolio(folioDesde(token || 'demo', nombre));
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
    el.classList.remove('is-capturing');
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
    const icon = btn.id === 'btn-imprimir' ? PRINT_ICON : DL_ICON;
    btn.classList.add('is-loading');
    btn.innerHTML = 'Generando…';

    const el = $(pageId);
    const savedTransform = el.style.transform;
    const savedPosition = el.style.position;

    if (typeof antesCaptura === 'function') antesCaptura();

    el.classList.add('is-capturing');
    el.style.transform = 'none';
    el.style.position = 'static';

    return html2canvas(el, {
      width: 816,
      height: 1056,
      scale: 2,
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
      btn.innerHTML = icon + ' ' + labelText;
    });
  }

  function exigirNombreYLibertad() {
    const acta = leerActa();
    const nombre = ($('input-mi-nombre')?.value || '').trim();
    if (!acta.libertad) {
      alert('Complete el anexo: ¿qué es la libertad?');
      $('rev-libertad')?.focus();
      return null;
    }
    if (!nombre) {
      alert('Falta el nombre conforme a su boleto.');
      $('input-mi-nombre')?.focus();
      return null;
    }
    return nombre;
  }

  async function descargarMiActa(btn) {
    const nombre = exigirNombreYLibertad();
    if (!nombre) return;

    try {
      await guardarSiFalta();
      await descargarPagina(btn, 'page-frente', 'acta-gorila-' + slug(nombre), () => {
        pintarNombreEnFrente(nombre);
        pintarFolio(folioDesde(token || nombre, nombre));
      });
    } catch (e) {
      alert(e.message || 'No se pudo generar el acta.');
    }
  }

  async function descargarReverso(btn) {
    const nombre = exigirNombreYLibertad();
    if (!nombre) return;

    try {
      await guardarSiFalta();
      await descargarPagina(btn, 'page-reverso', 'acta-gorila-reverso-' + slug(nombre), () => {
        pintarNombreEnFrente(nombre);
        pintarFolio(folioDesde(token || nombre, nombre));
      });
    } catch (e) {
      alert(e.message || 'No se pudo generar el reverso.');
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
        pintarFolio(folioDesde(token || regalo, regalo));
      });
      syncNombrePreview();
    } catch (e) {
      alert(e.message || 'No se pudo generar el acta regalo.');
      syncNombrePreview();
    }
  }

  async function imprimirActa() {
    const nombre = exigirNombreYLibertad();
    if (!nombre) return;
    pintarNombreEnFrente(nombre);
    pintarFolio(folioDesde(token || nombre, nombre));
    try { await guardarSiFalta(); } catch (_) {}
    window.print();
  }

  function slug(s) {
    return String(s || 'gorila').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gorila';
  }

  function rellenarDesdeSesion(data) {
    const kicker = $('kicker-funcion');
    if (kicker) kicker.textContent = data.funcionNombre || 'EL GORILA';

    /* Nombre oficial = quien pagó el boleto. Preferir boleto; si ya corrigieron, usar nombre guardado. */
    const nombreBoleto = (data.nombreBoleto || data.nombre || data.saludo || '').trim();
    const mi = $('input-mi-nombre');
    if (mi) {
      if (data.completada && data.nombre) mi.value = data.nombre;
      else if (nombreBoleto) mi.value = nombreBoleto;
    }

    pintarMeta(data);
    pintarFolio(folioDesde(token, nombreBoleto || data.fecha || 'gorila'));
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
    $('btn-descargar-reverso')?.addEventListener('click', e => {
      descargarReverso(e.currentTarget);
    });
    $('btn-imprimir')?.addEventListener('click', () => {
      imprimirActa();
    });
    $('btn-descargar-regalo')?.addEventListener('click', e => {
      descargarActaRegalo(e.currentTarget);
    });
  }

  async function init() {
    token = tokenFromUrl();
    bindUi();
    pintarMeta({});
    pintarFolio(folioDesde(token || 'preview', ''));
    syncNombrePreview();

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
