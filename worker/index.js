// ─── WORKER: EL GORILA — BOLETAJE MULTI-VENUE v3.0 ────────────────────────────
//
// KV SCHEMA (namespaces: VENTAS, INVENTARIO)
//
// INVENTARIO:
//   {tid}:config                   → JSON VenueConfig (nombre, venue, direccion, secciones[])
//   {tid}:funciones:activas        → JSON array FuncionConfig
//   {tid}:funcion:{YYYY-MM-DD}     → JSON InventarioFuncion (version, bloqueado, secciones:{})
//   inventario.holds[reservaId]    → hold sin pago (15 min); vendidos = pagados
//   ratelimit:{ip}:{ventana}       → '1' — TTL 900s  ← GLOBAL, sin prefijo tid
//
// VENTAS:
//   {tid}:venta:{sessionId}        → JSON Venta
//   {tid}:cert:{codigo}            → JSON { sessionId }
//   {tid}:ventaIdx:{fecha}:{sid}   → sessionId
//   {tid}:lista:{fecha}:{ts}       → JSON entrada lista espera
//   {tid}:fiscal:reserva:acumulado → JSON { acumulado: number }
//   metrica:dia:{YYYY-MM-DD}       → JSON agregados ventas (tipos, UTM, secciones — sin PII)
//   metrica:checkout:{YYYY-MM-DD}  → JSON intentos checkout (embudo)
//
// TEATRO IDs: wilberto, ccc, gira-xxx…  «gorila» es alias histórico → wilberto (mismo KV).
// COMPAT: ventas pre-v3 sin prefijo tid; _lookupVenta busca legacy solo para gorila.
// ──────────────────────────────────────────────────────────────────────────────

import {
  findKVUser, getUsuariosKV, saveUsuariosKV, hashPasswordPBKDF2,
  registrarAuditoria, listAuditoria, getSitioConfig, saveSitioConfig,
} from './admin-extra.js';
import { googleWalletSaveUrl, appleWalletPkpass, walletStatus } from './wallet.js';
import { sendMetaCapiPurchase, purchaseEventId } from './meta-capi.js';
import {
  logInfo, logError, maskEmail, truncateId, sanitizeObject,
  metricaFromVenta, registrarMetricaVenta, registrarMetricaCheckout, listMetricasDias,
} from './logs.js';

// ─── CORS + HELPERS ──────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  'https://elgorilateatro.com.mx',
  'https://www.elgorilateatro.com.mx',
  'http://localhost:3000',
  'http://localhost:8787',
  'http://127.0.0.1:5500',
]);

function corsHeaders(request) {
  const origin       = request.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://elgorilateatro.com.mx';
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
  });
}

// ─── BASE64URL + JWT ──────────────────────────────────────────────────────────

function base64urlEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function signJWT(payload, secret) {
  const enc     = new TextEncoder();
  const header  = base64urlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body    = base64urlEncode(enc.encode(JSON.stringify(payload)));
  const key     = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig     = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`));
  return `${header}.${body}.${base64urlEncode(sig)}`;
}

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const enc    = new TextEncoder();
    const key    = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid  = await crypto.subtle.verify('HMAC', key, base64urlDecode(sig), enc.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ─── STRIPE SIGNATURE ────────────────────────────────────────────────────────

async function verificarFirmaStripe(rawBody, sigHeader, secret) {
  try {
    const parts     = sigHeader.split(',');
    const tPart     = parts.find(p => p.startsWith('t='));
    const v1Part    = parts.find(p => p.startsWith('v1='));
    if (!tPart || !v1Part) return false;
    const timestamp = tPart.slice(2);
    const expected  = v1Part.slice(3);
    const enc       = new TextEncoder();
    const key       = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signed    = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
    const computed  = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computed === expected;
  } catch { return false; }
}

// ─── RATE LIMITING (GLOBAL — sin prefijo tid) ─────────────────────────────────

async function checkRateLimit(ip, env) {
  const ventana = Math.floor(Date.now() / 900000);
  const key     = `ratelimit:${ip}:${ventana}`;
  const current = await env.INVENTARIO.get(key);
  const count   = current ? parseInt(current, 10) : 0;
  if (count >= 10) return false;
  await env.INVENTARIO.put(key, String(count + 1), { expirationTtl: 900 });
  return true;
}

/**
 * Límite por IP para endpoints públicos que ESCRIBEN en KV.
 * Sin esto, un bot puede quemar la cuota diaria de escrituras de KV — y cuando
 * esa cuota se agota, las que fallan son las ventas reales. Además evita que se
 * inyecten correos falsos en listas que el sistema después notifica por correo.
 * Ventana de 15 min, igual que checkRateLimit.
 */
async function limitePorIp(request, env, prefijo, maximo) {
  const ip      = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ventana = Math.floor(Date.now() / 900000);
  const key     = `rl:${prefijo}:${ip}:${ventana}`;
  const actual  = parseInt((await env.INVENTARIO.get(key)) || '0', 10) || 0;
  if (actual >= maximo) return false;
  await env.INVENTARIO.put(key, String(actual + 1), { expirationTtl: 900 });
  return true;
}

// ─── EMAIL VÍA RESEND ────────────────────────────────────────────────────────

/** Correo operativo del teatro (avisos admin, reply-to). */
const EMAIL_OPERATIVO = 'elgorilateatro@gmail.com';
const EMAIL_FROM_DEFAULT = 'El Gorila Teatro <boletos@elgorilateatro.com.mx>';

function adminNotifyEmail(env) {
  const v = env.ADMIN_NOTIFY_EMAIL;
  return (typeof v === 'string' && v.trim()) ? v.trim() : EMAIL_OPERATIVO;
}

function formatMetodoPago(venta) {
  const m = (venta.metodoPago || '').toLowerCase();
  if (m === 'cortesia') return 'Cortesía';
  if (m === 'efectivo') return 'Efectivo en taquilla';
  if (m === 'tarjeta_taquilla') return 'Tarjeta en taquilla';
  if (venta.sessionId?.startsWith('manual_') && !m) return 'Efectivo en taquilla';
  if (m.includes('oxxo')) return 'OXXO';
  if (m.includes('card') || m.includes('link')) return 'Stripe (tarjeta en línea)';
  return m || '—';
}

function esVentaTaquilla(venta) {
  const m = (venta?.metodoPago || '').toLowerCase();
  if (m === 'efectivo' || m === 'tarjeta_taquilla' || m === 'cortesia') return true;
  return String(venta?.sessionId || '').startsWith('manual_');
}

function formatFechaCompra(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch { return iso; }
}

// Resend limita el ritmo de envío (del orden de 2 peticiones/segundo). Cada
// venta manda 2 correos (comprador + aviso admin), así que con más de una venta
// por segundo empiezan los 429. Sin reintento, ese 429 = boleto que nunca llega.
// Por eso: reintentar 429 y 5xx con espera creciente, respetando Retry-After.
const EMAIL_MAX_INTENTOS   = 4;
const EMAIL_ESPERAS_MS     = [400, 1200, 3000]; // entre intentos 1-2, 2-3, 3-4

const dormir = ms => new Promise(r => setTimeout(r, ms));

/** Un intento. Devuelve {ok, reintentable, esperaMs}. */
async function _enviarEmailResend(to, subject, html, env, from, opts = {}) {
  try {
    const payload = {
      from,
      to,
      subject,
      html,
      reply_to: opts.replyTo || EMAIL_OPERATIVO,
    };
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text();
      logError('resend.send', {
        status: res.status,
        toDomain: maskEmail(to),
        err: errBody.slice(0, 200),
      });
      // 429 = ritmo excedido; 5xx = fallo temporal del proveedor. Ambos se
      // reintentan. Un 4xx distinto (correo inválido, dominio no verificado) no
      // mejora reintentando: se corta y se registra.
      const reintentable = res.status === 429 || res.status >= 500;
      const ra = parseInt(res.headers.get('retry-after') || '', 10);
      return { ok: false, reintentable, esperaMs: Number.isFinite(ra) ? ra * 1000 : null };
    }
    return { ok: true };
  } catch (e) {
    // Fallo de red hacia Resend: temporal, se reintenta.
    logError('resend.exception', { toDomain: maskEmail(to), error: e.message });
    return { ok: false, reintentable: true, esperaMs: null };
  }
}

/** Envía con reintentos ante 429/5xx. true solo si Resend aceptó el correo. */
async function _enviarConReintentos(to, subject, html, env, from, opts = {}) {
  for (let intento = 0; intento < EMAIL_MAX_INTENTOS; intento++) {
    const r = await _enviarEmailResend(to, subject, html, env, from, opts);
    if (r.ok) {
      if (intento > 0) logInfo('resend.reintento_ok', { toDomain: maskEmail(to), intento: intento + 1 });
      return true;
    }
    if (!r.reintentable || intento === EMAIL_MAX_INTENTOS - 1) return false;
    await dormir(r.esperaMs ?? EMAIL_ESPERAS_MS[intento] ?? 3000);
  }
  return false;
}

async function enviarEmail(to, subject, html, env, opts = {}) {
  if (!env.RESEND_API_KEY) { logError('resend.config', { error: 'RESEND_API_KEY no configurada' }); return false; }
  // Remitente: boletos@elgorilateatro.com.mx (requiere dominio Verified en resend.com/domains).
  // Destinos operativos: comprador + aviso admin → elgorilateatro@gmail.com (nunca otro correo).
  const verifiedFrom = EMAIL_FROM_DEFAULT;
  const primaryFrom  = env.EMAIL_FROM || verifiedFrom;
  if (await _enviarConReintentos(to, subject, html, env, primaryFrom, opts)) return true;
  if (primaryFrom !== verifiedFrom) {
    return _enviarConReintentos(to, subject, html, env, verifiedFrom, opts);
  }
  return false;
}

async function enviarEmailsVenta(venta, tid, env) {
  const config        = await getVenueConfig(tid, env);
  const funcionNombre = venta.funcionNombre || venta.fecha;
  const codigoVenta   = venta.certificado || venta.codigo;
  const adminOk       = await enviarEmail(
    adminNotifyEmail(env),
    `${codigoVenta} : Nueva orden — EL GORILA`,
    htmlAvisoAdmin(venta, funcionNombre, config),
    env,
  );
  let compradorOk = false;
  if (venta.email) {
    compradorOk = await enviarEmail(
      venta.email,
      `Tu lugar — EL GORILA · ${funcionNombre}`,
      htmlBoleto(venta, funcionNombre, config),
      env,
    );
  }
  return { adminOk, compradorOk };
}

/**
 * Aviso AL OPERADOR cuando el boleto no le llegó al comprador.
 *
 * Es la vía más rápida para enterarse: el punto rojo del panel hay que ir a
 * buscarlo, este correo llega solo. Los dos se mantienen a propósito.
 *
 * OJO con el límite de esto: si el correo del comprador falló porque Resend está
 * caído o topado de ritmo, este aviso probablemente también falle — sale por el
 * mismo proveedor. Sirve sobre todo para el caso más común (correo mal escrito o
 * rechazado por el destinatario), y por eso NO sustituye al punto rojo del panel
 * ni al log `venta.email_comprador_fallo`.
 */
async function avisarBoletoNoEnviado(venta, tid, env, origen = 'compra') {
  // Sin correo registrado (taquilla/efectivo) no había nada que enviar.
  if (!venta?.email) return false;

  const cert     = venta.certificado || venta.codigo || '—';
  const funcion  = venta.funcionNombre || venta.fecha || '—';
  const nombre   = venta.nombre || 'Sin nombre';
  const cantidad = venta.cantidad || 0;

  const fila = (etiqueta, valor) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a7760;white-space:nowrap;">${etiqueta}</td>
      <td style="padding:6px 0;font-family:Georgia,serif;font-size:15px;color:#1a1411;">${valor}</td>
    </tr>`;

  return enviarEmail(
    adminNotifyEmail(env),
    `⚠️ NO LLEGÓ EL BOLETO — ${cert} (${nombre})`,
    `<div style="background:#f1ead9;padding:24px;font-family:Georgia,serif;">
      <p style="margin:0 0 4px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#D43A1A;">
        Boleto no entregado
      </p>
      <p style="margin:0 0 18px;font-size:17px;color:#1a1411;line-height:1.5;">
        Se cobró la venta pero <strong>el correo con el boleto no se pudo enviar</strong>.
        Esta persona no tiene su entrada.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:#e8dfc8;padding:14px 18px;border:1px solid #c9b896;">
        ${fila('Referencia', `<strong>${cert}</strong>`)}
        ${fila('Comprador', nombre)}
        ${fila('Correo', `<strong>${venta.email}</strong>`)}
        ${fila('Función', funcion)}
        ${fila('Entradas', cantidad)}
        ${fila('Origen', origen)}
      </table>
      <p style="margin:18px 0 0;font-size:16px;color:#3a2e26;line-height:1.6;">
        <strong>Qué hacer:</strong> abre el panel, busca <strong>${cert}</strong> en Ventas
        (aparece con un punto rojo) y usa <em>«Reenviar boleto»</em>.
        Si el correo está mal escrito, usa <em>«Corregir y reenviar»</em>.
      </p>
      <p style="margin:14px 0 0;">
        <a href="https://elgorilateatro.com.mx/admin.html"
           style="display:inline-block;padding:12px 24px;background:#D43A1A;color:#fff;text-decoration:none;font-family:Georgia,serif;font-size:16px;">
          Abrir el panel
        </a>
      </p>
    </div>`,
    env,
  );
}

async function enviarEmailReagendado(venta, tid, env) {
  if (!venta.email) return { compradorOk: false, sinEmail: true };
  const config        = await getVenueConfig(tid, env);
  const funcionNombre = venta.funcionNombre || venta.fecha;
  const compradorOk   = await enviarEmail(
    venta.email,
    `Boleto reagendado — EL GORILA · ${funcionNombre}`,
    htmlBoleto(venta, funcionNombre, config, { esReagenda: true }),
    env,
  );
  return { compradorOk, sinEmail: false };
}

// ─── EMAIL: RESERVA OXXO PENDIENTE (voucher generado, aún sin pagar) ──────────
// Se dispara cuando Stripe crea la ficha OXXO (checkout.session.completed sin
// pagar). El boleto real se emite después, en async_payment_succeeded.
async function enviarEmailOxxoPendiente(session, meta, tid, env) {
  const to = meta.email || session.customer_details?.email || session.customer_email;
  if (!to) return;

  // Anti-duplicado: el webhook puede reintentar el mismo evento.
  const flagKey = kv(tid, `oxxo-mail:${session.id}`);
  if (await env.INVENTARIO.get(flagKey)) return;
  await env.INVENTARIO.put(flagKey, '1', { expirationTtl: 30 * 24 * 60 * 60 });

  // Link de la ficha y vencimiento salen del payment_intent (no vienen en el evento).
  let voucherUrl = null;
  let venceTexto = null;
  try {
    const piId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
    if (piId && env.STRIPE_SECRET_KEY) {
      const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piId)}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      const pi   = await piRes.json();
      const oxxo = pi?.next_action?.oxxo_display_details;
      if (oxxo?.hosted_voucher_url) voucherUrl = oxxo.hosted_voucher_url;
      if (oxxo?.expires_after) {
        venceTexto = new Date(oxxo.expires_after * 1000).toLocaleString('es-MX', {
          timeZone: 'America/Mexico_City', dateStyle: 'long', timeStyle: 'short',
        });
      }
    }
  } catch (e) {
    logError('oxxo.voucher_fetch', { error: e.message });
  }

  await enviarEmail(
    to,
    'Tu ficha para pagar en OXXO — EL GORILA',
    htmlEmailOxxoPendiente({
      funcionNombre: meta.funcionNombre || meta.fecha || '',
      total:         session.amount_total != null ? session.amount_total / 100 : null,
      voucherUrl,
      venceTexto,
    }),
    env,
  );
}

