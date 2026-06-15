/**
 * Boleto vertical (9:16) — PNG / PDF para compartir, WhatsApp y taquilla.
 * Folio interno visible para ubicar la venta en lista de puerta.
 */
(function (global) {
  const W = 540;
  const H = 960;
  const VENUE = 'Teatro Wilberto Cantón';
  const DIRECCION = 'San José Insurgentes, CDMX';

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
    if (typeof QRCode !== 'undefined') {
      const c = document.createElement('canvas');
      await QRCode.toCanvas(c, data, {
        width: size,
        margin: 1,
        color: { dark: '#1a1411', light: '#f1ead9' },
      });
      return c;
    }
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const payload = encodeURIComponent(data);
    const img = await loadImage(
      `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&color=1a1411&bgcolor=f1ead9&margin=8&data=${payload}`,
    );
    c.getContext('2d').drawImage(img, 0, 0, size, size);
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

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * @param {object} opts
   * @param {string} opts.funcion
   * @param {string} opts.entradas
   * @param {string} opts.modo — "certificado" | "individual"
   * @param {string} opts.codigoLabel
   * @param {string} opts.codigo
   * @param {string} [opts.folio] — folio taquilla (1300-260819-00001)
   * @param {string} [opts.tipo]
   * @param {string} [opts.seccion]
   * @param {string} opts.qrUrl
   * @param {string} [opts.logoUrl]
   * @param {string} [opts.arteUrl]
   */
  async function generar(opts) {
    if (!opts?.qrUrl) throw new Error('Falta código QR del boleto.');

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
    ctx.fillStyle = '#D43A1A';
    ctx.fillRect(12, 12, W - 24, 3);

    // ── Logo
    const logoUrl = opts.logoUrl || 'img/LOGO/1.jpg';
    try {
      const logo = await loadImage(logoUrl);
      const lw = 56;
      const lh = (logo.height / logo.width) * lw;
      ctx.save();
      roundRect(ctx, 28, 36, lw, lh, 4);
      ctx.clip();
      ctx.drawImage(logo, 28, 36, lw, lh);
      ctx.restore();
    } catch { /* sin logo */ }

    // ── Encabezado
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#d99b3a';
    ctx.fillText('EL GORILA · TEATRO 2026', 96, 52);

    ctx.font = '500 38px Georgia, "Cormorant Garamond", serif';
    ctx.fillStyle = '#f1ead9';
    ctx.fillText('EL ', 96, 92);
    const elW = ctx.measureText('EL ').width;
    ctx.fillStyle = '#D43A1A';
    ctx.font = 'italic 500 38px Georgia, serif';
    ctx.fillText('Gorila', 96 + elW, 92);

    ctx.font = 'italic 400 18px Georgia, serif';
    ctx.fillStyle = '#d99b3a';
    ctx.fillText(opts.entradas || '1 entrada', 96, 118);

    // ── Función
    ctx.fillStyle = 'rgba(241,234,217,.5)';
    ctx.font = '500 8px "JetBrains Mono", monospace';
    ctx.fillText('FUNCIÓN', 28, 158);
    ctx.fillStyle = '#f1ead9';
    ctx.font = '500 22px Georgia, serif';
    wrapText(ctx, opts.funcion || '', 28, 182, W - 56, 26, 3);

    ctx.fillStyle = 'rgba(241,234,217,.65)';
    ctx.font = '400 14px Georgia, serif';
    ctx.fillText(VENUE, 28, 268);
    ctx.font = '400 12px Georgia, serif';
    ctx.fillStyle = 'rgba(241,234,217,.45)';
    ctx.fillText(DIRECCION, 28, 286);

    if (opts.tipo || opts.seccion) {
      ctx.font = '500 8px "JetBrains Mono", monospace';
      ctx.fillStyle = '#d99b3a';
      const zona = [opts.tipo, opts.seccion].filter(Boolean).join(' · ').toUpperCase();
      ctx.fillText(zona, 28, 308);
    }

    // ── Folio taquilla (destacado)
    const folio = (opts.folio || '').trim();
    if (folio) {
      ctx.fillStyle = 'rgba(217,155,58,0.12)';
      roundRect(ctx, 28, 322, W - 56, 52, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(217,155,58,0.45)';
      ctx.lineWidth = 1;
      roundRect(ctx, 28, 322, W - 56, 52, 6);
      ctx.stroke();
      ctx.font = '500 8px "JetBrains Mono", monospace';
      ctx.fillStyle = '#d99b3a';
      ctx.fillText('FOLIO TAQUILLA', 40, 342);
      ctx.font = '600 20px "JetBrains Mono", monospace';
      ctx.fillStyle = '#f1ead9';
      ctx.fillText(folio, 40, 366);
    }

    // ── Bloque papel + QR
    const paperY = folio ? 392 : 320;
    const paperH = H - paperY - 20;
    ctx.fillStyle = '#f1ead9';
    ctx.fillRect(0, paperY, W, paperH);
    ctx.fillStyle = '#e8dfc8';
    ctx.fillRect(0, paperY, W, 2);

    const qrSize = folio ? 220 : 240;
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
    ctx.font = '500 8px "JetBrains Mono", monospace';
    ctx.fillStyle = '#D43A1A';
    ctx.fillText((opts.codigoLabel || 'CERTIFICADO').toUpperCase(), W / 2, ty);
    ty += 18;
    ctx.fillStyle = '#1a1411';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    const codigoLines = (opts.codigo || '').match(/.{1,24}/g) || [''];
    codigoLines.slice(0, 2).forEach(line => {
      ctx.fillText(line, W / 2, ty);
      ty += 14;
    });
    ty += 6;
    ctx.font = '400 13px Georgia, serif';
    ctx.fillStyle = '#3a2e26';
    const hint = opts.modo === 'certificado'
      ? 'Presenta este QR en la entrada del teatro · válido para todas las entradas.'
      : 'Presenta este QR en puerta · una persona por pase.';
    wrapText(ctx, hint, W / 2 - (W - 80) / 2, ty, W - 80, 18, 2);

    ctx.textAlign = 'left';
    ctx.font = '400 11px Georgia, serif';
    ctx.fillStyle = '#6b5c4a';
    ctx.fillText('Llega 30 min antes · elgorilateatro.com.mx', 28, H - 28);

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
    const texto = `${titulo || 'Mi boleto — EL GORILA'}\n${VENUE}`;
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
