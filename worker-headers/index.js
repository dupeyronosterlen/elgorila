/**
 * Headers de seguridad en HTML público.
 * No toca el Worker de la API ni admin.html (Cloudflare Access).
 * Si este Worker falla, quitar rutas: wrangler delete --cwd worker-headers
 */
const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=15552000',
};

export default {
  async fetch(request) {
    const origin = await fetch(request);
    const headers = new Headers(origin.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }
    return new Response(origin.body, {
      status: origin.status,
      statusText: origin.statusText,
      headers,
    });
  },
};