// Aviso al equipo de que entró una reserva OXXO pendiente de pago (aún sin
// emitir boleto). Cuando el pago cae, llega el aviso normal de "Nueva orden".
async function notificarAdminOxxoPendiente(session, meta, tid, env) {
  const flagKey = kv(tid, `oxxo-mail-admin:${session.id}`);
  if (await env.INVENTARIO.get(flagKey)) return;
  await env.INVENTARIO.put(flagKey, '1', { expirationTtl: 30 * 24 * 60 * 60 });

  const funcionNombre = meta.funcionNombre || meta.fecha || '—';
  const emailComprador = meta.email || session.customer_details?.email || session.customer_email || '—';
  const nombre = meta.nombre || session.customer_details?.name || '—';
  const total  = session.amount_total != null
    ? `$${(session.amount_total / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
    : '—';
  const cantidad = meta.cantidad || '—';

  await enviarEmail(
    adminNotifyEmail(env),
    `OXXO pendiente de pago — ${funcionNombre}`,
    `<div style="font-family:Georgia,serif;font-size:15px;color:#1a1411;line-height:1.6;">
      <p style="font-size:17px;margin:0 0 12px;"><strong>Reserva OXXO pendiente de pago</strong></p>
      <p style="margin:0 0 12px;">Un comprador generó una ficha OXXO. Los lugares quedan
      apartados hasta que pague o venza la ficha. <strong>El boleto se emite solo cuando cae el pago</strong>
      (1–3 días hábiles); ahí llega el aviso normal de «Nueva orden».</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tr><td style="padding:2px 10px 2px 0;color:#8a5a2a;">Función</td><td><strong>${funcionNombre}</strong></td></tr>
        <tr><td style="padding:2px 10px 2px 0;color:#8a5a2a;">Entradas</td><td>${cantidad}</td></tr>
        <tr><td style="padding:2px 10px 2px 0;color:#8a5a2a;">Total</td><td>${total}</td></tr>
        <tr><td style="padding:2px 10px 2px 0;color:#8a5a2a;">Comprador</td><td>${nombre}</td></tr>
        <tr><td style="padding:2px 10px 2px 0;color:#8a5a2a;">Correo</td><td>${emailComprador}</td></tr>
      </table>
    </div>`,
    env,
  );
}

// Registro visible en el admin de la reserva OXXO pendiente de pago. Es solo
// informativo (no es una venta): se borra solo cuando el pago cae (async_payment
// _succeeded) o cuando la ficha vence (checkout.session.expired).
async function guardarOxxoPendiente(session, meta, tid, env) {
  const canonical = resolveTid(tid);
  let seccionCantidades = {};
  try { if (meta.seccionCants) seccionCantidades = JSON.parse(meta.seccionCants); } catch {}
  await env.VENTAS.put(
    kv(canonical, `oxxoPend:${session.id}`),
    JSON.stringify({
      sessionId:     session.id,
      fecha:         meta.fecha || null,
      funcionNombre: meta.funcionNombre || meta.fecha || null,
      cantidad:      parseInt(meta.cantidad, 10) || null,
      total:         session.amount_total != null ? session.amount_total / 100 : null,
      email:         meta.email || session.customer_details?.email || session.customer_email || null,
      nombre:        meta.nombre || session.customer_details?.name || null,
      seccionCantidades,
      creadoEn:      new Date().toISOString(),
      // Vencimiento real de la ficha (Stripe Checkout Session.expires_at). Sirve de
      // respaldo para que el admin la oculte sola aunque el webhook expired no llegue.
      expiraEn:      session.expires_at ? session.expires_at * 1000 : null,
    }),
    // Respaldo: si por lo que sea no se borra al pagar/vencer, caduca solo a los 31 días.
    { expirationTtl: 31 * 24 * 60 * 60 },
  );
}

async function borrarOxxoPendiente(tid, sessionId, env) {
  try { await env.VENTAS.delete(kv(tid, `oxxoPend:${sessionId}`)); } catch { /* */ }
}

// Historial permanente (fallidas y completadas) de fichas OXXO, para consulta en
// el admin. No tiene TTL, igual que los registros de venta.
async function guardarOxxoHistorial(tid, sessionId, estado, pendiente, extra, env) {
  const canonical = resolveTid(tid);
  try {
    await env.VENTAS.put(
      kv(canonical, `oxxoHist:${sessionId}`),
      JSON.stringify({
        sessionId,
        estado, // 'completada' | 'fallida'
        fecha:         pendiente?.fecha ?? extra.fecha ?? null,
        funcionNombre: pendiente?.funcionNombre ?? extra.funcionNombre ?? null,
        cantidad:      pendiente?.cantidad ?? extra.cantidad ?? null,
        total:         pendiente?.total ?? extra.total ?? null,
        email:         pendiente?.email ?? extra.email ?? null,
        nombre:        pendiente?.nombre ?? extra.nombre ?? null,
        creadoEn:      pendiente?.creadoEn || extra.creadoEn || null,
        resueltoEn:    new Date().toISOString(),
      }),
    );
  } catch (e) { logError('oxxo.historial', { error: e.message }); }
}

function htmlEmailOxxoPendiente({ funcionNombre, total, voucherUrl, venceTexto }) {
  const totalTxt = (total != null)
    ? `$${Number(total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`
    : null;

  const botonFicha = voucherUrl
    ? `<a href="${voucherUrl}" style="display:inline-block;background:#D43A1A;color:#fff;padding:16px 32px;text-decoration:none;font-family:Georgia,serif;font-size:18px;">
         Ver mi ficha OXXO →
       </a>
       <p style="margin:14px 0 0;font-family:Georgia,serif;font-size:13px;color:rgba(26,20,17,.6);">
         Muéstrala en la caja desde tu celular o imprímela.
       </p>`
    : `<p style="margin:0;font-family:Georgia,serif;font-size:15px;color:#1a1411;">
         La ficha con el código de barras te la mostró Stripe al terminar la compra.
         Si la cerraste, revisa también tu bandeja de correo.
       </p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tu ficha para pagar en OXXO — EL GORILA</title>
</head>
<body style="margin:0;padding:0;background:#0a0706;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0706;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

  <tr><td style="background:#0a0706;padding:36px 28px 24px;border:1px solid rgba(241,234,217,.12);text-align:center;">
    <p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.36em;text-transform:uppercase;color:#d99b3a;">
      Reserva apartada${funcionNombre ? ` · ${funcionNombre}` : ''}
    </p>
    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;font-weight:500;color:#f1ead9;">
      Ya casi. Falta pagar en OXXO.
    </h1>
    <p style="margin:16px auto 0;font-family:Georgia,serif;font-size:17px;line-height:1.5;color:rgba(241,234,217,.82);max-width:380px;">
      Apartamos tus lugares${totalTxt ? ` por <strong>${totalTxt}</strong>` : ''}. En cuanto pagues tu ficha,
      te llega tu boleto con código QR a este mismo correo.
    </p>
  </td></tr>

  <tr><td style="background:#f1ead9;padding:32px 28px;text-align:center;">
    ${botonFicha}
  </td></tr>

  <tr><td style="background:#f1ead9;padding:4px 28px 32px;">
    <p style="margin:0 0 12px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#8a5a2a;">
      Cómo funciona
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:8px 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#1a1411;vertical-align:top;">
        <strong>1.</strong> Ve a cualquier OXXO y paga con la ficha. Dile al cajero que es un pago de <strong>OXXO Pay</strong>.
      </td></tr>
      <tr><td style="padding:8px 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#1a1411;vertical-align:top;">
        <strong>2.</strong> <strong>Guarda tu recibo</strong> hasta que recibas tu boleto. Es tu comprobante por si algo se atora.
      </td></tr>
      <tr><td style="padding:8px 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#1a1411;vertical-align:top;">
        <strong>3.</strong> El pago tarda de <strong>1 a 3 días hábiles</strong> en reflejarse. No tienes que hacer nada más:
        en cuanto OXXO nos avisa, tu boleto sale solo a este correo.
      </td></tr>
    </table>
    ${venceTexto ? `<p style="margin:18px 0 0;font-family:Georgia,serif;font-size:14px;line-height:1.5;color:#8a2a1a;">
      Tus lugares quedan apartados hasta el <strong>${venceTexto}</strong>. Si la ficha vence sin pago, se liberan.
    </p>` : ''}
  </td></tr>

  <tr><td style="background:#120d0b;padding:22px 28px;text-align:center;border-top:1px solid rgba(241,234,217,.08);">
    <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:13px;color:rgba(241,234,217,.5);">
      ¿Alguna duda o problema con tu pago? Escríbenos y te ayudamos:
    </p>
    <p style="margin:0;font-family:Georgia,serif;font-size:14px;color:rgba(241,234,217,.7);">
      <a href="mailto:${EMAIL_OPERATIVO}" style="color:#d99b3a;text-decoration:underline;">${EMAIL_OPERATIVO}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

function codigoQrPayload(codigo) {
  return (codigo || '').trim().toUpperCase();
}

function codigoQrOficialVenta(venta) {
  const boletos = venta.boletos || [];
  const cert      = venta.certificado || venta.codigo || '';
  if (boletos.length === 1 && boletos[0]?.cert) return boletos[0].cert;
  return cert;
}

function urlVerificarBoleto(codigo) {
  return `${SITIO_BASE}/admin.html?view=verificar&codigo=${encodeURIComponent(codigo)}`;
}

const SITIO_BASE = 'https://elgorilateatro.com.mx';
/** Reseña pública (Google Maps · Teatro Wilberto Cantón). Filtro suave en copy: solo si la noche gustó. */
const URL_RESENA_GOOGLE = 'https://www.google.com/maps/search/?api=1&query=Teatro+Wilberto+Cant%C3%B3n+Jos%C3%A9+Mar%C3%ADa+Velasco+59+San+Jos%C3%A9+Insurgentes+CDMX';
const CUPONES_REFERIDO = new Set(['INVITADO25', 'REGALO25', 'OTRA50', 'MANADA15']);
const ENCUESTA_TTL_SEC = 7776000; // 90 días

function urlCompartirBoleto(codigo) {
  return `${SITIO_BASE}/compartir-boleto.html?c=${encodeURIComponent(codigo)}`;
}

function urlEnviarBoletoWa(codigo) {
  return `${SITIO_BASE}/enviar-boleto.html?c=${encodeURIComponent(codigo)}`;
}

function urlInvitacionRegalo(certificado, cupon = 'REGALO25') {
  const p = new URLSearchParams({ de: certificado, cupon });
  return `${SITIO_BASE}/boletos.html?${p.toString()}`;
}

function textoWhatsAppBoleto(venta, funcionNombre, config) {
  const cert    = venta.certificado || venta.codigo || '';
  const boletos = venta.boletos || [];
  const folio   = boletos.map(b => b.folio).filter(Boolean).join(' · ') || null;
  const n       = venta.cantidad || boletos.length || 1;
  const entradas = n === 1 ? '1 entrada' : `${n} entradas`;
  let t = `EL GORILA — ${funcionNombre}. ${entradas}.\n${config.venue || 'Teatro Wilberto Cantón'}`;
  if (folio) t += `\nFolio taquilla: ${folio}`;
  if (cert) t += `\nCertificado: ${cert}`;
  t += '\n\nPresenta el QR en la entrada del teatro.';
  return t;
}

function waMeUrlTexto(texto) {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

function normalizarTokenEncuesta(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/[^a-f0-9]/g, '').substring(0, 80);
}

function urlEncuesta(token) {
  return `${SITIO_BASE}/acta.html?t=${encodeURIComponent(token)}`;
}

function regaloEncuestaCard(certificado, cupon, titulo, subtitulo, porcentaje) {
  const url = urlInvitacionRegalo(certificado, cupon);
  return { cupon, titulo, subtitulo, porcentaje, url, qrUrl: urlQrData(url, 140) };
}

function regalosParaEncuesta(certificado, respuestas) {
  const regalos = [
    regaloEncuestaCard(
      certificado, 'REGALO25', 'Invita a alguien',
      'Precertificado personal — −25% en boletos generales para quien tú elijas',
      25,
    ),
  ];
  const vol = respuestas?.volveria;
  if (vol === 'si' || vol === 'talvez') {
    regalos.push(regaloEncuestaCard(
      certificado, 'OTRA50', 'Vuelve otra noche',
      'El Gorila nunca es igual dos veces — −50% en tu próxima visita',
      50,
    ));
  }
  const comp = respuestas?.acompanamiento;
  if (comp === 'amigos' || comp === 'familia') {
    regalos.push(regaloEncuestaCard(
      certificado, 'MANADA15', 'La manada',
      'La próxima, llévate a tu gente — −15% con 3+ boletos generales',
      15,
    ));
  }
  return regalos;
}

async function obtenerEncuestaPorToken(tid, token, env) {
  const t = normalizarTokenEncuesta(token);
  if (t.length < 32) return null;
  const raw = await env.VENTAS.get(kv(tid, `encuesta:${t}`));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return { token: t, data };
  } catch { return null; }
}

async function generarFolioSobre(tid, venta, env) {
  const canonical  = resolveTid(tid);
  const fecha      = venta.fecha || new Date().toISOString().slice(0, 10);
  const numeroObra = venta.numeroObra || await getNumeroObra(canonical, fecha, env);
  const parts      = fecha.split('-');
  const yymmdd     = `${(parts[0] || '').slice(2)}${parts[1] || ''}${parts[2] || ''}`;
  const seq        = await nextContador(env, kv(canonical, `sobre:folio:${fecha}`));
  return `SOBRE-${numeroObra}-${yymmdd}-${String(seq).padStart(4, '0')}`;
}

async function crearTokenEncuesta(tid, venta, env) {
  const token = crypto.randomUUID().replace(/-/g, '')
    + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const canonical = resolveTid(tid);
  const cert      = _certificadoVenta(venta);
  const folioSobre = await generarFolioSobre(tid, venta, env);
  const payload   = {
    sessionId:     venta.sessionId,
    certificado:   cert,
    folioSobre,
    email:         venta.email || null,
    nombre:        venta.nombre || null,
    funcionNombre: venta.funcionNombre || venta.fecha,
    fecha:         venta.fecha,
    teatroId:      canonical,
    creadoEn:      new Date().toISOString(),
    completadaEn:  null,
    respuestas:    null,
  };
  await env.VENTAS.put(
    kv(canonical, `encuesta:${token}`),
    JSON.stringify(payload),
    { expirationTtl: ENCUESTA_TTL_SEC },
  );
  venta.sobreFolio = folioSobre;
  return token;
}

async function asegurarTokenEncuesta(tid, venta, env) {
  if (venta.encuestaToken) {
    const prev = await obtenerEncuestaPorToken(tid, venta.encuestaToken, env);
    if (prev) return venta.encuestaToken;
  }
  return crearTokenEncuesta(tid, venta, env);
}

function urlQrBoleto(codigo, size = 148) {
  return urlQrData(codigoQrPayload(codigo), size);
}

function urlQrData(data, size = 148) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&color=1a1411&bgcolor=f1ead9&margin=8&data=${encodeURIComponent(data)}`;
}

function esCodigoCert(codigo) {
  if (typeof codigo !== 'string') return false;
  const c = codigo.trim().toUpperCase();
  return c.startsWith('CERT-') || c.startsWith('WIL-'); // WIL- = ventas legacy
}

async function nextContador(env, key) {
  for (let i = 0; i < 5; i++) {
    const prev = parseInt((await env.INVENTARIO.get(key)) || '0', 10) || 0;
    const seq  = prev + 1;
    await env.INVENTARIO.put(key, String(seq));
    if (parseInt((await env.INVENTARIO.get(key)) || '0', 10) === seq) return seq;
  }
  return Date.now() % 99999;
}

async function getNumeroObra(tid, fecha, env) {
  try {
    const raw = await env.INVENTARIO.get(kv(tid, 'funciones:activas'));
    const f   = JSON.parse(raw || '[]').find(x => x.fecha_iso === fecha);
    if (f?.numero_obra != null) return f.numero_obra;
  } catch { /* ignore */ }
  return 1300;
}

/** Certificado de compra + un CERT por boleto (QR) + folio interno por boleto (puerta). */
async function generarBoletosVenta(tid, fecha, items, env) {
  const canonical  = resolveTid(tid);
  const numeroObra   = await getNumeroObra(canonical, fecha, env);
  const parts        = (fecha || '').split('-');
  const yymmdd       = `${(parts[0] || '').slice(2)}${parts[1] || ''}${parts[2] || ''}`;
  const counterKey   = kv(canonical, 'boleto:folio:counter');
  const certificado  = `CERT-ORD-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const boletos      = [];
  let numero         = 0;

  for (const item of (items || [])) {
    const qty = item.cantidad || 1;
    for (let q = 0; q < qty; q++) {
      numero += 1;
      const seq   = await nextContador(env, counterKey);
      const cert  = `CERT-${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;
      const folio = `${numeroObra}-${yymmdd}-${String(seq).padStart(5, '0')}`;
      boletos.push({
        cert, folio, tipo: item.tipo, seccion: item.seccion || 'platea',
        numero, usado: false, usadoEn: null,
      });
    }
  }

  return { certificado, boletos, codigo: certificado, numeroObra };
}

async function persistirCertificadosKv(tid, sessionId, certificado, boletos, env) {
  await env.VENTAS.put(kv(tid, `cert:${certificado}`), JSON.stringify({ sessionId }));
  for (let i = 0; i < boletos.length; i++) {
    await env.VENTAS.put(
      kv(tid, `cert:${boletos[i].cert}`),
      JSON.stringify({ sessionId, boletoIdx: i }),
    );
  }
}

function syncVentaUsadoGlobal(venta) {
  if (!Array.isArray(venta.boletos) || !venta.boletos.length) return;
  const pendientes = venta.boletos.filter(b => !b.usado);
  venta.usado = pendientes.length === 0;
  if (venta.usado) {
    const ultimo = [...venta.boletos].reverse().find(b => b.usadoEn);
    venta.usadoEn = ultimo?.usadoEn || new Date().toISOString();
  } else {
    venta.usadoEn = null;
  }
}

function boletoEnVenta(venta, boletoIdx) {
  if (boletoIdx == null || !Array.isArray(venta.boletos)) return null;
  return venta.boletos[boletoIdx] ?? null;
}

function respuestaBoletoPublica(v, tid, boleto, boletoIdx) {
  const boletosArr   = v.boletos || [];
  const totalBoletos = boletosArr.length || v.cantidad || 1;
  const codigo       = boleto?.cert || v.certificado || v.codigo;

  if (!boleto && boletosArr.length) {
    const pendientes = boletosArr.filter(b => !b.usado);
    return {
      teatroId:      v.teatroId || tid,
      codigo,
      certificado:   v.certificado || v.codigo,
      fecha:         v.fecha,
      funcionNombre: v.funcionNombre || v.fecha,
      cantidad:      v.cantidad,
      totalBoletos,
      boletoNum:     pendientes.length ? (pendientes[0].numero || 1) : totalBoletos,
      pendientes:    pendientes.length,
      items:         v.items || [],
      metodoPago:    v.metodoPago || null,
      cortesia:      !!v.cortesia || (v.metodoPago || '').toLowerCase() === 'cortesia',
      codigoCupon:   v.codigoCupon || null,
      total:         v.total,
      fechaCompra:   v.fechaCompra,
      estado:        v.estado,
      usado:         pendientes.length === 0,
      usadoEn:       v.usadoEn || null,
      esCertificado: true,
    };
  }

  return {
    teatroId:      v.teatroId || tid,
    codigo,
    certificado:   v.certificado || v.codigo,
    fecha:         v.fecha,
    funcionNombre: v.funcionNombre || v.fecha,
    cantidad:      v.cantidad,
    totalBoletos,
    boletoNum:     boleto?.numero || (boletoIdx != null ? boletoIdx + 1 : 1),
    items:         v.items || [],
    metodoPago:    v.metodoPago || null,
    cortesia:      !!v.cortesia || (v.metodoPago || '').toLowerCase() === 'cortesia',
    codigoCupon:   v.codigoCupon || null,
    total:         v.total,
    fechaCompra:   v.fechaCompra,
    estado:        v.estado,
    usado:         boleto ? !!boleto.usado : !!v.usado,
    usadoEn:       boleto?.usadoEn || v.usadoEn || null,
    tipo:          boleto?.tipo || null,
    seccion:       boleto?.seccion || null,
  };
}

// ─── EMAIL: BOLETO PARA EL COMPRADOR (estilo programa v3) ─────────────────────

function htmlBoleto(venta, funcionNombre, config, opts = {}) {
  const multiSeccion = config.secciones && config.secciones.length > 1;
  const certificado  = venta.certificado || venta.codigo || 'CERT-—';
  const boletos      = venta.boletos || [];
  const qrCert       = codigoQrOficialVenta(venta);
  const folioTaquilla = boletos.map(b => b.folio).filter(Boolean).join(' · ') || null;
  const qrUrl        = urlQrBoleto(qrCert);
  const waPaginaUrl  = urlEnviarBoletoWa(certificado);
  const nEntradas    = venta.cantidad || boletos.length || 1;
  const entradasLbl  = nEntradas === 1 ? '1 entrada' : `${nEntradas} entradas`;
  const direccion    = config.direccion || 'José María Velasco 59, San José Insurgentes, CDMX';
  const esReagenda   = opts.esReagenda || !!venta.reagendado;
  const funcionAnterior = venta.funcionAnterior || venta.reagendado?.de || null;
  const reagendaBanner = esReagenda && funcionAnterior ? `
  <tr><td style="background:#fff8e6;padding:18px 28px;border-left:4px solid #d99b3a;">
    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.55;color:#3a2e26;">
      <strong>Tu boleto fue reagendado.</strong> La reservación para
      <em>${funcionAnterior}</em> quedó cancelada.
      Este correo confirma tu <strong>nueva función</strong> (abajo). El mismo código QR sigue siendo válido en puerta.
    </p>
  </td></tr>` : '';

  const itemsRows = (venta.items || []).map(item => {
    const tipoNombre = TIPOS_BOLETO[item.tipo]?.nombre || item.tipo;
    const secNombre  = (multiSeccion && item.seccion)
      ? ` · ${config.secciones.find(s => s.id === item.seccion)?.nombre || item.seccion}`
      : '';
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #d4c4a8;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#1a1411;">${tipoNombre}${secNombre}</td>
      <td style="padding:10px 0;border-bottom:1px solid #d4c4a8;text-align:right;font-family:Georgia,serif;font-size:16px;color:#1a1411;">${item.cantidad}</td>
    </tr>`;
  }).join('');

  const itemsFallback = !itemsRows
    ? `<tr><td style="padding:10px 0;font-family:Georgia,serif;font-size:16px;color:#1a1411;">Entrada</td>
       <td style="padding:10px 0;text-align:right;font-family:Georgia,serif;font-size:16px;color:#1a1411;">${nEntradas}</td></tr>`
    : itemsRows;

  const metodoPagoLbl = formatMetodoPago(venta);
  const fechaCompraLbl = formatFechaCompra(venta.fechaCompra);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tu boleto — EL GORILA</title>
</head>
<body style="margin:0;padding:0;background:#0a0706;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0706;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

  <!-- Portada oscura (v3) -->
  <tr><td style="background:#0a0706;padding:32px 28px 28px;border:1px solid rgba(241,234,217,.12);">
    <p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#d99b3a;">
      ${esReagenda ? 'Boleto reagendado' : 'Boleto confirmado'} · 2026
    </p>
    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:.9;font-weight:500;color:#f1ead9;letter-spacing:-.02em;">
      EL <span style="font-style:italic;color:#D43A1A;">Gorila</span>
    </h1>
    <p style="margin:18px 0 0;padding-left:12px;border-left:2px solid rgba(212,58,26,.55);font-family:Georgia,serif;font-size:20px;line-height:1.3;color:#f1ead9;max-width:320px;">
      Tus entradas · <span style="font-style:italic;color:#d99b3a;">${entradasLbl}</span>
    </p>
  </td></tr>

  ${reagendaBanner}

  <!-- Bloque papel: función -->
  <tr><td style="background:#f1ead9;padding:28px;color:#1a1411;">
    <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#D43A1A;">
      Tu función
    </p>
    <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:500;line-height:1.15;color:#1a1411;">
      ${funcionNombre}
    </h2>
    <p style="margin:0;font-family:Georgia,serif;font-size:15px;line-height:1.5;color:#3a2e26;">
      ${config.venue}<br>
      <span style="font-size:13px;color:#6b5c4a;">${config.direccion}</span>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
      <tr>
        <td style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#8a7760;padding-bottom:8px;">Tipo</td>
        <td style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#8a7760;padding-bottom:8px;text-align:right;">Cant.</td>
      </tr>
      ${itemsFallback}
      <tr>
        <td style="padding-top:14px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a7760;">Total pagado</td>
        <td style="padding-top:14px;text-align:right;font-family:Georgia,serif;font-size:20px;font-weight:600;color:#1a1411;">$${(venta.total ?? 0).toFixed(2)} MXN</td>
      </tr>
      <tr>
        <td style="padding-top:12px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a7760;">Forma de pago</td>
        <td style="padding-top:12px;text-align:right;font-family:Georgia,serif;font-size:16px;color:#1a1411;">${metodoPagoLbl}</td>
      </tr>
      <tr>
        <td style="padding-top:8px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a7760;">Fecha de compra</td>
        <td style="padding-top:8px;text-align:right;font-family:Georgia,serif;font-size:15px;color:#3a2e26;">${fechaCompraLbl}</td>
      </tr>
    </table>
  </td></tr>

  <!-- Folio + QR -->
  <tr><td style="background:#e8dfc8;padding:24px 28px;border-top:1px solid #c9b896;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;width:148px;padding-right:18px;">
          <img src="${qrUrl}" width="148" height="148" alt="Código QR — presentar en puerta" style="display:block;border:1px solid #c9b896;background:#f1ead9;">
        </td>
        <td style="vertical-align:top;">
          ${folioTaquilla ? `<p style="margin:0 0 8px;font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#8a7760;">Folio taquilla</p>
          <p style="margin:0 0 14px;font-family:'Courier New',monospace;font-size:15px;font-weight:600;color:#1a1411;">${folioTaquilla}</p>` : ''}
          <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#8a7760;">Referencia</p>
          <p style="margin:0 0 14px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:.06em;color:#1a1411;word-break:break-all;">${certificado}</p>
          <p style="margin:0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#3a2e26;">
            <strong>Presenta este QR en la entrada del teatro</strong> (pantalla o impreso). ${nEntradas > 1 ? `Tienes <strong>${nEntradas} entradas</strong> en este certificado.` : ''}
          </p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Indicaciones día D (sin enlaces promocionales) -->
  <tr><td style="background:#f1ead9;padding:22px 28px;border-top:1px solid #c9b896;">
    <p style="margin:0 0 12px;font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#D43A1A;">
      El día de la función
    </p>
    <ul style="margin:0;padding:0 0 0 18px;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:#3a2e26;">
      <li style="margin-bottom:8px;">Llega con <strong>al menos 30 minutos de anticipación</strong>. El acceso puede cerrarse al iniciar la función (18:00 hrs).</li>
      <li style="margin-bottom:8px;">Presenta el <strong>QR de arriba</strong> en la entrada — no necesitas hacer nada más en línea.</li>
      <li style="margin-bottom:8px;">Si compraste tarifa de <strong>estudiante, INAPAM o maestro</strong>, lleva credencial vigente al acceso.</li>
      <li style="margin-bottom:0;"><strong>${config.venue || 'Teatro Wilberto Cantón'}</strong><br><span style="font-size:13px;color:#6b5c4a;">${direccion}</span></li>
    </ul>
  </td></tr>

  <!-- Guardar / compartir boleto (misma página que post-compra) -->
  <tr><td style="background:#e8dfc8;padding:22px 28px;border-top:1px solid #c9b896;text-align:center;">
    <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#3a2e26;">
      ¿Quieres tenerlo a la mano? Abre tu boleto digital para <strong>guardarlo</strong> o <strong>compartirlo por WhatsApp</strong>.
    </p>
    <a href="${waPaginaUrl}" style="display:inline-block;background:#128C7E;color:#fff;padding:14px 22px;text-decoration:none;font-family:Georgia,serif;font-size:16px;margin:0 6px 10px;border-radius:2px;">
      Ver mi boleto · guardar o compartir →
    </a>
    <p style="margin:12px 0 0;font-family:Georgia,serif;font-size:13px;line-height:1.5;color:#6b5c4a;">
      Misma pantalla que al terminar tu compra: imagen del boleto con QR, botón para guardar y para WhatsApp. El QR también está arriba en este correo.
    </p>
  </td></tr>

  <!-- Pie -->
  <tr><td style="background:#120d0b;padding:22px 28px;text-align:center;border-top:1px solid rgba(241,234,217,.08);">
    <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:rgba(241,234,217,.55);">
      ¿Dudas? Responde a este correo o escribe a
      <a href="mailto:${EMAIL_OPERATIVO}" style="color:#d99b3a;text-decoration:underline;">${EMAIL_OPERATIVO}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ─── EMAIL: ACCESO TAQUILLA (4 h) ─────────────────────────────────────────────

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function htmlAccesoTaquilla(nombre, url, horas = 4) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acceso taquilla — EL GORILA</title>
</head>
<body style="margin:0;padding:0;background:#0a0706;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0706;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  <tr><td style="background:#0a0706;padding:32px 28px 24px;border:1px solid rgba(241,234,217,.12);">
    <p style="margin:0 0 16px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#d99b3a;">
      Panel de taquilla · ${horas} horas
    </p>
    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.05;font-weight:500;color:#f1ead9;">
      Hola, ${nombre}
    </h1>
    <p style="margin:18px 0 0;font-family:Georgia,serif;font-size:16px;line-height:1.55;color:rgba(241,234,217,.82);">
      Te dieron acceso al panel para vender en efectivo y verificar entradas. El enlace caduca en <strong>${horas} horas</strong>.
    </p>
    <p style="margin:14px 0 0;font-family:Georgia,serif;font-size:14px;line-height:1.5;color:rgba(241,234,217,.65);">
      Si cierras el navegador, puedes volver a entrar con tu <strong>nombre</strong> y tu <strong>correo</strong> en la pantalla de login (opción «Acceso taquilla»).
    </p>
    <a href="${url}" style="display:inline-block;margin-top:22px;background:#D43A1A;color:#f1ead9;padding:14px 26px;text-decoration:none;font-family:Georgia,serif;font-size:17px;border-radius:2px;">
      Abrir panel de taquilla →
    </a>
    <p style="margin:18px 0 0;font-family:'Courier New',monospace;font-size:10px;line-height:1.5;color:#6b5c4a;word-break:break-all;">
      ${url}
    </p>
  </td></tr>
  <tr><td style="background:#120d0b;padding:20px 28px;text-align:center;border-top:1px solid rgba(241,234,217,.08);">
    <p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#6b5c4a;">
      EL GORILA · ${EMAIL_OPERATIVO}
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ─── EMAIL: POST-FUNCIÓN (sobre privado → encuesta con token) ─────────────────

function htmlEmailPostFuncion(venta, funcionNombre, config, opts = {}) {
  const token       = opts.encuestaToken || '';
  const encuestaUrl = token ? urlEncuesta(token) : null;

  if (!encuestaUrl) {
    return `<!DOCTYPE html><html lang="es"><body style="font-family:Georgia,serif;padding:24px;">
      <p>Error interno: falta enlace de acta para ${venta.email || '—'}.</p></body></html>`;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tu acta — EL GORILA</title>
</head>
<body style="margin:0;padding:0;background:#0a0706;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0706;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

  <tr><td style="background:#0a0706;padding:36px 28px 28px;border:1px solid rgba(241,234,217,.12);text-align:center;">
    <p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.36em;text-transform:uppercase;color:#d99b3a;">
      Esta noche · ${funcionNombre}
    </p>
    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:500;color:#f1ead9;">
      Gracias por acompañarnos.
    </h1>
    <p style="margin:18px auto 0;font-family:Georgia,serif;font-size:20px;line-height:1.5;color:rgba(241,234,217,.82);max-width:360px;">
      El Gorila te deja una sorpresa.
    </p>
  </td></tr>

  <tr><td style="background:#f1ead9;padding:36px 28px;text-align:center;">
    <a href="${encuestaUrl}" style="display:inline-block;background:#D43A1A;color:#fff;padding:16px 32px;text-decoration:none;font-family:Georgia,serif;font-size:18px;">
      Abrir →
    </a>
  </td></tr>

  <tr><td style="background:#e8dfc8;padding:26px 28px;text-align:center;border-top:1px solid #c9b896;">
    <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#3a2e26;">
      Si esta noche te gustó, ¿nos dejas una reseña corta en Google? Ayuda a que más gente encuentre <em>El Gorila</em> los sábados a las 18:00.
    </p>
    <a href="${URL_RESENA_GOOGLE}" style="display:inline-block;background:transparent;color:#D43A1A;padding:10px 18px;text-decoration:none;font-family:Georgia,serif;font-size:16px;border:1px solid #D43A1A;">
      Dejar reseña →
    </a>
    <p style="margin:16px 0 0;font-family:Georgia,serif;font-size:13px;line-height:1.5;color:#6b5c4a;">
      Si algo no salió bien, escríbenos a
      <a href="mailto:${EMAIL_OPERATIVO}" style="color:#8a5a20;text-decoration:underline;">${EMAIL_OPERATIVO}</a>
      — preferimos escucharte en privado.
    </p>
  </td></tr>

  <tr><td style="background:#120d0b;padding:22px 28px;text-align:center;border-top:1px solid rgba(241,234,217,.08);">
    <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:rgba(241,234,217,.5);">
      <a href="mailto:${EMAIL_OPERATIVO}" style="color:#d99b3a;text-decoration:underline;">${EMAIL_OPERATIVO}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ─── EMAIL: DÍA DE LA FUNCIÓN (mañana — programa v2 + indicaciones) ───────────

const URL_PROGRAMA_V2 = `${SITIO_BASE}/programa/v2.html`;

function htmlEmailDiaFuncion(venta, funcionNombre, config) {
  const certificado = venta.certificado || venta.codigo || '';
  const direccion   = config.direccion || 'José María Velasco 59, San José Insurgentes, CDMX';
  const nEntradas   = venta.cantidad || (venta.boletos || []).length || 1;
  const entradasLbl = nEntradas === 1 ? '1 entrada' : `${nEntradas} entradas`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hoy nos vemos — EL GORILA</title>
</head>
<body style="margin:0;padding:0;background:#0a0706;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0706;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

  <tr><td style="background:#0a0706;padding:32px 28px 24px;border:1px solid rgba(241,234,217,.12);">
    <p style="margin:0 0 16px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#d99b3a;">
      Hoy · ${funcionNombre}
    </p>
    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:.95;font-weight:500;color:#f1ead9;letter-spacing:-.02em;">
      Nos vemos <span style="font-style:italic;color:#D43A1A;">esta noche</span>
    </h1>
    <p style="margin:16px 0 0;font-family:Georgia,serif;font-size:18px;line-height:1.45;color:rgba(241,234,217,.85);">
      ${venta.nombre ? `${venta.nombre}, ` : ''}aquí van las indicaciones para llegar preparado y tu programa de mano digital.
    </p>
  </td></tr>

  <tr><td style="background:#f1ead9;padding:26px 28px;color:#1a1411;">
    <p style="margin:0 0 8px;font-family:'Courier New',monospace;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:#D43A1A;">Tu reservación</p>
    <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:20px;font-weight:500;">${funcionNombre}</p>
    <p style="margin:0;font-family:Georgia,serif;font-size:15px;line-height:1.5;color:#3a2e26;">
      ${entradasLbl}${certificado ? ` · certificado <strong>${certificado}</strong>` : ''}
    </p>
  </td></tr>

  <tr><td style="background:#e8dfc8;padding:24px 28px;border-top:1px solid #c9b896;">
    <p style="margin:0 0 12px;font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#8a7760;">Acceso</p>
    <ul style="margin:0;padding:0 0 0 18px;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:#3a2e26;">
      <li><strong>${config.venue || 'Teatro Wilberto Cantón'}</strong><br>${direccion}</li>
      <li style="margin-top:10px;">Llega al menos <strong>30 minutos antes</strong> (recomendado 17:30 hrs).</li>
      <li>Inicio de función: <strong>18:00 hrs</strong>.</li>
      <li>Presenta tu boleto con QR (correo de confirmación o imagen guardada).</li>
      <li>Tarifas con descuento: lleva credencial vigente (estudiante, INAPAM, maestro).</li>
    </ul>
  </td></tr>

  <tr><td style="background:#f1ead9;padding:28px;text-align:center;border-top:1px solid #d4c4a8;">
    <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#1a1411;">
      Lee el programa de mano antes de entrar — contexto, elenco y notas de la función.
    </p>
    <a href="${URL_PROGRAMA_V2}" style="display:inline-block;background:#D43A1A;color:#fff;padding:14px 26px;text-decoration:none;font-family:Georgia,serif;font-size:17px;margin:0 6px 10px;border-radius:2px;">
      Programa de mano (v2) →
    </a>
  </td></tr>

  <tr><td style="background:#120d0b;padding:22px 28px;text-align:center;border-top:1px solid rgba(241,234,217,.08);">
    <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:rgba(241,234,217,.55);">
      ¿Dudas? <a href="mailto:${EMAIL_OPERATIVO}" style="color:#d99b3a;text-decoration:underline;">${EMAIL_OPERATIVO}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

async function enviarEmailsDiaFuncion(env, opts = {}) {
  const { fecha = null, dryRun = false, forzar = false } = opts;
  const hoyMx = fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const resumen = { fecha: hoyMx, dryRun, teatros: [], enviados: 0, fallidos: 0, omitidos: 0 };

  for (const tid of VALID_TEATROS) {
    const config = await getVenueConfig(tid, env);
    const idxResult  = await env.VENTAS.list({ prefix: kv(tid, `ventaIdx:${hoyMx}:`) });
    const sessionIds = (await Promise.all(idxResult.keys.map(k => env.VENTAS.get(k.name)))).filter(Boolean);
    const ventasRaw  = await Promise.all(sessionIds.map(sid => env.VENTAS.get(kv(tid, `venta:${sid}`))));
    const ventas     = ventasRaw
      .filter(Boolean)
      .map(r => { try { return JSON.parse(r); } catch { return null; } })
      .filter(v => v && v.estado !== 'reembolsada' && v.email);

    const teatroRes = { teatroId: tid, total: ventas.length, enviados: 0, fallidos: 0, omitidos: 0 };

    for (const venta of ventas) {
      if (!forzar && venta.emailDiaFuncionEnviado) {
        teatroRes.omitidos += 1;
        resumen.omitidos += 1;
        continue;
      }
      const funcionNombre = venta.funcionNombre || venta.fecha || hoyMx;
      if (dryRun) {
        teatroRes.enviados += 1;
        resumen.enviados += 1;
        continue;
      }
      const html = htmlEmailDiaFuncion(venta, funcionNombre, config);
      const ok   = await enviarEmail(
        venta.email,
        `Hoy: ${funcionNombre} · programa e indicaciones — EL GORILA`,
        html,
        env,
      );
      if (ok) {
        venta.emailDiaFuncionEnviado = new Date().toISOString();
        const sid = venta.sessionId;
        if (sid) await env.VENTAS.put(kv(tid, `venta:${sid}`), JSON.stringify(venta));
        teatroRes.enviados += 1;
        resumen.enviados += 1;
      } else {
        teatroRes.fallidos += 1;
        resumen.fallidos += 1;
      }
    }
    resumen.teatros.push(teatroRes);
  }
  return resumen;
}

async function handleEmailDiaFuncion(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_REENVIAR.has(payload.rol)) {
    return json({ error: 'Sin permiso para enviar correos.' }, 403, request);
  }

  let body = {};
  try { body = await request.json(); } catch { /* vacío = hoy */ }

  const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const fecha = typeof body.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha.trim())
    ? body.fecha.trim()
    : hoyMx;
  const dryRun = !!body.dryRun;
  const forzar = !!body.forzar;

  if (!dryRun && !forzar && fecha !== hoyMx) {
    return json({
      error: `El envío automático es para el día de la función. Hoy (CDMX): ${hoyMx}. Usa forzar:true si es intencional.`,
    }, 400, request);
  }

  const resumen = await enviarEmailsDiaFuncion(env, { fecha, dryRun, forzar });

  await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: dryRun ? 'email.dia_funcion.dry_run' : 'email.dia_funcion',
    teatroId: resolveTid(tid),
    detalles: `Día función ${fecha}: ${resumen.enviados} enviados, ${resumen.fallidos} fallidos, ${resumen.omitidos} omitidos`,
    meta: { fecha, ...resumen },
  });

  return json({ ok: true, ...resumen }, 200, request);
}

// ─── EMAIL: AVISO ADMIN ───────────────────────────────────────────────────────

function htmlAvisoAdmin(venta, funcionNombre, config) {
  const multiSeccion = config.secciones && config.secciones.length > 1;
  const cert         = venta.certificado || venta.codigo || '—';
  const adminUrl     = 'https://elgorilateatro.com.mx/admin.html';
  const items        = venta.items || [];
  const listSubtotal = items.reduce((s, item) => {
    const sec = config.secciones?.find(x => x.id === item.seccion) || config.secciones?.[0] || {};
    return s + getPrecio(item.tipo, sec) * (item.cantidad || 1);
  }, 0);
  const totalPagado  = venta.total ?? 0;
  const factor       = listSubtotal > 0 && totalPagado > 0 && totalPagado < listSubtotal
    ? totalPagado / listSubtotal : 1;

  const itemRows = items.map(item => {
    const sec        = config.secciones?.find(x => x.id === item.seccion) || config.secciones?.[0] || {};
    const unit       = getPrecio(item.tipo, sec);
    const cant       = item.cantidad || 1;
    const sub        = Math.round(unit * cant * factor * 100) / 100;
    const tipoNombre = TIPOS_BOLETO[item.tipo]?.nombre || item.tipo;
    const secLabel   = (multiSeccion && item.seccion)
      ? ` · ${config.secciones.find(s => s.id === item.seccion)?.nombre || item.seccion}`
      : '';
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e8e8e8;">${tipoNombre}${secLabel}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8e8e8;text-align:right;">$${unit.toFixed(2)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8e8e8;text-align:center;">${cant}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8e8e8;text-align:right;">$${sub.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const foliosInternos = (venta.boletos || []).map(b => b.folio).filter(Boolean).join(', ');
  const stripeRef      = venta.sessionId?.startsWith('cs_')
    ? `<a href="https://dashboard.stripe.com/checkout/sessions/${venta.sessionId}" style="color:#1a56db;font-family:monospace;font-size:12px;">${venta.sessionId}</a>`
    : (venta.sessionId || '—');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nueva orden — EL GORILA</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ddd;">

  <tr><td style="background:#1a1411;padding:24px 28px;">
    <p style="margin:0 0 8px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#d99b3a;">Nueva orden</p>
    <h1 style="margin:0;font-size:26px;font-weight:500;color:#f1ead9;line-height:1.1;">EL GORILA</h1>
    <p style="margin:12px 0 0;font-size:16px;color:rgba(241,234,217,.75);">${funcionNombre}</p>
  </td></tr>

  <tr><td style="padding:24px 28px;">
    <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.5;">
      Nueva orden para: <strong>${funcionNombre}</strong>
    </p>
    <a href="${adminUrl}" style="display:inline-block;background:#D43A1A;color:#fff;padding:12px 22px;text-decoration:none;font-size:15px;margin-bottom:22px;">
      Ver en admin →
    </a>

    <p style="margin:0 0 10px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#888;">Detalle de orden</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#222;margin-bottom:18px;">
      <tr><td style="padding:6px 0;color:#888;width:38%;">Certificado</td><td style="padding:6px 0;font-family:monospace;font-size:13px;"><strong>${cert}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#888;">Fecha compra</td><td style="padding:6px 0;">${formatFechaCompra(venta.fechaCompra)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Nombre</td><td style="padding:6px 0;">${venta.nombre || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Email</td><td style="padding:6px 0;">${venta.email || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Método de pago</td><td style="padding:6px 0;">${formatMetodoPago(venta)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Transacción</td><td style="padding:6px 0;">${stripeRef}</td></tr>
      ${foliosInternos ? `<tr><td style="padding:6px 0;color:#888;">Folios puerta</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${foliosInternos}</td></tr>` : ''}
      ${venta.codigoCupon ? `<tr><td style="padding:6px 0;color:#888;">Cupón</td><td style="padding:6px 0;">${venta.codigoCupon}</td></tr>` : ''}
      ${venta.referidoDe ? `<tr><td style="padding:6px 0;color:#888;">Invitado por</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${venta.referidoDe}</td></tr>` : ''}
      ${venta.registradoPor ? `<tr><td style="padding:6px 0;color:#888;">Registrado por</td><td style="padding:6px 0;">${venta.registradoPor}</td></tr>` : ''}
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
      <tr style="background:#f8f8f8;">
        <th style="padding:10px 12px;text-align:left;font-weight:600;color:#555;">Tipo</th>
        <th style="padding:10px 12px;text-align:right;font-weight:600;color:#555;">Precio</th>
        <th style="padding:10px 12px;text-align:center;font-weight:600;color:#555;">Cant.</th>
        <th style="padding:10px 12px;text-align:right;font-weight:600;color:#555;">Subtotal</th>
      </tr>
      ${itemRows || `<tr><td colspan="4" style="padding:12px;color:#888;">${venta.cantidad || 1} boleto(s)</td></tr>`}
      <tr>
        <td colspan="3" style="padding:14px 12px 6px;text-align:right;font-weight:600;">Total pagado</td>
        <td style="padding:14px 12px 6px;text-align:right;font-size:18px;font-weight:600;">$${totalPagado.toFixed(2)} MXN</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="background:#fafafa;padding:14px 28px;border-top:1px solid #eee;font-size:12px;color:#888;">
    ${config.nombre} · ${config.id} · ${EMAIL_OPERATIVO}
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ─── EMAIL: AVISO LISTA DE ESPERA ─────────────────────────────────────────────

function htmlAvisoListaEspera(entrada, funcionNombre) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>¡Hay disponibilidad! — EL GORILA</title></head>
<body style="font-family:Georgia,serif;padding:32px;color:#222;background:#f5f5f5;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.1);">
  <h1 style="color:#e8c84a;font-size:22px;letter-spacing:3px;margin:0 0 8px;">EL GORILA</h1>
  <h2 style="font-size:18px;margin:0 0 16px;">¡Hay boletos disponibles!</h2>
  <p style="font-size:14px;color:#555;line-height:1.7;">
    Hola <strong>${entrada.nombre}</strong>,<br>
    se liberaron boletos para <strong>${funcionNombre}</strong>. Date prisa: los primeros en comprar son los primeros en entrar.
  </p>
  <a href="https://elgorilateatro.com.mx/boletos.html" style="display:inline-block;background:#1a1a1a;color:#e8c84a;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;margin-top:8px;">
    Comprar boletos →
  </a>
</div>
</body></html>`;
}

// ─── NOTIFICAR PRIMER LUGAR EN LISTA DE ESPERA ────────────────────────────────

async function notificarPrimeroListaEspera(tid, fecha, funcionNombre, env) {
  const lista = await env.VENTAS.list({ prefix: kv(tid, `lista:${fecha}:`) });
  if (!lista.keys.length) return;

  const primerKey = lista.keys[0].name;
  const raw       = await env.VENTAS.get(primerKey);
  let entrada;
  try { entrada = JSON.parse(raw); } catch { return; }

  const enviado = await enviarEmail(
    entrada.email,
    `¡Hay disponibilidad! — EL GORILA`,
    htmlAvisoListaEspera(entrada, funcionNombre),
    env
  );
  if (enviado) await env.VENTAS.delete(primerKey);
}

// ─── KV PREFIX HELPER ────────────────────────────────────────────────────────

/** Alias de URL → ID canónico en KV (un solo inventario por recinto/temporada). */
const TEATRO_ALIASES = { gorila: 'wilberto', elgorila: 'wilberto' };

function resolveTid(tid) {
  return TEATRO_ALIASES[tid] || tid;
}

function kv(tid, key) { return `${resolveTid(tid)}:${key}`; }

// ─── VENUES VÁLIDOS ───────────────────────────────────────────────────────────

const VALID_TEATROS = new Set(['gorila', 'elgorila', 'wilberto', 'ccc']);

// ─── VENUE CONFIG ────────────────────────────────────────────────────────────

const SECCIONES_WILBERTO_FALLBACK = [
  { id: 'platea',  nombre: 'Platea (abajo)',  total: 250, precio_general: 400, precio_descuento: 280 },
  { id: 'galeria', nombre: 'Galería (arriba)', total: 75,  precio_general: 400, precio_descuento: 280 },
];

/** Preventa $350 hasta 26 jul 2026 15:00 CDMX (= 21:00 UTC, ya pasó); luego general $400. Credencial = 30% de descuento sobre el general vigente: $280 en temporada. */
const PRECIO_GENERAL_PREVENTA   = 350;
const PRECIO_GENERAL_TEMPORADA  = 400;
const PRECIO_CREDENCIAL_FIJO    = 280;
const FIN_PREVENTA_UTC_MS       = Date.parse('2026-07-26T21:00:00.000Z');

function precioGeneralVigente() {
  return Date.now() < FIN_PREVENTA_UTC_MS ? PRECIO_GENERAL_PREVENTA : PRECIO_GENERAL_TEMPORADA;
}

function aplicarPreciosVigentes(config) {
  if (!config || !Array.isArray(config.secciones)) return config;
  const general = precioGeneralVigente();
  return {
    ...config,
    secciones: config.secciones.map(s => ({
      ...s,
      precio_general: general,
      precio_descuento: PRECIO_CREDENCIAL_FIJO,
    })),
  };
}

const VENUE_FALLBACKS = {
  wilberto: {
    id:        'wilberto',
    nombre:    'El Gorila — Teatro Wilberto Cantón',
    venue:     'Teatro Wilberto Cantón',
    direccion: 'José María Velasco 59, San José Insurgentes, CDMX',
    secciones: SECCIONES_WILBERTO_FALLBACK,
  },
  ccc: {
    id:        'ccc',
    nombre:    'El Gorila — Centro Cultural Coyoacanense',
    venue:     'Centro Cultural Coyoacanense',
    direccion: 'Felipe Carrillo Puerto 54, Coyoacán, CDMX',
    secciones: [{ id: 'general', nombre: 'General', total: 200, precio_general: 400, precio_descuento: 280 }],
  },
};

async function getVenueConfig(tid, env) {
  const canonical = resolveTid(tid);
  const raw = await env.INVENTARIO.get(kv(canonical, 'config'));
  let config = null;
  if (raw) {
    try { config = JSON.parse(raw); } catch {}
  }
  if (!config) config = VENUE_FALLBACKS[canonical] || VENUE_FALLBACKS.wilberto;
  return aplicarPreciosVigentes(config);
}

// ─── NORMALIZAR INVENTARIO (compat flat → zone-based) ────────────────────────

function normalizeInventario(raw, config) {
  const cfgSecs = config?.secciones || [];
  if (!raw) {
    const secciones = {};
    for (const s of cfgSecs) {
      secciones[s.id] = { total: s.total, vendidos: 0, reservados: 0 };
    }
    return { version: 0, bloqueado: false, holds: {}, secciones };
  }
  const inv = JSON.parse(raw);
  if (inv.secciones) {
    if (inv.secciones.general && cfgSecs.some(s => s.id === 'platea') && !inv.secciones.platea) {
      inv.secciones.platea = inv.secciones.general;
      delete inv.secciones.general;
    }
    // Sincronizar totales desde config (325 = 250 platea + 75 galería) sin tocar vendidos/reservados
    for (const s of cfgSecs) {
      if (!inv.secciones[s.id]) {
        inv.secciones[s.id] = { total: s.total, vendidos: 0, reservados: 0 };
      } else {
        inv.secciones[s.id].total = s.total;
      }
    }
    if (!inv.holds) inv.holds = {};
    return inv;
  }
  // Formato legacy (gorila pre-v3): flat → sección 'general'
  return {
    version:  inv.version  ?? 0,
    bloqueado: inv.bloqueado || false,
    holds:    {},
    secciones: {
      general: {
        total:     inv.total     ?? 200,
        vendidos:  inv.vendidos  || 0,
        reservados: inv.reservados || 0,
      },
    },
  };
}

// ─── CONSTANTES DE NEGOCIO ────────────────────────────────────────────────────

// Precios viven en config KV. Aquí solo nombres y flag de descuento.
const TIPOS_BOLETO = {
  general:    { nombre: 'General',    es_descuento: false },
  inapam:     { nombre: 'INAPAM',     es_descuento: true  },
  estudiante: { nombre: 'Estudiante', es_descuento: true  },
  maestro:    { nombre: 'Maestro',    es_descuento: true  },
};

function getPrecio(tipo, seccionConfig) {
  const esDes = TIPOS_BOLETO[tipo]?.es_descuento ?? false;
  return esDes
    ? (seccionConfig.precio_descuento ?? 280)
    : (seccionConfig.precio_general   ?? 400);
}

const CAPACIDAD_DEFAULT = 200;
/** Tiempo máximo en pantalla de pago (Stripe + hold en inventario). Stripe exige ≥30 min. */
const RESERVA_TTL       = 1800; // 30 minutos
const VENTA_404_MAX     = 40;  // máx. folios NO encontrados por IP / 15 min (anti-enumeración)
const CODIGOS_DESCUENTO_KEY   = 'codigos:descuento';
const STRIPE_MIN_TOTAL_CENTAVOS = 1000; // MXN 10.00 — mínimo Stripe en México

function funcionYaInicio(fechaIso) {
  if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return true;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const [y, m, d] = fechaIso.split('-').map(Number);
  return now >= new Date(y, m - 1, d, 20, 30, 0);
}

async function getCodigosDescuento(env) {
  const raw = await env.INVENTARIO.get(CODIGOS_DESCUENTO_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function normalizarCodigoCupon(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').substring(0, 32);
}

async function validarCuponDescuento(codigoRaw, env) {
  const codigo = normalizarCodigoCupon(codigoRaw);
  if (!codigo || codigo.length < 4) return { ok: false, error: 'Código inválido.' };

  const codigos = await getCodigosDescuento(env);
  const entry   = codigos[codigo];
  if (!entry || entry.activo === false) return { ok: false, error: 'Código no válido o expirado.' };

  if (entry.expira && new Date(entry.expira) < new Date()) {
    return { ok: false, error: 'Código expirado.' };
  }

  if (entry.max_usos) {
    const usos = parseInt((await env.INVENTARIO.get(`cupon:usos:${codigo}`)) || '0', 10);
    if (usos >= entry.max_usos) return { ok: false, error: 'Código agotado.' };
  }

  const tipo = entry.tipo || 'porcentaje';
  const base = {
    ok:           true,
    codigo,
    tipo,
    nombre:       entry.nombre || codigo,
    referido:     !!entry.referido,
    soloGenerales: entry.solo_generales !== false,
    minGeneral:   entry.min_general != null ? Number(entry.min_general) : null,
    maxGeneral:   entry.max_general != null ? Number(entry.max_general) : null,
    // Candado por función: el cupón solo aplica a esta fecha (YYYY-MM-DD)
    soloFecha:    typeof entry.solo_fecha === 'string' ? entry.solo_fecha : null,
  };

  if (tipo === 'par_fijo') {
    const totalMxn = Number(entry.total_mxn);
    const minGen   = Number(entry.min_general) || 2;
    if (!totalMxn || totalMxn <= 0) return { ok: false, error: 'Código no válido.' };
    return { ...base, totalMxn, minGeneral: minGen, porcentaje: 0 };
  }

  const porcentaje = Math.min(100, Math.max(0, Number(entry.porcentaje) || 0));
  if (porcentaje <= 0) return { ok: false, error: 'Código no válido.' };
  return { ...base, porcentaje };
}

function errorCuponSoloFecha(cupon) {
  let legible = cupon.soloFecha;
  try {
    const [y, m, d] = cupon.soloFecha.split('-').map(Number);
    legible = new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch { /* fecha cruda como fallback */ }
  return `Este código solo aplica para la función del ${legible}.`;
}

function contarGenerales(itemsValidados) {
  return itemsValidados
    .filter(i => i.tipo === 'general')
    .reduce((s, i) => s + i.cantidad, 0);
}

function contarTotalBoletos(itemsValidados) {
  return itemsValidados.reduce((s, i) => s + i.cantidad, 0);
}

function carritoSoloGenerales(itemsValidados) {
  return itemsValidados.every(i => i.tipo === 'general');
}

function validarCarritoParaCupon(cupon, itemsValidados) {
  const cantGeneral = contarGenerales(itemsValidados);
  const cantTotal   = contarTotalBoletos(itemsValidados);

  if (cupon.tipo === 'par_fijo') {
    const req = cupon.minGeneral || 2;
    if (!carritoSoloGenerales(itemsValidados)) {
      return {
        ok:    false,
        error: `${cupon.nombre} aplica solo a ${req} boletos generales ($${cupon.totalMxn} total).`,
      };
    }
    if (cantGeneral !== req || cantTotal !== req) {
      return {
        ok:    false,
        error: `${cupon.nombre}: selecciona exactamente ${req} boletos generales ($${cupon.totalMxn} total).`,
      };
    }
    return { ok: true };
  }

  if (cupon.soloGenerales) {
    if (!cantGeneral) {
      return {
        ok:    false,
        error: 'Los cupones aplican solo a boletos generales. Las entradas con credencial ($280) van en su fila aparte.',
      };
    }
    if (!carritoSoloGenerales(itemsValidados)) {
      return {
        ok:    false,
        error: `${cupon.nombre} aplica solo cuando todos los boletos del carrito son generales.`,
      };
    }
  }

  if (cupon.minGeneral != null && cantGeneral < cupon.minGeneral) {
    return {
      ok:    false,
      error: `${cupon.nombre} requiere al menos ${cupon.minGeneral} boletos generales.`,
    };
  }

  if (cupon.maxGeneral != null && cantGeneral > cupon.maxGeneral) {
    return {
      ok:    false,
      error: `${cupon.nombre} aplica hasta ${cupon.maxGeneral} boletos generales por compra.`,
    };
  }

  if (cupon.tipo === 'porcentaje' && !cupon.soloGenerales && cantGeneral === 0) {
    return {
      ok:    false,
      error: `${cupon.nombre} aplica a boletos generales del carrito. Las tarifas INAPAM/estudiante/maestro van en su fila aparte.`,
    };
  }

  return { ok: true };
}

function calcularLineItemsPrecio(itemsValidados, seccionMap, { cupon, sinMinimoStripe = false, precioEspecialCentavos = null }) {
  // sinMinimoStripe: las ventas de taquilla (efectivo/tarjeta_taquilla) no pasan por
  // Stripe, así que no aplican ni el piso de 50¢/boleto ni el total mínimo de $10 —
  // una cortesía con cupón 100% debe quedar en $0 exactos.
  // precioEspecialCentavos: la función tiene precio fijo por boleto (funcion.precio_especial,
  // ej. preestreno de prensa a $10) — aplica a TODOS los tipos y anula cupones.
  const rows           = [];
  let totalCentavos    = 0;
  let subtotalCentavos = 0;

  for (const item of itemsValidados) {
    const seccionConfig = seccionMap[item.seccion];
    const precioBase    = getPrecio(item.tipo, seccionConfig);
    const unitBruto     = Math.round(precioBase * 100);
    subtotalCentavos   += unitBruto * item.cantidad;
    rows.push({ item, seccionConfig, unitBruto, unitCentavos: unitBruto });
  }

  if (precioEspecialCentavos > 0) {
    for (const row of rows) row.unitCentavos = precioEspecialCentavos;
    totalCentavos = rows.reduce((s, r) => s + r.unitCentavos * r.item.cantidad, 0);
  } else if (cupon?.tipo === 'par_fijo') {
    const target = Math.round(cupon.totalMxn * 100);
    const nGen   = contarGenerales(itemsValidados);
    let rest     = target;
    let idxGen   = 0;
    for (const row of rows) {
      if (row.item.tipo !== 'general') continue;
      idxGen += 1;
      const isLast = idxGen === nGen;
      const unit   = isLast ? rest : Math.floor(target / nGen);
      row.unitCentavos = Math.max(sinMinimoStripe ? 0 : 50, unit);
      if (!isLast) rest -= row.unitCentavos;
    }
    totalCentavos = rows.reduce((s, r) => s + r.unitCentavos * r.item.cantidad, 0);
  } else if (cupon?.tipo === 'porcentaje' && cupon.porcentaje > 0) {
    for (const row of rows) {
      let unit = row.unitBruto;
      if (row.item.tipo === 'general') {
        unit = Math.round(unit * (1 - cupon.porcentaje / 100));
      }
      row.unitCentavos = Math.max(sinMinimoStripe ? 0 : 50, unit);
    }
    totalCentavos = rows.reduce((s, r) => s + r.unitCentavos * r.item.cantidad, 0);
  } else {
    for (const row of rows) row.unitCentavos = row.unitBruto;
    totalCentavos = subtotalCentavos;
  }

  if (!sinMinimoStripe && totalCentavos > 0 && totalCentavos < STRIPE_MIN_TOTAL_CENTAVOS) {
    const diff = STRIPE_MIN_TOTAL_CENTAVOS - totalCentavos;
    rows[0].unitCentavos += Math.ceil(diff / rows[0].item.cantidad);
    totalCentavos = STRIPE_MIN_TOTAL_CENTAVOS;
  }

  return {
    rows: rows.map(r => ({
      item:           r.item,
      seccionConfig:  r.seccionConfig,
      unitCentavos:   r.unitCentavos,
      cuponAplicado:  !!cupon,
    })),
    totalCentavos,
    subtotalCentavos,
  };
}

async function incrementarUsoCupon(codigo, env, referidoDe) {
  const key  = `cupon:usos:${codigo}`;
  const usos = parseInt((await env.INVENTARIO.get(key)) || '0', 10);
  await env.INVENTARIO.put(key, String(usos + 1));

  const codigos = await getCodigosDescuento(env);
  if (codigos[codigo]?.referido) {
    const refKey = `cupon:referidos:total:${codigo}`;
    const total  = parseInt((await env.INVENTARIO.get(refKey)) || '0', 10);
    await env.INVENTARIO.put(refKey, String(total + 1));
  }

  if (referidoDe && esCodigoCert(referidoDe)) {
    const origenKey = `referido:origen:${referidoDe.trim().toUpperCase()}`;
    const n = parseInt((await env.INVENTARIO.get(origenKey)) || '0', 10);
    await env.INVENTARIO.put(origenKey, String(n + 1));
  }
}

function enmascararCertificado(cert) {
  if (!cert || typeof cert !== 'string') return '—';
  const c = cert.trim().toUpperCase();
  if (c.length <= 14) return c;
  return `${c.slice(0, 12)}…${c.slice(-4)}`;
}


// ─── HOLDS (reservas sin pago — no bloquean para siempre) ─────────────────────
// vendidos = pagados (intocables). holds = carritos en checkout. Al vencer o al
// necesitar cupo, se liberan holds; si tenían sesión Stripe, se expira vía API.

function recalcReservadosDesdeHolds(inv, config) {
  const holds  = inv.holds || {};
  const now    = Date.now();
  const counts = {};
  for (const h of Object.values(holds)) {
    if ((h.expiresAt || 0) > now) {
      for (const [secId, cant] of Object.entries(h.seccionCantidades || {})) {
        counts[secId] = (counts[secId] || 0) + cant;
      }
    }
  }
  const secciones = { ...(inv.secciones || {}) };
  for (const s of config?.secciones || []) {
    const sInv = secciones[s.id] || { total: s.total, vendidos: 0, reservados: 0 };
    secciones[s.id] = { ...sInv, reservados: counts[s.id] || 0 };
  }
  return { ...inv, secciones };
}

function purgarHoldsVencidos(inv) {
  const holds = { ...(inv.holds || {}) };
  const now   = Date.now();
  for (const [id, h] of Object.entries(holds)) {
    if ((h.expiresAt || 0) <= now) delete holds[id];
  }
  return { ...inv, holds };
}

function cupoSeccion(inv, secId, config) {
  const cfgSec = config?.secciones?.find(s => s.id === secId);
  const sInv   = inv.secciones?.[secId] || { total: cfgSec?.total ?? CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
  return Math.max(0, sInv.total - (sInv.vendidos || 0) - (sInv.reservados || 0));
}

function hayCupo(inv, config, seccionCantidades) {
  for (const [secId, cant] of Object.entries(seccionCantidades)) {
    if (cupoSeccion(inv, secId, config) < cant) return false;
  }
  return true;
}

// Un hold recién creado todavía no tiene sesión de Stripe: se crea unos
// instantes después (reservar → crear sesión → vincularSessionAlHold). Si lo
// desalojamos en esa ventana no hay sesión que expirar, y esa persona llega a
// pagar de todos modos → sobreventa real. Bajo un pico eso deja de ser teórico:
// llegan muchas reservas nuevas a la vez y todas son "recientes".
// Por eso los holds con menos de este tiempo son intocables: si el cupo está
// lleno de carritos frescos, la función está genuinamente llena AHORA y hay que
// decir que no, en vez de robarle el lugar a alguien que ya va a pagar.
const GRACIA_HOLD_MS = 90 * 1000;

/** Libera holds más antiguos (sin pago) hasta abrir cupo. Devuelve sessionIds a expirar en Stripe. */
function evictarHoldsFIFO(inv, seccionCantidades, config) {
  const sessionIds = [];
  const ahora = Date.now();
  let work = { ...inv, holds: { ...(inv.holds || {}) } };
  const ordenados = Object.entries(work.holds)
    .filter(([, h]) => (ahora - (h.createdAt || 0)) >= GRACIA_HOLD_MS)
    .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));

  for (const [holdId, h] of ordenados) {
    if (hayCupo(work, config, seccionCantidades)) break;
    if (h.sessionId) sessionIds.push(h.sessionId);
    delete work.holds[holdId];
    work = recalcReservadosDesdeHolds(work, config);
  }
  return { inv: work, sessionIds };
}

async function expirarSesionesStripe(sessionIds, env) {
  if (!env.STRIPE_SECRET_KEY || !sessionIds?.length) return;
  for (const sid of sessionIds) {
    try {
      await fetch(`https://api.stripe.com/v1/checkout/sessions/${sid}/expire`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
    } catch (e) { logError('session.expire', { sid: truncateId(sid), error: e.message }); }
  }
}

async function prepararInventarioParaVenta(tid, fecha, seccionCantidades, env, opts = {}) {
  const config = await getVenueConfig(tid, env);
  const invRaw = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
  let inv      = normalizeInventario(invRaw, config);
  inv          = purgarHoldsVencidos(inv);
  inv          = recalcReservadosDesdeHolds(inv, config);

  let evictedSessions = [];
  if (!hayCupo(inv, config, seccionCantidades)) {
    const ev = evictarHoldsFIFO(inv, seccionCantidades, config);
    inv = ev.inv;
    evictedSessions = ev.sessionIds;
  }

  if (!hayCupo(inv, config, seccionCantidades) && !opts.permitirSinCupo) {
    return { ok: false, inv, evictedSessions };
  }
  return { ok: true, inv, config, evictedSessions };
}

// ─── INVENTARIO SERIALIZADO (Durable Object) ─────────────────────────────────
// POR QUÉ EXISTE ESTO:
// El inventario de una función vivía en UNA llave de KV con "optimistic locking"
// (escribir y releer la versión). Eso no funciona en KV: no es linealizable y las
// lecturas vienen de caché de edge. Dos compras simultáneas leen versión 5, ambas
// escriben versión 6, ambas releen 6 y ambas creen que ganaron — gana la última.
// En el camino de confirmación eso significa una venta PAGADA que no suma a
// `vendidos`: el asiento se vendió y el inventario lo sigue mostrando libre.
// Además KV limita ~1 escritura por segundo por llave, y cada compra escribía esa
// misma llave 3-4 veces → techo de ~15-20 compras/min por función.
//
// Un Durable Object da ejecución serializada y consistencia fuerte por instancia
// (una instancia por función). Aquí el read-modify-write sí es atómico.
//
// KV queda como RÉPLICA de solo lectura para que todo lo que ya leía KV (panel de
// admin, endpoint público de funciones, reportes) siga funcionando sin cambios.
// La réplica es best-effort: si una escritura a KV se topa con su límite de ritmo
// se ignora, y una alarma la vuelve a volcar poco después. La verdad está en el DO.

const INVENTARIO_DO_FLUSH_MS = 3000; // volcado diferido a KV tras cada mutación

export class InventarioFuncion {
  constructor(state, env) {
    this.state = state;
    this.env   = env;
  }

  /** Estado actual, sembrándolo desde KV la primera vez (migración sin downtime). */
  async cargar(tid, fecha, config) {
    let guardado = await this.state.storage.get('inv');
    if (guardado === undefined) {
      const raw = await this.env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
      guardado  = normalizeInventario(raw, config);
      await this.state.storage.put('inv', guardado);
      await this.state.storage.put('sembrado', { desde: 'kv', en: Date.now() });
    }
    // Re-normalizar contra la config vigente (totales de secciones pueden cambiar)
    return normalizeInventario(JSON.stringify(guardado), config);
  }

  async guardar(tid, fecha, inv) {
    await this.state.storage.put('inv', inv);
    await this.state.storage.put('pendienteKV', { tid, fecha });
    // Réplica inmediata best-effort + alarma de respaldo por si KV la rechaza.
    await this.replicarAKV(tid, fecha, inv);
    await this.state.storage.setAlarm(Date.now() + INVENTARIO_DO_FLUSH_MS);
  }

  async replicarAKV(tid, fecha, inv) {
    try {
      await this.env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(inv));
      await this.state.storage.delete('pendienteKV');
    } catch (e) {
      // Límite de ritmo de KV u otro fallo: la alarma reintenta. No es fatal:
      // el DO ya tiene la verdad y ninguna decisión de cupo depende de KV.
      logError('inventario.replica_kv', { teatroId: tid, fecha, error: e.message });
    }
  }

  /** Reintenta el volcado a KV si la escritura inmediata falló. */
  async alarm() {
    const p = await this.state.storage.get('pendienteKV');
    if (!p) return;
    const inv = await this.state.storage.get('inv');
    if (!inv) return;
    await this.replicarAKV(p.tid, p.fecha, inv);
  }

  async fetch(request) {
    let payload;
    try { payload = await request.json(); }
    catch (_) { return Response.json({ ok: false, status: 400, error: 'payload inválido' }, { status: 400 }); }

    let salida;
    // blockConcurrencyWhile garantiza exclusión mutua aunque el handler haga await.
    // Nada de red externa aquí dentro (Stripe se llama fuera, con los sessionIds
    // que devolvemos) para no alargar la sección crítica.
    await this.state.blockConcurrencyWhile(async () => {
      try {
        salida = await this.ejecutar(payload);
      } catch (e) {
        logError('inventario.do', { op: payload?.op, error: e.message });
        salida = { ok: false, status: 500, error: 'inventario no disponible', _falloDO: true };
      }
    });
    return Response.json(salida);
  }

  async ejecutar(p) {
    const { op, tid, fecha, config, seccionCantidades, reservaId, sessionId, holdTtl } = p;
    let inv = await this.cargar(tid, fecha, config);

    // Todas las operaciones parten de un estado saneado: holds vencidos fuera y
    // reservados recalculados desde los holds vivos.
    inv = recalcReservadosDesdeHolds(purgarHoldsVencidos(inv), config);

    switch (op) {
      case 'leer':
        return { ok: true, inv };

      case 'reservar': {
        if (inv.bloqueado) return { ok: false, status: 409, error: 'Ventas cerradas para esta función.' };

        let evictedSessions = [];
        if (!hayCupo(inv, config, seccionCantidades)) {
          const ev = evictarHoldsFIFO(inv, seccionCantidades, config);
          inv = ev.inv;
          evictedSessions = ev.sessionIds;
        }
        if (!hayCupo(inv, config, seccionCantidades)) {
          return { ok: false, status: 409, error: 'No hay suficientes lugares para completar tu compra.', evictedSessions };
        }

        const now = Date.now();
        inv.holds = { ...(inv.holds || {}) };
        inv.holds[reservaId] = {
          seccionCantidades,
          createdAt: now,
          expiresAt: now + (holdTtl || RESERVA_TTL) * 1000,
          sessionId: null,
        };
        inv = recalcReservadosDesdeHolds({ ...inv, version: (inv.version ?? 0) + 1 }, config);
        await this.guardar(tid, fecha, inv);
        return { ok: true, evictedSessions };
      }

      case 'vincularSession': {
        const holds = { ...(inv.holds || {}) };
        if (!holds[reservaId]) return { ok: true, sinHold: true };
        holds[reservaId] = { ...holds[reservaId], sessionId };
        inv = { ...inv, holds, version: (inv.version ?? 0) + 1 };
        await this.guardar(tid, fecha, inv);
        return { ok: true };
      }

      case 'liberar': {
        const holds = { ...(inv.holds || {}) };
        if (reservaId && holds[reservaId]) {
          delete holds[reservaId];
        } else if (seccionCantidades) {
          // Respaldo heredado: quitar el primer hold que coincida en cantidades
          for (const [hid, h] of Object.entries(holds)) {
            if (JSON.stringify(h.seccionCantidades) === JSON.stringify(seccionCantidades)) {
              delete holds[hid];
              break;
            }
          }
        }
        inv = recalcReservadosDesdeHolds({ ...inv, holds, version: (inv.version ?? 0) + 1 }, config);
        await this.guardar(tid, fecha, inv);
        return { ok: true };
      }

      case 'confirmar': {
        // Camino del webhook de Stripe: el pago YA ocurrió. Nunca se rechaza por
        // cupo — sobrevender aquí es un error de negocio a resolver a mano, pero
        // perder la venta del registro es peor. Se avisa en logs si pasa.
        const holds = { ...(inv.holds || {}) };
        if (reservaId && holds[reservaId]) delete holds[reservaId];

        const secciones = { ...inv.secciones };
        let sobreventa = false;
        for (const [secId, cant] of Object.entries(seccionCantidades)) {
          const sInv = secciones[secId] || { total: CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
          const nuevosVendidos = (sInv.vendidos || 0) + cant;
          if (nuevosVendidos > (sInv.total ?? CAPACIDAD_DEFAULT)) sobreventa = true;
          secciones[secId] = { ...sInv, vendidos: nuevosVendidos };
        }
        inv = recalcReservadosDesdeHolds({ ...inv, holds, secciones, version: (inv.version ?? 0) + 1 }, config);
        await this.guardar(tid, fecha, inv);
        if (sobreventa) logError('inventario.sobreventa', { teatroId: tid, fecha, seccionCantidades });
        return { ok: true, sobreventa };
      }

      case 'ventaDirecta': {
        if (inv.bloqueado) return { ok: false, status: 409, error: 'Ventas cerradas para esta función.' };

        let evictedSessions = [];
        if (!hayCupo(inv, config, seccionCantidades)) {
          const ev = evictarHoldsFIFO(inv, seccionCantidades, config);
          inv = ev.inv;
          evictedSessions = ev.sessionIds;
        }
        if (!hayCupo(inv, config, seccionCantidades)) {
          return { ok: false, status: 409, error: 'No hay suficientes lugares disponibles.', evictedSessions };
        }

        const secciones = { ...inv.secciones };
        for (const [secId, cant] of Object.entries(seccionCantidades)) {
          const sInv = secciones[secId] || { total: CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
          secciones[secId] = { ...sInv, vendidos: (sInv.vendidos || 0) + cant };
        }
        inv = recalcReservadosDesdeHolds({ ...inv, secciones, version: (inv.version ?? 0) + 1 }, config);
        await this.guardar(tid, fecha, inv);
        return { ok: true, evictedSessions };
      }

      case 'liberarVendidos': {
        // Reagendamiento: devuelve cupo ya pagado a la función origen.
        const secciones = { ...(inv.secciones || {}) };
        for (const [secId, cant] of Object.entries(seccionCantidades)) {
          const sInv = secciones[secId] || { total: CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
          secciones[secId] = { ...sInv, vendidos: Math.max(0, (sInv.vendidos || 0) - cant) };
        }
        inv = recalcReservadosDesdeHolds({ ...inv, secciones, version: (inv.version ?? 0) + 1 }, config);
        await this.guardar(tid, fecha, inv);
        return { ok: true };
      }

      case 'reemplazar': {
        // Edición desde admin: se impone el objeto completo que manda el panel.
        const nuevo = recalcReservadosDesdeHolds(
          normalizeInventario(JSON.stringify(p.inv), config), config);
        nuevo.version = (inv.version ?? 0) + 1;
        await this.guardar(tid, fecha, nuevo);
        return { ok: true, inv: nuevo };
      }

      default:
        return { ok: false, status: 400, error: `op desconocida: ${op}` };
    }
  }
}

/** Instancia de inventario de UNA función. Una llave lógica = una instancia. */
function stubInventario(tid, fecha, env) {
  const nombre = `${resolveTid(tid)}:funcion:${fecha}`;
  return env.INVENTARIO_DO.get(env.INVENTARIO_DO.idFromName(nombre));
}

/**
 * Llama al DO de inventario. Devuelve null si el DO no está disponible, para que
 * el llamador caiga al camino KV heredado en vez de dejar de vender.
 */
async function opInventario(tid, fecha, env, payload) {
  if (!env.INVENTARIO_DO) return null;
  try {
    const config = payload.config || await getVenueConfig(tid, env);
    const res = await stubInventario(tid, fecha, env).fetch('https://inventario/op', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ tid, fecha, config, ...payload }),
    });
    if (!res.ok) throw new Error(`DO respondió ${res.status}`);
    const out = await res.json();
    if (out && out._falloDO) return null;
    return out;
  } catch (e) {
    logError('inventario.do_indisponible', { teatroId: tid, fecha, op: payload?.op, error: e.message });
    return null; // → respaldo KV
  }
}

/**
 * Lectura de inventario para DECIDIR (no para mostrar): va al DO, que es la
 * fuente de verdad. Cae a KV solo si el DO no responde. Para listados masivos
 * sigue sirviendo leer KV directo: es réplica de a lo más unos segundos.
 */
async function leerInventarioFuerte(tid, fecha, env, config) {
  const cfg = config || await getVenueConfig(tid, env);
  const r   = await opInventario(tid, fecha, env, { op: 'leer', config: cfg });
  if (r?.ok) return r.inv;
  const raw = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
  return recalcReservadosDesdeHolds(purgarHoldsVencidos(normalizeInventario(raw, cfg)), cfg);
}

const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'];

function sanitizarUTM(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of UTM_KEYS) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().substring(0, 200);
  }
  return out;
}

