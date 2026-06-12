/**
 * Genera PNG del boleto en canvas — estilo programa v2 (540px ancho).
 */
(function (global) {
  const W = 540;
  const H = 780;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar el logo.'));
      img.src = src;
    });
  }

  async function qrCanvas(data, size) {
    const c = document.createElement('canvas');
    await QRCode.toCanvas(c, data, {
      width: size,
      margin: 1,
      color: { dark: '#1a1411', light: '#f1ead9' },
    });
    return c;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = (text || '').split(/\s+/);
    let line = '';
    let cy = y;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line.trim(), x, cy);
        line = words[i] + ' ';
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), x, cy);
    return cy;
  }

  /**
   * @param {object} opts
   * @param {string} opts.funcion
   * @param {string} opts.entradas — "2 entradas" | "Entrada 1 de 3"
   * @param {string} opts.modo — "certificado" | "individual"
   * @param {string} opts.codigoLabel — "Certificado" | "Entrada"
   * @param {string} opts.codigo
   * @param {string} opts.qrUrl — URL codificada en el QR (verificar)
   * @param {string} [opts.logoUrl]
   */
  async function generar(opts) {
    if (typeof QRCode === 'undefined') throw new Error('QRCode no disponible.');

    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Fondo v2
    ctx.fillStyle = '#0a0706';
    ctx.fillRect(0, 0, W, H);

    // Bloque papel inferior
    ctx.fillStyle = '#f1ead9';
    ctx.fillRect(0, H - 280, W, 280);

    // Logo
    const logoUrl = opts.logoUrl || 'img/LOGO/1.jpg';
    try {
      const logo = await loadImage(logoUrl);
      const lw = 72;
      const lh = (logo.height / logo.width) * lw;
      ctx.save();
      ctx.beginPath();
      ctx.rect(28, 28, lw, lh);
      ctx.clip();
      ctx.drawImage(logo, 28, 28, lw, lh);
      ctx.restore();
      ctx.strokeStyle = 'rgba(241,234,217,.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(28, 28, lw, lh);
    } catch {
      /* sin logo */
    }

    // Kicker
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#d99b3a';
    ctx.fillText('BOLETO · EL GORILA · 2026', 28, 118);

    // Título
    ctx.font = '500 44px Georgia, "Cormorant Garamond", serif';
    ctx.fillStyle = '#f1ead9';
    ctx.fillText('EL ', 28, 168);
    const elW = ctx.measureText('EL ').width;
    ctx.fillStyle = '#D43A1A';
    ctx.font = 'italic 500 44px Georgia, serif';
    ctx.fillText('Gorila', 28 + elW, 168);

    // Entradas
    ctx.font = '400 22px Georgia, serif';
    ctx.fillStyle = '#f1ead9';
    ctx.fillRect(28, 182, 2, 36);
    ctx.fillStyle = '#d99b3a';
    ctx.font = 'italic 400 22px Georgia, serif';
    ctx.fillText(opts.entradas || '1 entrada', 40, 208);

    // Función (zona oscura)
    ctx.fillStyle = 'rgba(241,234,217,.55)';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText('TU FUNCIÓN', 28, 248);
    ctx.fillStyle = '#f1ead9';
    ctx.font = '500 24px Georgia, serif';
    wrapText(ctx, opts.funcion || '', 28, 272, W - 56, 28);

    // QR en bloque papel
    const qr = await qrCanvas(opts.qrUrl, 200);
    const qrX = 28;
    const qrY = H - 252;
    ctx.fillStyle = '#f1ead9';
    ctx.fillRect(qrX - 4, qrY - 4, 208, 208);
    ctx.strokeStyle = '#c9b896';
    ctx.strokeRect(qrX - 4, qrY - 4, 208, 208);
    ctx.drawImage(qr, qrX, qrY, 200, 200);

    const tx = 250;
    let ty = H - 240;
    ctx.fillStyle = '#D43A1A';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText((opts.codigoLabel || 'CERTIFICADO').toUpperCase(), tx, ty);
    ty += 22;
    ctx.fillStyle = '#1a1411';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    const codigoLines = (opts.codigo || '').match(/.{1,22}/g) || [''];
    codigoLines.slice(0, 3).forEach(line => {
      ctx.fillText(line, tx, ty);
      ty += 16;
    });
    ty += 8;
    ctx.font = '400 15px Georgia, serif';
    ctx.fillStyle = '#3a2e26';
    const hint = opts.modo === 'certificado'
      ? 'Acceso a todas las entradas de esta compra.'
      : 'Entrada individual · escanea en puerta.';
    wrapText(ctx, hint, tx, ty, W - tx - 28, 20);

    // Pie
    ctx.fillStyle = '#6b5c4a';
    ctx.font = '400 13px Georgia, serif';
    ctx.fillText('Teatro Wilberto Cantón · CDMX', 28, H - 24);

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

  global.GenerarImagenBoleto = { generar, descargar, canvasToBlob };
})(window);
