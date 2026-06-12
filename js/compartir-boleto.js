(function () {
  const VENUE = 'Teatro Wilberto Cantón, San José Insurgentes, CDMX';
  let ventaState = null;
  let modos = [];
  let modoActivo = 0;
  let canvasActual = null;

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function codigoFromUrl() {
    return (params().get('c') || params().get('codigo') || '').trim().toUpperCase();
  }

  function baseUrl() {
    const p = window.location.pathname.replace(/[^/]+$/, '');
    return window.location.origin + p;
  }

  function urlVerificar(codigo) {
    return `${baseUrl()}verificar.html?codigo=${encodeURIComponent(codigo)}`;
  }

  function urlCompartir(codigo) {
    return `${baseUrl()}compartir-boleto.html?c=${encodeURIComponent(codigo)}`;
  }

  function urlInvitacion(certificado) {
    return `${baseUrl()}invitacion.html?de=${encodeURIComponent(certificado)}`;
  }

  function entradasLabel(n) {
    const num = parseInt(n, 10) || 1;
    return num === 1 ? '1 entrada' : `${num} entradas`;
  }

  async function cargarVenta(codigo) {
    if (!window.API_BASE) throw new Error('API no configurada.');
    const tid = window.teatroIdActivo ? window.teatroIdActivo() : 'wilberto';
    const res = await fetch(`${window.API_BASE}/api/${tid}/venta/${encodeURIComponent(codigo)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Boleto no encontrado (404).');
    }
    return res.json();
  }

  function construirModos(venta) {
    const boletos = venta.boletos || [];
    const certificado = venta.certificado || venta.codigo || '';
    const n = venta.cantidad || boletos.length || 1;
    const lista = [];

    lista.push({
      id: 'certificado',
      label: n > 1 ? `Certificado (${n} entradas)` : 'Certificado',
      codigo: certificado,
      codigoLabel: 'Certificado',
      modo: 'certificado',
      entradas: entradasLabel(n),
      qrCodigo: certificado,
    });

    boletos.forEach((b, i) => {
      lista.push({
        id: `boleto-${i}`,
        label: boletos.length > 1 ? `Entrada ${b.numero || i + 1}` : 'Entrada individual',
        codigo: b.cert,
        codigoLabel: 'Entrada',
        modo: 'individual',
        entradas: boletos.length > 1
          ? `Entrada ${b.numero || i + 1} de ${boletos.length}`
          : '1 entrada',
        qrCodigo: b.cert,
        tipo: b.tipo,
      });
    });

    if (boletos.length === 0 && certificado) {
      lista[0].qrCodigo = certificado;
    }

    return lista;
  }

  async function renderImagen(modo) {
    if (!window.GenerarImagenBoleto) throw new Error('Generador de imagen no cargado.');
    const canvas = await GenerarImagenBoleto.generar({
      funcion: ventaState.funcionNombre || ventaState.fecha || '',
      entradas: modo.entradas,
      modo: modo.modo,
      codigoLabel: modo.codigoLabel,
      codigo: modo.codigo,
      qrUrl: urlVerificar(modo.qrCodigo),
      logoUrl: 'img/LOGO/1.jpg',
    });
    canvasActual = canvas;
    document.getElementById('preview-img').src = canvas.toDataURL('image/png');
    document.getElementById('modo-hint').textContent = modo.modo === 'certificado'
      ? 'El QR del certificado valida todas las entradas de esta compra en puerta.'
      : 'QR de entrada individual — una persona por imagen.';
    return canvas;
  }

  function renderTabs() {
    const tabs = document.getElementById('modo-tabs');
    tabs.innerHTML = modos.map((m, i) =>
      `<button type="button" class="modo-tab${i === modoActivo ? ' active' : ''}" data-idx="${i}">${m.label}</button>`
    ).join('');
    tabs.querySelectorAll('.modo-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        modoActivo = parseInt(btn.dataset.idx, 10);
        renderTabs();
        await renderImagen(modos[modoActivo]);
      });
    });
  }

  function nombreArchivo(modo) {
    const slug = (modo.codigo || 'boleto').replace(/[^A-Z0-9-]/gi, '').slice(0, 24);
    return `el-gorila-${slug}.png`;
  }

  async function compartirWhatsApp(modo) {
    if (!canvasActual) await renderImagen(modo);
    const blob = await GenerarImagenBoleto.canvasToBlob(canvasActual);
    const file = new File([blob], nombreArchivo(modo), { type: 'image/png' });
    const pagina = urlCompartir(modo.modo === 'certificado'
      ? (ventaState.certificado || ventaState.codigo)
      : modo.codigo);
    const texto =
      `Voy a ver EL GORILA — ${ventaState.funcionNombre || ventaState.fecha}. ` +
      `${modo.entradas}. ¿Me acompañas?\n${VENUE}\n${pagina}`;

    if (navigator.share) {
      try {
        const payload = { title: 'Mi boleto — EL GORILA', text: texto };
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ ...payload, files: [file] });
          return;
        }
        await navigator.share(payload);
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    window.location.href = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }

  async function compartirInvitacion() {
    const cert = ventaState.certificado || ventaState.codigo;
    if (!cert) throw new Error('No hay certificado para invitar.');
    const link = urlInvitacion(cert);
    const fn = ventaState.funcionNombre || ventaState.fecha || 'EL GORILA';
    const texto =
      `Te invito a ver EL GORILA (${fn}) con descuento de invitado.\n` +
      `Este enlace es personal — activa el −25% solo si tú quieres:\n${link}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Invitación — EL GORILA', text: texto, url: link });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    window.location.href = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }

  function copiarInvitacion() {
    const cert = ventaState.certificado || ventaState.codigo;
    if (!cert) throw new Error('No hay certificado.');
    const link = urlInvitacion(cert);
    return navigator.clipboard.writeText(link);
  }

  function mostrarError(msg) {
    document.getElementById('estado-carga').classList.add('hidden');
    const el = document.getElementById('estado-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  async function init(venta) {
    ventaState = venta;
    modos = construirModos(venta);
    modoActivo = 0;

    document.getElementById('estado-carga').classList.add('hidden');
    document.getElementById('contenido').classList.remove('hidden');

    renderTabs();
    await renderImagen(modos[0]);

    document.getElementById('btn-guardar').addEventListener('click', async function () {
      const btn = this;
      btn.disabled = true;
      try {
        const modo = modos[modoActivo];
        if (!canvasActual) await renderImagen(modo);
        await GenerarImagenBoleto.descargar(canvasActual, nombreArchivo(modo));
      } catch (e) {
        alert(e.message || 'No se pudo guardar.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btn-wa').addEventListener('click', async function () {
      const btn = this;
      btn.disabled = true;
      try {
        await compartirWhatsApp(modos[modoActivo]);
      } catch (e) {
        alert(e.message || 'No se pudo abrir WhatsApp.');
      } finally {
        btn.disabled = false;
      }
    });

    const btnInv = document.getElementById('btn-invitacion');
    if (btnInv) {
      btnInv.addEventListener('click', async function () {
        const btn = this;
        btn.disabled = true;
        try {
          await compartirInvitacion();
        } catch (e) {
          alert(e.message || 'No se pudo compartir la invitación.');
        } finally {
          btn.disabled = false;
        }
      });
    }

    const btnCopiar = document.getElementById('btn-copiar-invitacion');
    if (btnCopiar) {
      btnCopiar.addEventListener('click', async function () {
        const btn = this;
        btn.disabled = true;
        try {
          await copiarInvitacion();
          btn.textContent = 'Enlace copiado';
          setTimeout(function () { btn.textContent = 'Copiar enlace de invitación'; }, 2000);
        } catch (e) {
          alert(e.message || 'No se pudo copiar.');
        } finally {
          btn.disabled = false;
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const codigo = codigoFromUrl();
    if (!codigo) {
      mostrarError('Falta el certificado. Ábrelo desde el correo de confirmación.');
      return;
    }

    try {
      const venta = await cargarVenta(codigo);
      await init(venta);
    } catch (e) {
      mostrarError(
        (e.message || 'Error al cargar.') +
        ' Si acabas de comprar, espera unos segundos. Si el enlace da 404, publica compartir-boleto.html en el sitio.'
      );
    }
  });
})();