// ─── OPTIMISTIC LOCKING (zone-aware) ─────────────────────────────────────────
// seccionCantidades = { platea: 2, galeria: 1 }

function disponiblesSeccion(inv, secId, config) {
  const cfgSec = config?.secciones?.find(s => s.id === secId);
  const sInv   = inv.secciones[secId] || { total: cfgSec?.total ?? CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
  return Math.max(0, sInv.total - (sInv.vendidos || 0) - (sInv.reservados || 0));
}

/** Cupo restante en todo el teatro (platea + galería). Uso interno / taquilla. */
function sumDisponiblesSecciones(seccionesMap) {
  if (!seccionesMap || typeof seccionesMap !== 'object') return 0;
  return Object.values(seccionesMap).reduce((s, x) => s + (x.disponibles ?? 0), 0);
}

async function reservarOptimista(tid, fecha, seccionCantidades, reservaId, env, ctx, holdTtl = RESERVA_TTL) {
  const r = await opInventario(tid, fecha, env, {
    op: 'reservar', seccionCantidades, reservaId, holdTtl,
  });
  if (r) {
    if (r.evictedSessions?.length && ctx) ctx.waitUntil(expirarSesionesStripe(r.evictedSessions, env));
    return r.ok ? { ok: true } : { ok: false, status: r.status, error: r.error };
  }
  return reservarOptimistaKV(tid, fecha, seccionCantidades, reservaId, env, ctx, holdTtl);
}

/** Respaldo heredado sobre KV. Solo corre si el DO no está disponible. */
async function reservarOptimistaKV(tid, fecha, seccionCantidades, reservaId, env, ctx, holdTtl = RESERVA_TTL) {
  const config = await getVenueConfig(tid, env);
  for (let intento = 0; intento < 3; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 50 + Math.random() * 150));

    const prep = await prepararInventarioParaVenta(tid, fecha, seccionCantidades, env);
    if (prep.evictedSessions?.length && ctx) {
      ctx.waitUntil(expirarSesionesStripe(prep.evictedSessions, env));
    }

    let inv = prep.inv;
    if (inv.bloqueado) return { ok: false, status: 409, error: 'Ventas cerradas para esta función.' };

    if (!hayCupo(inv, config, seccionCantidades)) {
      const secId = Object.keys(seccionCantidades)[0] || 'platea';
      const disp  = cupoSeccion(inv, secId, config);
      const secLabel = secId.charAt(0).toUpperCase() + secId.slice(1);
      return { ok: false, status: 409, error: 'No hay suficientes lugares para completar tu compra.' };
    }

    const version  = inv.version ?? 0;
    const now      = Date.now();
    const holds    = { ...(inv.holds || {}) };
    holds[reservaId] = {
      seccionCantidades,
      createdAt: now,
      expiresAt: now + holdTtl * 1000,
      sessionId: null,
    };
    let invNuevo = recalcReservadosDesdeHolds({ ...inv, holds, version: version + 1 }, config);
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(invNuevo));

    const check    = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const checkInv = check ? JSON.parse(check) : {};
    if ((checkInv.version ?? -1) === version + 1) return { ok: true };
  }
  return { ok: false, status: 503, error: 'Sistema concurrido. Intenta de nuevo en unos segundos.' };
}

