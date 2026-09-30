/** Meta Conversions API — Purchase desde servidor (dedup con pixel vía event_id). */

import { logError } from './logs.js';

const META_PIXEL_DEFAULT = '24471801772518505';
const META_GRAPH_VERSION = 'v21.0';

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function splitNombre(nombre) {
  if (!nombre || typeof nombre !== 'string') return { fn: null, ln: null };
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { fn: null, ln: null };
  if (parts.length === 1) return { fn: parts[0].toLowerCase(), ln: null };
  return { fn: parts[0].toLowerCase(), ln: parts.slice(1).join(' ').toLowerCase() };
}

export function purchaseEventId(sessionId, fallback) {
  const sid = (sessionId || fallback || '').trim();
  return sid ? `purchase_${sid}` : '';
}

function catalogContentId(fecha) {
  const f = (fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
  return `gorila-${f}`;
}

export async function sendMetaCapiPurchase(venta, env, opts = {}) {
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = (env.META_PIXEL_ID || META_PIXEL_DEFAULT).trim();
  if (!token) return { ok: false, skipped: true, reason: 'no_token' };

  const eventId = opts.eventId
    || purchaseEventId(venta.sessionId, venta.certificado || venta.codigo);
  if (!eventId) return { ok: false, skipped: true, reason: 'no_event_id' };

  const userData = {};
  const email = normalizeEmail(venta.email);
  if (email) userData.em = [await sha256Hex(email)];

  const { fn, ln } = splitNombre(venta.nombre);
  if (fn) userData.fn = [await sha256Hex(fn)];
  if (ln) userData.ln = [await sha256Hex(ln)];

  if (opts.clientIp) userData.client_ip_address = opts.clientIp;
  if (opts.userAgent) userData.client_user_agent = opts.userAgent;
  if (opts.fbp) userData.fbp = opts.fbp;
  if (opts.fbc) userData.fbc = opts.fbc;

  const extId = venta.sessionId || venta.certificado || venta.codigo;
  if (extId) userData.external_id = [await sha256Hex(String(extId))];

  const customData = {
    currency: 'MXN',
    value: venta.total != null ? Number(venta.total) : 0,
  };
  const catId = catalogContentId(venta.fecha);
  const qty = Number(venta.cantidad || venta.cantidadTotal) || 1;
  if (catId) {
    customData.content_ids = [catId];
    customData.content_type = 'product';
    customData.contents = [{ id: catId, quantity: qty }];
  }

  const payload = {
    data: [{
      event_name:       'Purchase',
      event_time:       Math.floor(Date.now() / 1000),
      event_id:         eventId,
      event_source_url: opts.eventSourceUrl || 'https://elgorilateatro.com.mx/confirmacion.html',
      action_source:    'website',
      user_data:        userData,
      custom_data:      customData,
    }],
  };

  try {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      logError('meta.capi.response', { status: res.status, error: body?.error?.message || 'api_error' });
      return { ok: false, error: body };
    }
    return { ok: true, eventsReceived: body.events_received, eventId };
  } catch (e) {
    logError('meta.capi.exception', { error: e.message });
    return { ok: false, error: e.message };
  }
}

