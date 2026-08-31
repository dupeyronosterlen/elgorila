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

    const left = minLeft + Math.random() * Math.max(0, maxLeft - minLeft);
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
        ? 'Este documento documenta al portador como una «mujer», destacada entre las mujeres.'
        : 'Este documento documenta al portador como un «hombre», destacado entre los hombres.';
    }
    const e = $('expediente-genero');
    if (e) e.textContent = esMujer ? 'de la mujer' : 'del hombre';
  }

  function syncGeneroPreview() {
    const chk = $('chk-genero-mujer');
    const esMujer = !!chk?.checked;
    generosTira[tiraIndex] = esMujer ? 'mujer' : 'hombre';
    pintarGenero(esMujer);
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

  // ─── Compartir en Instagram (imagen prearmada + link con UTM + cupón) ──────

  const SITIO_SOBRE_LA_OBRA = 'https://elgorilateatro.com.mx/sobre-la-obra.html';
  const IG_FONDO_SRC = 'img/ig-fondo-1.jpg';

  function urlCompartirIG() {
    return `${SITIO_SOBRE_LA_OBRA}?cupon=${encodeURIComponent(BUTACA_CODIGO)}`
      + `&utm_source=instagram&utm_medium=social&utm_campaign=certificado_ig`;
  }

  function cargarImagen(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function generarImagenIG() {
    const W = 1080, H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    try {
      const foto = await cargarImagen(IG_FONDO_SRC);
      const escala = Math.max(W / foto.width, H / foto.height);
      const fw = foto.width * escala, fh = foto.height * escala;
      ctx.drawImage(foto, (W - fw) / 2, (H - fh) / 2, fw, fh);
    } catch (_) {
      ctx.fillStyle = '#0d1f12';
      ctx.fillRect(0, 0, W, H);
    }

    // Velo oscuro para que el texto se lea sobre la foto.
    const velo = ctx.createLinearGradient(0, 0, 0, H);
    velo.addColorStop(0, 'rgba(6,8,6,.55)');
    velo.addColorStop(0.4, 'rgba(6,8,6,.35)');
    velo.addColorStop(0.68, 'rgba(6,8,6,.55)');
    velo.addColorStop(1, 'rgba(6,8,6,.82)');
    ctx.fillStyle = velo;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(217,155,58,.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(56, 56, W - 112, H - 112);

    // Zona segura de historias de IG: los primeros ~250px y los últimos
    // ~250px quedan tapados por la UI de Instagram (perfil/reloj arriba,
    // barra de respuesta/stickers abajo) — nada importante va ahí.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d99b3a';
    ctx.font = '600 28px "Courier New", monospace';
    ctx.fillText('E L   G O R I L A', W / 2, 300);

    ctx.fillStyle = 'rgba(241,234,217,.75)';
    ctx.font = '22px "Courier New", monospace';
    ctx.fillText('SÁBADOS 18:00', W / 2, 350);

    ctx.strokeStyle = 'rgba(217,155,58,.5)';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 90, H - 420);
    ctx.lineTo(W / 2 + 90, H - 420);
    ctx.stroke();

    ctx.fillStyle = 'rgba(241,234,217,.75)';
    ctx.font = '24px "Courier New", monospace';
    ctx.fillText('25% de descuento con el código', W / 2, H - 360);

    ctx.fillStyle = '#d99b3a';
    ctx.font = '700 46px "Courier New", monospace';
    ctx.fillText(BUTACA_CODIGO, W / 2, H - 290);

    ctx.fillStyle = 'rgba(241,234,217,.5)';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText('elgorilateatro.com.mx', W / 2, H - 240);

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  async function compartirIG(btn) {
    const label = btn.textContent.trim();
    btn.classList.add('is-loading');
    try {
      // Instagram no deja incrustar un link cliqueable dentro de la imagen —
      // solo se vuelve cliqueable si la persona pega un link "sticker" a mano
      // sobre su historia. Por eso copiamos el link ANTES de compartir: IG
      // sugiere pegar automáticamente si detecta una URL en el portapapeles.
      try { await navigator.clipboard.writeText(urlCompartirIG()); } catch (_) { /* no bloquea */ }

      const blob = await generarImagenIG();
      const archivo = new File([blob], 'el-gorila-certificado.png', { type: 'image/png' });
      const texto = `🦍 EL GORILA — 25% de descuento con el código ${BUTACA_CODIGO}\n${urlCompartirIG()}`;

      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], text: texto, title: 'El Gorila' });
        return;
      }

      const urlBlob = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlBlob;
      a.download = 'el-gorila-certificado.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlBlob);

      try { await navigator.clipboard.writeText(urlCompartirIG()); } catch (_) { /* no bloquea */ }
      alert('Descargamos la imagen para tu historia y copiamos el link con tu código al portapapeles.');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // usuario canceló el share sheet
      alert('No se pudo generar la imagen. Intenta de nuevo.');
    } finally {
      btn.classList.remove('is-loading');
      btn.textContent = label;
    }
  }

  async function copiarLinkIG() {
    try {
      await navigator.clipboard.writeText(urlCompartirIG());
      alert('Link copiado, con tu código de descuento incluido.');
    } catch (_) {
      prompt('Copia tu link:', urlCompartirIG());
    }
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
    const page = $('page-frente');
    const wrapper = page.closest('.page-wrapper');

    page.classList.add('is-capturing');
    const prevTransform = page.style.transform;
    page.style.transform = 'none';
    const prevOverflow = wrapper.style.overflow;
    wrapper.style.overflow = 'visible';

    try {
      const canvas = await window.html2canvas(page, { scale: 2, useCORS: true, backgroundColor: '#f5f0e2' });
      return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    } finally {
      page.classList.remove('is-capturing');
      page.style.transform = prevTransform;
      wrapper.style.overflow = prevOverflow;
    }
  }

  async function compartirCertificadoWa() {
    if (!token) {
      alert('Este certificado necesita venir de un enlace real para poder enviarse.');
      return;
    }
    const nombre = exigirNombre();
    if (!nombre) return;

    const btn = $('btn-enviar-cert-wa');
    const label = btn ? btn.textContent.trim() : '';
    if (btn) { btn.classList.add('is-loading'); btn.textContent = 'Generando…'; }

    try {
      const blob = await generarImagenCertificado();
      const archivo = new File([blob], 'certificado-el-gorila.png', { type: 'image/png' });
      const texto = `🦍 Aquí está el certificado de ${nombre} de EL GORILA.`;

      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], text: texto, title: 'Certificado — El Gorila' });
        return;
      }

      // WhatsApp no deja adjuntar un archivo vía el link wa.me — es un límite
      // de la plataforma, no algo que podamos programar alrededor. Bajamos
      // la imagen y abrimos el chat con el texto para que la adjunten a mano.
      const urlBlob = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlBlob;
      a.download = 'certificado-el-gorila.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlBlob);

      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
      alert('Descargamos tu certificado — adjúntalo en el chat de WhatsApp que se abrió.');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      alert('No se pudo generar el certificado. Intenta de nuevo.');
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
    $('btn-compartir-ig')?.addEventListener('click', e => {
      compartirIG(e.currentTarget);
    });
    $('btn-copiar-link-ig')?.addEventListener('click', () => {
      copiarLinkIG();
    });
    $('btn-enviar-cert-wa')?.addEventListener('click', () => {
      compartirCertificadoWa();
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
