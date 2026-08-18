/** Página post-correo: misma vista y acciones que confirmacion.html (guardar + WhatsApp). */
(function () {
  let ordenCompra = null;

  function codigoFromUrl() {
    const p = new URLSearchParams(window.location.search);
    return (p.get('c') || p.get('codigo') || '').trim().toUpperCase();
  }

  function codigoQrBoleto(orden) {
    const boletos = orden.boletos || [];
    if (window.ElGorilaQr) return window.ElGorilaQr.codigoQrOficial(orden);
    if (boletos.length === 1 && boletos[0].cert) return boletos[0].cert;
    return orden.numeroOrden || orden.certificado || '';
  }

  function folioTaquillaOrden(orden) {
    const boletos = orden.boletos || [];
    if (boletos.length === 1 && boletos[0].folio) return boletos[0].folio;
    return boletos.map(b => b.folio).filter(Boolean).join(' · ') || null;
  }

  function pintarQR(container, codigo, size) {
    if (window.ElGorilaQr && typeof window.ElGorilaQr.pintarQr === 'function') {
      return window.ElGorilaQr.pintarQr(container, codigo, size);
    }
    if (!container || !codigo) return Promise.resolve();
    if (typeof QRCode === 'undefined') {
      container.textContent = String(codigo).trim().toUpperCase();
      return Promise.reject(new Error('QRCode no cargado'));
    }
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    return QRCode.toCanvas(canvas, codigo, {
      width: size,
      margin: 1,
      color: { dark: '#1a1411', light: '#f1ead9' },
    });
  }

  function showError(msg) {
    document.getElementById('estado-carga')?.classList.add('hidden');
    document.getElementById('contenido')?.classList.add('hidden');
    const el = document.getElementById('estado-error');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  }

  async function cargarVenta(codigo) {
    if (!window.API_BASE) throw new Error('API no configurada.');
    const tid = typeof window.teatroIdFromUrl === 'function'
      ? window.teatroIdFromUrl()
      : (window.TEATRO_ID || 'wilberto');
    const res = await fetch(`${window.API_BASE}/api/${tid}/venta/${encodeURIComponent(codigo)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Boleto no encontrado.');
    }
    return res.json();
  }

  function ordenDesdeVenta(venta) {
    return {
      fecha: venta.funcionNombre || venta.fecha,
      funcionNombre: venta.funcionNombre || venta.fecha,
      certificado: venta.certificado || venta.codigo,
      numeroOrden: venta.certificado || venta.codigo,
      boletos: venta.boletos || [],
      cantidad: venta.cantidad,
      cantidadTotal: venta.cantidad || (venta.boletos && venta.boletos.length) || 1,
    };
  }

  function htmlVistaBoleto(orden, opts) {
    const cant = orden.cantidadTotal || orden.cantidad || 1;
    const folio = folioTaquillaOrden(orden);
    const cert = orden.numeroOrden || orden.certificado || '';
    const imgAlt = opts.fullTicket ? 'Boleto digital EL GORILA con código QR' : 'Código QR — presentar en puerta';
    const media = opts.previewSrc
      ? `<div class="boleto-preview">
        <img id="boleto-preview-img" src="${opts.previewSrc}" alt="${imgAlt}" loading="eager">
      </div>`
      : `<div class="boleto-preview">
        <div class="qr-box" id="qr-preview-live" aria-label="${imgAlt}"></div>
      </div>`;
    return `
      ${media}
      <p class="boleto-meta">${cant === 1 ? '1 entrada' : cant + ' entradas'}${folio ? ' · Folio ' + folio : ''}</p>
      ${cert ? `<p class="boleto-cert">${cert}</p>` : ''}
      <button type="button" class="btn-guardar-boleto" id="btn-guardar-boleto">
        <span class="material-symbols-outlined">download</span>
        Guardar imagen del boleto
      </button>
      <p class="boleto-hint">Presenta este QR en la entrada. Al compartir por WhatsApp se envía la imagen del boleto.</p>`;
  }

  function enlazarGuardarBoleto(canvas) {
    document.getElementById('btn-guardar-boleto')?.addEventListener('click', () => {
      if (!canvas || !window.GenerarImagenBoleto) return;
      GenerarImagenBoleto.guardarEnDispositivo(canvas, 'el-gorila-boleto.png', 'Mi boleto — EL GORILA')
        .catch((e) => {
          if (e.name !== 'AbortError') GenerarImagenBoleto.descargar(canvas, 'el-gorila-boleto.png');
        });
    });
  }

  async function pintarBoletitoCanvas(container, orden) {
    if (!container || !orden) return;

    const cant = orden.cantidadTotal || orden.cantidad || 1;
    const folio = folioTaquillaOrden(orden);
    const cert = orden.numeroOrden || orden.certificado || '';

    container.innerHTML = htmlVistaBoleto(orden, {});
    void pintarQR(document.getElementById('qr-preview-live'), codigoQrBoleto(orden), 280);

    if (!window.ElGorilaCompartirWa || !window.GenerarImagenBoleto) {
      pintarQrFallback(container, orden, cant, folio, cert);
      return;
    }

    try {
      const canvas = await ElGorilaCompartirWa.generarCanvas(orden);
      const dataUrl = canvas.toDataURL('image/png', 0.92);
      container.innerHTML = htmlVistaBoleto(orden, { previewSrc: dataUrl, fullTicket: true });
      enlazarGuardarBoleto(canvas);
    } catch (err) {
      console.warn('Boleto completo no disponible, mostrando QR:', err);
      document.getElementById('btn-guardar-boleto')?.addEventListener('click', async () => {
        try {
          const c = await ElGorilaCompartirWa.generarCanvas(orden);
          await GenerarImagenBoleto.guardarEnDispositivo(c, 'el-gorila-boleto.png', 'Mi boleto — EL GORILA');
        } catch (e) {
          if (e.name !== 'AbortError') alert('No se pudo guardar. Usa captura de pantalla del QR.');
        }
      }, { once: true });
    }
  }

  function pintarQrFallback(container, orden, cant, folio, cert) {
    const qrCodigo = codigoQrBoleto(orden);
    const qrData = window.ElGorilaQr ? window.ElGorilaQr.codigoQrPayload(qrCodigo) : qrCodigo;
    container.innerHTML = `
      <div class="boleto-fallback-qr">
        <div class="qr-box"><div id="qr-folio-fallback"></div></div>
        <div>
          <p class="boleto-meta" style="text-align:left;margin-bottom:8px;">${cant === 1 ? '1 entrada' : cant + ' entradas'}</p>
          ${folio ? `<p class="boleto-cert" style="text-align:left;margin-bottom:8px;">Folio: ${folio}</p>` : ''}
          ${cert ? `<p class="boleto-cert" style="text-align:left;">${cert}</p>` : ''}
          <p class="boleto-hint" style="text-align:left;margin-top:10px;">Presenta el QR en la entrada.</p>
        </div>
      </div>`;
    pintarQR(document.getElementById('qr-folio-fallback'), qrData, 84);
  }

  function montarBotonWhatsApp(orden) {
    const waContainer = document.getElementById('btn-whatsapp-container');
    if (!waContainer || !window.ElGorilaCompartirWa) return;

    const cantTotal = orden.cantidadTotal || orden.cantidad || 0;
    const entradas = cantTotal === 1 ? '1 entrada' : `${cantTotal} entradas`;
    waContainer.innerHTML = `
      <button type="button" id="btn-compartir-wa" class="btn-wa">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.109.549 4.09 1.508 5.814L0 24l6.335-1.496A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.882 9.882 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374A9.858 9.858 0 012.106 12c0-5.455 4.44-9.894 9.894-9.894 5.455 0 9.894 4.439 9.894 9.894 0 5.455-4.439 9.894-9.894 9.894z"/></svg>
        Compartir por WhatsApp · ${entradas}
      </button>
      <p class="wa-hint">Se abre WhatsApp con la imagen de tu boleto.</p>`;
    waContainer.classList.remove('hidden');

    const btnWa = document.getElementById('btn-compartir-wa');
    if (!btnWa) return;
    btnWa.addEventListener('click', async () => {
      btnWa.disabled = true;
      const label = btnWa.innerHTML;
      btnWa.textContent = 'Preparando boleto…';
      try {
        await ElGorilaCompartirWa.compartirPorWhatsApp(orden);
      } catch (e) {
        if (e.name !== 'AbortError') {
          alert('No se pudo compartir. Usa «Guardar imagen del boleto» arriba o el QR del correo.');
        }
      } finally {
        btnWa.disabled = false;
        btnWa.innerHTML = label;
      }
    });
  }

  async function init() {
    const codigo = codigoFromUrl();
    if (!codigo) {
      showError('Falta el código del boleto. Ábrelo desde el correo de confirmación.');
      return;
    }

    try {
      const venta = await cargarVenta(codigo);
      ordenCompra = ordenDesdeVenta(venta);

      document.getElementById('estado-carga')?.classList.add('hidden');
      document.getElementById('contenido')?.classList.remove('hidden');

      const fn = ordenCompra.fecha || 'EL GORILA';
      const n = ordenCompra.cantidadTotal || 1;
      document.getElementById('sub-funcion').textContent =
        `${fn} · ${n === 1 ? '1 entrada' : n + ' entradas'}`;

      const wrap = document.getElementById('boleto-preview-wrap');
      await pintarBoletitoCanvas(wrap, ordenCompra);
      montarBotonWhatsApp(ordenCompra);
    } catch (e) {
      showError((e.message || 'No se pudo cargar el boleto.') +
        ' Si acabas de comprar, espera unos segundos e intenta de nuevo.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
