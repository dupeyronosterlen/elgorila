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
//
// TEATRO IDs: wilberto, ccc, gira-xxx…  «gorila» es alias histórico → wilberto (mismo KV).
// COMPAT: ventas pre-v3 sin prefijo tid; _lookupVenta busca legacy solo para gorila.
// ──────────────────────────────────────────────────────────────────────────────

import {
  findKVUser, getUsuariosKV, saveUsuariosKV, hashPasswordPBKDF2,
  registrarAuditoria, listAuditoria, getSitioConfig, saveSitioConfig,
} from './admin-extra.js';
import { googleWalletSaveUrl, appleWalletPkpass, walletStatus } from './wallet.js';

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
  if (m === 'efectivo' || venta.sessionId?.startsWith('manual_')) return 'Efectivo / taquilla';
  if (m.includes('card') || m.includes('link')) return 'Stripe (tarjeta en línea)';
  return m || '—';
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
      console.error('Resend error', res.status, to, from, errBody);
      return false;
    }
    return true;
  } catch (e) { console.error('enviarEmail exception:', to, e.message); return false; }
}

async function enviarEmail(to, subject, html, env, opts = {}) {
  if (!env.RESEND_API_KEY) { console.error('RESEND_API_KEY no configurada'); return false; }
  // Remitente: boletos@elgorilateatro.com.mx (requiere dominio Verified en resend.com/domains).
  // Destinos operativos: comprador + aviso admin → elgorilateatro@gmail.com (nunca otro correo).
  const verifiedFrom = EMAIL_FROM_DEFAULT;
  const primaryFrom  = env.EMAIL_FROM || verifiedFrom;
  if (await _enviarEmailResend(to, subject, html, env, primaryFrom, opts)) return true;
  if (primaryFrom !== verifiedFrom) {
    return _enviarEmailResend(to, subject, html, env, verifiedFrom, opts);
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
  return `https://elgorilateatro.com.mx/verificar.html?codigo=${encodeURIComponent(codigo)}`;
}

function urlCompartirBoleto(codigo) {
  return `https://elgorilateatro.com.mx/compartir-boleto.html?c=${encodeURIComponent(codigo)}`;
}

function urlQrBoleto(codigo, size = 148) {
  const data = encodeURIComponent(codigoQrPayload(codigo));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&color=1a1411&bgcolor=f1ead9&margin=8&data=${data}`;
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

function htmlBoleto(venta, funcionNombre, config) {
  const multiSeccion = config.secciones && config.secciones.length > 1;
  const certificado  = venta.certificado || venta.codigo || 'CERT-—';
  const boletos      = venta.boletos || [];
  const qrCert       = codigoQrOficialVenta(venta);
  const folioTaquilla = boletos.map(b => b.folio).filter(Boolean).join(' · ') || null;
  const qrUrl        = urlQrBoleto(qrCert);
  const graciasUrl   = 'https://elgorilateatro.com.mx/gracias.html';
  const nEntradas    = venta.cantidad || boletos.length || 1;
  const entradasLbl  = nEntradas === 1 ? '1 entrada' : `${nEntradas} entradas`;

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
      Boleto confirmado · 2026
    </p>
    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:.9;font-weight:500;color:#f1ead9;letter-spacing:-.02em;">
      EL <span style="font-style:italic;color:#D43A1A;">Gorila</span>
    </h1>
    <p style="margin:18px 0 0;padding-left:12px;border-left:2px solid rgba(212,58,26,.55);font-family:Georgia,serif;font-size:20px;line-height:1.3;color:#f1ead9;max-width:320px;">
      Tus entradas · <span style="font-style:italic;color:#d99b3a;">${entradasLbl}</span>
    </p>
  </td></tr>

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
            <strong>Presenta este correo o el QR en la entrada del teatro.</strong> ${nEntradas > 1 ? `Tienes <strong>${nEntradas} entradas</strong>.` : ''} Llega con <strong>30 minutos de anticipación</strong>. No necesitas hacer nada más en línea.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Pie -->
  <tr><td style="background:#120d0b;padding:22px 28px;text-align:center;border-top:1px solid rgba(241,234,217,.08);">
    <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:13px;color:rgba(241,234,217,.55);">
      ¿Dudas? Responde a este correo o escribe a
      <a href="mailto:${EMAIL_OPERATIVO}" style="color:#d99b3a;text-decoration:underline;">${EMAIL_OPERATIVO}</a>
    </p>
    <a href="${graciasUrl}" style="display:inline-block;border:1px solid rgba(217,155,58,.45);color:#d99b3a;padding:12px 20px;text-decoration:none;font-family:Georgia,serif;font-size:15px;margin:0 6px 10px;">
      Indicaciones para el día de la función →
    </a>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
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
  { id: 'platea',  nombre: 'Platea (abajo)',  total: 250, precio_general: 350, precio_descuento: 245 },
  { id: 'galeria', nombre: 'Galería (arriba)', total: 75,  precio_general: 350, precio_descuento: 245 },
];

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
    secciones: [{ id: 'general', nombre: 'General', total: 200, precio_general: 350, precio_descuento: 245 }],
  },
};

async function getVenueConfig(tid, env) {
  const canonical = resolveTid(tid);
  const raw = await env.INVENTARIO.get(kv(canonical, 'config'));
  if (raw) {
    try { return JSON.parse(raw); } catch {}
  }
  return VENUE_FALLBACKS[canonical] || VENUE_FALLBACKS.wilberto;
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
    ? (seccionConfig.precio_descuento ?? 245)
    : (seccionConfig.precio_general   ?? 350);
}

const CAPACIDAD_DEFAULT = 200;
/** Tiempo máximo en pantalla de pago (Stripe + hold en inventario). Stripe exige ≥30 min. */
const RESERVA_TTL       = 1800; // 30 minutos
const VENTA_404_MAX     = 40;  // máx. folios NO encontrados por IP / 15 min (anti-enumeración)
const CODIGOS_DESCUENTO_KEY   = 'codigos:descuento';
const STRIPE_MIN_TOTAL_CENTAVOS = 1000; // MXN 10.00 — mínimo Stripe en México

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
        error: 'Los cupones aplican solo a boletos generales. Las entradas con credencial ($245) van en su fila aparte.',
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

  return { ok: true };
}

function calcularLineItemsPrecio(itemsValidados, seccionMap, { cupon }) {
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

  if (cupon?.tipo === 'par_fijo') {
    const target = Math.round(cupon.totalMxn * 100);
    const nGen   = contarGenerales(itemsValidados);
    let rest     = target;
    let idxGen   = 0;
    for (const row of rows) {
      if (row.item.tipo !== 'general') continue;
      idxGen += 1;
      const isLast = idxGen === nGen;
      const unit   = isLast ? rest : Math.floor(target / nGen);
      row.unitCentavos = Math.max(50, unit);
      if (!isLast) rest -= row.unitCentavos;
    }
    totalCentavos = rows.reduce((s, r) => s + r.unitCentavos * r.item.cantidad, 0);
  } else if (cupon?.tipo === 'porcentaje' && cupon.porcentaje > 0) {
    for (const row of rows) {
      let unit = row.unitBruto;
      if (row.item.tipo === 'general') {
        unit = Math.round(unit * (1 - cupon.porcentaje / 100));
      }
      row.unitCentavos = Math.max(50, unit);
    }
    totalCentavos = rows.reduce((s, r) => s + r.unitCentavos * r.item.cantidad, 0);
  } else {
    for (const row of rows) row.unitCentavos = row.unitBruto;
    totalCentavos = subtotalCentavos;
  }

  if (totalCentavos > 0 && totalCentavos < STRIPE_MIN_TOTAL_CENTAVOS) {
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

/** Libera holds más antiguos (sin pago) hasta abrir cupo. Devuelve sessionIds a expirar en Stripe. */
function evictarHoldsFIFO(inv, seccionCantidades, config) {
  const sessionIds = [];
  let work = { ...inv, holds: { ...(inv.holds || {}) } };
  const ordenados = Object.entries(work.holds)
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
    } catch (e) { console.error('expire session:', sid, e.message); }
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

async function reservarOptimista(tid, fecha, seccionCantidades, reservaId, env, ctx) {
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
      expiresAt: now + RESERVA_TTL * 1000,
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
  console.error(`liberarReserva: conflicto persistente para ${tid}/${fecha}`);
}

async function confirmarVentaOptimista(tid, fecha, seccionCantidades, reservaId, env) {
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
  console.error(`confirmarVenta: conflicto persistente para ${tid}/${fecha}`);
}

/** Venta inmediata (efectivo / taquilla) — sin hold; solo incrementa vendidos. */
async function aplicarVentaDirecta(tid, fecha, seccionCantidades, env, ctx) {
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

async function requireAdmin(request, env) {
  if (!env.JWT_SECRET) return null;
  const auth  = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || !ROLES_AUTH.has(payload.rol)) return null;
  return payload;
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

async function handleFunciones(tid, request, env) {
  const canonical = resolveTid(tid);
  const config    = await getVenueConfig(canonical, env);
  const raw       = await env.INVENTARIO.get(kv(canonical, 'funciones:activas'));
  if (!raw) return json([], 200, request);
  try {
    const funciones = JSON.parse(raw).filter(f => f.activa !== false);
    const capacidad = (config.secciones || []).reduce((s, x) => s + (x.total || 0), 0);

    const enriched = await Promise.all(funciones.map(async f => {
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
      // comprables_ahora: solo la zona en venta (platea hasta agotar, luego galería)
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

    return json(enriched, 200, request);
  } catch { return json([], 200, request); }
}

// ─── HANDLER: DISPONIBILIDAD ──────────────────────────────────────────────────

async function handleDisponibilidad(tid, request, env) {
  const fecha = new URL(request.url).searchParams.get('fecha');
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Parámetro fecha inválido (YYYY-MM-DD).' }, 400, request);
  }

  const config = await getVenueConfig(tid, env);
  const raw    = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
  let inv      = normalizeInventario(raw, config);
  const antes  = JSON.stringify(inv.holds || {});
  inv          = recalcReservadosDesdeHolds(purgarHoldsVencidos(inv), config);
  if (JSON.stringify(inv.holds || {}) !== antes) {
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify({
      ...inv,
      version: (inv.version ?? 0) + 1,
    }));
  }

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

  const { items, fecha, codigoCupon, referidoDe: referidoDeRaw } = body;
  const referidoDe = typeof referidoDeRaw === 'string' ? referidoDeRaw.trim().toUpperCase() : '';
  const utmClean = sanitizarUTM(body.utm);
  const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase().substring(0, 254) : '';
  const emailOk  = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : '';

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

  // Agrupar cantidades por sección para optimistic lock
  const seccionCantidades = {};
  for (const item of itemsValidados) {
    seccionCantidades[item.seccion] = (seccionCantidades[item.seccion] || 0) + item.cantidad;
  }

  if (seccionCantidades.galeria) {
    const prepG = await prepararInventarioParaVenta(tid, fecha, { platea: 0 }, env);
    const plateaQ = cupoSeccion(prepG.inv, 'platea', config);
    if (plateaQ > 0) {
      return json({
        error: 'No hay lugar disponible en esta función.',
      }, 409, request);
    }
  }

  const reservaId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Hold corto (15 min) antes de Stripe; si no hay cupo, expira holds viejos sin pago
  const reserva = await reservarOptimista(tid, fecha, seccionCantidades, reservaId, env, ctx);
  if (!reserva.ok) return json({ error: reserva.error }, reserva.status, request);

  // Cupón (única vía de descuento promocional; credenciales van en su fila a $245)
  let cuponAplicado = null;
  if (codigoCupon) {
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
    cuponAplicado = cupon;
  }

  if (cuponAplicado?.codigo === 'INVITADO25') {
    if (!referidoDe || !esCodigoCert(referidoDe)) {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: 'El cupón de invitado solo funciona con un enlace de invitación válido.' }, 400, request);
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
    if (!cuponAplicado || cuponAplicado.codigo !== 'INVITADO25') {
      await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
      return json({ error: 'El descuento de invitado debe activarse antes de pagar.' }, 400, request);
    }
  }

  const { rows: lineRows } = calcularLineItemsPrecio(itemsValidados, seccionMap, {
    cupon: cuponAplicado,
  });

  const canonical = resolveTid(tid);
  const baseUrl   = 'https://elgorilateatro.com.mx';
  const expiresAt = Math.floor(Date.now() / 1000) + RESERVA_TTL;

  const params = new URLSearchParams({
    mode:        'payment',
    expires_at:  String(expiresAt),
    success_url: `${baseUrl}/confirmacion.html?session_id={CHECKOUT_SESSION_ID}&teatro=${canonical}`,
    cancel_url:  `${baseUrl}/boletos.html?cancelado=1&teatro=${canonical}`,
    'metadata[teatroId]':       canonical,
    'metadata[fecha]':          fecha,
    'metadata[cantidad]':       String(cantidadTotal),
    'metadata[reservaId]':      reservaId,
    'metadata[seccionCants]':   JSON.stringify(seccionCantidades),
    'metadata[items]':          JSON.stringify(itemsValidados),
    'metadata[funcionNombre]':  funcion.nombre,
  });

  if (emailOk) params.set('customer_email', emailOk);
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
    return json({ url: session.url, sessionId: session.id }, 200, request);

  } catch (err) {
    await liberarReservaOptimista(tid, fecha, seccionCantidades, reservaId, env);
    console.error('Stripe checkout error:', err.message);
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
    return new Response('ok', { status: 200 });
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response('ok', { status: 200 });
  }

  const sessionId = session.id;

  // Idempotencia: verificar con prefijo y sin prefijo (compat gorila pre-v3)
  const existingNew    = await env.VENTAS.get(kv(tid, `venta:${sessionId}`));
  const existingLegacy = (!existingNew && tid === 'gorila') ? await env.VENTAS.get(`venta:${sessionId}`) : null;
  if (existingNew || existingLegacy) return new Response('ok', { status: 200 });

  const fecha         = meta.fecha;
  const cantidad      = parseInt(meta.cantidad, 10);
  const reservaId     = meta.reservaId;
  const funcionNombre = meta.funcionNombre || fecha;

  let items = [];
  try { if (meta.items) items = JSON.parse(meta.items); } catch {}

  if (!fecha || !cantidad) {
    console.error('Webhook: metadata incompleta en sesión', sessionId);
    return new Response('ok', { status: 200 });
  }

  const gen = await generarBoletosVenta(tid, fecha, items, env);

  const utm = {};
  for (const k of UTM_KEYS) {
    const val = meta[`utm_${k}`];
    if (val) utm[k] = val;
  }

  const metodoPago = Array.isArray(session.payment_method_types) && session.payment_method_types.length
    ? session.payment_method_types.join(',')
    : 'card';

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
    email:        session.customer_details?.email || session.customer_email || null,
    nombre:       session.customer_details?.name  || null,
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

  await env.VENTAS.put(kv(tid, `venta:${sessionId}`),  JSON.stringify(venta));
  await persistirCertificadosKv(tid, sessionId, gen.certificado, gen.boletos, env);
  await env.VENTAS.put(kv(tid, `ventaIdx:${fecha}:${sessionId}`), sessionId);
  await env.VENTAS.put(kv(tid, `ventaIdxContable:${fecha}:${sessionId}`), sessionId);

  if (meta.codigoCupon) {
    ctx.waitUntil(
      incrementarUsoCupon(meta.codigoCupon, env, meta.referidoDe || null)
        .catch(e => console.error('cupon uso:', e.message)),
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
    } catch (e) { console.error('fiscal acumulado error:', e.message); }
  })());

  // Emails (comprador + aviso admin)
  const emailResult = await enviarEmailsVenta(venta, tid, env);
  venta.emailsEnviados = {
    admin:     emailResult.adminOk,
    comprador: emailResult.compradorOk,
    en:        new Date().toISOString(),
  };
  await env.VENTAS.put(kv(tid, `venta:${sessionId}`), JSON.stringify(venta));

  // Webhook de marketing (Make/CAPI) — sin PII
  if (env.MAKE_WEBHOOK_URL) {
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
      metodo_pago:     metodoPago,
    };
    ctx.waitUntil(
      fetch(env.MAKE_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payloadMkt),
      }).catch(e => console.error('marketing webhook:', e.message))
    );
  }

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

  if (emailNuevo && emailNuevo !== emailAnterior) {
    await env.VENTAS.put(ventaKey, JSON.stringify(venta));
  }

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

async function handleAdminLogin(request, env) {
  if (!env.JWT_SECRET)              return json({ error: 'Configuración incompleta.' }, 500, request);
  if (!env.ADMIN_USER || !env.ADMIN_PASS)
    return json({ error: 'Cuentas admin no configuradas.' }, 503, request);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(ip, env)) {
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
  const TTL_30D = 30 * 24 * 60 * 60;
  const token   = await signJWT({ usuario: u, nombre, rol, iat: now, exp: now + TTL_30D }, env.JWT_SECRET);
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
  };
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
  const telefono = typeof body.telefono === 'string' ? body.telefono.replace(/\D/g, '') : '';
  const notas    = typeof body.notas === 'string' ? body.notas.trim().substring(0, 300) : '';
  const { items, fecha } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'Indica al menos un boleto.' }, 400, request);
  }
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Fecha inválida.' }, 400, request);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Correo inválido.' }, 400, request);
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
    const prepG     = await prepararInventarioParaVenta(tid, fecha, { platea: 0 }, env);
    const plateaQ   = cupoSeccion(prepG.inv, 'platea', config);
    if (plateaQ > 0) {
      return json({ error: 'La galería solo se abre cuando se agote la platea.' }, 409, request);
    }
  }

  const ventaAplicada = await aplicarVentaDirecta(tid, fecha, seccionCantidades, env, ctx);
  if (!ventaAplicada.ok) return json({ error: ventaAplicada.error }, ventaAplicada.status, request);

  let total = 0;
  for (const item of itemsValidados) {
    total += getPrecio(item.tipo, seccionMap[item.seccion]) * item.cantidad;
  }
  total = Math.round(total * 100) / 100;

  const gen = await generarBoletosVenta(tid, fecha, itemsValidados, env);
  const sessionId = `manual_${crypto.randomUUID().replace(/-/g, '')}`;
  const canonical = resolveTid(tid);

  const venta = {
    teatroId:       canonical,
    sessionId,
    codigo:         gen.codigo,
    certificado:    gen.certificado,
    boletos:        gen.boletos,
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
    telefono:       telefono || null,
    notas:          notas || null,
    total,
    fechaCompra:    new Date().toISOString(),
    estado:         'completada',
    usado:          false,
    metodoPago:     'efectivo',
    registradoPor:  payload.usuario || 'admin',
    utm:            {},
  };

  await env.VENTAS.put(kv(canonical, `venta:${sessionId}`), JSON.stringify(venta));
  await persistirCertificadosKv(canonical, sessionId, gen.certificado, gen.boletos, env);
  await env.VENTAS.put(kv(canonical, `ventaIdx:${fecha}:${sessionId}`), sessionId);
  await env.VENTAS.put(kv(canonical, `ventaIdxContable:${fecha}:${sessionId}`), sessionId);

  let emailEnviado = false;
  let adminOk      = false;
  if (email) {
    const emailResult = await enviarEmailsVenta(venta, canonical, env);
    emailEnviado = emailResult.compradorOk;
    adminOk      = emailResult.adminOk;
    venta.emailsEnviados = {
      admin: adminOk, comprador: emailEnviado, en: new Date().toISOString(),
    };
    await env.VENTAS.put(kv(canonical, `venta:${sessionId}`), JSON.stringify(venta));
  } else {
    adminOk = await enviarEmail(
      adminNotifyEmail(env),
      `${gen.certificado} : Nueva orden — EL GORILA`,
      htmlAvisoAdmin(venta, funcion.nombre, config),
      env,
    );
  }

  const compartirUrl = urlCompartirBoleto(gen.certificado);
  const folioPuerta = gen.boletos.map(b => b.folio).filter(Boolean).join(' · ') || null;
  const waTexto = [
    `🎭 *EL GORILA* — ${funcion.nombre}`,
    `📍 ${config.venue}`,
    `🎟 ${cantidadTotal} boleto(s)${folioPuerta ? ` · Folio ${folioPuerta}` : ''}`,
    `Presenta el QR en la entrada. El boleto también llegó por correo.`,
  ].join('\n');
  const waUrl = telefono
    ? `https://wa.me/${telefono}?text=${encodeURIComponent(waTexto)}`
    : `https://wa.me/?text=${encodeURIComponent(waTexto)}`;

  await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'venta_manual', teatroId: canonical,
    detalles: `Venta efectivo ${gen.certificado} — ${cantidadTotal} boleto(s) — ${funcion.nombre}`,
    meta: { codigo: gen.certificado, fecha, total, email: email || null },
  });

  return json({
    ok:           true,
    codigo:       gen.certificado,
    certificado:  gen.certificado,
    boletos:      gen.boletos.map(b => ({ cert: b.cert, folio: b.folio, numero: b.numero })),
    compartirUrl,
    waUrl,
    waTexto,
    emailEnviado: !!email,
    total,
    funcionNombre: funcion.nombre,
    venta:         _formatVenta(venta),
  }, 200, request);
}

