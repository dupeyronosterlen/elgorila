/** Página mínima: carga boleto por certificado y abre WhatsApp con imagen. */
(function () {
  function codigoFromUrl() {
    const p = new URLSearchParams(window.location.search);
    return (p.get('c') || p.get('codigo') || '').trim().toUpperCase();
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
      cantidadTotal: venta.cantidad,
    };
  }

  async function init() {
    const codigo = codigoFromUrl();
    if (!codigo) {
      showError('Falta el código del boleto. Ábrelo desde el correo de confirmación.');
      return;
    }

    try {
      const venta = await cargarVenta(codigo);
      const orden = ordenDesdeVenta(venta);

      if (!window.ElGorilaCompartirWa || !window.GenerarImagenBoleto) {
        throw new Error('Generador no disponible.');
      }

      const canvas = await ElGorilaCompartirWa.generarCanvas(orden);
      const dataUrl = canvas.toDataURL('image/png');

      document.getElementById('estado-carga')?.classList.add('hidden');
      document.getElementById('contenido')?.classList.remove('hidden');

      const fn = orden.fecha || 'EL GORILA';
      const n = orden.cantidadTotal || 1;
      document.getElementById('sub-funcion').textContent =
        `${fn} · ${n === 1 ? '1 entrada' : n + ' entradas'}`;

      const img = document.getElementById('preview-img');
      if (img) img.src = dataUrl;

      const boletos = orden.boletos || [];
      const folio = boletos.length === 1 && boletos[0].folio
        ? boletos[0].folio
        : boletos.map(b => b.folio).filter(Boolean).join(' · ');
      const cert = orden.certificado || codigo;
      document.getElementById('meta-folio').textContent =
        (folio ? `Folio: ${folio} · ` : '') + cert;

      const btn = document.getElementById('btn-wa');
      if (btn) {
        btn.addEventListener('click', async function () {
          btn.disabled = true;
          try {
            await ElGorilaCompartirWa.compartirPorWhatsApp(orden);
          } catch (e) {
            if (e.name !== 'AbortError') {
              alert('No se pudo compartir. El QR está arriba: guárdalo con captura o el botón de descarga.');
            }
          } finally {
            btn.disabled = false;
          }
        });
        if (new URLSearchParams(window.location.search).get('wa') === '1') {
          setTimeout(() => btn.click(), 400);
        }
      }
    } catch (e) {
      showError(e.message || 'No se pudo cargar el boleto.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