async function vincularSessionAlHold(tid, fecha, reservaId, sessionId, env) {
  const r = await opInventario(tid, fecha, env, { op: 'vincularSession', reservaId, sessionId });
  if (r) return;
  return vincularSessionAlHoldKV(tid, fecha, reservaId, sessionId, env);
}

/** Respaldo heredado sobre KV. Solo corre si el DO no está disponible. */
async function vincularSessionAlHoldKV(tid, fecha, reservaId, sessionId, env) {
  const config = await getVenueConfig(tid, env);
  const invRaw = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
  if (!invRaw) return;
  const inv   = normalizeInventario(invRaw, config);
  const holds = { ...(inv.holds || {}) };
  if (!holds[reservaId]) return;
  holds[reservaId] = { ...holds[reservaId], sessionId };
  const invNuevo = { ...inv, holds, version: (inv.version ?? 0) + 1 };
  await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(invNuevo));
}

async function liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env) {
  const r = await opInventario(tid, fecha, env, { op: 'liberar', seccionCantidades, reservaId });
  if (r) return;
  return liberarReservaOptimistaKV(tid, fecha, seccionCantidades, reservaId, env);
}

/** Respaldo heredado sobre KV. Solo corre si el DO no está disponible. */
async function liberarReservaOptimistaKV(tid, fecha, seccionCantidades, reservaId, env) {
  const config = await getVenueConfig(tid, env);
  for (let intento = 0; intento < 3; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 50 + Math.random() * 150));

    const invRaw = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    if (!invRaw) return;
    let inv     = normalizeInventario(invRaw, config);
    const version = inv.version ?? 0;
    const holds   = { ...(inv.holds || {}) };

    if (reservaId && holds[reservaId]) {
      delete holds[reservaId];
    } else if (seccionCantidades) {
      // Fallback legacy: quitar primer hold que coincida en cantidades
      for (const [hid, h] of Object.entries(holds)) {
        if (JSON.stringify(h.seccionCantidades) === JSON.stringify(seccionCantidades)) {
          delete holds[hid];
          break;
        }
      }
    }

    inv = recalcReservadosDesdeHolds({ ...inv, holds, version: version + 1 }, config);
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(inv));

    const check    = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const checkInv = check ? JSON.parse(check) : {};
    if ((checkInv.version ?? -1) === version + 1) return;
  }
  logError('inventario.liberar_conflicto', { teatroId: tid, fecha });
}

async function confirmarVentaOptimista(tid, fecha, seccionCantidades, reservaId, env) {
  const r = await opInventario(tid, fecha, env, { op: 'confirmar', seccionCantidades, reservaId });
  if (r) return;
  return confirmarVentaOptimistaKV(tid, fecha, seccionCantidades, reservaId, env);
}

/** Respaldo heredado sobre KV. Solo corre si el DO no está disponible. */
async function confirmarVentaOptimistaKV(tid, fecha, seccionCantidades, reservaId, env) {
  const config = await getVenueConfig(tid, env);
  for (let intento = 0; intento < 3; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 50 + Math.random() * 150));

    const invRaw  = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    let inv       = normalizeInventario(invRaw, config);
    const version = inv.version ?? 0;
    const holds   = { ...(inv.holds || {}) };

    if (reservaId && holds[reservaId]) delete holds[reservaId];

    const secciones = { ...inv.secciones };
    for (const [secId, cant] of Object.entries(seccionCantidades)) {
      const sInv = secciones[secId] || { total: CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
      secciones[secId] = {
        ...sInv,
        vendidos: (sInv.vendidos || 0) + cant,
      };
    }
    inv = recalcReservadosDesdeHolds({ ...inv, holds, secciones, version: version + 1 }, config);
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(inv));

    const check    = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const checkInv = check ? JSON.parse(check) : {};
    if ((checkInv.version ?? -1) === version + 1) return;
  }
  logError('inventario.confirmar_conflicto', { teatroId: tid, fecha });
}

/** Venta inmediata (efectivo / taquilla) — sin hold; solo incrementa vendidos. */
async function aplicarVentaDirecta(tid, fecha, seccionCantidades, env, ctx) {
  const r = await opInventario(tid, fecha, env, { op: 'ventaDirecta', seccionCantidades });
  if (r) {
    if (r.evictedSessions?.length && ctx) ctx.waitUntil(expirarSesionesStripe(r.evictedSessions, env));
    return r.ok ? { ok: true } : { ok: false, status: r.status, error: r.error };
  }
  return aplicarVentaDirectaKV(tid, fecha, seccionCantidades, env, ctx);
}

/** Respaldo heredado sobre KV. Solo corre si el DO no está disponible. */
async function aplicarVentaDirectaKV(tid, fecha, seccionCantidades, env, ctx) {
  const config = await getVenueConfig(tid, env);
  for (let intento = 0; intento < 3; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 50 + Math.random() * 150));

    const prep = await prepararInventarioParaVenta(tid, fecha, seccionCantidades, env);
    if (prep.evictedSessions?.length && ctx) {
      ctx.waitUntil(expirarSesionesStripe(prep.evictedSessions, env));
    }
    if (!hayCupo(prep.inv, config, seccionCantidades)) {
      const secId    = Object.keys(seccionCantidades)[0] || 'platea';
      const disp     = cupoSeccion(prep.inv, secId, config);
      const secLabel = secId.charAt(0).toUpperCase() + secId.slice(1);
      return { ok: false, status: 409, error: 'No hay suficientes lugares para completar tu compra.' };
    }

    const version   = prep.inv.version ?? 0;
    const secciones = { ...(prep.inv.secciones || {}) };
    for (const [secId, cant] of Object.entries(seccionCantidades)) {
      const cfgSec = config.secciones?.find(s => s.id === secId);
      const sInv   = secciones[secId] || { total: cfgSec?.total ?? CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
      secciones[secId] = { ...sInv, vendidos: (sInv.vendidos || 0) + cant };
    }
    const invNuevo = recalcReservadosDesdeHolds({ ...prep.inv, secciones, version: version + 1 }, config);
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(invNuevo));

    const check    = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const checkInv = check ? JSON.parse(check) : {};
    if ((checkInv.version ?? -1) === version + 1) return { ok: true };
  }
  return { ok: false, status: 503, error: 'Sistema concurrido. Intenta de nuevo.' };
}

// ─── ADMIN AUTH ───────────────────────────────────────────────────────────────

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    let sink = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) sink |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return false;
  }
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
}

const ROLES_AUTH = new Set(['admin', 'gerente', 'taquilla', 'validacion', 'reclamos']);

const JWT_PURPOSES_OK = new Set(['boletera', 'acceso_email']);

async function requireAdmin(request, env) {
  if (!env.JWT_SECRET) return null;
  const auth  = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || !ROLES_AUTH.has(payload.rol)) return null;
  if (payload.purpose && !JWT_PURPOSES_OK.has(payload.purpose)) return null;
  return payload;
}

function actorLabel(payload) {
  if (!payload) return '—';
  const nom   = payload.nombre || payload.usuario || '—';
  const email = payload.email ? String(payload.email) : '';
  const tel   = payload.telefono ? String(payload.telefono) : '';
  if (payload.purpose === 'acceso_email') {
    if (email) return `${nom} · ${email}`;
    if (tel) return `${nom} · ${tel}`;
  }
  return nom || payload.usuario;
}

function hoyISOMx() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function _errorCanjeVenta(venta, fechaPuerta) {
  if (!venta) return 'Venta no encontrada.';
  if (venta.estado === 'reembolsada') {
    return 'Este boleto fue reembolsado y ya no tiene validez.';
  }
  if (venta.estado === 'cancelada' || venta.cancelada === true) {
    return 'Este boleto fue cancelado y ya no tiene validez.';
  }
  const fechaVenta           = venta.fecha;
  const fechaOrigenCancelada = venta.fechaAnterior || venta.reagendado?.de || null;
  if (fechaPuerta && fechaOrigenCancelada && fechaPuerta === fechaOrigenCancelada && fechaVenta !== fechaPuerta) {
    return `Función cancelada por reagendamiento. Válido solo para ${venta.funcionNombre || fechaVenta}.`;
  }
  if (fechaPuerta && fechaVenta && fechaPuerta !== fechaVenta) {
    return `Este boleto es para ${venta.funcionNombre || fechaVenta}, no para la función seleccionada.`;
  }
  // Aunque no se seleccione fecha en la puerta (fechaPuerta ausente), un boleto de
  // una función que ya pasó nunca es canjeable — evita que se use por error en una
  // función posterior.
  if (!venta.usado && fechaVenta && fechaVenta < hoyISOMx()) {
    return `Esta función (${venta.funcionNombre || fechaVenta}) ya pasó. El boleto ya no es válido.`;
  }
  return null;
}

async function _fechaCanjeDesdeRequest(request) {
  try {
    const body = await request.clone().json();
    const fecha = body?.fecha;
    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  } catch { /* sin cuerpo */ }
  return null;
}

async function requireRolAdmin(request, env) {
  const p = await requireAdmin(request, env);
  if (!p || p.rol !== 'admin') return null;
  return p;
}

const PUEDE_VENTAS       = new Set(['admin', 'gerente', 'taquilla', 'reclamos']);
const PUEDE_VENTA_MAN    = new Set(['admin', 'taquilla']);
const PUEDE_REENVIAR     = new Set(['admin', 'gerente', 'reclamos']);
const PUEDE_CORREGIR_EMAIL = new Set(['admin', 'reclamos']);
const PUEDE_FISCAL_VER = new Set(['admin', 'gerente']);
const PUEDE_AUDITORIA  = new Set(['admin', 'gerente']);
const PUEDE_CANJEAR    = new Set(['admin', 'gerente', 'taquilla', 'validacion']);
const PUEDE_CANJEAR_LOTE = new Set(['admin', 'gerente', 'taquilla']);

// ─── HANDLER: VALIDAR CUPÓN (público, rate-limited) ───────────────────────────

async function handleValidarCupon(tid, request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(ip, env)) {
    return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const codigoRaw = body.codigo;
  const { items }   = body;
  if (!codigoRaw) return json({ error: 'Indica un código de descuento.' }, 400, request);
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'El carrito está vacío.' }, 400, request);
  }

  const config         = await getVenueConfig(tid, env);
  const validSecciones = new Set(config.secciones.map(s => s.id));
  const seccionMap     = Object.fromEntries(config.secciones.map(s => [s.id, s]));
  const itemsValidados = [];

  for (const item of items) {
    const tipo     = typeof item.tipo === 'string' ? item.tipo.toLowerCase().trim() : '';
    const cantidad = item.cantidad;
    const seccion  = item.seccion || (config.secciones.length === 1 ? config.secciones[0].id : 'platea');
    if (!TIPOS_BOLETO[tipo] || !Number.isInteger(cantidad) || cantidad < 1) continue;
    if (!validSecciones.has(seccion)) continue;
    itemsValidados.push({ tipo, cantidad, seccion });
  }
  if (!itemsValidados.length) return json({ error: 'Carrito inválido.' }, 400, request);

  const cupon = await validarCuponDescuento(codigoRaw, env);
  if (!cupon.ok) return json({ error: cupon.error }, 400, request);

  const reglas = validarCarritoParaCupon(cupon, itemsValidados);
  if (!reglas.ok) return json({ error: reglas.error }, 400, request);

  // Candado solo_fecha: si el cliente manda la fecha de la orden, se valida aquí
  // (el candado duro está en la creación del checkout y en venta manual).
  const fechaOrden = typeof body.fecha === 'string' ? body.fecha : '';
  if (cupon.soloFecha && fechaOrden && fechaOrden !== cupon.soloFecha) {
    return json({ error: errorCuponSoloFecha(cupon) }, 400, request);
  }

  // Funciones con precio especial (ej. preestreno $10/boleto) no combinan cupones
  if (fechaOrden) {
    try {
      const fRaw = await env.INVENTARIO.get(kv(tid, 'funciones:activas'));
      const fn   = fRaw ? JSON.parse(fRaw).find(f => f.fecha_iso === fechaOrden) : null;
      if (Number(fn?.precio_especial) > 0) {
        return json({ error: 'Esta función ya tiene precio especial — los cupones no aplican.' }, 400, request);
      }
    } catch { /* si falla la lectura, el checkout aplica el precio especial de todos modos */ }
  }

  const { totalCentavos, subtotalCentavos } = calcularLineItemsPrecio(itemsValidados, seccionMap, {
    cupon,
  });

  const subtotal = Math.round(subtotalCentavos) / 100;
  const total    = totalCentavos / 100;

  return json({
    ok:             true,
    codigo:         cupon.codigo,
    nombre:         cupon.nombre,
    tipo:           cupon.tipo,
    porcentaje:     cupon.porcentaje || 0,
    totalMxn:       cupon.totalMxn || null,
    subtotal,
    descuentoMonto: Math.max(0, Math.round((subtotal - total) * 100) / 100),
    total,
  }, 200, request);
}

// ─── HANDLER: FUNCIONES ACTIVAS (público) ────────────────────────────────────

async function enrichFuncionesList(canonical, funciones, config, env) {
  const capacidad = (config.secciones || []).reduce((s, x) => s + (x.total || 0), 0);
  return Promise.all(funciones.map(async f => {
    const invRaw = await env.INVENTARIO.get(kv(canonical, `funcion:${f.fecha_iso}`));
    const inv    = recalcReservadosDesdeHolds(
      purgarHoldsVencidos(normalizeInventario(invRaw, config)),
      config,
    );
    let vendidos = 0, reservados = 0;
    const secciones = {};
    for (const s of config.secciones) {
      const sInv = inv.secciones[s.id] || { total: s.total, vendidos: 0, reservados: 0 };
      vendidos   += sInv.vendidos   || 0;
      reservados += sInv.reservados || 0;
      secciones[s.id] = {
        nombre:      s.nombre,
        total:       sInv.total,
        vendidos:    sInv.vendidos   || 0,
        reservados:  sInv.reservados || 0,
        disponibles: disponiblesSeccion(inv, s.id, config),
      };
    }
    const plateaDisp  = secciones.platea?.disponibles ?? 0;
    const galeriaDisp = secciones.galeria?.disponibles ?? 0;
    const galeriaAbierta = !!secciones.galeria && plateaDisp === 0 && galeriaDisp > 0;
    const disponibles_total = sumDisponiblesSecciones(secciones);
    const disponibles = galeriaAbierta
      ? galeriaDisp
      : (plateaDisp || Math.max(0, capacidad - vendidos - reservados));

    return {
      ...f,
      teatroId:        canonical,
      capacidad,
      vendidos,
      reservados,
      disponibles,
      disponibles_total,
      galeria_abierta: galeriaAbierta,
      secciones,
    };
  }));
}

async function handleFunciones(tid, request, env) {
  const canonical = resolveTid(tid);
  const config    = await getVenueConfig(canonical, env);
  const raw       = await env.INVENTARIO.get(kv(canonical, 'funciones:activas'));
  if (!raw) return json([], 200, request);
  try {
    const funciones = JSON.parse(raw).filter(f => f.activa !== false);
    const enriched  = await enrichFuncionesList(canonical, funciones, config, env);
    return json(enriched, 200, request);
  } catch { return json([], 200, request); }
}

async function handleFuncionesAdmin(tid, request, env) {
  const payload = await requireRolAdmin(request, env);
  if (!payload) return json({ error: 'Solo el administrador.' }, 403, request);

  const canonical = resolveTid(tid);
  const config    = await getVenueConfig(canonical, env);
  const raw       = await env.INVENTARIO.get(kv(canonical, 'funciones:activas'));
  if (!raw) return json([], 200, request);
  try {
    const funciones = JSON.parse(raw);
    const enriched  = await enrichFuncionesList(canonical, funciones, config, env);
    return json(enriched, 200, request);
  } catch { return json([], 200, request); }
}

async function handleFuncionesToggle(tid, request, env) {
  const payload = await requireRolAdmin(request, env);
  if (!payload) return json({ error: 'Solo el administrador.' }, 403, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const fechaIso = (body.fecha_iso || body.fecha || '').trim();
  if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
    return json({ error: 'Indica fecha_iso válida.' }, 400, request);
  }
  if (typeof body.activa !== 'boolean') {
    return json({ error: 'Indica activa: true|false.' }, 400, request);
  }

  const canonical = resolveTid(tid);
  const raw       = await env.INVENTARIO.get(kv(canonical, 'funciones:activas'));
  const list      = raw ? JSON.parse(raw) : [];
  const idx       = list.findIndex(f => f.fecha_iso === fechaIso);
  if (idx < 0) return json({ error: 'Función no encontrada en KV.' }, 404, request);

  const antes = list[idx].activa !== false;
  list[idx].activa = body.activa;
  await env.INVENTARIO.put(kv(canonical, 'funciones:activas'), JSON.stringify(list));

  await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'funcion_toggle', teatroId: canonical,
    detalles: `${fechaIso} · venta pública: ${antes ? 'activa' : 'oculta'} → ${body.activa ? 'activa' : 'oculta'}`,
    meta: { fecha_iso: fechaIso, activa: body.activa, nombre: list[idx].nombre },
  });

  return json({ ok: true, funcion: list[idx] }, 200, request);
}

// ─── HANDLER: DISPONIBILIDAD ──────────────────────────────────────────────────

async function handleDisponibilidad(tid, request, env) {
  const fecha = new URL(request.url).searchParams.get('fecha');
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Parámetro fecha inválido (YYYY-MM-DD).' }, 400, request);
  }

  const config = await getVenueConfig(tid, env);
  // Endpoint de SOLO LECTURA, público y sin autenticar: es el más fácil de
  // martillar. Por eso lee la réplica en KV y NO el Durable Object: un DO ejecuta
  // en serie, así que un bot pegándole aquí encolaría peticiones y le metería
  // latencia a las compras reales de esa misma función.
  // La réplica va como mucho unos segundos atrás, que para MOSTRAR disponibilidad
  // es de sobra; la decisión real de cupo la toma el DO al reservar.
  // Tampoco se escribe nada aquí (antes sí): escribir KV a mano pisaría la
  // réplica que mantiene el DO. Los holds vencidos se purgan en memoria solo
  // para el cálculo que se muestra.
  const raw = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
  const inv = recalcReservadosDesdeHolds(purgarHoldsVencidos(normalizeInventario(raw, config)), config);

  const seccionesDisp = {};
  for (const s of config.secciones) {
    const sInv        = inv.secciones[s.id] || { total: s.total, vendidos: 0, reservados: 0 };
    const disponibles = Math.max(0, sInv.total - (sInv.vendidos || 0) - (sInv.reservados || 0));
    seccionesDisp[s.id] = {
      nombre:     s.nombre,
      total:      sInv.total,
      vendidos:   sInv.vendidos  || 0,
      disponibles,
    };
  }

  const plateaDisp  = seccionesDisp.platea?.disponibles ?? 0;
  const galeriaDisp = seccionesDisp.galeria?.disponibles ?? 0;
  const galeriaAbierta = !!seccionesDisp.galeria && plateaDisp === 0 && galeriaDisp > 0;
  const disponibles_total = sumDisponiblesSecciones(seccionesDisp);

  return json({
    fecha,
    secciones:      seccionesDisp,
    bloqueado:      inv.bloqueado || false,
    galeria_abierta: galeriaAbierta,
    disponibles:    galeriaAbierta ? galeriaDisp : (plateaDisp || Object.values(seccionesDisp).reduce((s, x) => s + x.disponibles, 0)),
    disponibles_total,
  }, 200, request);
}

// ─── HANDLER: CHECKOUT ────────────────────────────────────────────────────────

async function handleCheckout(tid, request, env, ctx) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Pagos no configurados.' }, 503, request);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(ip, env)) {
    return json({ error: 'Demasiadas solicitudes. Intenta en 15 minutos.' }, 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const { items, fecha, codigoCupon, referidoDe: referidoDeRaw, checkoutMode } = body;
  const modoEmbebido = checkoutMode === 'embedded';
  const referidoDe = typeof referidoDeRaw === 'string' ? referidoDeRaw.trim().toUpperCase() : '';
  const utmClean = sanitizarUTM(body.utm);
  const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase().substring(0, 254) : '';
  const emailOk  = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : '';
  const nombreRaw = typeof body.nombre === 'string' ? body.nombre.trim().substring(0, 120) : '';
  const nombreOk  = nombreRaw.replace(/[<>]/g, '') || '';

  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'El carrito está vacío.' }, 400, request);
  }

  const config = await getVenueConfig(tid, env);
  if (!config.secciones || config.secciones.length === 0) {
    return json({ error: 'Configuración de venue inválida.' }, 500, request);
  }
  const validSecciones = new Set(config.secciones.map(s => s.id));
  const seccionMap     = Object.fromEntries(config.secciones.map(s => [s.id, s]));

  let cantidadTotal = 0;
  const itemsValidados = [];
  const tiposVistos    = new Set();

  for (const item of items) {
    const tipo     = typeof item.tipo === 'string' ? item.tipo.toLowerCase().trim() : '';
    const cantidad = item.cantidad;
    // Seccion: default a sección única si solo hay una
    const seccion  = item.seccion || (config.secciones.length === 1 ? config.secciones[0].id : 'platea');

    if (!TIPOS_BOLETO[tipo]) return json({ error: `Tipo de boleto inválido: "${tipo}".` }, 400, request);
    if (!Number.isInteger(cantidad) || cantidad < 1) return json({ error: 'Cantidad inválida.' }, 400, request);
    if (!seccion || !validSecciones.has(seccion)) {
      return json({ error: config.secciones.length > 1
        ? `Debes seleccionar una sección válida (${[...validSecciones].join(', ')}).`
        : `Sección inválida: "${seccion}".`
      }, 400, request);
    }

    const tipoSecKey = `${tipo}:${seccion}`;
    if (tiposVistos.has(tipoSecKey)) return json({ error: 'Tipo/sección duplicado en el carrito.' }, 400, request);
    tiposVistos.add(tipoSecKey);

    cantidadTotal += cantidad;
    itemsValidados.push({ tipo, cantidad, seccion });
  }

  if (cantidadTotal > 50) return json({ error: 'El máximo es 50 boletos por compra.' }, 400, request);

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Fecha inválida.' }, 400, request);
  }

  // Verificar función activa
  const funcionesRaw = await env.INVENTARIO.get(kv(tid, 'funciones:activas'));
  if (!funcionesRaw) return json({ error: 'No hay funciones activas.' }, 503, request);

  let funcion;
  try {
    funcion = JSON.parse(funcionesRaw).find(f => f.fecha_iso === fecha && f.activa !== false);
  } catch { return json({ error: 'Error al leer configuración.' }, 500, request); }
  if (!funcion) return json({ error: 'Fecha de función no válida.' }, 400, request);

  // Precio especial de la función (ej. preestreno de prensa $10/boleto):
  // aplica a todos los boletos y anula cupones — el cupón se ignora en silencio.
  const precioEspecialCentavos = Math.round(Number(funcion.precio_especial || 0) * 100);

  // Agrupar cantidades por sección para optimistic lock
  const seccionCantidades = {};
  for (const item of itemsValidados) {
    seccionCantidades[item.seccion] = (seccionCantidades[item.seccion] || 0) + item.cantidad;
  }

  if (seccionCantidades.galeria) {
    const invG    = await leerInventarioFuerte(tid, fecha, env, config);
    const plateaQ = cupoSeccion(invG, 'platea', config);
    if (plateaQ > 0) {
      return json({
        error: 'No hay lugar disponible en esta función.',
      }, 409, request);
    }
  }

  const reservaId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Hold antes de Stripe; si no hay cupo, expira holds viejos sin pago
  const reserva = await reservarOptimista(tid, fecha, seccionCantidades, reservaId, env, ctx);
  if (!reserva.ok) return json({ error: reserva.error }, reserva.status, request);

  // Cupón (única vía de descuento promocional; credenciales van en su fila a $280)
  let cuponAplicado = null;
  if (codigoCupon && precioEspecialCentavos <= 0) {
    const cupon = await validarCuponDescuento(codigoCupon, env);
    if (!cupon.ok) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: cupon.error }, 400, request);
    }
    const reglas = validarCarritoParaCupon(cupon, itemsValidados);
    if (!reglas.ok) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: reglas.error }, 400, request);
    }
    // Candado duro solo_fecha: el cupón únicamente aplica a su función
    if (cupon.soloFecha && fecha !== cupon.soloFecha) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: errorCuponSoloFecha(cupon) }, 400, request);
    }
    cuponAplicado = cupon;
  }

  if (cuponAplicado && CUPONES_REFERIDO.has(cuponAplicado.codigo)) {
    if (!referidoDe || !esCodigoCert(referidoDe)) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: 'El cupón de invitado/regalo solo funciona con un enlace de invitación válido.' }, 400, request);
    }
    const refVenta = await _resolveVentaKey(tid, referidoDe, env);
    if (!refVenta) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: 'La invitación ya no es válida.' }, 400, request);
    }
  } else if (referidoDe) {
    if (!esCodigoCert(referidoDe)) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: 'Referencia de invitación inválida.' }, 400, request);
    }
    const refVenta = await _resolveVentaKey(tid, referidoDe, env);
    if (!refVenta) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: 'La invitación ya no es válida.' }, 400, request);
    }
    if (!cuponAplicado || !CUPONES_REFERIDO.has(cuponAplicado.codigo)) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: 'El descuento de invitado/regalo debe activarse antes de pagar.' }, 400, request);
    }
  }

  const { rows: lineRows } = calcularLineItemsPrecio(itemsValidados, seccionMap, {
    cupon: cuponAplicado,
    precioEspecialCentavos: precioEspecialCentavos > 0 ? precioEspecialCentavos : null,
  });

  const canonical = resolveTid(tid);
  const baseUrl   = 'https://elgorilateatro.com.mx';

  // OXXO disponible solo si faltan más de 48 hrs para la función (18:00 CDMX)
  const fechaFuncionMs  = new Date(`${fecha}T18:00:00-06:00`).getTime();
  const oxxoDisponible  = (fechaFuncionMs - Date.now()) > 48 * 60 * 60 * 1000;
  // Si hay OXXO: voucher vence en min(24h, hasta 2h antes de la función); si no, TTL normal
  const oxxoMaxMs       = Math.min(Date.now() + 24 * 60 * 60 * 1000, fechaFuncionMs - 2 * 60 * 60 * 1000);
  const sessionTtl      = oxxoDisponible ? Math.floor((oxxoMaxMs - Date.now()) / 1000) : RESERVA_TTL;
  const sessionExpiresAt = Math.floor(Date.now() / 1000) + sessionTtl;

  const params = new URLSearchParams({
    mode:        'payment',
    expires_at:  String(sessionExpiresAt),
    'phone_number_collection[enabled]': 'false',
    // La ficha OXXO solo se genera en 'es' o 'en'; con 'es-419' cae a inglés.
    locale:                             'es',
    // Aparece en la ficha OXXO y en el recibo de Stripe.
    'payment_intent_data[description]': 'EL GORILA con Humberto Dupeyrón',
    'payment_method_types[0]':          'card',
    ...(oxxoDisponible ? {
      'payment_method_types[1]': 'oxxo',
      'payment_method_options[oxxo][expires_after_days]': String(Math.min(30, Math.max(1, Math.round(sessionTtl / 86400)))),
    } : {}),
    ...(modoEmbebido
      ? { ui_mode: 'embedded', return_url: `${baseUrl}/confirmacion.html?session_id={CHECKOUT_SESSION_ID}&teatro=${canonical}` }
      : { success_url: `${baseUrl}/confirmacion.html?session_id={CHECKOUT_SESSION_ID}&teatro=${canonical}`, cancel_url: `${baseUrl}/boletos.html?cancelado=1&teatro=${canonical}` }),
    'metadata[teatroId]':       canonical,
    'metadata[fecha]':          fecha,
    'metadata[cantidad]':       String(cantidadTotal),
    'metadata[reservaId]':      reservaId,
    'metadata[seccionCants]':   JSON.stringify(seccionCantidades),
    'metadata[items]':          JSON.stringify(itemsValidados),
    'metadata[funcionNombre]':  funcion.nombre,
  });

  // No pasamos customer_email a Stripe para evitar el interstitial de Link
  if (emailOk) params.set('metadata[email]', emailOk);
  if (nombreOk) params.set('metadata[nombre]', nombreOk);
  if (cuponAplicado) {
    params.set('metadata[codigoCupon]', cuponAplicado.codigo);
    params.set('metadata[cuponTipo]', cuponAplicado.tipo || 'porcentaje');
    if (cuponAplicado.porcentaje) params.set('metadata[cuponPct]', String(cuponAplicado.porcentaje));
    if (cuponAplicado.totalMxn) params.set('metadata[cuponTotalMxn]', String(cuponAplicado.totalMxn));
  }
  if (referidoDe) params.set('metadata[referidoDe]', referidoDe.substring(0, 64));

  // UTM como metadata de Stripe
  for (const k of Object.keys(utmClean)) {
    params.set(`metadata[utm_${k}]`, utmClean[k]);
  }

  // Line items con precio dinámico desde config
  lineRows.forEach(({ item, seccionConfig, unitCentavos, cuponAplicado: cuponEnLinea }, idx) => {
    const tipoNombre  = TIPOS_BOLETO[item.tipo]?.nombre || item.tipo;
    const secLabel    = config.secciones.length > 1 ? ` — ${seccionConfig.nombre}` : '';
    let cuponLabel    = '';
    if (cuponEnLinea && cuponAplicado) {
      cuponLabel = cuponAplicado.tipo === 'par_fijo'
        ? ` (${cuponAplicado.nombre})`
        : ` (−${cuponAplicado.porcentaje}%)`;
    }
    const productName = `EL GORILA — ${tipoNombre}${secLabel}${cuponLabel}`;

    params.set(`line_items[${idx}][price_data][currency]`,                  'mxn');
    params.set(`line_items[${idx}][price_data][product_data][name]`,        productName);
    params.set(`line_items[${idx}][price_data][product_data][description]`, funcion.nombre);
    params.set(`line_items[${idx}][price_data][unit_amount]`,               String(unitCentavos));
    params.set(`line_items[${idx}][quantity]`,                              String(item.cantidad));
  });

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(session.error?.message || 'Stripe error');
    await vincularSessionAlHold(tid, fecha, reservaId, session.id, env);
    ctx.waitUntil(registrarMetricaCheckout(env, metricaFromVenta({
      tid: canonical,
      venta: { fecha, cantidad: cantidadTotal, items: itemsValidados, seccionCantidades },
      items: itemsValidados,
      seccionCantidades,
      utm: utmClean,
      codigoCupon: cuponAplicado?.codigo || null,
      referidoDe: referidoDe || null,
      canal: 'web_checkout',
    })));
    if (modoEmbebido) {
      return json({ clientSecret: session.client_secret, publishableKey: env.STRIPE_PUBLISHABLE_KEY, sessionId: session.id }, 200, request);
    }
    return json({ url: session.url, sessionId: session.id }, 200, request);

  } catch (err) {
    await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
    logError('stripe.checkout', { error: err.message, teatroId: tid, fecha });
    return json({ error: 'Error al crear sesión de pago. Intenta de nuevo.' }, 500, request);
  }
}

