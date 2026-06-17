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
  const cert = venta.certificado || venta.codigo;
  if (cert) {
    customData.content_ids = [cert];
    customData.content_type = 'product';
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
