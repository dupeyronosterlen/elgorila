/**
 * Headers de seguridad en HTML público.
 * No toca el Worker de la API ni admin.html (Cloudflare Access).
 * Si este Worker falla, quitar rutas: wrangler delete --cwd worker-headers
 *
 * En js/config.js reescribe el host de la API a este mismo origen para que
 * la compra no dependa de *.workers.dev (redes Izzi y similares lo cuelgan).
 */
const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=15552000',
};

const WORKERS_DEV_API = 'https://elgorila-api.dupeyronosterlen.workers.dev';

function aplicarHeaders(headers) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = await fetch(request);
    const headers = new Headers(origin.headers);
    aplicarHeaders(headers);

    const esConfigJs = /\/js\/config\.js$/i.test(url.pathname);
    if (esConfigJs && origin.ok) {
      const text = (await origin.text()).split(WORKERS_DEV_API).join(url.origin);
      headers.set('Content-Type', 'application/javascript; charset=utf-8');
      headers.set('Cache-Control', 'public, max-age=60');
      return new Response(text, {
        status: origin.status,
        statusText: origin.statusText,
        headers,
      });
    }

    return new Response(origin.body, {
      status: origin.status,
      statusText: origin.statusText,
      headers,
    });
  },
};