// ─── HANDLER: WEBHOOK STRIPE ──────────────────────────────────────────────────

async function handleWebhook(request, env, ctx) {
  const rawBody = await request.text();
  const sig     = request.headers.get('stripe-signature') || '';

  const firmaValida = await verificarFirmaStripe(rawBody, sig, env.STRIPE_WEBHOOK_SECRET || '');
  if (!firmaValida) return new Response('Webhook signature invalid', { status: 400 });

  let event;
  try { event = JSON.parse(rawBody); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const session = event.data.object;
  const meta    = session.metadata || {};

  const tid = resolveTid(meta.teatroId || 'wilberto');

  // seccionCantidades con fallback para ventas pre-v3
  let seccionCantidades = {};
  try { if (meta.seccionCants) seccionCantidades = JSON.parse(meta.seccionCants); } catch {}
  if (!Object.keys(seccionCantidades).length) {
    const cantLegacy = parseInt(meta.cantidad, 10) || 0;
    if (cantLegacy) seccionCantidades = { general: cantLegacy };
  }

  if (event.type === 'checkout.session.expired') {
    const fecha = meta.fecha;
    if (fecha && Object.keys(seccionCantidades).length) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, meta.reservaId || null, env);
      ctx.waitUntil(notificarPrimeroListaEspera(tid, fecha, meta.funcionNombre || fecha, env));
    }
    // Email de voucher expirado solo si era sesión OXXO y hay correo
    const emailExpirado = meta.email || session.customer_details?.email;
    const metodos = session.payment_method_types || [];
    if (emailExpirado && metodos.includes('oxxo')) {
      ctx.waitUntil(enviarEmail(
        emailExpirado,
        'Tu voucher de OXXO venció — EL GORILA',
        `<p style="font-family:Georgia,serif;font-size:17px;color:#1a1411;">
          Tu voucher para pagar en OXXO ya venció y los lugares fueron liberados.<br><br>
          Si aún quieres asistir, puedes volver a comprar tus boletos aquí:<br><br>
          <a href="https://elgorilateatro.com.mx/boletos.html"
             style="display:inline-block;padding:14px 28px;background:#D43A1A;color:#fff;
                    text-decoration:none;font-family:Georgia,serif;font-size:16px;">
            Ver boletos disponibles
          </a>
        </p>`,
        env
      ));
    }
    // La ficha venció: quitar el pendiente del admin (los lugares ya se liberaron)
    // y dejar registro en el historial como fallida.
    if (metodos.includes('oxxo')) {
      ctx.waitUntil((async () => {
        let pendiente = null;
        try {
          const raw = await env.VENTAS.get(kv(tid, `oxxoPend:${session.id}`));
          if (raw) pendiente = JSON.parse(raw);
        } catch { /* */ }
        await guardarOxxoHistorial(tid, session.id, 'fallida', pendiente, {
          fecha, funcionNombre: meta.funcionNombre || fecha,
          cantidad: meta.cantidad, total: session.amount_total != null ? session.amount_total / 100 : null,
          email: emailExpirado, nombre: meta.nombre || session.customer_details?.name,
        }, env);
        await borrarOxxoPendiente(tid, session.id, env);
      })());
    } else {
      ctx.waitUntil(borrarOxxoPendiente(tid, session.id, env));
    }
    return new Response('ok', { status: 200 });
  }

  const esAsyncPago = event.type === 'checkout.session.async_payment_succeeded';

  if (event.type === 'checkout.session.completed') {
    // OXXO: session.completed llega cuando el usuario recibe el voucher, aún sin pagar.
    // Solo procesamos si payment_status === 'paid'. El pago real llega por async_payment_succeeded.
    if (session.payment_status === 'unpaid') {
      // Correo al comprador + aviso al equipo + registro visible en el admin.
      if ((session.payment_method_types || []).includes('oxxo')) {
        ctx.waitUntil(enviarEmailOxxoPendiente(session, meta, tid, env));
        ctx.waitUntil(notificarAdminOxxoPendiente(session, meta, tid, env));
        ctx.waitUntil(guardarOxxoPendiente(session, meta, tid, env));
      }
      return new Response('ok', { status: 200 });
    }
  } else if (!esAsyncPago) {
    return new Response('ok', { status: 200 });
  }

  const sessionId = session.id;
  const ventaKey    = kv(tid, `venta:${sessionId}`);
  const lockKey     = kv(tid, `lock:webhook:${sessionId}`);

  // 1) ¿La venta ya quedó registrada? Eso sí es "entregado": 200 definitivo.
  const existingNew    = await env.VENTAS.get(ventaKey);
  const existingLegacy = (!existingNew && tid === 'gorila') ? await env.VENTAS.get(`venta:${sessionId}`) : null;
  if (existingNew || existingLegacy) return new Response('ok', { status: 200 });

  // 2) ¿Hay otro intento del mismo webhook en curso? Pedir reintento, NUNCA 200.
  //    Antes aquí se respondía 200: si el intento en curso moría a media
  //    ejecución (Resend caído, KV lento, cualquier excepción), Stripe daba el
  //    webhook por entregado y dejaba de reintentar. Resultado: el cliente pagó,
  //    la venta nunca se registró y el boleto nunca salió. Con 409 Stripe vuelve
  //    a intentarlo y la venta se recupera sola.
  if (await env.INVENTARIO.get(lockKey)) {
    return new Response('procesando, reintentar', { status: 409 });
  }

  // 3) Marca de "en proceso" con TTL corto (no 15 min): si este intento muere a
  //    medias, la marca expira sola y el siguiente reintento puede completarla.
  await env.INVENTARIO.put(lockKey, '1', { expirationTtl: 120 });

  const fecha         = meta.fecha;
  const cantidad      = parseInt(meta.cantidad, 10);
  const reservaId     = meta.reservaId;
  const funcionNombre = meta.funcionNombre || fecha;

  let items = [];
  try { if (meta.items) items = JSON.parse(meta.items); } catch {}

  if (!fecha || !cantidad) {
    logError('stripe.webhook_meta', { sessionId: truncateId(sessionId) });
    return new Response('ok', { status: 200 });
  }

  const gen = await generarBoletosVenta(tid, fecha, items, env);

  const utm = {};
  for (const k of UTM_KEYS) {
    const val = meta[`utm_${k}`];
    if (val) utm[k] = val;
  }

  // Método REAL usado (no la lista de métodos ofrecidos): OXXO se confirma por
  // async_payment_succeeded; la tarjeta en línea por checkout.session.completed.
  const metodoPago = esAsyncPago ? 'oxxo' : 'card';

  const venta = {
    teatroId:     tid,
    sessionId,
    codigo:       gen.codigo,
    certificado:  gen.certificado,
    boletos:      gen.boletos,
    numeroObra:   gen.numeroObra,
    fecha,
    fechaContable:  fecha,
    funcionNombre,
    funcionContable: funcionNombre,
    cantidad,
    items,
    seccionCantidades,
    email:        session.customer_details?.email || session.customer_email || meta.email || null,
    nombre:       meta.nombre || session.customer_details?.name || null,
    total:        session.amount_total != null ? session.amount_total / 100 : 0,
    fechaCompra:  new Date().toISOString(),
    estado:       'completada',
    usado:        false,
    utm,
    metodoPago,
    codigoCupon:  meta.codigoCupon || null,
    cuponPct:     meta.cuponPct ? parseInt(meta.cuponPct, 10) : null,
    referidoDe:   meta.referidoDe || null,
  };

  await env.VENTAS.put(ventaKey, JSON.stringify(venta));
  // Pago confirmado: ya existe la venta real, quitar el pendiente OXXO del admin
  // (se va a Ventas) y, si era OXXO, dejar registro en el historial como completada.
  if (metodoPago === 'oxxo') {
    ctx.waitUntil((async () => {
      let pendiente = null;
      try {
        const raw = await env.VENTAS.get(kv(tid, `oxxoPend:${sessionId}`));
        if (raw) pendiente = JSON.parse(raw);
      } catch { /* */ }
      await guardarOxxoHistorial(tid, sessionId, 'completada', pendiente, {
        fecha, funcionNombre, cantidad, total: venta.total,
        email: venta.email, nombre: venta.nombre,
      }, env);
      await borrarOxxoPendiente(tid, sessionId, env);
    })());
  } else {
    ctx.waitUntil(borrarOxxoPendiente(tid, sessionId, env));
  }
  await persistirCertificadosKv(tid, sessionId, gen.certificado, gen.boletos, env);
  await env.VENTAS.put(kv(tid, `ventaIdx:${fecha}:${sessionId}`), sessionId);
  await env.VENTAS.put(kv(tid, `ventaIdxContable:${fecha}:${sessionId}`), sessionId);

  if (meta.codigoCupon) {
    ctx.waitUntil(
      incrementarUsoCupon(meta.codigoCupon, env, meta.referidoDe || null)
        .catch(e => logError('cupon.uso', { error: e.message })),
    );
  }

  // Inventario: reservado → vendido
  await confirmarVentaOptimista(tid, fecha, seccionCantidades, reservaId || null, env);

  // Reserva fiscal: 8% acumulado por teatro
  ctx.waitUntil((async () => {
    try {
      const monto8    = Math.round(venta.total * 0.08 * 100) / 100;
      const fiscalRaw = await env.VENTAS.get(kv(tid, 'fiscal:reserva:acumulado'));
      const fiscal    = fiscalRaw ? JSON.parse(fiscalRaw) : { acumulado: 0 };
      fiscal.acumulado = Math.round((fiscal.acumulado + monto8) * 100) / 100;
      await env.VENTAS.put(kv(tid, 'fiscal:reserva:acumulado'), JSON.stringify(fiscal));
    } catch (e) { logError('fiscal.acumulado', { error: e.message, teatroId: tid }); }
  })());

  // La venta YA está registrada arriba. Correos y Meta CAPI salen de la ruta
  // crítica: con reintentos, los correos pueden tardar segundos y no queremos
  // que Stripe se quede esperando la respuesta del webhook (si expira, reintenta
  // y aunque es idempotente, añade carga justo en el pico).
  // Van encadenados en UN solo waitUntil, no en dos: ambos releen y reescriben
  // la venta, y en paralelo el último en escribir borraría el campo del otro.
  const capiEventId = purchaseEventId(sessionId, gen.certificado);
  ctx.waitUntil((async () => {
    try {
      const emailResult = await enviarEmailsVenta(venta, tid, env);
      venta.emailsEnviados = {
        admin:     emailResult.adminOk,
        comprador: emailResult.compradorOk,
        en:        new Date().toISOString(),
      };
      await env.VENTAS.put(ventaKey, JSON.stringify(venta));
      if (!emailResult.compradorOk && venta.email) {
        // Tres avisos, a propósito: log (para wrangler tail), punto rojo en el
        // panel (emailsEnviados.comprador=false) y correo al operador, que es la
        // vía más rápida porque llega sola sin ir a buscarla.
        logError('venta.email_comprador_fallo', { sessionId: truncateId(sessionId), certificado: venta.certificado });
        await avisarBoletoNoEnviado(venta, tid, env, 'compra en línea');
      }
    } catch (e) { logError('venta.emails', { error: e.message }); }

    try {
      const capiResult = await sendMetaCapiPurchase(venta, env, {
        eventId:  capiEventId,
        clientIp: request.headers.get('CF-Connecting-IP') || undefined,
      });
      if (capiResult.ok || capiResult.skipped) {
        const raw = await env.VENTAS.get(ventaKey);
        if (!raw) return;
        const v = JSON.parse(raw);
        v.metaCapiPurchase = {
          ok:      !!capiResult.ok,
          skipped: !!capiResult.skipped,
          eventId: capiEventId,
          en:      new Date().toISOString(),
        };
        await env.VENTAS.put(ventaKey, JSON.stringify(v));
      }
    } catch (e) { logError('meta.capi', { error: e.message }); }
  })());

  // Webhook de marketing (Make) — sin PII; campos planos para Notion/Make
  if (env.MAKE_WEBHOOK_URL) {
    const codigoVenta = venta.certificado || venta.codigo;
    const tiposResumen = {};
    for (const it of (items || [])) {
      const t = it.tipo || 'general';
      tiposResumen[t] = (tiposResumen[t] || 0) + (it.cantidad || 1);
    }
    const payloadMkt = {
      evento:          'venta.completada',
      teatroId:        tid,
      codigo:          codigoVenta,
      fecha,
      funcionNombre,
      items,
      seccionCantidades,
      cantidad,
      total:           venta.total,
      moneda:          'MXN',
      fechaCompra:     venta.fechaCompra,
      utm,
      utm_source:      utm.source || null,
      utm_medium:      utm.medium || null,
      utm_campaign:    utm.campaign || null,
      utm_content:     utm.content || null,
      utm_term:        utm.term || null,
      codigo_cupon:    meta.codigoCupon || null,
      canal:           meta.codigoCupon
        ? `cupon:${String(meta.codigoCupon).toUpperCase()}`
        : (utm.source || 'directo'),
      tipos_resumen:   tiposResumen,
      metodo_pago:     metodoPago,
    };
    ctx.waitUntil(
      fetch(env.MAKE_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payloadMkt),
      }).catch(e => logError('marketing.webhook', { error: e.message }))
    );
  }

  ctx.waitUntil(registrarMetricaVenta(env, metricaFromVenta({
    tid,
    venta,
    items,
    seccionCantidades,
    utm,
    metodoPago,
    codigoCupon: meta.codigoCupon || null,
    referidoDe: meta.referidoDe || null,
    canal: 'web',
  })));

  return new Response('ok', { status: 200 });
}

// ─── LOOKUP HELPER: busca venta con prefijo y, para gorila, sin prefijo ────────

async function _lookupVenta(tid, id, env) {
  // 1. Nuevo formato con prefijo
  let ventaRaw = await env.VENTAS.get(kv(tid, `venta:${id}`));
  if (!ventaRaw) {
    const certRaw = await env.VENTAS.get(kv(tid, `cert:${id}`));
    if (certRaw) {
      const { sessionId } = JSON.parse(certRaw);
      ventaRaw = await env.VENTAS.get(kv(tid, `venta:${sessionId}`));
    }
  }
  // 2. Fallback legacy (ventas pre-v3 sin prefijo tid)
  if (!ventaRaw) {
    ventaRaw = await env.VENTAS.get(`venta:${id}`);
    if (!ventaRaw) {
      const certRaw = await env.VENTAS.get(`cert:${id}`);
      if (certRaw) {
        const { sessionId } = JSON.parse(certRaw);
        ventaRaw = await env.VENTAS.get(`venta:${sessionId}`);
      }
    }
  }
  // 3. Ventas guardadas bajo alias gorila: (pre-alias)
  if (!ventaRaw) {
    ventaRaw = await env.VENTAS.get(`gorila:venta:${id}`);
    if (!ventaRaw) {
      const certRaw = await env.VENTAS.get(`gorila:cert:${id}`);
      if (certRaw) {
        const { sessionId } = JSON.parse(certRaw);
        ventaRaw = await env.VENTAS.get(`gorila:venta:${sessionId}`);
      }
    }
  }
  return ventaRaw;
}

// ─── HANDLER: INVITACIÓN PÚBLICA (info mínima, sin PII) ─────────────────────

async function handleInvitacion(tid, certificado, request, env) {
  const ip      = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ventana = Math.floor(Date.now() / 900000);
  const rlKey   = `rl:inv:${ip}:${ventana}`;
  const rl      = parseInt((await env.INVENTARIO.get(rlKey)) || '0', 10);
  if (rl >= 60) return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429, request);

  const codigo = (certificado || '').trim().toUpperCase();
  if (!codigo || !esCodigoCert(codigo)) {
    await env.INVENTARIO.put(rlKey, String(rl + 1), { expirationTtl: 900 });
    return json({ error: 'Invitación no válida.' }, 400, request);
  }

  const resolved = await _resolveVentaKey(tid, codigo, env);
  if (!resolved) {
    await env.INVENTARIO.put(rlKey, String(rl + 1), { expirationTtl: 900 });
    return json({ error: 'Invitación no encontrada.' }, 404, request);
  }

  const { venta } = resolved;
  if (venta.estado === 'reembolsada') {
    return json({ error: 'Esta invitación ya no está activa.' }, 410, request);
  }

  const certOrd = (venta.certificado || venta.codigo || codigo).trim().toUpperCase();
  return json({
    valido:        true,
    certificadoRef: enmascararCertificado(certOrd),
    referidoDe:    certOrd,
    funcionNombre: venta.funcionNombre || venta.fecha,
    fecha:         venta.fecha,
    entradas:      venta.cantidad || (venta.boletos?.length) || 1,
    mensaje:       'Alguien que ya vio EL GORILA te invita.',
  }, 200, request);
}

// ─── HANDLER: ENCUESTA POST-FUNCIÓN (solo token del correo) ───────────────────

const ENCUESTA_VOLVERIA  = new Set(['si', 'talvez', 'no']);
const ENCUESTA_COMPANIA  = new Set(['solo', 'pareja', 'amigos', 'familia', 'trabajo', 'otro']);
const ENCUESTA_ORIGEN    = new Set([
  'instagram', 'boca', 'google', 'prensa', 'repeat', 'otro',
]);

function respuestaEncuestaPublica(data, certificado) {
  const nombreBoleto = (data.nombre || '').trim();
  const nombrePortador = (data.respuestas?.nombrePortador || '').trim();
  const nombre = (nombrePortador || nombreBoleto).trim();
  const primer = nombre ? nombre.split(/\s+/)[0] : null;
  const out = {
    valido:        true,
    completada:    !!data.completadaEn,
    funcionNombre: data.funcionNombre || data.fecha,
    fecha:         data.fecha || null,
    saludo:        primer,
    nombre:        nombre || null,
    nombreBoleto:  nombreBoleto || null,
  };
  if (data.completadaEn && data.respuestas) {
    out.regalos = regalosParaEncuesta(certificado, data.respuestas);
    out.acta = data.respuestas.acta || null;
  }
  return out;
}

function parseActaEncuesta(body) {
  const raw = body.acta && typeof body.acta === 'object' ? body.acta : body;
  const clip = (v, max) => (typeof v === 'string' ? v.trim().substring(0, max) : '');
  return {
    libertad: clip(raw.libertad, 1200),
    jaulas:   clip(raw.jaulas, 1200),
    salidas:  clip(raw.salidas, 1200),
    actitud:  clip(raw.actitud, 1200),
  };
}

async function handleEncuestaGet(tid, token, request, env) {
  const ip      = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ventana = Math.floor(Date.now() / 900000);
  const rlKey   = `rl:enc:g:${ip}:${ventana}`;
  const rl      = parseInt((await env.INVENTARIO.get(rlKey)) || '0', 10);
  if (rl >= 120) return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429, request);

  const found = await obtenerEncuestaPorToken(tid, token, env);
  if (!found) {
    await env.INVENTARIO.put(rlKey, String(rl + 1), { expirationTtl: 900 });
    return json({
      error: 'Este sobre no existe o ya expiró. Ábrelo desde el correo que te enviamos esta noche.',
    }, 404, request);
  }

  const { data } = found;
  if (data.teatroId && data.teatroId !== resolveTid(tid)) {
    return json({ error: 'Enlace no válido para este teatro.' }, 404, request);
  }

  return json(respuestaEncuestaPublica(data, data.certificado), 200, request);
}

async function handleEncuestaPost(tid, token, request, env) {
  const ip      = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ventana = Math.floor(Date.now() / 900000);
  const rlKey   = `rl:enc:p:${ip}:${ventana}`;
  const rl      = parseInt((await env.INVENTARIO.get(rlKey)) || '0', 10);
  if (rl >= 40) return json({ error: 'Demasiados intentos.' }, 429, request);

  const found = await obtenerEncuestaPorToken(tid, token, env);
  if (!found) {
    await env.INVENTARIO.put(rlKey, String(rl + 1), { expirationTtl: 900 });
    return json({ error: 'Sobre no válido.' }, 404, request);
  }

  const { token: t, data } = found;

  if (data.completadaEn) {
    return json({
      ok: true,
      completada: true,
      regalos: regalosParaEncuesta(data.certificado, data.respuestas || {}),
    }, 200, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Cuerpo inválido.' }, 400, request);
  }

  const acta = parseActaEncuesta(body);
  if (!acta.libertad) {
    return json({ error: 'Responde: ¿qué es la libertad?' }, 400, request);
  }

  const nombrePortador = typeof body.nombrePortador === 'string'
    ? body.nombrePortador.trim().substring(0, 120) : '';
  if (!nombrePortador) {
    return json({ error: 'Indica tu nombre para el acta.' }, 400, request);
  }

  const nombreRegalo = typeof body.nombreRegalo === 'string'
    ? body.nombreRegalo.trim().substring(0, 120) : '';

  const npsRaw = parseInt(body.nps, 10);
  const nps = Number.isInteger(npsRaw) && npsRaw >= 1 && npsRaw <= 5 ? npsRaw : null;
  const volveria = typeof body.volveria === 'string' ? body.volveria.trim().toLowerCase() : '';
  const acompanamiento = typeof body.acompanamiento === 'string'
    ? body.acompanamiento.trim().toLowerCase() : '';
  const origen = typeof body.origen === 'string' ? body.origen.trim().toLowerCase() : '';
  const comentario = typeof body.comentario === 'string'
    ? body.comentario.trim().substring(0, 800) : '';

  const respuestas = {
    acta,
    nombrePortador,
    nombreRegalo: nombreRegalo || null,
    nps,
    volveria: ENCUESTA_VOLVERIA.has(volveria) ? volveria : null,
    acompanamiento: ENCUESTA_COMPANIA.has(acompanamiento) ? acompanamiento : null,
    origen: ENCUESTA_ORIGEN.has(origen) ? origen : null,
    comentario: comentario || null,
    enviadoEn: new Date().toISOString(),
  };

  data.respuestas   = respuestas;
  data.completadaEn = respuestas.enviadoEn;

  const canonical = resolveTid(tid);
  await env.VENTAS.put(
    kv(canonical, `encuesta:${t}`),
    JSON.stringify(data),
    { expirationTtl: ENCUESTA_TTL_SEC },
  );

  if (data.sessionId) {
    const ventaRaw = await env.VENTAS.get(kv(canonical, `venta:${data.sessionId}`));
    if (ventaRaw) {
      try {
        const venta = JSON.parse(ventaRaw);
        venta.encuestaCompletadaEn = data.completadaEn;
        venta.encuestaRespuestas   = respuestas;
        await env.VENTAS.put(kv(canonical, `venta:${data.sessionId}`), JSON.stringify(venta));
      } catch { /* ignore */ }
    }
  }

  const regalos = regalosParaEncuesta(data.certificado, respuestas);

  return json({
    ok: true, completada: true, regalos,
  }, 200, request);
}

// ─── HANDLER: VENTA PÚBLICA (sin email) ───────────────────────────────────────

async function handleEnviarBoletoCompra(tid, id, request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(ip, env)) {
    return json({ error: 'Demasiadas solicitudes. Intenta en unos minutos.' }, 429, request);
  }

  const ventaRaw = await _lookupVenta(tid, id, env);
  if (!ventaRaw) return json({ error: 'Venta no encontrada.' }, 404, request);

  let venta;
  try { venta = JSON.parse(ventaRaw); } catch { return json({ error: 'Venta corrupta.' }, 500, request); }

  const sessionId = venta.sessionId || id;

  if (venta.emailsEnviados?.comprador) {
    return json({
      ok:          true,
      alreadySent: true,
      emailEnviado: venta.email || null,
    }, 200, request);
  }

  const rlKey     = kv(tid, `emailRetry:${sessionId}`);
  const retries   = parseInt((await env.INVENTARIO.get(rlKey)) || '0', 10);
  if (retries >= 5) {
    return json({ error: 'Límite de reenvíos alcanzado. Escribe a elgorilateatro@gmail.com' }, 429, request);
  }

  const emailResult = await enviarEmailsVenta(venta, tid, env);
  venta.emailsEnviados = {
    admin:     emailResult.adminOk,
    comprador: emailResult.compradorOk,
    en:        new Date().toISOString(),
  };
  await env.VENTAS.put(kv(tid, `venta:${sessionId}`), JSON.stringify(venta));
  await env.INVENTARIO.put(rlKey, String(retries + 1), { expirationTtl: 86400 });

  if (!emailResult.compradorOk && venta.email) {
    // El comprador ve el error en pantalla, pero avisamos igual: si se va sin
    // insistir, este correo es lo único que deja rastro fuera del panel.
    await avisarBoletoNoEnviado(venta, tid, env, 'reenvío pedido por el comprador');
    return json({
      ok: false,
      error: 'No se pudo enviar el correo al comprador. Revisa spam o escribe a elgorilateatro@gmail.com',
      adminOk: emailResult.adminOk,
    }, 502, request);
  }

  return json({
    ok: true,
    emailEnviado: venta.email || null,
    adminOk:      emailResult.adminOk,
    compradorOk:  emailResult.compradorOk,
  }, 200, request);
}