/** Libera cupo vendido (reagendamiento). */
async function liberarVendidos(tid, fecha, seccionCantidades, env) {
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
  if (venta.fecha === fechaDestino) return json({ error: 'Ya está en esa función.' }, 400, request);

  const funcionesRaw = await env.INVENTARIO.get(kv(tid, 'funciones:activas'));
  let funcionDest;
  try {
    funcionDest = JSON.parse(funcionesRaw || '[]').find(f => f.fecha_iso === fechaDestino && f.activa !== false);
  } catch { return json({ error: 'Error al leer funciones.' }, 500, request); }
  if (!funcionDest) return json({ error: 'Función destino no válida.' }, 400, request);

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

  const audit = await registrarAuditoria(env, {
    usuarioId: payload.usuario, usuario: payload.nombre || payload.usuario,
    rol: payload.rol, accion: 'reagenda', teatroId: canonical,
    detalles: `${codigo}: cancelado en ${fechaOrigen} → activo en ${fechaDestino}. Monto contable en ${venta.fechaContable}.`,
    meta: {
      tipo: 'reagenda', codigo,
      de: fechaOrigen, a: fechaDestino,
      fechaContable: venta.fechaContable,
      total: venta.total, cancelacionOrigen: true,
    },
  });

  return json({ ok: true, venta: _formatVenta(venta), auditId: audit.id }, 200, request);
}

