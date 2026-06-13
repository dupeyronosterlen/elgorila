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

  global.ElGorilaQr = { codigoQrPayload, codigoQrOficial };
})(window);