async function handleVenta(tid, id, request, env) {
  // Rate-limit anti-enumeración: solo cuenta folios NO encontrados, así el escáner
  // de la puerta (muchos folios VÁLIDOS desde una IP) nunca se ve afectado.
  const ip       = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ventana  = Math.floor(Date.now() / 900000);
  const rl404Key = `rl404:${ip}:${ventana}`;
  const rl404    = parseInt((await env.INVENTARIO.get(rl404Key)) || '0', 10);
  if (rl404 >= VENTA_404_MAX) {
    return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429, request);
  }

  try {
    const codigo = (id || '').trim().toUpperCase();
    const ref    = await _resolveCertRef(tid, codigo, env);
    let v;
    let boletoIdx = null;

    if (ref) {
      const ventaRaw = await env.VENTAS.get(kv(tid, `venta:${ref.sessionId}`))
        || await env.VENTAS.get(`venta:${ref.sessionId}`)
        || await env.VENTAS.get(`gorila:venta:${ref.sessionId}`);
      if (!ventaRaw) {
        await env.INVENTARIO.put(rl404Key, String(rl404 + 1), { expirationTtl: 900 });
        return json({ error: 'Venta no encontrada.' }, 404, request);
      }
      v = JSON.parse(ventaRaw);
      boletoIdx = ref.boletoIdx;
    } else {
      const ventaRaw = await _lookupVenta(tid, id, env);
      if (!ventaRaw) {
        await env.INVENTARIO.put(rl404Key, String(rl404 + 1), { expirationTtl: 900 });
        return json({ error: 'Venta no encontrada.' }, 404, request);
      }
      v = JSON.parse(ventaRaw);
    }

    if (v.estado === 'reembolsada') {
      return json({ error: 'Este boleto fue reembolsado y ya no tiene validez.', estado: 'reembolsada' }, 410, request);
    }
    if (v.estado === 'cancelada' || v.cancelada === true) {
      return json({ error: 'Este boleto fue cancelado y ya no tiene validez.', estado: 'cancelada' }, 410, request);
    }

    const fechaPuerta = new URL(request.url).searchParams.get('fecha');
    if (fechaPuerta && /^\d{4}-\d{2}-\d{2}$/.test(fechaPuerta)) {
      const errFn = _errorCanjeVenta(v, fechaPuerta);
      if (errFn) return json({ error: errFn }, 409, request);
    }

    const boleto = boletoEnVenta(v, boletoIdx);
    const resp   = respuestaBoletoPublica(v, tid, boleto, boletoIdx);
    resp.boletos = (v.boletos || []).map(b => ({
      cert: b.cert, folio: b.folio || null, numero: b.numero, tipo: b.tipo, seccion: b.seccion, usado: !!b.usado,
    }));
    return json(resp, 200, request);
  } catch { return json({ error: 'Error al obtener la venta.' }, 500, request); }
}

// ─── HANDLER: WALLET (Google / Apple) ─────────────────────────────────────────

async function handleWallet(tid, id, request, env) {
  const ventaRaw = await _lookupVenta(tid, id, env);
  if (!ventaRaw) return json({ error: 'Venta no encontrada.' }, 404, request);

  let venta;
  try { venta = JSON.parse(ventaRaw); } catch { return json({ error: 'Venta corrupta.' }, 500, request); }
  if (venta.estado === 'reembolsada') return json({ error: 'Boleto no disponible.' }, 410, request);

  const config    = await getVenueConfig(tid, env);
  const url       = new URL(request.url);
  const boletoRaw = url.searchParams.get('boleto');
  const boletoIdx = boletoRaw != null && boletoRaw !== '' ? parseInt(boletoRaw, 10) : null;

  const [google, apple] = await Promise.all([
    googleWalletSaveUrl(venta, config, env, Number.isInteger(boletoIdx) ? boletoIdx : null),
    appleWalletPkpass(venta, config, env, Number.isInteger(boletoIdx) ? boletoIdx : null),
  ]);

  return json({ ok: true, configured: walletStatus(env), google, apple }, 200, request);
}

// ─── HANDLER: VENTA DETALLE ADMIN (con email) ─────────────────────────────────

async function handleAdminVentaDetail(tid, id, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_VENTAS.has(payload.rol)) {
    return json({ error: 'Sin permiso.' }, 403, request);
  }

  try {
    const resolved = await _resolveVentaKey(tid, id, env);
    if (!resolved) {
      const ventaRaw = await _lookupVenta(tid, id, env);
      if (!ventaRaw) return json({ error: 'Venta no encontrada.' }, 404, request);
      return json(_formatVenta(JSON.parse(ventaRaw)), 200, request);
    }
    return json(_formatVenta(resolved.venta), 200, request);
  } catch { return json({ error: 'Error al obtener la venta.' }, 500, request); }
}

async function handleEmailPostFuncion(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_REENVIAR.has(payload.rol)) {
    return json({ error: 'Sin permiso para enviar correos post-función.' }, 403, request);
  }

  let body = {};
  try { body = await request.json(); } catch {
    return json({ error: 'Indica fecha (YYYY-MM-DD) en el cuerpo JSON.' }, 400, request);
  }

  const fecha = typeof body.fecha === 'string' ? body.fecha.trim() : '';
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Indica fecha válida (YYYY-MM-DD).' }, 400, request);
  }

  const dryRun = !!body.dryRun;
  const forzar = !!body.forzar;
  const config = await getVenueConfig(tid, env);

  const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  if (!dryRun && !forzar && fecha !== hoyMx) {
    return json({
      error: `Este envío es para asistentes del día de la función. Hoy (CDMX): ${hoyMx}. Seleccionaste: ${fecha}. Usa forzar:true solo si es intencional.`,
    }, 400, request);
  }

  const idxResult  = await env.VENTAS.list({ prefix: kv(tid, `ventaIdx:${fecha}:`) });
  const sessionIds = (await Promise.all(idxResult.keys.map(k => env.VENTAS.get(k.name)))).filter(Boolean);
  const ventasRaw  = await Promise.all(sessionIds.map(sid => env.VENTAS.get(kv(tid, `venta:${sid}`))));
  const ventas     = ventasRaw
    .filter(Boolean)
    .map(r => { try { return JSON.parse(r); } catch { return null; } })
    .filter(v => v && v.estado !== 'reembolsada' && v.email && (v.fecha === fecha || !v.fecha));

  const resultados = [];
  let enviados = 0;
  let fallidos = 0;

  for (const venta of ventas) {
    const funcionNombre = venta.funcionNombre || venta.fecha || fecha;
    const cert          = _certificadoVenta(venta);
    const entry         = {
      certificado: cert,
      email:       venta.email,
      folioSobre:  venta.sobreFolio || null,
      ok:          false,
    };

    if (dryRun) {
      entry.ok = true;
      entry.dryRun = true;
      enviados += 1;
      resultados.push(entry);
      continue;
    }

    if (venta.emailPostFuncionEnviado && venta.encuestaToken) {
      entry.ok = true;
      entry.omitido = true;
      entry.motivo = 'Ya enviado';
      resultados.push(entry);
      continue;
    }

    let encuestaToken = venta.encuestaToken || null;
    if (!dryRun) {
      encuestaToken = await asegurarTokenEncuesta(tid, venta, env);
      venta.encuestaToken = encuestaToken;
      const sidPre = venta.sessionId;
      if (sidPre) {
        await env.VENTAS.put(kv(tid, `venta:${sidPre}`), JSON.stringify(venta));
      }
    } else {
      encuestaToken = encuestaToken || 'dryrun000000000000000000000000000000000000000000';
    }

    const html = htmlEmailPostFuncion(venta, funcionNombre, config, {
      encuestaToken,
      folioSobre: venta.sobreFolio,
    });
    const ok   = await enviarEmail(
      venta.email,
      `Gracias por acompañarnos · EL GORILA · ${funcionNombre}`,
      html,
      env,
    );

    entry.ok = ok;
    if (ok) {
      enviados += 1;
      venta.emailPostFuncionEnviado = new Date().toISOString();
      const sid = venta.sessionId;
      if (sid) {
        await env.VENTAS.put(kv(tid, `venta:${sid}`), JSON.stringify(venta));
      }
    } else {
      fallidos += 1;
      entry.error = 'No se pudo enviar';
    }
    resultados.push(entry);
  }

  await registrarAuditoria(env, {
    usuarioId: payload.usuario,
    usuario:   payload.nombre || payload.usuario,
    rol:       payload.rol,
    accion:    dryRun ? 'email.post_funcion.dry_run' : 'email.post_funcion',
    teatroId:  resolveTid(tid),
    detalles:  `Post-función ${fecha}: ${enviados} enviados, ${fallidos} fallidos, ${ventas.length} con email`,
    meta:      { fecha, enviados, fallidos, total: ventas.length, dryRun },
  });

  return json({
    ok:       true,
    fecha,
    dryRun,
    total:    ventas.length,
    enviados,
    fallidos,
    omitidos: resultados.filter(r => r.omitido).length,
    resultados,
  }, 200, request);
}

async function handleReenviarEmail(tid, id, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_REENVIAR.has(payload.rol)) {
    return json({ error: 'Sin permiso para reenviar boletos.' }, 403, request);
  }

  let body = {};
  try { body = await request.json(); } catch { /* vacío = reenvío al mismo correo */ }

  let resolved = await _resolveVentaKey(tid, id, env);
  if (!resolved) {
    const ventaRaw = await _lookupVenta(tid, id, env);
    if (!ventaRaw) return json({ error: 'Venta no encontrada.' }, 404, request);
    const ventaParsed = JSON.parse(ventaRaw);
    const sid = ventaParsed.sessionId || id;
    const keys = [
      kv(tid, `venta:${sid}`),
      `venta:${sid}`,
      `gorila:venta:${sid}`,
    ];
    let ventaKey = null;
    for (const key of keys) {
      if (await env.VENTAS.get(key)) { ventaKey = key; break; }
    }
    if (!ventaKey) return json({ error: 'Venta no encontrada.' }, 404, request);
    resolved = { ventaKey, venta: ventaParsed };
  }

  const { ventaKey, venta } = resolved;
  if (venta.estado === 'reembolsada') {
    return json({ error: 'No se puede reenviar un boleto reembolsado.' }, 409, request);
  }

  const emailAnterior = (venta.email || '').trim().toLowerCase();
  const emailNuevo    = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  let emailDestino    = emailAnterior;

  if (emailNuevo && emailNuevo !== emailAnterior) {
    if (!PUEDE_CORREGIR_EMAIL.has(payload.rol)) {
      return json({ error: 'Sin permiso para corregir el correo.' }, 403, request);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNuevo)) {
      return json({ error: 'Correo inválido.' }, 400, request);
    }
    venta.email            = emailNuevo;
    venta.emailAnterior    = emailAnterior || venta.emailAnterior || null;
    venta.emailCorregidoEn = new Date().toISOString();
    emailDestino           = emailNuevo;
  }

  if (!emailDestino && !body.soloAvisoAdmin) {
    return json({ error: 'Indica un correo para enviar el boleto.' }, 400, request);
  }

  const config        = await getVenueConfig(tid, env);
  const funcionNombre = venta.funcionNombre || venta.fecha;
  const codigoVenta   = venta.certificado || venta.codigo;

  if (body.soloAvisoAdmin) {
    const adminOk = await enviarEmail(
      adminNotifyEmail(env),
      `${codigoVenta} : Nueva orden — EL GORILA`,
      htmlAvisoAdmin(venta, funcionNombre, config),
      env,
    );
    if (!adminOk) {
      return json({ error: 'No se pudo enviar el aviso admin.' }, 502, request);
    }
    return json({ ok: true, avisoAdmin: true, emailEnviado: adminNotifyEmail(env) }, 200, request);
  }

  const enviado       = await enviarEmail(
    emailDestino,
    `Tu lugar — EL GORILA · ${funcionNombre}`,
    htmlBoleto(venta, funcionNombre, config),
    env,
  );

  if (!enviado) {
    return json({ error: 'No se pudo enviar el correo. Revisa Resend o intenta más tarde.' }, 502, request);
  }

  // El reenvío funcionó: dejarlo asentado. Sin esto, una venta cuyo correo falló
  // al principio se quedaría marcada en rojo en el panel para siempre y se
  // reenviaría de más, porque antes solo se re-guardaba si CAMBIÓ el correo.
  venta.emailsEnviados = {
    ...(venta.emailsEnviados || {}),
    comprador: true,
    en:        new Date().toISOString(),
  };
  await env.VENTAS.put(ventaKey, JSON.stringify(venta));

  await registrarAuditoria(env, {
    usuarioId: payload.usuario,
    usuario:   payload.usuario,
    rol:       payload.rol,
    accion:    emailNuevo && emailNuevo !== emailAnterior ? 'email.corregido' : 'email.reenviado',
    detalles:  `${_certificadoVenta(venta)} → ${emailDestino}${emailAnterior && emailNuevo !== emailAnterior ? ` (antes: ${emailAnterior})` : ''}`,
    teatroId:  tid,
    meta:      { certificado: _certificadoVenta(venta), email: emailDestino },
  });

  return json({
    ok:             true,
    emailEnviado:   emailDestino,
    emailCorregido: !!(emailNuevo && emailNuevo !== emailAnterior),
    venta:          _formatVenta(venta),
  }, 200, request);
}

// ─── HANDLER: ADMIN LOGIN ─────────────────────────────────────────────────────

const PIN_FINANCIERO_DEFAULT = '9999';

function pinFinancieroOk(body, env) {
  const expected = String(env.PIN_FINANCIERO || PIN_FINANCIERO_DEFAULT).trim();
  const got = String(body?.pinFinanciero ?? body?.pin ?? '').trim();
  return got.length > 0 && timingSafeEqual(got, expected);
}

const ACCESO_TAQUILLA_TTL = 4 * 60 * 60;

async function handleAdminAccesoCrear(request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (payload.purpose) {
    return json({ error: 'Genera el enlace con sesión de administrador (usuario y contraseña).' }, 403, request);
  }
  if (payload.rol !== 'admin' && payload.rol !== 'gerente') {
    return json({ error: 'Solo admin o gerente pueden crear enlaces de taquilla.' }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const nombre = String(body.nombre || '').trim().substring(0, 80);
  const email  = normalizeEmail(body.email || body.correo);
  if (!nombre) return json({ error: 'Indica el nombre de quien usará taquilla.' }, 400, request);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Indica un correo electrónico válido.' }, 400, request);
  }

  const now   = Math.floor(Date.now() / 1000);
  const exp   = now + ACCESO_TAQUILLA_TTL;
  const token = await signJWT({
    purpose: 'acceso_email',
    usuario: email,
    email,
    nombre,
    rol:     'taquilla',
    iat:     now,
    exp,
  }, env.JWT_SECRET);

  const url = `${SITIO_BASE}/admin.html?acceso=${encodeURIComponent(token)}&view=boletera`;

  await env.VENTAS.put(
    `acceso-taquilla:${email}`,
    JSON.stringify({ nombre, email, exp }),
    { expirationTtl: ACCESO_TAQUILLA_TTL },
  );

  const emailEnviado = await enviarEmail(
    email,
    `Acceso taquilla — EL GORILA (4 h)`,
    htmlAccesoTaquilla(nombre, url, 4),
    env,
  );

  await registrarAuditoria(env, {
    usuarioId: payload.usuario,
    usuario:   payload.nombre || payload.usuario,
    rol:       payload.rol,
    accion:    'acceso_taquilla_creado',
    detalles:  `Enlace taquilla · ${nombre} · ${email}${emailEnviado ? ' · correo enviado' : ' · correo no enviado'}`,
    meta:      { nombre, email, exp, emailEnviado },
  });

  return json({ ok: true, token, exp, url, nombre, email, emailEnviado }, 200, request);
}

async function handleAdminAccesoLogin(request, env) {
  if (!env.JWT_SECRET) return json({ error: 'Configuración incompleta.' }, 500, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const nombre = String(body.nombre || '').trim().substring(0, 80);
  const email  = normalizeEmail(body.email || body.correo);
  if (!nombre) return json({ error: 'Indica tu nombre.' }, 400, request);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Indica un correo válido.' }, 400, request);
  }

  const raw = await env.VENTAS.get(`acceso-taquilla:${email}`);
  if (!raw) {
    return json({ error: 'No hay acceso activo para este correo. Pide un enlace al administrador.' }, 401, request);
  }

  let grant;
  try { grant = JSON.parse(raw); } catch { return json({ error: 'Acceso inválido.' }, 401, request); }

  const now = Math.floor(Date.now() / 1000);
  if (!grant.exp || grant.exp < now) {
    return json({ error: 'El acceso expiró. Pide un enlace nuevo al administrador.' }, 401, request);
  }
  if (grant.nombre.trim().toLowerCase() !== nombre.trim().toLowerCase()) {
    return json({ error: 'El nombre no coincide con el acceso autorizado.' }, 401, request);
  }

  const token = await signJWT({
    purpose: 'acceso_email',
    usuario: email,
    email,
    nombre:  grant.nombre,
    rol:     'taquilla',
    iat:     now,
    exp:     grant.exp,
  }, env.JWT_SECRET);

  await registrarAuditoria(env, {
    usuarioId: email,
    usuario:   `${grant.nombre} · ${email}`,
    rol:       'taquilla',
    accion:    'acceso_taquilla_login',
    detalles:  `Ingreso taquilla con nombre y correo · ${grant.nombre} · ${email}`,
    meta:      { nombre: grant.nombre, email, via: 'login' },
  });

  return json({
    ok: true,
    token,
    usuario: email,
    email,
    nombre:  grant.nombre,
    rol:     'taquilla',
    exp:     grant.exp,
  }, 200, request);
}

async function handleAdminAccesoValidar(request, env) {
  if (!env.JWT_SECRET) return json({ error: 'Configuración incompleta.' }, 500, request);
  const tokenRaw = new URL(request.url).searchParams.get('token') || '';
  if (!tokenRaw) return json({ error: 'Falta token.' }, 400, request);

  const payload = await verifyJWT(tokenRaw, env.JWT_SECRET);
  if (!payload || payload.purpose !== 'acceso_email') {
    return json({ error: 'Enlace inválido o expirado.' }, 401, request);
  }
  if (!PUEDE_VENTA_MAN.has(payload.rol)) {
    return json({ error: 'Sin permiso.' }, 403, request);
  }

  await registrarAuditoria(env, {
    usuarioId: payload.email || payload.usuario,
    usuario:   actorLabel(payload),
    rol:       payload.rol,
    accion:    'acceso_taquilla_login',
    detalles:  `Ingreso taquilla vía enlace · ${payload.nombre || '—'} · ${payload.email || payload.telefono || payload.usuario}`,
    meta:      { nombre: payload.nombre, email: payload.email, telefono: payload.telefono, via: 'enlace' },
  });

  return json({
    ok:       true,
    usuario:  payload.email || payload.telefono || payload.usuario,
    email:    payload.email || null,
    telefono: payload.telefono || null,
    nombre:   payload.nombre || payload.usuario,
    rol:      payload.rol,
    exp:      payload.exp,
    purpose:  payload.purpose,
  }, 200, request);
}

/** @deprecated — la boletera vive dentro de admin.html */
async function handleBoleteraPase(request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  return json({
    error: 'Usa el botón Boletera en el panel o «Enlace taquilla» con nombre y correo.',
    embed: `${SITIO_BASE}/admin.html?view=boletera`,
  }, 400, request);
}

async function handleBoleteraValidar(request, env) {
  const url = new URL(request.url);
  const pase = url.searchParams.get('pase') || '';
  if (pase) {
    url.searchParams.set('token', pase);
    return handleAdminAccesoValidar(new Request(url.toString(), request), env);
  }
  return handleAdminAccesoValidar(request, env);
}

async function handleAdminLogin(request, env) {
  if (!env.JWT_SECRET)              return json({ error: 'Configuración incompleta.' }, 500, request);
  if (!env.ADMIN_USER || !env.ADMIN_PASS)
    return json({ error: 'Cuentas admin no configuradas.' }, 503, request);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const loginRateLimitOff = env.DISABLE_LOGIN_RATE_LIMIT === 'true' || env.DISABLE_LOGIN_RATE_LIMIT === '1';
  if (!loginRateLimitOff && !await checkRateLimit(ip, env)) {
    return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const { usuario, password } = body || {};
  if (!usuario || !password) return json({ error: 'Faltan usuario o contraseña.' }, 400, request);

  const u       = usuario.trim();
  let match     = false;
  let nombre    = 'Admin';
  let rol       = 'admin';

  if (timingSafeEqual(u, env.ADMIN_USER) && timingSafeEqual(password, env.ADMIN_PASS)) {
    match = true;
  } else if (env.ADMIN_USER_2 && env.ADMIN_PASS_2
      && timingSafeEqual(u, env.ADMIN_USER_2) && timingSafeEqual(password, env.ADMIN_PASS_2)) {
    match = true;
  } else if (env.ADMIN_USER_UNIVERSAL && env.ADMIN_PASS_UNIVERSAL
      && timingSafeEqual(u, env.ADMIN_USER_UNIVERSAL) && timingSafeEqual(password, env.ADMIN_PASS_UNIVERSAL)) {
    match  = true;
    nombre = 'Equipo';
  }

  if (!match) {
    const kvUser = await findKVUser(u, password, env);
    if (kvUser) {
      match  = true;
      nombre = kvUser.nombre || kvUser.id;
      rol    = kvUser.rol || 'taquilla';
      const usuarios = await getUsuariosKV(env);
      if (usuarios[u]) {
        usuarios[u].ultimoAcceso = new Date().toISOString();
        await saveUsuariosKV(env, usuarios);
      }
    }
  }

  if (!match) {
    await new Promise(r => setTimeout(r, 300));
    return json({ error: 'Credenciales incorrectas.' }, 401, request);
  }

  const now     = Math.floor(Date.now() / 1000);
  const TTL_12H = 12 * 60 * 60;
  const token   = await signJWT({ usuario: u, nombre, rol, iat: now, exp: now + TTL_12H }, env.JWT_SECRET);
  return json({ token, usuario: u, nombre, rol }, 200, request);
}

// ─── HANDLER: CANJEAR BOLETO ──────────────────────────────────────────────────

async function handleCanjear(tid, codigo, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_CANJEAR.has(payload.rol)) {
    return json({ error: 'Sin permiso para canjear.' }, 403, request);
  }
  if (!codigo || !esCodigoCert(codigo)) return json({ error: 'Código de folio inválido.' }, 400, request);

  const resolved = await _resolveVentaKey(tid, codigo, env);
  if (!resolved) return json({ error: 'Folio no encontrado.' }, 404, request);
  const { ventaKey, venta, boletoIdx } = resolved;
  const boleto = boletoEnVenta(venta, boletoIdx);

  const fechaPuerta = await _fechaCanjeDesdeRequest(request);
  const errCanje = _errorCanjeVenta(venta, fechaPuerta);
  if (errCanje) return json({ error: errCanje }, 409, request);

  if (boleto) {
    if (boleto.usado) {
      const cuandoMX = new Date(boleto.usadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      return json({ error: `Ya fue canjeado el ${cuandoMX}.`, usadoEn: boleto.usadoEn }, 409, request);
    }
    boleto.usado = true;
    boleto.usadoEn = new Date().toISOString();
    syncVentaUsadoGlobal(venta);
  } else if (Array.isArray(venta.boletos) && venta.boletos.length) {
    const pendientes = venta.boletos.filter(b => !b.usado);
    if (!pendientes.length) {
      const cuandoMX = new Date(venta.usadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      return json({ error: `Ya fue canjeado el ${cuandoMX}.`, usadoEn: venta.usadoEn }, 409, request);
    }
    const now = new Date().toISOString();
    pendientes.forEach(b => { b.usado = true; b.usadoEn = now; });
    syncVentaUsadoGlobal(venta);
  } else {
    if (venta.usado) {
      const cuandoMX = new Date(venta.usadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      return json({ error: `Ya fue canjeado el ${cuandoMX}.`, usadoEn: venta.usadoEn }, 409, request);
    }
    venta.usado = true;
    venta.usadoEn = new Date().toISOString();
  }

  venta.canjeadoPor = payload.usuario;
  await env.VENTAS.put(ventaKey, JSON.stringify(venta));

  await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'canjear_boleto', teatroId: tid,
    detalles: `CERT ${codigo} canjeado en puerta${boleto?.folio ? ` · folio ${boleto.folio}` : ''}`,
    meta: { codigo, folio: boleto?.folio || null, funcion: venta.funcionNombre || venta.fecha },
  });

  return json({ ok: true, usadoEn: boleto?.usadoEn || venta.usadoEn, folio: boleto?.folio || null }, 200, request);
}

async function handleDescanjear(tid, codigo, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_CANJEAR.has(payload.rol)) {
    return json({ error: 'Sin permiso para modificar check-in.' }, 403, request);
  }
  if (!codigo || !esCodigoCert(codigo)) return json({ error: 'Código de folio inválido.' }, 400, request);

  const resolved = await _resolveVentaKey(tid, codigo, env);
  if (!resolved) return json({ error: 'Folio no encontrado.' }, 404, request);
  const { ventaKey, venta, boletoIdx } = resolved;
  const boleto = boletoEnVenta(venta, boletoIdx);

  if (boleto) {
    if (!boleto.usado) {
      return json({ error: 'Este boleto no tiene check-in registrado.' }, 409, request);
    }
    boleto.usado = false;
    boleto.usadoEn = null;
    syncVentaUsadoGlobal(venta);
  } else if (Array.isArray(venta.boletos) && venta.boletos.length) {
    return json({ error: 'Indica el certificado de la entrada individual, no el de la orden.' }, 400, request);
  } else {
    if (!venta.usado) {
      return json({ error: 'Este boleto no tiene check-in registrado.' }, 409, request);
    }
    venta.usado = false;
    venta.usadoEn = null;
  }

  await env.VENTAS.put(ventaKey, JSON.stringify(venta));

  await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'descanjear_boleto', teatroId: tid,
    detalles: `Check-in revertido · CERT ${codigo}${boleto?.folio ? ` · folio ${boleto.folio}` : ''}`,
    meta: { codigo, folio: boleto?.folio || null, funcion: venta.funcionNombre || venta.fecha },
  });

  return json({ ok: true, folio: boleto?.folio || null }, 200, request);
}

// ─── HANDLER: LISTA PUERTA (admin — folios internos agrupados) ────────────────

async function handleListaPuerta(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_CANJEAR.has(payload.rol) && !PUEDE_CANJEAR_LOTE.has(payload.rol)) {
    return json({ error: 'Sin permiso.' }, 403, request);
  }

  const fecha = new URL(request.url).searchParams.get('fecha') || '';
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Indica fecha válida (YYYY-MM-DD).' }, 400, request);
  }

  const idxResult  = await env.VENTAS.list({ prefix: kv(tid, `ventaIdx:${fecha}:`) });
  const sessionIds = (await Promise.all(idxResult.keys.map(k => env.VENTAS.get(k.name)))).filter(Boolean);
  const ventasRaw  = await Promise.all(sessionIds.map(sid => env.VENTAS.get(kv(tid, `venta:${sid}`))));
  const ventas     = ventasRaw.filter(Boolean).map(r => JSON.parse(r));

  const grupos = ventas
    .filter(v => v.estado !== 'reembolsada')
    .map(v => ({
      certificado: v.certificado || v.codigo,
      nombre:      v.nombre || v.email || '—',
      email:       v.email || null,
      cantidad:    v.cantidad,
      numeroObra:  v.numeroObra || null,
      metodoPago:  v.metodoPago || null,
      cortesia:    !!v.cortesia || (v.metodoPago || '').toLowerCase() === 'cortesia',
      codigoCupon: v.codigoCupon || null,
      items:       v.items || [],
      boletos: (v.boletos || []).map(b => ({
        cert:   b.cert,
        folio:  b.folio,
        tipo:   b.tipo,
        numero: b.numero,
        usado:  !!b.usado,
        usadoEn: b.usadoEn || null,
      })),
      usado: v.usado || false,
    }))
    .sort((a, b) => (a.boletos[0]?.folio || '').localeCompare(b.boletos[0]?.folio || ''));

  const ingresados = grupos.reduce((s, g) => s + g.boletos.filter(b => b.usado).length, 0);
  const total      = grupos.reduce((s, g) => s + g.boletos.length, 0);

  return json({ fecha, grupos, total, ingresados, pendientes: total - ingresados }, 200, request);
}

// ─── HANDLER: LISTADO DE VENTAS (admin) ───────────────────────────────────────

function _certificadoVenta(v) {
  return (v?.certificado || v?.codigo || '').trim().toUpperCase();
}

function _fechaContableVenta(v) {
  if (v?.fechaContable) return v.fechaContable;
  if (v?.reagendado?.de) return v.reagendado.de;
  return v?.fecha || null;
}

function _fechaCompraDiaMx(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  } catch { return null; }
}

/** Canal u organización inferida (cupón, UTM, referido, taquilla). */
function _organizacionVenta(v) {
  const explicit = typeof v?.organizacion === 'string' ? v.organizacion.trim() : '';
  if (explicit) return explicit;
  const cupon = (v?.codigoCupon || '').trim();
  if (cupon) return `Cupón: ${cupon}`;
  const camp = (v?.utm?.campaign || '').trim();
  if (camp) return camp;
  const src = (v?.utm?.source || '').trim();
  if (src) return src;
  if (v?.referidoDe) return 'Referido';
  if (esVentaTaquilla(v)) return 'Taquilla';
  return 'Web directo';
}

function _formatVenta(v) {
  const certificado = _certificadoVenta(v);
  const fc = _fechaContableVenta(v);
  return {
    teatroId:         v.teatroId       || 'wilberto',
    sessionId:        v.sessionId      || null,
    codigo:           certificado || v.codigo,
    certificado,
    fecha:            v.fecha,
    fechaContable:    fc,
    funcionNombre:    v.funcionNombre  || v.fecha,
    funcionContable:  v.funcionContable || v.funcionAnterior || null,
    cantidad:         v.cantidad,
    items:            v.items          || [],
    boletos:          (v.boletos || []).map(b => ({
      cert:   b.cert,
      folio:  b.folio,
      numero: b.numero,
      tipo:   b.tipo,
      usado:  !!b.usado,
    })),
    email:            v.email          || null,
    emailAnterior:    v.emailAnterior  || null,
    emailCorregidoEn: v.emailCorregidoEn || null,
    nombre:           v.nombre         || null,
    telefono:         v.telefono       || null,
    total:            v.total,
    metodoPago:       v.metodoPago     || 'card',
    fechaCompra:      v.fechaCompra,
    fechaCompraDia:   _fechaCompraDiaMx(v.fechaCompra),
    organizacion:     _organizacionVenta(v),
    notas:            v.notas          || null,
    usado:            v.usado          || false,
    usadoEn:          v.usadoEn        || null,
    reagendado:       v.reagendado     || null,
    registradoPor:    v.registradoPor  || null,
    estado:           v.estado         || 'completada',
    codigoCupon:      v.codigoCupon    || null,
    cuponPct:         v.cuponPct       ?? null,
    referidoDe:       v.referidoDe     || null,
    utm:              v.utm            || null,
    reembolso:        v.reembolso      || null,
    // Si el correo del comprador salió o no. Las ventas anteriores a este campo
    // llegan como null = "no se sabe", que NO es lo mismo que "falló": el panel
    // solo marca en rojo cuando consta explícitamente que falló.
    emailsEnviados:   v.emailsEnviados || null,
  };
}

// ─── Idempotencia (evita doble venta si la red corta y taquilla reintenta) ───

