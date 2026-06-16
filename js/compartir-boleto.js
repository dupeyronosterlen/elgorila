(function () {
  const VENUE = 'Teatro Wilberto Cantón';
  const DIRECCION = 'José María Velasco 59 · San José Insurgentes';
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
    return `${baseUrl()}admin.html?view=verificar&codigo=${encodeURIComponent(codigo)}`;
  }

  function qrPayload(codigo) {
    if (window.ElGorilaQr) return window.ElGorilaQr.codigoQrPayload(codigo);
    return (codigo || '').trim().toUpperCase();
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
      qrCodigo: n === 1 && boletos[0]?.cert ? boletos[0].cert : certificado,
      folio: boletos.map(b => b.folio).filter(Boolean).join(' · ') || null,
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
        folio: b.folio || null,
        tipo: b.tipo,
        seccion: b.seccion,
      });
    });

    if (boletos.length === 0 && certificado) {
      lista[0].qrCodigo = certificado;
    }

    return lista;
  }

  function walletCodigo(modo) {
    return modo.modo === 'certificado'
      ? (ventaState.certificado || ventaState.codigo)
      : modo.codigo;
  }

  function walletBoletoIdx(modo) {
    if (modo.modo !== 'individual') return null;
    const i = modos.indexOf(modo);
    return i > 0 ? i - 1 : 0;
  }

  async function actualizarWallet(modo) {
    const btnG = document.getElementById('btn-google-wallet');
    const btnA = document.getElementById('btn-apple-wallet');
    if (!btnG || !btnA || !window.API_BASE) return;

    btnG.disabled = true;
    btnA.disabled = true;
    btnG.removeAttribute('data-url');
    btnA.removeAttribute('data-url');

    try {
      const tid = window.teatroIdActivo ? window.teatroIdActivo() : 'wilberto';
      const codigo = walletCodigo(modo);
      const idx = walletBoletoIdx(modo);
      const q = idx != null ? `?boleto=${idx}` : '';
      const res = await fetch(`${window.API_BASE}/api/${tid}/venta/${encodeURIComponent(codigo)}/wallet${q}`);
      const data = await res.json().catch(() => ({}));

      if (data.google?.ok && data.google.saveUrl) {
        btnG.disabled = false;
        btnG.dataset.url = data.google.saveUrl;
      }
      if (data.apple?.ok && data.apple.saveUrl) {
        btnA.disabled = false;
        btnA.dataset.url = data.apple.saveUrl;
      } else if (data.configured?.apple) {
        btnA.disabled = false;
        btnA.title = data.apple?.error || 'Apple Wallet';
      }
    } catch { /* wallet opcional */ }
  }

  async function renderImagen(modo) {
    if (!window.GenerarImagenBoleto) throw new Error('Generador de imagen no cargado.');
    try {
      const canvas = await GenerarImagenBoleto.generar({
        funcion: ventaState.funcionNombre || ventaState.fecha || '',
        entradas: modo.entradas,
        modo: modo.modo,
        codigoLabel: modo.codigoLabel,
        codigo: modo.codigo,
        folio: modo.folio,
        tipo: modo.tipo,
        seccion: modo.seccion,
        qrUrl: qrPayload(modo.qrCodigo),
        logoUrl: 'img/LOGO/1.jpg',
        arteUrl: 'img/programa/portada-v4.jpg',
      });
      canvasActual = canvas;
      document.getElementById('preview-img').src = canvas.toDataURL('image/png');
    } catch (err) {
      console.warn('Canvas boleto:', err);
      const qrImg = window.ElGorilaQr?.urlQrImagen?.(modo.qrCodigo, 320)
        || `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrPayload(modo.qrCodigo))}`;
      document.getElementById('preview-img').src = qrImg;
      canvasActual = null;
    }
    const folioHint = modo.folio ? ` Folio taquilla: ${modo.folio}.` : '';
    document.getElementById('modo-hint').textContent = (modo.modo === 'certificado'
      ? 'Presenta el QR en la entrada del teatro — válido para todas las entradas.'
      : 'Presenta este QR en puerta — una persona por pase.') + folioHint;
    await actualizarWallet(modo);
    return canvasActual;
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
    const cert = modo.modo === 'certificado'
      ? (ventaState.certificado || ventaState.codigo)
      : modo.codigo;
    let texto =
      `Voy a ver EL GORILA — ${ventaState.funcionNombre || ventaState.fecha}. ` +
      `${modo.entradas}.\n${VENUE}\n${DIRECCION}`;
    if (modo.folio) texto += `\nFolio taquilla: ${modo.folio}`;
    if (cert) texto += `\nCertificado: ${cert}`;
    texto += '\n\nPresenta el QR adjunto en la entrada del teatro.';

    if (navigator.share) {
      try {
        const payload = { title: 'Mi boleto — EL GORILA', text: texto, files: [file] };
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share(payload);
          return;
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    await GenerarImagenBoleto.descargar(canvasActual, nombreArchivo(modo));
    window.location.href = `https://wa.me/?text=${encodeURIComponent(texto + '\n\nAdjunta la imagen del boleto que acabas de descargar.')}`;
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
    // 1 boleto → pestaña individual (folio taquilla + QR de entrada)
    modoActivo = modos.length > 1 ? 1 : 0;

    document.getElementById('estado-carga').classList.add('hidden');
    document.getElementById('contenido').classList.remove('hidden');

    renderTabs();
    await renderImagen(modos[modoActivo]);

    document.getElementById('btn-guardar').addEventListener('click', async function () {
      const btn = this;
      btn.disabled = true;
      try {
        const modo = modos[modoActivo];
        if (!canvasActual) await renderImagen(modo);
        await GenerarImagenBoleto.guardarEnDispositivo(
          canvasActual,
          nombreArchivo(modo),
          `EL GORILA — ${modo.entradas}`,
        );
      } catch (e) {
        if (e.name !== 'AbortError') alert(e.message || 'No se pudo guardar.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btn-pdf').addEventListener('click', async function () {
      const btn = this;
      btn.disabled = true;
      try {
        const modo = modos[modoActivo];
        if (!canvasActual) await renderImagen(modo);
        await GenerarImagenBoleto.descargarPdf(canvasActual, nombreArchivo(modo));
      } catch (e) {
        alert(e.message || 'No se pudo crear el PDF.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btn-png').addEventListener('click', async function () {
      const btn = this;
      btn.disabled = true;
      try {
        const modo = modos[modoActivo];
        if (!canvasActual) await renderImagen(modo);
        await GenerarImagenBoleto.descargar(canvasActual, nombreArchivo(modo));
      } catch (e) {
        alert(e.message || 'No se pudo descargar.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btn-google-wallet')?.addEventListener('click', function () {
      const url = this.dataset.url;
      if (url) window.open(url, '_blank', 'noopener');
      else alert('Google Wallet aún no está configurado en el servidor.');
    });

    document.getElementById('btn-apple-wallet')?.addEventListener('click', function () {
      const url = this.dataset.url;
      if (url) window.location.href = url;
      else alert('Apple Wallet: configura los certificados Pass Type ID en Cloudflare (APPLE_PASS_*).');
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
