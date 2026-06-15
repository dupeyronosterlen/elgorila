/** QR de boleto: solo el código CERT (puerta escanea; el público no abre URLs). */
(function (global) {
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

  function urlQrImagen(codigo, size = 240) {
    const data = encodeURIComponent(codigoQrPayload(codigo));
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&color=1a1411&bgcolor=f1ead9&margin=8&data=${data}`;
  }

  global.ElGorilaQr = { codigoQrPayload, codigoQrOficial, urlQrImagen };
})(window);