async function leerIdempotencia(tid, key, env) {
  const k = String(key || '').trim().slice(0, 80);
  if (!k) return null;
  const raw = await env.INVENTARIO.get(kv(tid, `idempotency:${k}`));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function guardarIdempotencia(tid, key, payload, env) {
  const k = String(key || '').trim().slice(0, 80);
  if (!k || !payload) return;
  await env.INVENTARIO.put(kv(tid, `idempotency:${k}`), JSON.stringify(payload), { expirationTtl: 86400 });
}

// ─── HANDLER: VENTA MANUAL (efectivo / taquilla) ─────────────────────────────

async function handleVentaManual(tid, request, env, ctx) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_VENTA_MAN.has(payload.rol)) {
    return json({ error: 'Solo boletera o administrador pueden registrar ventas.' }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const email    = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const nombre   = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const notas    = typeof body.notas === 'string' ? body.notas.trim().substring(0, 300) : '';
  const codigoCuponRaw = typeof body.codigoCupon === 'string' ? body.codigoCupon.trim() : '';
  const METODOS_TAQUILLA = new Set(['efectivo', 'tarjeta_taquilla', 'cortesia']);
  let metodoPago = typeof body.metodoPago === 'string' ? body.metodoPago.trim().toLowerCase() : 'efectivo';
  if (!METODOS_TAQUILLA.has(metodoPago)) metodoPago = 'efectivo';
  const esCortesia = metodoPago === 'cortesia';
  const { items, fecha } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'Indica al menos un boleto.' }, 400, request);
  }
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Fecha inválida.' }, 400, request);
  }
  // Email opcional: lookalike / rifas. Sin correo la venta sigue (walk-up).
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Correo inválido.' }, 400, request);
  }

  const canonical = resolveTid(tid);
  const idemKey   = (request.headers.get('Idempotency-Key') || body.idempotencyKey || '').trim().slice(0, 80);
  if (idemKey) {
    const prev = await leerIdempotencia(canonical, idemKey, env);
    if (prev?.body) {
      return json({ ...prev.body, idempotentReplay: true }, prev.status || 200, request);
    }
  }

  const config         = await getVenueConfig(tid, env);
  const validSecciones = new Set(config.secciones.map(s => s.id));
  const seccionMap     = Object.fromEntries(config.secciones.map(s => [s.id, s]));

  let cantidadTotal = 0;
  const itemsValidados = [];
  const tiposVistos    = new Set();

  for (const item of items) {
    const tipo     = typeof item.tipo === 'string' ? item.tipo.toLowerCase().trim() : '';
    const cantidad = item.cantidad;
    const seccion  = item.seccion || (config.secciones.length === 1 ? config.secciones[0].id : 'platea');

    if (!TIPOS_BOLETO[tipo]) return json({ error: `Tipo inválido: "${tipo}".` }, 400, request);
    if (!Number.isInteger(cantidad) || cantidad < 1) return json({ error: 'Cantidad inválida.' }, 400, request);
    if (!validSecciones.has(seccion)) return json({ error: `Sección inválida: "${seccion}".` }, 400, request);

    const key = `${tipo}:${seccion}`;
    if (tiposVistos.has(key)) return json({ error: 'Tipo duplicado.' }, 400, request);
    tiposVistos.add(key);

    cantidadTotal += cantidad;
    itemsValidados.push({ tipo, cantidad, seccion });
  }

  if (cantidadTotal > 50) return json({ error: 'Máximo 50 boletos por venta.' }, 400, request);

  let cuponAplicado = null;
  if (codigoCuponRaw && !esCortesia) {
    const cupon = await validarCuponDescuento(codigoCuponRaw, env);
    if (!cupon.ok) return json({ error: cupon.error }, 400, request);
    const reglas = validarCarritoParaCupon(cupon, itemsValidados);
    if (!reglas.ok) return json({ error: reglas.error }, 400, request);
    if (cupon.soloFecha && fecha !== cupon.soloFecha) {
      return json({ error: errorCuponSoloFecha(cupon) }, 400, request);
    }
    cuponAplicado = cupon;
  }

  const funcionesRaw = await env.INVENTARIO.get(kv(tid, 'funciones:activas'));
  if (!funcionesRaw) return json({ error: 'No hay funciones activas.' }, 503, request);

  let funcion;
  try {
    funcion = JSON.parse(funcionesRaw).find(f => f.fecha_iso === fecha && f.activa !== false);
  } catch { return json({ error: 'Error al leer funciones.' }, 500, request); }
  if (!funcion) return json({ error: 'Fecha no válida.' }, 400, request);

  const seccionCantidades = {};
  for (const item of itemsValidados) {
    seccionCantidades[item.seccion] = (seccionCantidades[item.seccion] || 0) + item.cantidad;
  }

  if (seccionCantidades.galeria) {
    const invG      = await leerInventarioFuerte(tid, fecha, env, config);
    const plateaQ   = cupoSeccion(invG, 'platea', config);
    if (plateaQ > 0) {
      return json({ error: 'La galería solo se abre cuando se agote la platea.' }, 409, request);
    }
  }

  const ventaAplicada = await aplicarVentaDirecta(tid, fecha, seccionCantidades, env, ctx);
  if (!ventaAplicada.ok) return json({ error: ventaAplicada.error }, ventaAplicada.status, request);

  const { totalCentavos } = calcularLineItemsPrecio(itemsValidados, seccionMap, {
    cupon: cuponAplicado,
    sinMinimoStripe: true,
    // Si la función tiene precio especial (ej. preestreno $10), taquilla cobra lo mismo
    precioEspecialCentavos: Number(funcion.precio_especial) > 0
      ? Math.round(Number(funcion.precio_especial) * 100)
      : null,
  });
  // Cortesía: boletos e inventario reales, cobro $0. No pasa por Stripe ni usa cupón.
  const total = esCortesia ? 0 : totalCentavos / 100;

  const gen = await generarBoletosVenta(tid, fecha, itemsValidados, env);
  const sessionId = `manual_${crypto.randomUUID().replace(/-/g, '')}`;

  // Función de hoy (CDMX): marcar ingreso al vender. Otra función: solo registrar.
  const esFuncionHoy = fecha === hoyISOMx();
  const ahoraIso = new Date().toISOString();
  const boletosVenta = esFuncionHoy
    ? gen.boletos.map(b => ({ ...b, usado: true, usadoEn: ahoraIso }))
    : gen.boletos;

  const venta = {
    teatroId:       canonical,
    sessionId,
    codigo:         gen.codigo,
    certificado:    gen.certificado,
    boletos:        boletosVenta,
    numeroObra:     gen.numeroObra,
    fecha,
    fechaContable:  fecha,
    funcionNombre:  funcion.nombre,
    funcionContable: funcion.nombre,
    cantidad:       cantidadTotal,
    items:          itemsValidados,
    seccionCantidades,
    email:          email || null,
    nombre:         nombre || null,
    notas:          notas || null,
    total,
    fechaCompra:    ahoraIso,
    estado:         'completada',
    usado:          esFuncionHoy,
    usadoEn:        esFuncionHoy ? ahoraIso : null,
    canjeadoPor:    esFuncionHoy ? (payload.usuario || 'admin') : undefined,
    canjeEnVenta:   esFuncionHoy || undefined,
    metodoPago,
    cortesia:       esCortesia || undefined,
    registradoPor:  payload.usuario || 'admin',
    codigoCupon:    cuponAplicado?.codigo || null,
    cuponPct:       cuponAplicado?.porcentaje != null ? parseInt(cuponAplicado.porcentaje, 10) : null,
    utm:            {},
  };

  await env.VENTAS.put(kv(canonical, `venta:${sessionId}`), JSON.stringify(venta));

  if (cuponAplicado) {
    ctx.waitUntil(
      incrementarUsoCupon(cuponAplicado.codigo, env, null)
        .catch(e => logError('cupon.uso_manual', { error: e.message })),
    );
  }
  await persistirCertificadosKv(canonical, sessionId, gen.certificado, gen.boletos, env);
  await env.VENTAS.put(kv(canonical, `ventaIdx:${fecha}:${sessionId}`), sessionId);
  await env.VENTAS.put(kv(canonical, `ventaIdxContable:${fecha}:${sessionId}`), sessionId);

  const emailResult = await enviarEmailsVenta(venta, canonical, env);
  const emailEnviado = emailResult.compradorOk;
  const adminOk      = emailResult.adminOk;
  venta.emailsEnviados = {
    admin: adminOk, comprador: emailEnviado, en: new Date().toISOString(),
  };
  await env.VENTAS.put(kv(canonical, `venta:${sessionId}`), JSON.stringify(venta));

  if (!emailEnviado && venta.email) {
    logError('venta.email_comprador_fallo', { sessionId: truncateId(sessionId), certificado: venta.certificado });
    ctx.waitUntil(avisarBoletoNoEnviado(venta, canonical, env, 'venta en taquilla'));
  }

  ctx.waitUntil(registrarMetricaVenta(env, metricaFromVenta({
    tid: canonical,
    venta,
    canal: esCortesia ? 'cortesia' : (metodoPago === 'efectivo' ? 'taquilla_efectivo' : 'taquilla'),
  })));

  await registrarAuditoria(env, {
    usuarioId: payload.telefono || payload.usuario,
    usuario:   actorLabel(payload),
    rol:       payload.rol,
    accion:    'venta_manual',
    teatroId:  canonical,
    detalles:  `${esCortesia ? 'Cortesía' : 'Venta efectivo'} ${gen.certificado} — ${cantidadTotal} boleto(s) — ${funcion.nombre}${esFuncionHoy ? ' · ingreso marcado' : ''}`,
    meta:      {
      codigo: gen.certificado, fecha, total, email: email || null,
      codigoCupon: cuponAplicado?.codigo || null, via: payload.purpose || 'admin',
      ingresoMarcado: esFuncionHoy,
    },
  });

  const respBody = {
    ok:           true,
    codigo:       gen.certificado,
    certificado:  gen.certificado,
    boletos:      boletosVenta.map(b => ({ cert: b.cert, folio: b.folio, numero: b.numero, tipo: b.tipo, usado: !!b.usado })),
    emailEnviado,
    ingresoMarcado: esFuncionHoy,
    total,
    funcionNombre: funcion.nombre,
    metodoPago,
    venta:         _formatVenta(venta),
  };
  if (idemKey) {
    await guardarIdempotencia(canonical, idemKey, { status: 200, body: respBody }, env);
  }
  return json(respBody, 200, request);
}

/** Libera cupo vendido (reagendamiento). */
async function liberarVendidos(tid, fecha, seccionCantidades, env) {
  const r = await opInventario(tid, fecha, env, { op: 'liberarVendidos', seccionCantidades });
  if (r) return { ok: !!r.ok };
  return liberarVendidosKV(tid, fecha, seccionCantidades, env);
}

/** Respaldo heredado sobre KV. Solo corre si el DO no está disponible. */
async function liberarVendidosKV(tid, fecha, seccionCantidades, env) {
  const config = await getVenueConfig(tid, env);
  for (let intento = 0; intento < 3; intento++) {
    const invRaw  = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    let inv       = normalizeInventario(invRaw, config);
    const version = inv.version ?? 0;
    const secciones = { ...(inv.secciones || {}) };
    for (const [secId, cant] of Object.entries(seccionCantidades)) {
      const cfgSec = config.secciones?.find(s => s.id === secId);
      const sInv   = secciones[secId] || { total: cfgSec?.total ?? CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
      secciones[secId] = { ...sInv, vendidos: Math.max(0, (sInv.vendidos || 0) - cant) };
    }
    inv = recalcReservadosDesdeHolds({ ...inv, secciones, version: version + 1 }, config);
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(inv));
    const check = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    if ((JSON.parse(check || '{}').version ?? -1) === version + 1) return { ok: true };
  }
  return { ok: false };
}

async function _resolveCertRef(tid, codigo, env) {
  const keys = [
    kv(tid, `cert:${codigo}`),
    `cert:${codigo}`,
    `gorila:cert:${codigo}`,
  ];
  for (const key of keys) {
    const raw = await env.VENTAS.get(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.sessionId) return parsed;
    } catch { /* ignore */ }
  }
  return null;
}

async function _resolveVentaKey(tid, codigo, env) {
  const ref = await _resolveCertRef(tid, codigo, env);
  if (!ref) return null;

  const keys = [
    kv(tid, `venta:${ref.sessionId}`),
    `venta:${ref.sessionId}`,
    `gorila:venta:${ref.sessionId}`,
  ];
  let ventaRaw = null;
  let ventaKey = null;
  for (const key of keys) {
    ventaRaw = await env.VENTAS.get(key);
    if (ventaRaw) { ventaKey = key; break; }
  }
  if (!ventaRaw || !ventaKey) return null;
  return {
    ventaKey,
    venta: JSON.parse(ventaRaw),
    boletoIdx: ref.boletoIdx ?? null,
  };
}

async function handleReagendar(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (payload.rol !== 'admin') {
    return json({ error: 'Solo el administrador puede reagendar.' }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }
  const codigo       = (body.codigo || '').trim().toUpperCase();
  const fechaDestino = body.fechaDestino || body.fecha;
  if (!esCodigoCert(codigo)) return json({ error: 'Folio inválido.' }, 400, request);
  if (!fechaDestino || !/^\d{4}-\d{2}-\d{2}$/.test(fechaDestino)) {
    return json({ error: 'Fecha destino inválida.' }, 400, request);
  }

  const resolved = await _resolveVentaKey(tid, codigo, env);
  if (!resolved) return json({ error: 'Folio no encontrado.' }, 404, request);
  const { ventaKey, venta } = resolved;

  if (venta.usado) return json({ error: 'No se puede reagendar un boleto ya canjeado.' }, 409, request);
  if (venta.estado === 'reembolsada') return json({ error: 'No se puede reagendar un boleto reembolsado.' }, 409, request);
  if (venta.fecha === fechaDestino) return json({ error: 'Ya está en esa función.' }, 400, request);

  const funcionesRaw = await env.INVENTARIO.get(kv(tid, 'funciones:activas'));
  let funcionDest;
  try {
    funcionDest = JSON.parse(funcionesRaw || '[]').find(f => f.fecha_iso === fechaDestino && f.activa !== false);
  } catch { return json({ error: 'Error al leer funciones.' }, 500, request); }
  if (!funcionDest) return json({ error: 'Función destino no válida.' }, 400, request);
  if (funcionYaInicio(fechaDestino)) {
    return json({ error: 'La función destino ya comenzó o pasó.' }, 400, request);
  }

  const seccionCantidades = venta.seccionCantidades || {};
  if (!Object.keys(seccionCantidades).length && venta.items?.length) {
    for (const it of venta.items) {
      const sec = it.seccion || 'platea';
      seccionCantidades[sec] = (seccionCantidades[sec] || 0) + (it.cantidad || 1);
    }
  }
  if (!Object.keys(seccionCantidades).length) {
    seccionCantidades.platea = venta.cantidad || 1;
  }

  const lib = await liberarVendidos(tid, venta.fecha, seccionCantidades, env);
  if (!lib.ok) return json({ error: 'No se pudo liberar cupo en función origen.' }, 503, request);

  const ventaAplicada = await aplicarVentaDirecta(tid, fechaDestino, seccionCantidades, env, null);
  if (!ventaAplicada.ok) {
    await aplicarVentaDirecta(tid, venta.fecha, seccionCantidades, env, null);
    return json({ error: ventaAplicada.error || 'Sin cupo en función destino.' }, ventaAplicada.status || 409, request);
  }

  const fechaOrigen = venta.fecha;
  const canonical   = resolveTid(tid);
  if (!venta.fechaContable) {
    venta.fechaContable    = fechaOrigen;
    venta.funcionContable  = venta.funcionNombre || fechaOrigen;
  }
  await env.VENTAS.delete(kv(canonical, `ventaIdx:${fechaOrigen}:${venta.sessionId}`));

  venta.fechaAnterior   = fechaOrigen;
  venta.funcionAnterior = venta.funcionNombre;
  venta.fecha           = fechaDestino;
  venta.funcionNombre   = funcionDest.nombre;
  venta.reagendado      = {
    de: fechaOrigen, a: fechaDestino,
    por: payload.usuario, en: new Date().toISOString(),
    cancelacionOrigen: true,
    montoEnFuncion: venta.fechaContable,
  };

  await env.VENTAS.put(ventaKey, JSON.stringify(venta));
  await env.VENTAS.put(kv(canonical, `ventaIdx:${fechaDestino}:${venta.sessionId}`), venta.sessionId);

  let emailEnviado = false;
  let sinEmail     = !venta.email;
  if (venta.email) {
    const emailResult = await enviarEmailReagendado(venta, canonical, env);
    emailEnviado = !!emailResult.compradorOk;
    sinEmail     = !!emailResult.sinEmail;
    venta.emailsEnviados = {
      ...(venta.emailsEnviados || {}),
      reagenda: emailEnviado,
      reagendaEn: new Date().toISOString(),
    };
    await env.VENTAS.put(ventaKey, JSON.stringify(venta));

    if (!emailEnviado) {
      // Aquí NO se toca emailsEnviados.comprador (su boleto original sí llegó),
      // así que el panel no lo pinta de rojo. El correo es el único aviso: esta
      // persona no se enteró de que le cambiaron la fecha.
      logError('venta.email_reagenda_fallo', { certificado: venta.certificado, fechaDestino });
      await avisarBoletoNoEnviado(venta, canonical, env, `aviso de reagenda a ${fechaDestino}`);
    }
  }

  const audit = await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'reagenda', teatroId: canonical,
    detalles: `${codigo}: cancelado en ${fechaOrigen} → activo en ${fechaDestino}. Monto contable en ${venta.fechaContable}.${emailEnviado ? ' Correo enviado al comprador.' : ''}`,
    meta: {
      tipo: 'reagenda', codigo,
      de: fechaOrigen, a: fechaDestino,
      fechaContable: venta.fechaContable,
      total: venta.total, cancelacionOrigen: true,
      emailEnviado,
    },
  });

  return json({
    ok: true, venta: _formatVenta(venta), auditId: audit.id,
    emailEnviado, sinEmail,
  }, 200, request);
}

async function handleReembolso(tid, request, env, ctx) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (payload.rol !== 'admin') {
    return json({ error: 'Solo el administrador puede reembolsar.' }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  if (!pinFinancieroOk(body, env)) {
    return json({ error: 'PIN de operaciones incorrecto.' }, 403, request);
  }

  const codigo = (body.codigo || '').trim().toUpperCase();
  if (!esCodigoCert(codigo)) return json({ error: 'Folio inválido.' }, 400, request);

  const resolved = await _resolveVentaKey(tid, codigo, env);
  if (!resolved) return json({ error: 'Folio no encontrado.' }, 404, request);
  const { ventaKey, venta } = resolved;

  if (venta.estado === 'reembolsada') return json({ error: 'Esta venta ya fue reembolsada.' }, 409, request);
  if (venta.usado) return json({ error: 'No se puede reembolsar un boleto ya canjeado.' }, 409, request);

  const sessionId = venta.sessionId || '';
  const esManual  = esVentaTaquilla(venta);
  if (!esManual && !env.STRIPE_SECRET_KEY) {
    return json({ error: 'Stripe no configurado.' }, 503, request);
  }
  let stripeRefundId = null;

  if (!esManual) {
    try {
      const sessRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      const sess = await sessRes.json();
      if (!sessRes.ok) throw new Error(sess.error?.message || 'No se pudo leer la sesión Stripe');

      const paymentIntent = typeof sess.payment_intent === 'string'
        ? sess.payment_intent
        : sess.payment_intent?.id;
      if (!paymentIntent) throw new Error('Sin payment_intent en la sesión');

      const refundParams = new URLSearchParams({ payment_intent: paymentIntent });
      const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: refundParams.toString(),
      });
      const refund = await refundRes.json();
      if (!refundRes.ok) throw new Error(refund.error?.message || 'Stripe refund error');
      stripeRefundId = refund.id;
    } catch (err) {
      logError('stripe.reembolso', { error: err.message, teatroId: tid });
      return json({ error: `No se pudo reembolsar en Stripe: ${err.message}` }, 502, request);
    }
  }

  let seccionCantidades = venta.seccionCantidades || {};
  if (!Object.keys(seccionCantidades).length && venta.items?.length) {
    for (const it of venta.items) {
      const sec = it.seccion || 'platea';
      seccionCantidades[sec] = (seccionCantidades[sec] || 0) + (it.cantidad || 1);
    }
  }
  if (!Object.keys(seccionCantidades).length) {
    seccionCantidades.platea = venta.cantidad || 1;
  }

  const lib = await liberarVendidos(tid, venta.fecha, seccionCantidades, env);
  if (!lib.ok) return json({ error: 'Reembolso en Stripe OK pero no se liberó inventario. Revisa manualmente.' }, 503, request);

  venta.estado   = 'reembolsada';
  venta.reembolso = {
    por: payload.usuario,
    en:  new Date().toISOString(),
    monto: venta.total,
    stripeRefundId,
    manual: esManual,
  };
  await env.VENTAS.put(ventaKey, JSON.stringify(venta));

  ctx.waitUntil((async () => {
    try {
      const monto8 = Math.round(venta.total * 0.08 * 100) / 100;
      const canonical = resolveTid(tid);
      const fiscalRaw = await env.VENTAS.get(kv(canonical, 'fiscal:reserva:acumulado'));
      const fiscal    = fiscalRaw ? JSON.parse(fiscalRaw) : { acumulado: 0 };
      fiscal.acumulado = Math.max(0, Math.round((fiscal.acumulado - monto8) * 100) / 100);
      await env.VENTAS.put(kv(canonical, 'fiscal:reserva:acumulado'), JSON.stringify(fiscal));
    } catch (e) { logError('fiscal.reembolso', { error: e.message, teatroId: tid }); }
  })());

  const audit = await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'reembolso', teatroId: resolveTid(tid),
    detalles: `${codigo} reembolsado · $${venta.total} MXN · cupo liberado`,
    meta: {
      tipo: 'reembolso', codigo, total: venta.total, stripeRefundId, manual: esManual,
      fecha: venta.fecha, fechaContable: _fechaContableVenta(venta),
    },
  });

  return json({ ok: true, venta: _formatVenta(venta), auditId: audit.id }, 200, request);
}

// ─── HANDLER: ELIMINAR VENTA (limpieza de pruebas) ────────────────────────────
// Borrado real: quita la venta de las estadísticas y libera el cupo.
// Guarda una copia íntegra en el archivo `eliminada:` (solo informativo, fuera
// de los reportes). NO reembolsa en Stripe — pensado para depurar ventas de
// prueba, no para devolver dinero (para eso está el reembolso).
async function handleEliminarVenta(tid, codigo, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (payload.rol !== 'admin') {
    return json({ error: 'Solo el administrador puede eliminar ventas.' }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  if (!pinFinancieroOk(body, env)) {
    return json({ error: 'PIN de operaciones incorrecto.' }, 403, request);
  }

  const cod = (codigo || '').trim().toUpperCase();
  if (!esCodigoCert(cod)) return json({ error: 'Folio inválido.' }, 400, request);

  const resolved = await _resolveVentaKey(tid, cod, env);
  if (!resolved) return json({ error: 'Folio no encontrado.' }, 404, request);
  const { ventaKey, venta } = resolved;

  const canonical   = resolveTid(tid);
  const certificado = _certificadoVenta(venta) || venta.codigo || cod;

  // Liberar cupo solo si la venta seguía ocupando lugares (una venta ya
  // reembolsada liberó su cupo en el reembolso).
  if (venta.estado !== 'reembolsada') {
    let seccionCantidades = venta.seccionCantidades || {};
    if (!Object.keys(seccionCantidades).length && venta.items?.length) {
      seccionCantidades = {};
      for (const it of venta.items) {
        const sec = it.seccion || 'platea';
        seccionCantidades[sec] = (seccionCantidades[sec] || 0) + (it.cantidad || 1);
      }
    }
    if (!Object.keys(seccionCantidades).length) {
      seccionCantidades = { platea: venta.cantidad || 1 };
    }
    const lib = await liberarVendidos(tid, venta.fecha, seccionCantidades, env);
    if (!lib.ok) return json({ error: 'No se pudo liberar el cupo. Intenta de nuevo.' }, 503, request);
  }

  // Archivo informativo (fuera de estadísticas): copia completa + quién/cuándo.
  await env.VENTAS.put(
    kv(canonical, `eliminada:${venta.sessionId}`),
    JSON.stringify({
      venta,
      certificado,
      eliminadaPor:    payload.usuario,
      eliminadaNombre: payload.nombre || payload.usuario,
      eliminadaEn:     new Date().toISOString(),
      motivo:          (body.motivo || '').toString().slice(0, 200) || null,
    }),
  );

  // Borrado real: la venta, su índice por función (que recorren los reportes)
  // y todas las referencias de certificados que apuntan a ella.
  await env.VENTAS.delete(ventaKey);
  if (venta.fecha && venta.sessionId) {
    await env.VENTAS.delete(kv(canonical, `ventaIdx:${venta.fecha}:${venta.sessionId}`));
  }
  const certs = [certificado, ...(venta.boletos || []).map(b => b.cert).filter(Boolean)];
  for (const c of certs) {
    await env.VENTAS.delete(kv(canonical, `cert:${c}`));
    await env.VENTAS.delete(`cert:${c}`);
    await env.VENTAS.delete(`gorila:cert:${c}`);
  }

  const audit = await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'eliminacion', teatroId: canonical,
    detalles: `${certificado} eliminada · $${venta.total} MXN · cupo liberado · archivada`,
    meta: {
      tipo: 'eliminacion', codigo: certificado, total: venta.total,
      fecha: venta.fecha, sessionId: venta.sessionId,
    },
  });

  return json({ ok: true, auditId: audit.id }, 200, request);
}

async function handleCanjearLote(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_CANJEAR_LOTE.has(payload.rol)) {
    return json({ error: 'La puerta solo verifica por QR. Búsqueda por nombre: boletera o admin.' }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }
  const codigos = Array.isArray(body.codigos) ? body.codigos.map(c => String(c).trim().toUpperCase()) : [];
  if (!codigos.length) return json({ error: 'Indica al menos un folio.' }, 400, request);
  const fechaPuerta = body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : null;

  const resultados = [];
  for (const codigo of codigos) {
    const resolved = await _resolveVentaKey(tid, codigo, env);
    if (!resolved) { resultados.push({ codigo, ok: false, error: 'No encontrado' }); continue; }
    const { ventaKey, venta, boletoIdx } = resolved;
    const boleto = boletoEnVenta(venta, boletoIdx);
    const errCanje = _errorCanjeVenta(venta, fechaPuerta);
    if (errCanje) { resultados.push({ codigo, ok: false, error: errCanje }); continue; }
    if (boleto) {
      if (boleto.usado) { resultados.push({ codigo, ok: false, error: 'Ya canjeado' }); continue; }
      boleto.usado = true;
      boleto.usadoEn = new Date().toISOString();
      syncVentaUsadoGlobal(venta);
    } else if (Array.isArray(venta.boletos) && venta.boletos.length) {
      const pendientes = venta.boletos.filter(b => !b.usado);
      if (!pendientes.length) { resultados.push({ codigo, ok: false, error: 'Ya canjeado' }); continue; }
      const now = new Date().toISOString();
      pendientes.forEach(b => { b.usado = true; b.usadoEn = now; });
      syncVentaUsadoGlobal(venta);
    } else {
      if (venta.usado) { resultados.push({ codigo, ok: false, error: 'Ya canjeado' }); continue; }
      venta.usado = true;
      venta.usadoEn = new Date().toISOString();
    }
    venta.canjeadoPor = payload.usuario;
    await env.VENTAS.put(ventaKey, JSON.stringify(venta));
    resultados.push({ codigo, ok: true, usadoEn: boleto?.usadoEn || venta.usadoEn });
  }

  const okCount = resultados.filter(r => r.ok).length;
  const audit = await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'canjear_lote', teatroId: tid,
    detalles: `${okCount}/${codigos.length} folios canjeados (modo nombre/lote)`,
    meta: { codigos, resultados },
  });

  return json({ ok: true, resultados, auditId: audit.id }, 200, request);
}

async function handleMetricasList(request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_AUDITORIA.has(payload.rol)) {
    return json({ error: 'Sin permiso.' }, 403, request);
  }
  const url  = new URL(request.url);
  const dias = parseInt(url.searchParams.get('dias') || '30', 10) || 30;
  const diasData = await listMetricasDias(env, { dias });
  return json({
    ok: true,
    dias: diasData,
    nota: 'Métricas agregadas por categoría (sin datos personales). Claves KV: metrica:dia:* y metrica:checkout:*',
  }, 200, request);
}

async function handleAuditoriaList(request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_AUDITORIA.has(payload.rol)) {
    return json({ error: 'Sin permiso.' }, 403, request);
  }
  const url    = new URL(request.url);
  const limite = Math.min(200, parseInt(url.searchParams.get('limite') || '100', 10) || 100);
  const cursor = url.searchParams.get('cursor') || undefined;
  const { entries, cursor: next } = await listAuditoria(env, { limite, cursor });
  return json({ entries, cursor: next }, 200, request);
}

async function handleUsuariosList(request, env) {
  const payload = await requireRolAdmin(request, env);
  if (!payload) return json({ error: 'Solo el administrador.' }, 403, request);
  const usuarios = await getUsuariosKV(env);
  const lista = Object.values(usuarios).map(u => ({
    id: u.id, nombre: u.nombre, rol: u.rol, activo: u.activo !== false,
    fechaCreacion: u.fechaCreacion, ultimoAcceso: u.ultimoAcceso || null,
  }));
  return json({ usuarios: lista }, 200, request);
}

async function handleUsuariosCreate(request, env) {
  const payload = await requireRolAdmin(request, env);
  if (!payload) return json({ error: 'Solo el administrador.' }, 403, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }
  const id       = (body.id || '').trim().toLowerCase();
  const nombre   = (body.nombre || '').trim();
  const rol      = body.rol || 'taquilla';
  const password = body.password || '';

  if (!id || !/^[a-z0-9_-]{2,32}$/.test(id)) return json({ error: 'ID inválido (a-z, 0-9, _, -).' }, 400, request);
  if (rol === 'admin') return json({ error: 'No se crean cuentas admin desde aquí.' }, 400, request);
  if (!['gerente', 'taquilla', 'validacion', 'reclamos'].includes(rol)) {
    return json({ error: 'Rol inválido.' }, 400, request);
  }
  if (!password || password.length < 6) return json({ error: 'Contraseña mínimo 6 caracteres.' }, 400, request);

  const usuarios = await getUsuariosKV(env);
  if (usuarios[id]) return json({ error: 'Usuario ya existe.' }, 409, request);

  const { salt, hash } = await hashPasswordPBKDF2(password);
  usuarios[id] = {
    id, nombre: nombre || id, rol, salt, hash,
    activo: true, fechaCreacion: new Date().toISOString(),
  };
  await saveUsuariosKV(env, usuarios);

  const audit = await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'crear_usuario',
    detalles: `Usuario ${id} (${rol}) creado`,
    meta: { id, rol },
  });

  return json({ ok: true, usuario: { id, nombre: usuarios[id].nombre, rol }, auditId: audit.id }, 201, request);
}

