(function () {
  const BUTACA_CODIGO = 'BUTACA37';
  const SITIO_BOLETOS = 'https://elgorilateatro.com.mx/boletos.html';

  let token = '';
  let sessionData = null;
  let folioActual = 'ACTA —····';

  // "Tira" de boletos: una compra con N boletos permite regenerar el
  // certificado con N nombres/géneros distintos (uno por persona que
  // asistió), todo local — comparten el mismo enlace/token de la compra.
  let entradasTotal = 1;
  let tiraIndex = 0;
  let nombresTira = [''];
  let generosTira = ['hombre'];

  function describirError(e) {
    if (!e) return '';
    if (e instanceof Error) return ` (${e.name}: ${e.message})`;
    if (typeof e === 'string') return ` (${e})`;
    if (e instanceof Event) return ` (evento: ${e.type})`;
    try { return ` (${JSON.stringify(e)})`; } catch (_) { return ` (${String(e)})`; }
  }

  function $(id) { return document.getElementById(id); }

  // El sello se ve "puesto a mano": varía un poco de posición/ángulo cada
  // vez que se genera un certificado, en vez de caer siempre en el mismo sitio.
  function variarSelloGigante() {
    const sello = $('sello-gigante-el');
    const page = $('page-frente');
    if (!sello || !page) return;
    // Píxeles fijos (no %): la página es 816×1056 siempre.
    const PAGE_W = 816, PAGE_H = 1056, MARGEN = 24;
    const mitad = (sello.offsetWidth || 269) / 2;

    // Regla: el sello vive solo en el último tercio de la hoja (nunca más
    // arriba), y nunca cruza el margen del papel — ni hacia abajo (se
    // mordía el sello-membrete del pie), ni a los lados.
    const limiteSuperior = PAGE_H * (2 / 3);

    const minLeft = MARGEN + mitad;
    const maxLeft = PAGE_W - MARGEN - mitad;
    const minTop = Math.max(limiteSuperior + mitad, MARGEN + mitad);
    const maxTop = PAGE_H - MARGEN - mitad;

    // Regla horizontal: el sello vive en el primer o el tercer tercio de la
    // hoja — nunca centrado en el tercio de en medio (ahí vive la firma, y
    // centrado ahí se la tapa entera). Puede morder un poco el tercio central
    // (BORDE), pero no plantarse en el centro exacto.
    const BORDE = 40;
    const tercio1Fin = PAGE_W / 3 + BORDE;
    const tercio3Ini = (PAGE_W * 2) / 3 - BORDE;
    const zonaIzq = [minLeft, Math.min(tercio1Fin, maxLeft)];
    const zonaDer = [Math.max(tercio3Ini, minLeft), maxLeft];
    const zona = Math.random() < 0.5 ? zonaIzq : zonaDer;
    const [zonaMin, zonaMax] = zona[0] <= zona[1] ? zona : [minLeft, maxLeft];

    const left = zonaMin + Math.random() * Math.max(0, zonaMax - zonaMin);
    const top = minTop + Math.random() * Math.max(0, maxTop - minTop);
    const rot = -18 + Math.random() * 22;    // -18°–+4°
    sello.style.left = left.toFixed(0) + 'px';
    sello.style.top = top.toFixed(0) + 'px';
    sello.style.transform = `translate(-50%, -50%) rotate(${rot.toFixed(1)}deg)`;
  }

  function tokenFromUrl() {
    return (new URLSearchParams(window.location.search).get('t') || '').trim();
  }

  function show(id) {
    ['estado-carga', 'estado-error', 'contenido-acta'].forEach(x => {
      const el = $(x);
      if (el) el.classList.toggle('hidden', x !== id);
    });
  }

  function leerActa() {
    return {
      jaulas:   ($('rev-jaulas')?.value || '').trim(),
      salidas:  ($('rev-salidas')?.value || '').trim(),
      actitud:  ($('rev-actitud')?.value || '').trim(),
    };
  }

  // Folio real: número de función (consecutivo desde el estreno del montaje,
  // no de la temporada) + año. Ej. "1050 · 2026" — la función 1050 del
  // montaje, sábado 29 ago 2026. Viene de data.numeroObra (backend); sin eso
  // (preview local, tokens viejos sin el campo) cae a un placeholder.
  function folioTexto(numeroObra, fecha) {
    if (numeroObra == null) return 'ACTA —····';
    const anio = (fecha && /^\d{4}/.test(fecha)) ? fecha.slice(0, 4) : new Date().getFullYear();
    return `${numeroObra} · ${anio}`;
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

  function pintarFechaFuncion(data) {
    const el = $('ciudad-fecha');
    if (!el) return;
    const fecha = formatearFecha(data?.fecha);
    el.textContent = fecha ? `Función del ${fecha}` : 'Fecha de la función por confirmar';
  }

  function pintarMeta(data) {
    pintarFechaFuncion(data);
  }

  // ─── Género (hombre / mujer) ────────────────────────────────────────────────

  function pintarGenero(esMujer) {
    const t = $('titulo-genero');
    if (t) t.textContent = esMujer ? 'Mujer destacada' : 'Hombre destacado';
    const c = $('clausula-genero');
    if (c) {
      c.textContent = esMujer
        ? 'Por medio de la presente se reconoce al portador de este documento como una «mujer» destacada entre las mujeres.'
        : 'Por medio de la presente se reconoce al portador de este documento como un «hombre» destacado entre los hombres.';
    }
    const e = $('expediente-genero');
    if (e) e.textContent = esMujer ? 'de la mujer' : 'del hombre';
  }

  function syncGeneroPreview() {
    const chk = $('chk-genero-mujer');
    const esMujer = !!chk?.checked;
    generosTira[tiraIndex] = esMujer ? 'mujer' : 'hombre';
    pintarGenero(esMujer);
    preWarmCertBlob();
  }

  function pintarNombreEnFrente(nombre) {
    const el = $('campo-nombre-valor');
    const rev = $('rev-portador-nombre');
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
  }

  function syncNombrePreview() {
    const nombre = $('input-mi-nombre')?.value || '';
    nombresTira[tiraIndex] = nombre;
    pintarNombreEnFrente(nombre);
    preWarmCertBlob();
  }

  // ─── Tira de boletos (1 certificado por boleto de la compra) ───────────────

  function pintarTira() {
    const conteo = $('conteo-certificado');
    if (conteo) {
      conteo.classList.toggle('hidden', entradasTotal <= 1);
      $('conteo-actual').textContent = String(tiraIndex + 1);
      $('conteo-total').textContent = String(entradasTotal);
    }

    const wrap = $('tira-boletos');
    if (!wrap) return;
    if (entradasTotal <= 1) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    $('tira-actual').textContent = String(tiraIndex + 1);
    $('tira-total').textContent = String(entradasTotal);
    const dots = $('tira-dots');
    if (dots) {
      dots.innerHTML = Array.from({ length: entradasTotal })
        .map((_, i) => `<span class="${i === tiraIndex ? 'activo' : ''}"></span>`)
        .join('');
    }
    $('btn-tira-prev').disabled = tiraIndex === 0;
    $('btn-tira-next').disabled = tiraIndex === entradasTotal - 1;
  }

  function irATira(nuevoIndex) {
    if (nuevoIndex < 0 || nuevoIndex >= entradasTotal) return;
    tiraIndex = nuevoIndex;
    const mi = $('input-mi-nombre');
    if (mi) mi.value = nombresTira[tiraIndex] || '';
    pintarNombreEnFrente(mi ? mi.value : '');
    const chk = $('chk-genero-mujer');
    if (chk) chk.checked = generosTira[tiraIndex] === 'mujer';
    pintarGenero(chk ? chk.checked : false);
    pintarTira();
    variarSelloGigante();
    preWarmCertBlob();
  }

  // ─── API ────────────────────────────────────────────────────────────────────

  async function apiGet() {
    const res = await fetch(window.teatroApi(`encuesta/${encodeURIComponent(token)}`));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Enlace no válido.');
    return data;
  }

  function exigirNombre() {
    const nombre = ($('input-mi-nombre')?.value || '').trim();
    if (!nombre) {
      alert('Falta el nombre para el certificado.');
      $('input-mi-nombre')?.focus();
      return null;
    }
    return nombre;
  }

  // ─── Compartir por WhatsApp (código BUTACA37) ──────────────────────────────

  function textoCompartirWa() {
    return `🦍 Vengo de ver EL GORILA en el Teatro Wilberto Cantón — te invito con 25% de descuento.\n\n`
      + `Código: ${BUTACA_CODIGO}\nAplícalo al comprar tus boletos aquí: ${SITIO_BOLETOS}`;
  }

  function compartirWa() {
    const url = `https://wa.me/?text=${encodeURIComponent(textoCompartirWa())}`;
    window.open(url, '_blank', 'noopener');
  }

  // ─── Compartir el certificado por WhatsApp (imagen) ────────────────────────
  // Solo la hoja del frente, como imagen — más simple y rápido que un PDF de
  // 2 páginas, y es lo único que de verdad hace falta para compartir.

  async function generarImagenCertificado() {
    if (typeof window.html2canvas !== 'function') {
      throw new Error('No cargó la librería para generar la imagen (revisa tu conexión y recarga la página).');
    }
    const page = $('page-frente');
    const wrapper = page.closest('.page-wrapper');

    page.classList.add('is-capturing');
    const prevTransform = page.style.transform;
    page.style.transform = 'none';
    const prevOverflow = wrapper.style.overflow;
    wrapper.style.overflow = 'visible';

    try {
      const canvas = await window.html2canvas(page, { scale: 1.5, useCORS: true, backgroundColor: '#f5f0e2' });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('El navegador no pudo convertir el certificado en imagen.');
      return blob;
    } finally {
      page.classList.remove('is-capturing');
      page.style.transform = prevTransform;
      wrapper.style.overflow = prevOverflow;
    }
  }

  // Se pre-genera el certificado en cuanto cambia el nombre/género, para que
  // al tocar "Guardar" el navegador ya tenga la imagen lista y pueda abrir
  // el share nativo (o la descarga) en el mismo instante del toque — si se
  // genera EN ESE momento, html2canvas tarda y el sistema operativo cancela
  // el permiso de compartir/descargar por haber pasado demasiado tiempo.
  let certBlobCache = null;
  let certBlobToken = 0;
  let certPreWarmTimer = null;

  function preWarmCertBlob() {
    certBlobCache = null;
    clearTimeout(certPreWarmTimer);
    const miToken = ++certBlobToken;
    certPreWarmTimer = setTimeout(async () => {
      try {
        const blob = await generarImagenCertificado();
        if (miToken === certBlobToken) certBlobCache = blob;
      } catch (_) { /* si falla, se genera de nuevo al tocar "Guardar" */ }
    }, 500);
  }

  async function verCertificadoParaGuardar() {
    const nombre = exigirNombre();
    if (!nombre) return;

    const btn = $('btn-ver-certificado');
    const label = btn ? btn.textContent.trim() : '';

    try {
      let blob = certBlobCache;
      if (!blob) {
        if (btn) { btn.classList.add('is-loading'); btn.textContent = 'Generando…'; }
        blob = await generarImagenCertificado();
      }

      const archivo = new File([blob], 'certificado-el-gorila.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: 'Certificado — El Gorila' });
          return;
        } catch (shareErr) {
          if (shareErr && shareErr.name === 'AbortError') return; // canceló el share sheet
          // sigue al plan B si el share nativo falla por otra razón
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'certificado-el-gorila.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch (e) {
      alert('No se pudo generar el certificado. Intenta de nuevo.' + describirError(e));
    } finally {
      if (btn) { btn.classList.remove('is-loading'); btn.textContent = label; }
    }
  }

  function rellenarDesdeSesion(data) {
    const kicker = $('kicker-funcion');
    if (kicker) kicker.textContent = data.funcionNombre || 'EL GORILA';

    entradasTotal = Math.max(1, parseInt(data.entradas, 10) || 1);
    nombresTira = Array.from({ length: entradasTotal }, () => '');
    generosTira = Array.from({ length: entradasTotal }, () => 'hombre');
    tiraIndex = 0;

    /* Nombre oficial = quien pagó el boleto. Preferir boleto; si ya corrigieron, usar nombre guardado. */
    const nombreBoleto = (data.nombreBoleto || data.nombre || data.saludo || '').trim();
    if (data.completada && data.nombre) nombresTira[0] = data.nombre;
    else if (nombreBoleto) nombresTira[0] = nombreBoleto;

    const mi = $('input-mi-nombre');
    if (mi) mi.value = nombresTira[0] || '';

    pintarMeta(data);
    pintarFolio(folioTexto(data.numeroObra, data.fecha));
    syncNombrePreview();
    syncGeneroPreview();
    pintarTira();

    const acta = data.acta;
    if (acta) {
      if ($('rev-jaulas') && acta.jaulas) $('rev-jaulas').value = acta.jaulas;
      if ($('rev-salidas') && acta.salidas) $('rev-salidas').value = acta.salidas;
      if ($('rev-actitud') && acta.actitud) $('rev-actitud').value = acta.actitud;
    }
  }

  function bindUi() {
    $('input-mi-nombre')?.addEventListener('input', syncNombrePreview);
    $('chk-genero-mujer')?.addEventListener('change', syncGeneroPreview);

    $('btn-tira-prev')?.addEventListener('click', () => irATira(tiraIndex - 1));
    $('btn-tira-next')?.addEventListener('click', () => irATira(tiraIndex + 1));

    $('btn-compartir-wa')?.addEventListener('click', () => {
      compartirWa();
    });
    $('btn-ver-certificado')?.addEventListener('click', () => {
      verCertificadoParaGuardar();
    });
  }

  async function init() {
    token = tokenFromUrl();
    bindUi();
    pintarMeta({});
    pintarFolio(folioTexto(null));
    syncNombrePreview();
    syncGeneroPreview();
    pintarTira();

    if (!token) {
      show('contenido-acta');
      variarSelloGigante();
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
      variarSelloGigante();
    } catch (e) {
      $('error-text').textContent = e.message || 'Este enlace no está disponible.';
      show('estado-error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