async function handleReembolso(tid, request, env, ctx) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (payload.rol !== 'admin') {
    return json({ error: 'Solo el administrador puede reembolsar.' }, 403, request);
  }
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Stripe no configurado.' }, 503, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const codigo = (body.codigo || '').trim().toUpperCase();
  if (!esCodigoCert(codigo)) return json({ error: 'Folio inválido.' }, 400, request);

  const resolved = await _resolveVentaKey(tid, codigo, env);
  if (!resolved) return json({ error: 'Folio no encontrado.' }, 404, request);
  const { ventaKey, venta } = resolved;

  if (venta.estado === 'reembolsada') return json({ error: 'Esta venta ya fue reembolsada.' }, 409, request);
  if (venta.usado) return json({ error: 'No se puede reembolsar un boleto ya canjeado.' }, 409, request);

  const sessionId = venta.sessionId || '';
  const esManual  = sessionId.startsWith('manual_') || venta.metodoPago === 'efectivo';
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
      console.error('Reembolso Stripe:', err.message);
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
    } catch (e) { console.error('fiscal reembolso:', e.message); }
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

  const resultados = [];
  for (const codigo of codigos) {
    const resolved = await _resolveVentaKey(tid, codigo, env);
    if (!resolved) { resultados.push({ codigo, ok: false, error: 'No encontrado' }); continue; }
    const { ventaKey, venta, boletoIdx } = resolved;
    const boleto = boletoEnVenta(venta, boletoIdx);
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
        vendidosTotal  += sInv.vendidos  || 0;
        reservadosTotal += sInv.reservados || 0;
        invPorSeccion[s.id] = {
          nombre:     s.nombre,
          total:      sInv.total,
          vendidos:   sInv.vendidos  || 0,
          disponibles: Math.max(0, sInv.total - (sInv.vendidos||0) - (sInv.reservados||0)),
        };
      }
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
      if (method === 'GET'  && sub === 'informe-funciones') return handleInformeFunciones(tid, request, env);
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

      const reenviarMatch = sub.match(/^venta\/([^/]+)\/reenviar-email$/);
      if (method === 'POST' && reenviarMatch)
        return handleReenviarEmail(tid, decodeURIComponent(reenviarMatch[1]), request, env);

      const canjearMatch = sub.match(/^canjear\/([^/]+)$/);
      if (method === 'POST' && canjearMatch)
        return handleCanjear(tid, decodeURIComponent(canjearMatch[1]), request, env);

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
};