async function handleUsuariosUpdate(userId, request, env) {
  const payload = await requireRolAdmin(request, env);
  if (!payload) return json({ error: 'Solo el administrador.' }, 403, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const usuarios = await getUsuariosKV(env);
  const u = usuarios[userId];
  if (!u) return json({ error: 'Usuario no encontrado.' }, 404, request);

  if (body.nombre) u.nombre = String(body.nombre).trim().substring(0, 80);
  if (body.rol && body.rol !== 'admin' && ['gerente', 'taquilla', 'validacion', 'reclamos'].includes(body.rol)) {
    u.rol = body.rol;
  }
  if (typeof body.activo === 'boolean') u.activo = body.activo;
  if (body.password && body.password.length >= 6) {
    const { salt, hash } = await hashPasswordPBKDF2(body.password);
    u.salt = salt;
    u.hash = hash;
  }
  u.fechaModificacion = new Date().toISOString();
  usuarios[userId] = u;
  await saveUsuariosKV(env, usuarios);

  const audit = await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'actualizar_usuario',
    detalles: `Usuario ${userId} actualizado`,
    meta: { id: userId, rol: u.rol, activo: u.activo },
  });

  return json({ ok: true, auditId: audit.id }, 200, request);
}

async function handleSitioGet(request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (payload.rol !== 'admin') return json({ error: 'Sin permiso.' }, 403, request);
  const config = await getSitioConfig(env);
  return json({ config }, 200, request);
}

async function handleSitioPut(request, env) {
  const payload = await requireRolAdmin(request, env);
  if (!payload) return json({ error: 'Solo el administrador.' }, 403, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }
  const config = body.config && typeof body.config === 'object' ? body.config : body;
  await saveSitioConfig(env, config);

  const audit = await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'actualizar_sitio',
    detalles: 'Configuración del sitio web guardada en servidor',
  });

  return json({ ok: true, auditId: audit.id }, 200, request);
}

// Reservas OXXO pendientes de pago (informativo). Se limpian solas al pagar o
// vencer la ficha; ver guardarOxxoPendiente / borrarOxxoPendiente. Como respaldo
// por si el webhook checkout.session.expired no llegó, aquí también se filtran
// (y se mueven al historial como fallidas) las que ya deberían haber vencido.
async function handleOxxoPendientes(tid, request, env, ctx) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_VENTAS.has(payload.rol)) {
    return json({ error: 'Sin permiso para ver ventas.' }, 403, request);
  }
  const canonical = resolveTid(tid);
  const list = await env.VENTAS.list({ prefix: kv(canonical, 'oxxoPend:') });
  const raw  = await Promise.all(list.keys.map(k => env.VENTAS.get(k.name)));
  const todas = raw.filter(Boolean)
    .map(r => { try { return JSON.parse(r); } catch { return null; } })
    .filter(Boolean);

  const ahora = Date.now();
  const hoyMx = hoyISOMx();
  // Respaldo para fichas antiguas creadas antes de que existiera `expiraEn`:
  // si la función ya pasó, o si ya lleva más de 4 días sin resolverse (el
  // voucher de OXXO nunca dura tanto), se considera vencida igual.
  const MAX_EDAD_SIN_EXPIRAEN_MS = 4 * 24 * 60 * 60 * 1000;
  const vigentes = [];
  const vencidas = [];
  for (const p of todas) {
    const expiroPorFicha    = p.expiraEn && ahora > p.expiraEn;
    const funcionYaPaso     = !p.expiraEn && p.fecha && p.fecha < hoyMx;
    const demasiadoAntigua  = !p.expiraEn && p.creadoEn && (ahora - new Date(p.creadoEn).getTime()) > MAX_EDAD_SIN_EXPIRAEN_MS;
    if (expiroPorFicha || funcionYaPaso || demasiadoAntigua) vencidas.push(p);
    else vigentes.push(p);
  }
  if (vencidas.length) {
    const limpiar = Promise.all(vencidas.map(async p => {
      await guardarOxxoHistorial(canonical, p.sessionId, 'fallida', p, {}, env);
      await borrarOxxoPendiente(canonical, p.sessionId, env);
    }));
    if (ctx?.waitUntil) ctx.waitUntil(limpiar); else await limpiar;
  }

  vigentes.sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));
  return json({ pendientes: vigentes }, 200, request);
}

// Historial permanente de fichas OXXO (completadas y fallidas).
async function handleOxxoHistorial(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_VENTAS.has(payload.rol)) {
    return json({ error: 'Sin permiso para ver ventas.' }, 403, request);
  }
  const canonical = resolveTid(tid);
  const list = await env.VENTAS.list({ prefix: kv(canonical, 'oxxoHist:') });
  const raw  = await Promise.all(list.keys.map(k => env.VENTAS.get(k.name)));
  const historial = raw.filter(Boolean)
    .map(r => { try { return JSON.parse(r); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.resueltoEn || '').localeCompare(a.resueltoEn || ''));
  return json({ historial }, 200, request);
}

async function handleVentas(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_VENTAS.has(payload.rol)) {
    return json({ error: 'Sin permiso para ver ventas.' }, 403, request);
  }

  const url         = new URL(request.url);
  const fechaFiltro = url.searchParams.get('fecha') || '';
  const q           = (url.searchParams.get('q') || '').trim().toLowerCase();
  const cursorParam = url.searchParams.get('cursor') || undefined;
  const LIMIT       = 100;

  let ventas = [], nextCursor = null;

  if (fechaFiltro && /^\d{4}-\d{2}-\d{2}$/.test(fechaFiltro)) {
    const idxResult  = await env.VENTAS.list({ prefix: kv(tid, `ventaIdx:${fechaFiltro}:`) });
    const sessionIds = (await Promise.all(
      idxResult.keys.map(k => env.VENTAS.get(k.name))
    )).filter(Boolean);
    const ventasRaw = await Promise.all(sessionIds.map(sid => env.VENTAS.get(kv(tid, `venta:${sid}`))));
    ventas = ventasRaw.filter(Boolean).map(r => _formatVenta(JSON.parse(r)));
  } else {
    const listResult = await env.VENTAS.list({ prefix: kv(tid, 'venta:'), limit: LIMIT, cursor: cursorParam });
    if (!listResult.list_complete) nextCursor = listResult.cursor;
    const ventasRaw = await Promise.all(listResult.keys.map(k => env.VENTAS.get(k.name)));
    ventas = ventasRaw.filter(Boolean).map(r => _formatVenta(JSON.parse(r)));
  }

  if (q) {
    ventas = ventas.filter(v => {
      const nombre = (v.nombre || '').toLowerCase();
      const email  = (v.email || '').toLowerCase();
      const codigo = (v.codigo || v.certificado || '').toLowerCase();
      const cupon  = (v.codigoCupon || '').toLowerCase();
      const ref    = (v.referidoDe || '').toLowerCase();
      return nombre.includes(q) || email.includes(q) || codigo.includes(q)
        || cupon.includes(q) || ref.includes(q);
    });
  }

  ventas.sort((a, b) => new Date(b.fechaCompra) - new Date(a.fechaCompra));
  return json({ ventas, cursor: nextCursor || null }, 200, request);
}

async function handleCompradores(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_VENTAS.has(payload.rol)) {
    return json({ error: 'Sin permiso para ver compradores.' }, 403, request);
  }

  const url = new URL(request.url);
  const desde = url.searchParams.get('desde') || '';
  const hasta = url.searchParams.get('hasta') || '';
  const orgFiltro = (url.searchParams.get('organizacion') || '').trim().toLowerCase();
  const funcionFiltro = url.searchParams.get('funcion') || '';
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const soloActivas = url.searchParams.get('soloActivas') !== '0';

  if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return json({ error: 'Parámetro desde inválido (YYYY-MM-DD).' }, 400, request);
  }
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return json({ error: 'Parámetro hasta inválido (YYYY-MM-DD).' }, 400, request);
  }

  const ventasRaw = await listAllVentasRaw(tid, env);
  let ventas = ventasRaw.map(v => _formatVenta(v));

  if (soloActivas) {
    ventas = ventas.filter(v => v.estado !== 'reembolsada');
  }

  if (desde || hasta) {
    ventas = ventas.filter(v => {
      const dia = v.fechaCompraDia || _fechaCompraDiaMx(v.fechaCompra);
      if (!dia) return false;
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
      return true;
    });
  }

  if (funcionFiltro && /^\d{4}-\d{2}-\d{2}$/.test(funcionFiltro)) {
    ventas = ventas.filter(v => v.fecha === funcionFiltro);
  }

  if (orgFiltro) {
    ventas = ventas.filter(v => (v.organizacion || '').toLowerCase().includes(orgFiltro));
  }

  if (q) {
    ventas = ventas.filter(v => {
      const nombre = (v.nombre || '').toLowerCase();
      const email = (v.email || '').toLowerCase();
      const codigo = (v.codigo || v.certificado || '').toLowerCase();
      const tel = (v.telefono || '').toLowerCase();
      return nombre.includes(q) || email.includes(q) || codigo.includes(q) || tel.includes(q);
    });
  }

  ventas.sort((a, b) => new Date(b.fechaCompra || 0) - new Date(a.fechaCompra || 0));

  const porOrgMap = {};
  let entradas = 0;
  let revenue = 0;
  for (const v of ventas) {
    entradas += v.cantidad || 0;
    revenue += Number(v.total) || 0;
    const org = v.organizacion || '—';
    if (!porOrgMap[org]) {
      porOrgMap[org] = { organizacion: org, ventas: 0, entradas: 0, revenue: 0 };
    }
    porOrgMap[org].ventas += 1;
    porOrgMap[org].entradas += v.cantidad || 0;
    porOrgMap[org].revenue += Number(v.total) || 0;
  }

  const porOrganizacion = Object.values(porOrgMap)
    .sort((a, b) => b.entradas - a.entradas || b.revenue - a.revenue);

  const organizaciones = [...new Set(ventasRaw.map(v => _organizacionVenta(v)))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );

  return json({
    compradores: ventas,
    resumen: {
      ventas: ventas.length,
      entradas,
      revenue,
      porOrganizacion,
    },
    organizaciones,
  }, 200, request);
}

async function listAllVentasRaw(tid, env) {
  const canonical = resolveTid(tid);
  const ventas = [];
  let cursor;
  do {
    const list = await env.VENTAS.list({
      prefix: kv(canonical, 'venta:'),
      limit:  100,
      cursor: cursor || undefined,
    });
    const parsed = (await Promise.all(list.keys.map(k => env.VENTAS.get(k.name))))
      .filter(Boolean)
      .map(r => { try { return JSON.parse(r); } catch { return null; } })
      .filter(Boolean);
    ventas.push(...parsed);
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);
  return ventas;
}

async function handleInformeFunciones(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_VENTAS.has(payload.rol) && payload.rol !== 'gerente') {
    return json({ error: 'Sin permiso.' }, 403, request);
  }

  const canonical = resolveTid(tid);
  let funciones = [];
  try {
    const raw = await env.INVENTARIO.get(kv(canonical, 'funciones:activas'));
    funciones = JSON.parse(raw || '[]');
  } catch { /* */ }
  const nombreMap = Object.fromEntries(funciones.map(f => [f.fecha_iso, f.nombre]));

  const ventas = await listAllVentasRaw(tid, env);
  const stats  = {};

  for (const v of ventas) {
    const fc = _fechaContableVenta(v);
    if (!fc) continue;

    if (!stats[fc]) {
      stats[fc] = {
        entradasVendidas: 0, ventasCount: 0, revenue: 0,
        reembolsos: 0, reembolsoMonto: 0,
      };
    }
    const row = stats[fc];

    if (v.estado === 'reembolsada') {
      row.reembolsos    += 1;
      row.reembolsoMonto += Number(v.total) || 0;
      continue;
    }

    row.entradasVendidas += v.cantidad || 0;
    row.ventasCount      += 1;
    row.revenue          += Number(v.total) || 0;
  }

  const asistenPorFecha = {};
  for (const v of ventas) {
    if (v.estado === 'reembolsada') continue;
    const fa = v.fecha;
    if (!fa) continue;
    asistenPorFecha[fa] = (asistenPorFecha[fa] || 0) + (v.cantidad || 0);
  }

  const funcionesInforme = Object.entries(stats)
    .filter(([, d]) => d.ventasCount > 0)
    .map(([fecha_iso, d]) => ({
      fecha_iso,
      nombre:           nombreMap[fecha_iso] || fecha_iso,
      entradasVendidas: d.entradasVendidas,
      ventas:           d.ventasCount,
      revenue:          Math.round(d.revenue * 100) / 100,
      asisten:          asistenPorFecha[fecha_iso] || 0,
      reembolsos:       d.reembolsos,
      reembolsoMonto:   Math.round(d.reembolsoMonto * 100) / 100,
      revenueNeto:      Math.round((d.revenue - d.reembolsoMonto) * 100) / 100,
    }))
    .sort((a, b) => a.fecha_iso.localeCompare(b.fecha_iso));

  const totales = funcionesInforme.reduce((acc, f) => ({
    entradas: acc.entradas + f.entradasVendidas,
    revenue:  Math.round((acc.revenue + f.revenue) * 100) / 100,
    ventas:   acc.ventas + f.ventas,
  }), { entradas: 0, revenue: 0, ventas: 0 });

  return json({ funciones: funcionesInforme, totales }, 200, request);
}

// ─── HANDLER: LISTA DE ESPERA ─────────────────────────────────────────────────

async function handleListaEspera(tid, request, env) {
  // Escribe en KV y alimenta una lista que luego se notifica por correo:
  // sin límite, es un vector para quemar cuota de KV y para inyectar correos.
  if (!await limitePorIp(request, env, 'lespera', 8)) {
    return json({ error: 'Demasiadas solicitudes. Intenta en unos minutos.' }, 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido.' }, 400, request); }

  const { clave, fechaIso, nombre, email } = body || {};

  const listaId = (fechaIso && /^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) ? fechaIso : clave;
  if (!listaId || typeof listaId !== 'string' || !/^[a-z0-9_-]+$/.test(listaId))
    return json({ error: 'Función inválida.' }, 400, request);
  if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.trim().length > 100)
    return json({ error: 'Nombre inválido.' }, 400, request);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: 'Correo inválido.' }, 400, request);

  const key = kv(tid, `lista:${listaId}:${Date.now()}`);
  await env.VENTAS.put(key, JSON.stringify({
    clave:    clave    || listaId,
    fechaIso: fechaIso || null,
    nombre:   nombre.trim().substring(0, 100),
    email:    email.trim().substring(0, 254),
    ts:       new Date().toISOString(),
  }));

  return json({ ok: true }, 200, request);
}

// ─── HANDLERS: RESERVA FISCAL ────────────────────────────────────────────────

async function handleFiscalReserva(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!PUEDE_FISCAL_VER.has(payload.rol)) {
    return json({ error: 'Sin permiso.' }, 403, request);
  }

  const raw    = await env.VENTAS.get(kv(tid, 'fiscal:reserva:acumulado'));
  const fiscal = raw ? JSON.parse(raw) : { acumulado: 0 };
  return json({ teatroId: tid, acumulado: fiscal.acumulado || 0 }, 200, request);
}

async function handleFiscalReset(tid, request, env) {
  const payload = await requireRolAdmin(request, env);
  if (!payload) return json({ error: 'Solo el administrador.' }, 403, request);

  let body = {};
  try { body = await request.json(); } catch { /* vacío ok */ }
  if (!pinFinancieroOk(body, env)) {
    return json({ error: 'PIN de operaciones incorrecto.' }, 403, request);
  }

  await env.VENTAS.put(kv(tid, 'fiscal:reserva:acumulado'), JSON.stringify({ acumulado: 0 }));

  await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'fiscal_reset', teatroId: tid,
    detalles: 'Reserva fiscal reiniciada a $0',
  });

  return json({ ok: true, teatroId: tid, acumulado: 0 }, 200, request);
}

// ─── HANDLER: REPORTE READ-ONLY (agencia) — MULTI-VENUE ──────────────────────
// Protegido por REPORTE_TOKEN (separado del JWT admin). NO escribe nada. Sin PII.

const REPORTE_CACHE_KEY = 'https://reporte.cache/v3-multivenue';
const REPORTE_CACHE_TTL = 60;

async function handleReporte(request, env, ctx) {
  if (!env.REPORTE_TOKEN) return json({ error: 'Reporte no configurado.' }, 503, request);

  const auth  = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !timingSafeEqual(token, env.REPORTE_TOKEN)) {
    return json({ error: 'No autorizado.' }, 401, request);
  }

  // Cache corto por colo
  const cache    = caches.default;
  const cacheReq = new Request(REPORTE_CACHE_KEY);
  const hit      = await cache.match(cacheReq);
  if (hit) {
    const body = await hit.text();
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
    });
  }

  let totGlobalVendidos = 0, totGlobalIngreso = 0;
  const porTeatro = {};

  for (const tid of VALID_TEATROS) {
    const config = await getVenueConfig(tid, env);

    let funciones = [];
    try {
      const raw = await env.INVENTARIO.get(kv(tid, 'funciones:activas'));
      funciones = raw ? JSON.parse(raw) : [];
    } catch {}

    if (funciones.length === 0) continue; // teatro sin funciones activas: omitir

    const reporteFunciones = [];
    let totVendidos = 0, totIngreso = 0, sumaOcup = 0, nFunc = 0;

    for (const f of funciones) {
      const fecha = f.fecha_iso;
      if (!fecha) continue;

      const invRaw = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
      const inv    = normalizeInventario(invRaw, config);

      // Totales de inventario por secciones
      let aforoTotal = 0, vendidosTotal = 0, reservadosTotal = 0;
      const invPorSeccion = {};
      for (const s of config.secciones) {
        const sInv     = inv.secciones[s.id] || { total: s.total, vendidos: 0, reservados: 0 };
        aforoTotal     += sInv.total;
        reservadosTotal += sInv.reservados || 0;
        invPorSeccion[s.id] = {
          nombre:     s.nombre,
          total:      sInv.total,
          vendidos:   sInv.vendidos  || 0,
          disponibles: Math.max(0, sInv.total - (sInv.vendidos||0) - (sInv.reservados||0)),
        };
      }
      // Sumar vendidos de TODAS las keys del inventario (no solo las de config)
      // para capturar ventas históricas guardadas bajo 'general' u otros nombres.
      vendidosTotal = Object.values(inv.secciones).reduce((acc, s) => acc + (s.vendidos || 0), 0);
      const disponibles = Math.max(0, aforoTotal - vendidosTotal - reservadosTotal);
      const ocupacion   = aforoTotal > 0 ? Math.round((vendidosTotal / aforoTotal) * 1000) / 10 : 0;

      // Agregados desde ventas individuales
      const porTipo = Object.fromEntries(Object.keys(TIPOS_BOLETO).map(k => [k, 0]));
      let ingreso = 0, checkins = 0;

      const idx  = await env.VENTAS.list({ prefix: kv(tid, `ventaIdx:${fecha}:`) });
      const sids = (await Promise.all(idx.keys.map(k => env.VENTAS.get(k.name)))).filter(Boolean);
      const ventasRaw = await Promise.all(sids.map(sid => env.VENTAS.get(kv(tid, `venta:${sid}`))));

      for (const r of ventasRaw) {
        if (!r) continue;
        let v; try { v = JSON.parse(r); } catch { continue; }
        ingreso += (v.total || 0);
        if (v.usado) checkins += (v.cantidad || 0);
        if (Array.isArray(v.items)) {
          for (const it of v.items) {
            if (porTipo[it.tipo] != null) porTipo[it.tipo] += (it.cantidad || 0);
          }
        }
      }

      let listaEspera = 0;
      try {
        const le = await env.VENTAS.list({ prefix: kv(tid, `lista:${fecha}:`) });
        listaEspera = le.keys.length;
      } catch {}

      reporteFunciones.push({
        fecha,
        nombre:        f.nombre || fecha,
        aforo:         aforoTotal,
        vendidos:      vendidosTotal,
        reservados:    reservadosTotal,
        disponibles,
        ocupacion_pct: ocupacion,
        ingreso_total: Math.round(ingreso * 100) / 100,
        por_tipo:      porTipo,
        por_seccion:   invPorSeccion,
        checkins,
        lista_espera:  listaEspera,
      });

      totVendidos += vendidosTotal;
      totIngreso  += ingreso;
      sumaOcup    += ocupacion;
      nFunc       += 1;
    }

    porTeatro[tid] = {
      nombre:   config.nombre,
      venue:    config.venue,
      funciones: reporteFunciones,
      totales: {
        vendidos:               totVendidos,
        ingreso_total:          Math.round(totIngreso * 100) / 100,
        ocupacion_promedio_pct: nFunc > 0 ? Math.round((sumaOcup / nFunc) * 10) / 10 : 0,
      },
    };

    totGlobalVendidos += totVendidos;
    totGlobalIngreso  += totIngreso;
  }

  const resultado = {
    generado:   new Date().toISOString(),
    moneda:     'MXN',
    por_teatro: porTeatro,
    totales: {
      vendidos:      totGlobalVendidos,
      ingreso_total: Math.round(totGlobalIngreso * 100) / 100,
    },
  };

  const bodyStr  = JSON.stringify(resultado);
  const cacheResp = new Response(bodyStr, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `max-age=${REPORTE_CACHE_TTL}` },
  });
  ctx.waitUntil(cache.put(cacheReq, cacheResp));

  return new Response(bodyStr, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
  });
}

// ─── PRÓXIMAMENTE: REGISTRO DE CORREOS ───────────────────────────────────────

async function handleProximamente(request, env) {
  // Mismo motivo que lista-espera: POST público que escribe en KV.
  if (!await limitePorIp(request, env, 'prox', 8)) {
    return json({ error: 'Demasiadas solicitudes. Intenta en unos minutos.' }, 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido.' }, 400, request); }

  const { email } = body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))
    return json({ error: 'Correo inválido.' }, 400, request);

  const correo = String(email).trim().toLowerCase().substring(0, 254);

  // Verificar si ya existe para no duplicar
  const existing = await env.VENTAS.get(`proximamente:email:${correo}`);
  if (existing) return json({ ok: true, nuevo: false }, 200, request);

  // Guardar en KV
  const ts = Date.now();
  await env.VENTAS.put(`proximamente:email:${correo}`, JSON.stringify({ email: correo, ts: new Date(ts).toISOString() }));
  await env.VENTAS.put(`proximamente:lista:${ts}`, JSON.stringify({ email: correo, ts: new Date(ts).toISOString() }));

  // Notificar al admin
  await enviarEmail(
    'elgorilateatro@gmail.com',
    `📬 Nuevo registro próximamente — ${correo}`,
    `<p style="font-family:sans-serif;">Nuevo correo registrado para aviso de reestreno:</p>
     <p style="font-family:monospace;font-size:16px;"><strong>${correo}</strong></p>
     <p style="font-family:sans-serif;color:#888;font-size:13px;">${new Date(ts).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>`,
    env
  );

  return json({ ok: true, nuevo: true }, 200, request);
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const { pathname } = new URL(request.url);
    const method       = request.method;

    // Rutas globales (sin teatroId)
    if (method === 'POST' && pathname === '/api/proximamente') {
      return handleProximamente(request, env);
    }
    if (method === 'POST' && pathname === '/api/webhook') {
      return handleWebhook(request, env, ctx);
    }
    if (method === 'GET' && pathname === '/api/health') {
      return json({ status: 'ok', version: '3.0' }, 200, request);
    }
    if (method === 'POST' && pathname === '/api/admin/login') {
      return handleAdminLogin(request, env);
    }
    if (method === 'POST' && pathname === '/api/admin/acceso/crear') {
      return handleAdminAccesoCrear(request, env);
    }
    if (method === 'GET' && pathname === '/api/admin/acceso/validar') {
      return handleAdminAccesoValidar(request, env);
    }
    if (method === 'POST' && pathname === '/api/admin/acceso/login') {
      return handleAdminAccesoLogin(request, env);
    }
    if (method === 'POST' && pathname === '/api/admin/boletera/pase') {
      return handleBoleteraPase(request, env);
    }
    if (method === 'GET' && pathname === '/api/admin/boletera/validar') {
      return handleBoleteraValidar(request, env);
    }
    if (method === 'GET' && pathname === '/api/reporte') {
      return handleReporte(request, env, ctx);
    }

    // Parsear partes del path
    const parts = pathname.split('/').filter(Boolean);
    // parts[0] == 'api'

    if (parts[0] !== 'api') {
      return json({ error: 'Not found.' }, 404, request);
    }

    // ── /api/admin/sistema/... ─────────────────────────────────────────────────
    if (parts[1] === 'admin' && parts[2] === 'sistema') {
      const subSys = parts.slice(3).join('/');
      if (method === 'GET'  && subSys === 'auditoria')   return handleAuditoriaList(request, env);
      if (method === 'GET'  && subSys === 'metricas')    return handleMetricasList(request, env);
      if (method === 'GET'  && subSys === 'usuarios')    return handleUsuariosList(request, env);
      if (method === 'POST' && subSys === 'usuarios')    return handleUsuariosCreate(request, env);
      if (method === 'GET'  && subSys === 'sitio')       return handleSitioGet(request, env);
      if (method === 'PUT'  && subSys === 'sitio')       return handleSitioPut(request, env);
      const userMatch = subSys.match(/^usuarios\/([^/]+)$/);
      if (method === 'PUT' && userMatch)
        return handleUsuariosUpdate(decodeURIComponent(userMatch[1]), request, env);
      return json({ error: 'Not found.' }, 404, request);
    }

    // ── /api/admin/{tid}/... ───────────────────────────────────────────────────
    if (parts[1] === 'admin') {
      const tid = parts[2];
      if (!tid || !VALID_TEATROS.has(tid)) {
        return json({ error: 'Teatro inválido.' }, 404, request);
      }
      const sub = parts.slice(3).join('/');

      if (method === 'GET'  && sub === 'ventas')         return handleVentas(tid, request, env);
      if (method === 'GET'  && sub === 'oxxo-pendientes') return handleOxxoPendientes(tid, request, env, ctx);
      if (method === 'GET'  && sub === 'oxxo-historial')  return handleOxxoHistorial(tid, request, env);
      if (method === 'GET'  && sub === 'compradores')    return handleCompradores(tid, request, env);
      if (method === 'GET'  && sub === 'informe-funciones') return handleInformeFunciones(tid, request, env);
      if (method === 'GET'  && sub === 'funciones')        return handleFuncionesAdmin(tid, request, env);
      if (method === 'POST' && sub === 'funciones/toggle') return handleFuncionesToggle(tid, request, env);
      if (method === 'GET'  && sub === 'lista-puerta') return handleListaPuerta(tid, request, env);
      if (method === 'POST' && sub === 'venta-manual')   return handleVentaManual(tid, request, env, ctx);
      if (method === 'GET'  && sub === 'fiscal')         return handleFiscalReserva(tid, request, env);
      if (method === 'POST' && sub === 'fiscal/reset')   return handleFiscalReset(tid, request, env);
      if (method === 'POST' && sub === 'reagendar')      return handleReagendar(tid, request, env);
      if (method === 'POST' && sub === 'reembolso')    return handleReembolso(tid, request, env, ctx);
      if (method === 'POST' && sub === 'canjear-lote')   return handleCanjearLote(tid, request, env);

      const ventaAdminMatch = sub.match(/^venta\/([^/]+)$/);
      if (method === 'GET' && ventaAdminMatch)
        return handleAdminVentaDetail(tid, decodeURIComponent(ventaAdminMatch[1]), request, env);

      if (method === 'POST' && sub === 'email-post-funcion')
        return handleEmailPostFuncion(tid, request, env);
      if (method === 'POST' && sub === 'email-dia-funcion')
        return handleEmailDiaFuncion(tid, request, env);

      const reenviarMatch = sub.match(/^venta\/([^/]+)\/reenviar-email$/);
      if (method === 'POST' && reenviarMatch)
        return handleReenviarEmail(tid, decodeURIComponent(reenviarMatch[1]), request, env);

      const eliminarMatch = sub.match(/^venta\/([^/]+)\/eliminar$/);
      if (method === 'POST' && eliminarMatch)
        return handleEliminarVenta(tid, decodeURIComponent(eliminarMatch[1]), request, env);

      const canjearMatch = sub.match(/^canjear\/([^/]+)$/);
      if (method === 'POST' && canjearMatch)
        return handleCanjear(tid, decodeURIComponent(canjearMatch[1]), request, env);

      const descanjearMatch = sub.match(/^descanjear\/([^/]+)$/);
      if (method === 'POST' && descanjearMatch)
        return handleDescanjear(tid, decodeURIComponent(descanjearMatch[1]), request, env);

      return json({ error: 'Not found.' }, 404, request);
    }

    // ── /api/{tid}/... ────────────────────────────────────────────────────────
    const tid = parts[1];
    if (!tid || !VALID_TEATROS.has(tid)) {
      return json({ error: 'Teatro inválido.' }, 404, request);
    }
    const sub = parts.slice(2).join('/');

    if (method === 'GET'  && sub === 'funciones')      return handleFunciones(tid, request, env);
    if (method === 'GET'  && sub === 'disponibilidad') return handleDisponibilidad(tid, request, env);
    if (method === 'POST' && sub === 'checkout')       return handleCheckout(tid, request, env, ctx);
    if (method === 'POST' && sub === 'validar-cupon')  return handleValidarCupon(tid, request, env);
    if (method === 'POST' && sub === 'lista-espera')   return handleListaEspera(tid, request, env);

    const invMatch = sub.match(/^invitacion\/([^/]+)$/);
    if (method === 'GET' && invMatch)
      return handleInvitacion(tid, decodeURIComponent(invMatch[1]), request, env);

    const encuestaMatch = sub.match(/^encuesta\/([^/]+)$/);
    if (encuestaMatch) {
      const encToken = decodeURIComponent(encuestaMatch[1]);
      if (method === 'GET')  return handleEncuestaGet(tid, encToken, request, env);
      if (method === 'POST') return handleEncuestaPost(tid, encToken, request, env);
    }

    const ventaMatch = sub.match(/^venta\/([^/]+)$/);
    if (method === 'GET' && ventaMatch)
      return handleVenta(tid, decodeURIComponent(ventaMatch[1]), request, env);

    const enviarMatch = sub.match(/^venta\/([^/]+)\/enviar-boleto$/);
    if (method === 'POST' && enviarMatch) {
      return handleEnviarBoletoCompra(tid, decodeURIComponent(enviarMatch[1]), request, env);
    }

    const walletMatch = sub.match(/^venta\/([^/]+)\/wallet$/);
    if (method === 'GET' && walletMatch) {
      return handleWallet(tid, decodeURIComponent(walletMatch[1]), request, env);
    }

    return json({ error: 'Not found.' }, 404, request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const res = await enviarEmailsDiaFuncion(env);
        logInfo('cron.email_dia_funcion', sanitizeObject(res));
      } catch (e) {
        logError('cron.email_dia_funcion', { error: e.message });
      }
    })());
  },
};