/**
 * Meta Conversions API — ViewContent desde servidor (30-sep-2026).
 *
 * Por qué existe: el ViewContent del navegador SÍ dispara bien (confirmado en
 * vivo con performance.getEntriesByType — el evento sale con content_name e
 * URL correctos), pero bloqueadores de anuncios / iOS ATT impiden que una
 * fracción real de esos eventos llegue a Meta o se asocie a una persona. Las
 * Website Custom Audience de "Visitantes-*" se quedan atrapadas en el piso de
 * reporte (~20) pese a haber miles de vistas reales. CAPI manda el mismo
 * evento por servidor en paralelo, sin depender del navegador del usuario.
 *
 * Configuración vía variables de entorno del worker (Cloudflare Dashboard,
 * NUNCA en wrangler.toml [vars] -- ver nota arriba del archivo), pensado para
 * reusarse tal cual en otra producción/gira sin tocar código:
 *   META_CAPI_VIEWCONTENT_ENABLED  → "true" prende la función completa. Con
 *       cualquier otro valor u omitido, queda apagada -- interruptor
 *       permanente y explícito, no algo que se "olvide prendido".
 *   META_CAPI_VIEWCONTENT_PAGES    → lista separada por comas de los
 *       content_name permitidos, ej. "sobre-la-obra,historia-del-gorila,boletos"
 *       (deben coincidir con el data-viewcontent="..." de cada página). El
 *       cliente (js/analytics.js) ya no trae su propia lista hardcodeada --
 *       intenta mandar siempre; el servidor es la única fuente de verdad y
 *       simplemente ignora silenciosamente lo que no esté en esta lista.
 *   META_CAPI_TEST_EVENT_CODE      → SOLO durante la verificación en Events
 *       Manager (Meta marca esos eventos como prueba, no cuentan para nada
 *       real) -- se borra del Dashboard en cuanto se confirma que dedupla
 *       bien. Esto sí es temporal por diseño de Meta, no es el interruptor
 *       de la función.
 *
 * Dedup con el píxel del navegador: mismo event_id en ambos lados (lo genera
 * el cliente en analytics.js y lo manda también acá) — Meta cuenta 1 solo
 * evento si event_name + event_id coinciden. Ver sendMetaCapiPurchase arriba,
 * mismo patrón ya probado en producción para Purchase.
 */
export function isCapiViewContentEnabled(env) {
  return (env.META_CAPI_VIEWCONTENT_ENABLED || '').trim().toLowerCase() === 'true';
}

export function isCapiViewContentPageAllowed(contentName, env) {
  const name = (contentName || '').trim().toLowerCase();
  if (!name) return false;
  const allowed = (env.META_CAPI_VIEWCONTENT_PAGES || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(name);
}

export async function sendMetaCapiViewContent(data, env, opts = {}) {
  if (!isCapiViewContentEnabled(env)) return { ok: false, skipped: true, reason: 'disabled' };

  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = (env.META_PIXEL_ID || META_PIXEL_DEFAULT).trim();
  if (!token) return { ok: false, skipped: true, reason: 'no_token' };

  const eventId = (data.eventId || '').trim();
  const contentName = (data.contentName || '').trim();
  if (!eventId || !contentName) return { ok: false, skipped: true, reason: 'missing_fields' };
  if (!isCapiViewContentPageAllowed(contentName, env)) {
    return { ok: false, skipped: true, reason: 'page_not_allowed' };
  }

  const userData = {};
  if (opts.clientIp) userData.client_ip_address = opts.clientIp;
  if (opts.userAgent) userData.client_user_agent = opts.userAgent;
  if (data.fbp) userData.fbp = data.fbp;
  if (data.fbc) userData.fbc = data.fbc;

  const payload = {
    data: [{
      event_name:       'ViewContent',
      event_time:       Math.floor(Date.now() / 1000),
      event_id:         eventId,
      event_source_url: data.url || `https://elgorilateatro.com.mx/${contentName}.html`,
      action_source:    'website',
      user_data:        userData,
      custom_data:      { content_name: contentName, content_type: 'product' },
    }],
  };
  // Modo de prueba (Events Manager → Test Events): fijar META_CAPI_TEST_EVENT_CODE
  // en el env del worker mientras se valida el piloto; quitarlo para producción real.
  if (env.META_CAPI_TEST_EVENT_CODE) payload.test_event_code = env.META_CAPI_TEST_EVENT_CODE;

  try {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      logError('meta.capi_vc.response', { status: res.status, error: body?.error?.message || 'api_error' });
      return { ok: false, error: body };
    }
    return { ok: true, eventsReceived: body.events_received, eventId };
  } catch (e) {
    logError('meta.capi_vc.exception', { error: e.message });
    return { ok: false, error: e.message };
  }
}
