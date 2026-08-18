/** QR de boleto: solo el código CERT (puerta escanea; el público no abre URLs). */
(function (global) {
  var QR_COLOR = { dark: '#1a1411', light: '#f1ead9' };

  function codigoQrPayload(codigo) {
    return (codigo || '').trim().toUpperCase();
  }

  /** 1 entrada → QR del cert individual; 2+ → certificado de orden. */
  function codigoQrOficial(venta) {
    const boletos = venta?.boletos || [];
    const cert = venta?.certificado || venta?.codigo || '';
    if (boletos.length === 1 && boletos[0]?.cert) return boletos[0].cert;
    return cert;
  }

  function qrOpts(size) {
    return {
      width: size || 240,
      margin: 1,
      color: QR_COLOR,
    };
  }

  function pintarQr(container, codigo, size) {
    if (!container) return Promise.resolve();
    var payload = codigoQrPayload(codigo);
    if (!payload) return Promise.resolve();
    if (typeof QRCode === 'undefined') {
      container.textContent = payload;
      return Promise.reject(new Error('QRCode no cargado'));
    }
    container.innerHTML = '';
    var canvas = document.createElement('canvas');
    container.appendChild(canvas);
    var opts = qrOpts(size);
    return QRCode.toCanvas(canvas, payload, opts).catch(function () {
      return QRCode.toDataURL(payload, opts).then(function (dataUrl) {
        container.innerHTML = '<img src="' + dataUrl + '" width="' + opts.width +
          '" height="' + opts.width + '" alt="QR boleto" style="display:block;">';
      });
    });
  }

  function dataUrlQrImagen(codigo, size) {
    if (typeof QRCode === 'undefined') {
      return Promise.reject(new Error('QRCode no cargado'));
    }
    return QRCode.toDataURL(codigoQrPayload(codigo), qrOpts(size));
  }

  global.ElGorilaQr = { codigoQrPayload, codigoQrOficial, pintarQr, dataUrlQrImagen };
})(window);
