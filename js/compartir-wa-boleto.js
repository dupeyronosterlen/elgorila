/** Compartir boleto por WhatsApp — imagen PNG del boleto, sin subpágina intermedia. */
(function (global) {
  const VENUE = 'Teatro Wilberto Cantón';
  const DIRECCION = 'José María Velasco 59 · San José Insurgentes';

  function qrPayload(codigo) {
    if (global.ElGorilaQr) return global.ElGorilaQr.codigoQrPayload(codigo);
    return (codigo || '').trim().toUpperCase();
  }

  function qrCodigoOficial(orden) {
    if (global.ElGorilaQr) return global.ElGorilaQr.codigoQrOficial(orden);
    const boletos = orden.boletos || [];
    const cert = orden.certificado || orden.numeroOrden || orden.codigo || '';
    if (boletos.length === 1 && boletos[0].cert) return boletos[0].cert;
    return cert;
  }

  function folioTaquilla(orden) {
    const boletos = orden.boletos || [];
    if (boletos.length === 1 && boletos[0].folio) return boletos[0].folio;
    return boletos.map(b => b.folio).filter(Boolean).join(' · ') || null;
  }

  function entradasLabel(orden) {
    const n = orden.cantidadTotal || orden.cantidad || (orden.boletos && orden.boletos.length) || 1;
    return n === 1 ? '1 entrada' : `${n} entradas`;
  }

  function textoWhatsApp(orden) {
    const fn = orden.fecha || orden.funcionNombre || 'EL GORILA';
    const entradas = entradasLabel(orden);
    const folio = folioTaquilla(orden);
    const cert = orden.certificado || orden.numeroOrden || orden.codigo || '';
    const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : 'https://elgorilateatro.com.mx';
    const compartirPath = cert
      ? `/enviar-boleto.html?c=${encodeURIComponent(cert)}`
      : '';
    let t = `Voy a ver EL GORILA — ${fn}. ${entradas}.\n${VENUE}\n${DIRECCION}`;
    if (folio) t += `\nFolio taquilla: ${folio}`;
    if (cert) t += `\nCertificado: ${cert}`;
    t += '\n\nPresenta el QR adjunto en la entrada del teatro.';
    if (compartirPath) t += `\n\nBoleto con QR:\n${origin}${compartirPath}`;
    t += `\n\nPrograma de mano:\n${origin}/programa/v2.html`;
    return t;
  }

  async function generarCanvas(orden) {
    if (!global.GenerarImagenBoleto) throw new Error('Generador de boleto no disponible.');
    const boletos = orden.boletos || [];
    const cert = orden.certificado || orden.numeroOrden || orden.codigo || '';
    const n = orden.cantidadTotal || orden.cantidad || boletos.length || 1;
    const qrCodigo = qrCodigoOficial(orden);
    const folio = folioTaquilla(orden);
    const individual = n === 1 && boletos[0];
    return GenerarImagenBoleto.generar({
      funcion: orden.fecha || orden.funcionNombre || 'EL GORILA',
      entradas: entradasLabel(orden),
      modo: individual ? 'individual' : 'certificado',
      codigoLabel: individual ? 'Entrada' : 'Certificado',
      codigo: individual ? (boletos[0].cert || cert) : cert,
      folio,
      tipo: boletos[0] && boletos[0].tipo,
      seccion: boletos[0] && boletos[0].seccion,
      qrUrl: qrPayload(qrCodigo),
      logoUrl: 'img/LOGO/1.jpg',
      arteUrl: 'img/programa/portada-v4.jpg',
    });
  }

  /** Número para wa.me (México: 521 + 10 dígitos). */
  function normalizarTelefonoWa(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10) return '521' + d;
    if (d.length === 12 && d.startsWith('52')) return '521' + d.slice(2);
    if (d.length === 13 && d.startsWith('521')) return d;
    if (d.startsWith('52')) return d;
    return d;
  }

  function waMeUrl(texto, telefono) {
    const tel = normalizarTelefonoWa(telefono);
    const q = `?text=${encodeURIComponent(texto)}`;
    return tel ? `https://wa.me/${tel}${q}` : `https://wa.me/${q}`;
  }

  async function compartirArchivoNativo(file, texto) {
    if (!navigator.share) return false;
    const payload = { title: 'Mi boleto — EL GORILA', text: texto, files: [file] };
    try {
      if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;
      await navigator.share(payload);
      return true;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return false;
    }
  }

  async function compartirPorWhatsApp(orden, opts) {
    const telefono = opts && opts.telefono;
    const texto = textoWhatsApp(orden);
    const canvas = await generarCanvas(orden);
    const blob = await GenerarImagenBoleto.canvasToBlob(canvas);
    const file = new File([blob], 'el-gorila-boleto.png', { type: 'image/png' });

    // Con teléfono del comprador (taquilla): abrir chat directo — el share nativo no elige contacto.
    if (!telefono && await compartirArchivoNativo(file, texto)) return;

    await GenerarImagenBoleto.descargar(canvas, 'el-gorila-boleto.png');
    const hint = telefono
      ? 'Adjunta la imagen *el-gorila-boleto.png* (acaba de descargarse) y envía.'
      : 'Adjunta la imagen *el-gorila-boleto.png* (acaba de descargarse) en este chat de WhatsApp.';
    window.open(waMeUrl(`${texto}\n\n${hint}`, telefono), '_blank', 'noopener');
  }

  global.ElGorilaCompartirWa = {
    textoWhatsApp, compartirPorWhatsApp, generarCanvas, waMeUrl, normalizarTelefonoWa,
  };
})(window);
