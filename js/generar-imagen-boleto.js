/**
 * Boleto vertical (9:16) — PNG / PDF para compartir, WhatsApp y taquilla.
 * Folio interno visible para ubicar la venta en lista de puerta.
 */
(function (global) {
  const W = 540;
  const H = 960;
  const VENUE = 'Teatro Wilberto Cantón';
  const CALLE = 'José María Velasco 59';
  const COLONIA = 'San José Insurgentes';
  const DIRECCION_BOLETO = `${CALLE} · ${COLONIA}`;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      try {
        const resolved = new URL(src, global.location?.href || 'https://elgorilateatro.com.mx/');
        if (resolved.origin !== (global.location?.origin || '')) {
          img.crossOrigin = 'anonymous';
        }
      } catch {
        /* rutas relativas: sin crossOrigin para no “taint” el canvas */
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar imagen: ' + src));
      img.src = src;
    });
  }

  async function qrCanvas(data, size) {
    if (typeof QRCode === 'undefined') {
      throw new Error('QRCode no cargado');
    }
    const c = document.createElement('canvas');
    await QRCode.toCanvas(c, data, {
      width: size,
      margin: 1,
      color: { dark: '#1a1411', light: '#f1ead9' },
    });
    return c;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = (text || '').split(/\s+/);
    let line = '';
    let cy = y;
    let lines = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line.trim(), x, cy);
        line = words[i] + ' ';
        cy += lineHeight;
        lines += 1;
        if (maxLines && lines >= maxLines) return cy;
      } else {
        line = test;
      }
    }
    if (line.trim()) {
      ctx.fillText(line.trim(), x, cy);
      cy += lineHeight;
    }
    return cy;
  }

  /** Separador ornamental (línea·diamante·línea) centrado en (cx, y). */
  function dividerOrnamental(ctx, cx, y) {
    ctx.save();
    ctx.lineWidth = 1;
    const gradL = ctx.createLinearGradient(cx - 100, y, cx - 14, y);
    gradL.addColorStop(0, 'rgba(217,155,58,0)');
    gradL.addColorStop(1, 'rgba(217,155,58,0.55)');
    ctx.strokeStyle = gradL;
    ctx.beginPath();
    ctx.moveTo(cx - 100, y);
    ctx.lineTo(cx - 14, y);
    ctx.stroke();
    const gradR = ctx.createLinearGradient(cx + 14, y, cx + 100, y);
    gradR.addColorStop(0, 'rgba(217,155,58,0.55)');
    gradR.addColorStop(1, 'rgba(217,155,58,0)');
    ctx.strokeStyle = gradR;
    ctx.beginPath();
    ctx.moveTo(cx + 14, y);
    ctx.lineTo(cx + 100, y);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#d99b3a';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
    ctx.restore();
  }

  /**
   * @param {object} opts
   * @param {string} opts.funcion
   * @param {string} opts.entradas
   * @param {string} opts.modo — "certificado" | "individual"
   * @param {string} opts.codigoLabel
   * @param {string} opts.codigo
   * @param {string} [opts.folio] — folio taquilla; se acepta por compatibilidad pero
   *   ya no se imprime en el boleto (uso interno de taquilla/admin).
   * @param {string} [opts.tipo]
   * @param {string} [opts.seccion]
   * @param {string} opts.qrUrl
   * @param {string} [opts.logoUrl] — aceptado por compatibilidad; el logo ya no se dibuja.
   * @param {string} [opts.arteUrl]
   */
  async function generar(opts) {
    if (!opts?.qrUrl) throw new Error('Falta código QR del boleto.');

    // Las fuentes nuevas (IM Fell English / Courier Prime) deben estar
    // parseadas por el navegador antes de dibujar texto en canvas, o cae
    // silenciosamente a la fuente de respaldo en la imagen exportada.
    try { await document.fonts.ready; } catch { /* sin Font Loading API */ }

    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // ── Fondo base
    ctx.fillStyle = '#0a0706';
    ctx.fillRect(0, 0, W, H);

    // ── Arte de fondo (portada / obra, sutil)
    const arteUrl = opts.arteUrl || 'img/programa/portada-v4.jpg';
    try {
      const arte = await loadImage(arteUrl);
      ctx.save();
      ctx.globalAlpha = 0.22;
      const ar = arte.width / arte.height;
      const drawH = 420;
      const drawW = drawH * ar;
      const ax = (W - drawW) / 2;
      ctx.drawImage(arte, ax, 0, drawW, drawH);
      ctx.restore();
      const grad = ctx.createLinearGradient(0, 0, 0, 480);
      grad.addColorStop(0, 'rgba(10,7,6,0.15)');
      grad.addColorStop(1, '#0a0706');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, 480);
    } catch { /* sin arte */ }

    // ── Borde decorativo
    ctx.strokeStyle = 'rgba(217,155,58,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.fillStyle = '#B23A1E';
    ctx.fillRect(12, 12, W - 24, 3);

    // ── Encabezado (centrado, sin logo)
    ctx.textAlign = 'center';
    ctx.font = '500 9px "Courier Prime", monospace';
    ctx.fillStyle = '#d99b3a';
    ctx.fillText('EL GORILA · TEATRO 2026', W / 2, 56);

    const tituloY = 96;
    const FONT_TITULO = '400 46px "IM Fell English", Georgia, serif';
    const FONT_TITULO_ITALIC = 'italic 400 46px "IM Fell English", Georgia, serif';
    ctx.font = FONT_TITULO;
    const elW = ctx.measureText('EL ').width;
    ctx.font = FONT_TITULO_ITALIC;
    const gorilaW = ctx.measureText('Gorila').width;
    const tituloX = W / 2 - (elW + gorilaW) / 2;
    ctx.textAlign = 'left';
    ctx.font = FONT_TITULO;
    ctx.fillStyle = '#f1ead9';
    ctx.fillText('EL ', tituloX, tituloY);
    ctx.fillStyle = '#C1401F';
    ctx.font = FONT_TITULO_ITALIC;
    ctx.fillText('Gorila', tituloX + elW, tituloY);
    ctx.textAlign = 'center';

    const entradasY = tituloY + 34;
    ctx.font = 'italic 400 18px "Cormorant Garamond", Georgia, serif';
    ctx.fillStyle = '#d99b3a';
    ctx.fillText(opts.entradas || '1 entrada', W / 2, entradasY);

    const dividerY = entradasY + 26;
    dividerOrnamental(ctx, W / 2, dividerY);

    // ── Función
    ctx.textAlign = 'left';
    const funcionLabelY = dividerY + 40;
    ctx.fillStyle = 'rgba(241,234,217,.5)';
    ctx.font = '500 8px "Courier Prime", monospace';
    ctx.fillText('FUNCIÓN', 28, funcionLabelY);
    ctx.fillStyle = '#f1ead9';
    ctx.font = '500 22px "Cormorant Garamond", Georgia, serif';
    let cy = wrapText(ctx, opts.funcion || '', 28, funcionLabelY + 26, W - 56, 26, 3);

    cy += 12;
    ctx.fillStyle = 'rgba(241,234,217,.65)';
    ctx.font = '500 15px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(VENUE, 28, cy);
    cy += 20;
    ctx.font = '400 12px "Cormorant Garamond", Georgia, serif';
    ctx.fillStyle = 'rgba(241,234,217,.55)';
    ctx.fillText(CALLE, 28, cy);
    cy += 16;
    ctx.fillText(COLONIA, 28, cy);
    cy += 18;

    if (opts.tipo || opts.seccion) {
      ctx.font = '500 8px "Courier Prime", monospace';
      ctx.fillStyle = '#d99b3a';
      const zona = [opts.tipo, opts.seccion].filter(Boolean).join(' · ').toUpperCase();
      ctx.fillText(zona, 28, cy);
      cy += 14;
    }

    // ── Bloque papel + QR (el folio taquilla ya no se imprime en el boleto:
    // se sigue generando y guardando igual para taquilla/admin, solo deja de
    // mostrarse aquí — el espacio se lo damos al QR).
    const paperY = cy + 14;
    const paperH = H - paperY - 20;
    ctx.fillStyle = '#f1ead9';
    ctx.fillRect(0, paperY, W, paperH);
    ctx.save();
    ctx.strokeStyle = 'rgba(217,155,58,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, paperY);
    ctx.lineTo(W, paperY);
    ctx.stroke();
    ctx.restore();

    const qrSize = 380;
    const qrY = paperY + 28;
    const qrX = (W - qrSize) / 2;
    const qr = await qrCanvas(opts.qrUrl, qrSize);
    ctx.fillStyle = '#fff';
    ctx.fillRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);
    ctx.strokeStyle = '#c9b896';
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

    let ty = qrY + qrSize + 28;
    ctx.textAlign = 'center';
    ctx.font = '500 8px "Courier Prime", monospace';
    ctx.fillStyle = '#B23A1E';
    ctx.fillText((opts.codigoLabel || 'CERTIFICADO').toUpperCase(), W / 2, ty);
    ty += 18;
    ctx.fillStyle = '#1a1411';
    ctx.font = '500 10px "Courier Prime", monospace';
    const codigoLines = (opts.codigo || '').match(/.{1,24}/g) || [''];
    codigoLines.slice(0, 2).forEach(line => {
      ctx.fillText(line, W / 2, ty);
      ty += 14;
    });
    ty += 8;
    ctx.font = 'italic 400 15px "Cormorant Garamond", Georgia, serif';
    ctx.fillStyle = '#3a2e26';
    const hint = 'Presenta este QR en taquilla · válido para todas las entradas.';
    wrapText(ctx, hint, W / 2, ty, W - 80, 20, 2);

    ctx.font = '400 12px "Cormorant Garamond", Georgia, serif';
    ctx.fillStyle = '#6b5c4a';
    ctx.fillText('Llega 30 min antes', W / 2, H - 40);
    ctx.fillText(DIRECCION_BOLETO, W / 2, H - 24);
    ctx.textAlign = 'left';

    // Marca de agua sutil
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.font = 'italic 80px Georgia, serif';
    ctx.fillStyle = '#D43A1A';
    ctx.translate(W - 40, H - 120);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('K', 0, 0);
    ctx.restore();

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Error al crear imagen.'))), 'image/png');
    });
  }

  function descargar(canvas, filename) {
    return canvasToBlob(canvas).then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return blob;
    });
  }

  function descargarPdf(canvas, filename) {
    if (!global.jspdf?.jsPDF) {
      return Promise.reject(new Error('Generador PDF no cargado.'));
    }
    const { jsPDF } = global.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [W, H],
      compress: true,
    });
    const img = canvas.toDataURL('image/png', 1.0);
    pdf.addImage(img, 'PNG', 0, 0, W, H, undefined, 'FAST');
    pdf.save((filename || 'boleto').replace(/\.png$/i, '.pdf'));
    return Promise.resolve();
  }

  /** Compartir / guardar en dispositivo (equivalente práctico a Wallet en móvil). */
  async function guardarEnDispositivo(canvas, filename, titulo) {
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], filename, { type: 'image/png' });
    const texto = `${titulo || 'Mi boleto — EL GORILA'}\n${VENUE}\n${DIRECCION_BOLETO}`;
    if (navigator.share) {
      const payload = { title: titulo || 'EL GORILA', text: texto };
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ ...payload, files: [file] });
        return;
      }
      await navigator.share(payload);
      return;
    }
    await descargar(canvas, filename);
  }

  global.GenerarImagenBoleto = {
    generar, descargar, descargarPdf, canvasToBlob, guardarEnDispositivo,
  };
})(window);
