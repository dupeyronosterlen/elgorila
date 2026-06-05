/**
 * EL GORILA — Cloudflare Worker API
 * Autenticación JWT + checkout Stripe + inventario en KV.
 *
 * KV INVENTARIO:
 *   sistema:usuarios          → { [id]: { id, nombre, rol, salt, hash, activo } }
 *   funciones:activas         → [{ fecha_iso, nombre, activa }]
 *   funcion:{fecha_iso}       → { total, vendidos, reservados, bloqueado }
 *   codigos:descuento         → { [CODIGO]: { porcentaje, nombre, activo } }
 *   reserva:{id}              → { fecha, cantidad }   [TTL: 15 min]
 *   ratelimit:{ip}:{ventana}  → count                 [TTL: 15 min]
 *
 * KV VENTAS:
 *   venta:{session_id}        → { sessionId, codigo, fecha, cantidad, email, total, ... }
 *   cert:{codigo}             → { sessionId }
 */

// ─── CORS ─────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://elgorilateatro.com.mx',
  'https://www.elgorilateatro.com.mx',
];

function resolveOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
  });
}

// ─── BASE64URL ────────────────────────────────────────────────────────────────

function b64uEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64uEncodeStr(str) {
  return b64uEncode(new TextEncoder().encode(str));
}

function b64uDecode(str) {
  const padded = str + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// ─── JWT (HMAC-SHA256) ────────────────────────────────────────────────────────

async function importHmacKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

async function signJWT(payload, secret) {
  const header = b64uEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = b64uEncodeStr(JSON.stringify(payload));
  const input  = `${header}.${body}`;
  const key    = await importHmacKey(secret, 'sign');
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return `${input}.${b64uEncode(sig)}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const input = `${header}.${body}`;
  const key   = await importHmacKey(secret, 'verify');
  const valid = await crypto.subtle.verify('HMAC', key, b64uDecode(sig), new TextEncoder().encode(input));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(body)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ─── PBKDF2 (contraseñas) ─────────────────────────────────────────────────────
// Parámetros DEBEN coincidir con scripts/init-usuarios.js.

const PBKDF2_ITERATIONS   = 100_000;
const PBKDF2_KEYLEN_BITS  = 256;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function verifyPassword(password, saltHex, storedHashHex) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, PBKDF2_KEYLEN_BITS,
  ));
  const stored = hexToBytes(storedHashHex);
  if (derived.length !== stored.length) return false;
  let acc = 0;
  for (let i = 0; i < derived.length; i++) acc |= derived[i] ^ stored[i];
  return acc === 0;
}

// ─── STRIPE ───────────────────────────────────────────────────────────────────

// Verifica la firma de un webhook de Stripe usando HMAC-SHA256.
// Ref: https://stripe.com/docs/webhooks/signatures
async function verificarFirmaStripe(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const seg of sigHeader.split(',')) {
    const eq = seg.indexOf('=');
    if (eq > 0) parts[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim();
  }
  if (!parts.t || !parts.v1) return false;

  // Rechazar si el timestamp tiene más de 5 minutos de diferencia (anti-replay)
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(parts.t, 10)) > 300) return false;

  const key      = await importHmacKey(secret, 'sign');
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (parts.v1.length !== expected.length) return false;
  let acc = 0;
  for (let i = 0; i < expected.length; i++) acc |= parts.v1.charCodeAt(i) ^ expected.charCodeAt(i);
  return acc === 0;
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

const RATE_MAX    = 10;
const RATE_WINDOW = 900; // 15 minutos en segundos

async function checkRateLimit(ip, env) {
  const window = Math.floor(Date.now() / (RATE_WINDOW * 1000));
  const key    = `ratelimit:${ip}:${window}`;
  const raw    = await env.INVENTARIO.get(key);
  const count  = raw ? parseInt(raw, 10) : 0;
  if (count >= RATE_MAX) return false;
  await env.INVENTARIO.put(key, String(count + 1), { expirationTtl: RATE_WINDOW });
  return true;
}

// ─── RESEND (EMAIL) ───────────────────────────────────────────────────────────

async function enviarEmail(to, subject, html, env) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'EL GORILA <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });
    if (!res.ok) { const e = await res.text(); console.error('Resend:', res.status, e); return false; }
    return true;
  } catch (e) { console.error('Resend fetch:', e.message); return false; }
}

function htmlBoleto(venta, funcionNombre, tipos) {
  const items = Array.isArray(venta.items) ? venta.items : [];
  const generalItem     = items.find(i => i.tipo === 'general');
  const tieneEspeciales = items.some(i => i.tipo !== 'general');
  const promoGrupo      = !!(generalItem && generalItem.cantidad >= 5 && !tieneEspeciales);
  const subtotal = items.reduce((s, i) => s + (tipos[i.tipo]?.precio || 0) * i.cantidad, 0);
  const total    = venta.total || 0;
  const descuentoMonto = Math.max(0, subtotal - total);

  const verUrl = `https://elgorilateatro.com.mx/verificar.html?codigo=${encodeURIComponent(venta.codigo)}`;
  const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(verUrl)}&margin=8`;
  const waText = encodeURIComponent(
    `*EL GORILA — Boleto confirmado* 🎭\n` +
    `Función: ${funcionNombre}\n` +
    `Boletos: ${items.map(i => `${i.cantidad} ${tipos[i.tipo]?.nombre || i.tipo}`).join(', ')}\n` +
    `Total: $${total.toFixed(2)} MXN\n` +
    `Folio: ${venta.codigo}\n\n` +
    `📍 Centro Cultural Coyoacanense, Coyoacán`
  );
  const waUrl = `https://wa.me/?text=${waText}`;

  const itemsHtml = items.map(i => {
    const t = tipos[i.tipo] || { nombre: i.tipo, precio: 0 };
    const p = (promoGrupo && i.tipo === 'general') ? t.precio * 0.75 : t.precio;
    return `<tr><td style="color:#D4CFC3;font-size:14px;padding:3px 0;font-family:Arial,sans-serif;">${t.nombre} × ${i.cantidad}</td><td align="right" style="color:#D4CFC3;font-size:14px;padding:3px 0;font-family:Arial,sans-serif;">$${(p * i.cantidad).toFixed(2)}</td></tr>`;
  }).join('');

  const descuentoHtml = descuentoMonto > 0
    ? `<tr><td style="color:#4cd964;font-size:13px;padding:3px 0;font-family:Arial,sans-serif;">Descuento 25% (5+ generales)</td><td align="right" style="color:#4cd964;font-size:13px;padding:3px 0;font-family:Arial,sans-serif;">-$${descuentoMonto.toFixed(2)}</td></tr>`
    : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e0a07;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0e0a07;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#1a150e;border:1px solid rgba(212,175,55,0.25);border-radius:8px;">
<tr><td style="padding:36px 40px 28px;text-align:center;background:#130f0b;border-bottom:1px solid rgba(212,175,55,0.15);border-radius:8px 8px 0 0;">
  <img src="https://elgorilateatro.com.mx/img/LOGO/1.jpg" width="72" height="72" alt="EL GORILA" style="border-radius:50%;display:block;margin:0 auto 16px;border:2px solid rgba(212,175,55,0.4);">
  <h1 style="margin:0;color:#D4AF37;font-size:26px;letter-spacing:6px;font-weight:400;">EL GORILA</h1>
  <p style="margin:8px 0 0;color:rgba(212,175,55,0.5);font-size:10px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">Boleto de Entrada · Confirmado</p>
</td></tr>
<tr><td style="padding:28px 40px 0;">
  <p style="margin:0 0 4px;color:rgba(212,175,55,0.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Función</p>
  <p style="margin:0 0 20px;color:#EAE0D1;font-size:17px;">${funcionNombre}</p>
  <p style="margin:0 0 4px;color:rgba(212,175,55,0.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Venue</p>
  <p style="margin:0 0 4px;color:#EAE0D1;font-size:15px;">Centro Cultural Coyoacanense</p>
  <p style="margin:0 0 24px;color:rgba(212,175,55,0.6);font-size:13px;font-family:Arial,sans-serif;">Calle Felipe Carrillo Puerto 54, Coyoacán, CDMX</p>
  <hr style="border:none;border-top:1px solid rgba(212,175,55,0.12);margin:0 0 24px;">
</td></tr>
<tr><td style="padding:0 40px 24px;">
  <p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Resumen</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    ${itemsHtml}
    ${descuentoHtml}
    <tr><td colspan="2" style="padding-top:8px;border-top:1px solid rgba(212,175,55,0.15);"></td></tr>
    <tr><td style="color:#D4AF37;font-size:16px;font-weight:700;padding-top:6px;font-family:Arial,sans-serif;">Total</td><td align="right" style="color:#D4AF37;font-size:18px;font-weight:700;padding-top:6px;font-family:Arial,sans-serif;">$${total.toFixed(2)} MXN</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid rgba(212,175,55,0.12);margin:24px 0 0;">
</td></tr>
<tr><td style="padding:20px 40px;background:rgba(0,0,0,0.25);">
  <p style="margin:0 0 6px;color:rgba(212,175,55,0.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Folio</p>
  <p style="margin:0;color:#EAE0D1;font-family:'Courier New',monospace;font-size:13px;letter-spacing:1px;">${venta.codigo}</p>
</td></tr>
<tr><td style="padding:28px 40px;text-align:center;background:rgba(0,0,0,0.15);">
  <p style="margin:0 0 16px;color:rgba(212,175,55,0.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Código QR para acceso</p>
  <img src="${qrUrl}" width="160" height="160" alt="QR de acceso" style="display:block;margin:0 auto;background:#fff;padding:8px;border-radius:4px;">
  <p style="margin:12px 0 0;color:rgba(212,175,55,0.35);font-size:11px;font-family:Arial,sans-serif;">Presenta este código en taquilla</p>
</td></tr>
<tr><td style="padding:24px 40px;text-align:center;">
  <a href="${waUrl}" style="display:inline-block;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.4);color:#25d366;text-decoration:none;padding:14px 36px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;">💬 &nbsp;Guardar en WhatsApp</a>
</td></tr>
<tr><td style="padding:24px 40px;text-align:center;background:#130f0b;border-top:1px solid rgba(212,175,55,0.12);border-radius:0 0 8px 8px;">
  <p style="margin:0 0 6px;color:#D4AF37;font-size:15px;letter-spacing:3px;">EL GORILA</p>
  <p style="margin:0;color:rgba(212,175,55,0.4);font-size:11px;font-family:Arial,sans-serif;">elgorilateatro@gmail.com &nbsp;·&nbsp; elgorilateatro.com.mx</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function htmlAvisoAdmin(venta, funcionNombre, tipos) {
  const items   = Array.isArray(venta.items) ? venta.items : [];
  const resumen = items.map(i => `${i.cantidad}× ${tipos[i.tipo]?.nombre || i.tipo}`).join(', ') || `${venta.cantidad} boleto(s)`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #ddd;">
<tr><td>
  <h2 style="margin:0 0 24px;color:#8B0000;font-size:20px;">🎭 Nueva venta — EL GORILA</h2>
  <table width="100%" cellpadding="6" cellspacing="0" style="font-size:15px;color:#333;border-collapse:collapse;">
    <tr><td style="color:#666;width:140px;padding:8px 0;">Función</td><td style="padding:8px 0;"><strong>${funcionNombre}</strong></td></tr>
    <tr style="background:#fafafa;"><td style="color:#666;padding:8px 6px;">Comprador</td><td style="padding:8px 6px;">${venta.nombre ? `${venta.nombre} &lt;${venta.email}&gt;` : (venta.email || '—')}</td></tr>
    <tr><td style="color:#666;padding:8px 0;">Boletos</td><td style="padding:8px 0;">${resumen}</td></tr>
    <tr style="background:#fafafa;"><td style="color:#666;padding:8px 6px;">Total</td><td style="padding:8px 6px;"><strong>$${(venta.total || 0).toFixed(2)} MXN</strong></td></tr>
    <tr><td style="color:#666;padding:8px 0;">Folio</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${venta.codigo}</td></tr>
    <tr style="background:#fafafa;"><td style="color:#666;padding:8px 6px;">Fecha</td><td style="padding:8px 6px;">${new Date(venta.fechaCompra).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

function htmlAvisoListaEspera(entrada, funcionNombre) {
  const nombre1 = entrada.nombre.split(' ')[0];
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e0a07;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0e0a07;padding:40px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#1a150e;border:1px solid rgba(212,175,55,0.25);border-radius:8px;padding:48px 40px;text-align:center;">
<tr><td>
  <h1 style="color:#D4AF37;font-size:24px;letter-spacing:4px;font-weight:400;margin:0 0 8px;">EL GORILA</h1>
  <hr style="border:none;border-top:1px solid rgba(212,175,55,0.2);margin:20px 0;">
  <p style="color:#EAE0D1;font-size:20px;margin:0 0 8px;">Hay disponibilidad, ${nombre1}.</p>
  <p style="color:rgba(212,175,55,0.7);font-size:14px;margin:0 0 28px;font-family:Arial,sans-serif;">Quedaste en la lista de espera para <strong style="color:#D4AF37;">${funcionNombre}</strong>.<br>Acaba de liberarse un lugar.</p>
  <a href="https://elgorilateatro.com.mx/boletos.html" style="display:inline-block;background:#8B0000;border:1px solid rgba(212,175,55,0.5);color:#f5f0e8;text-decoration:none;padding:16px 44px;border-radius:6px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:1px;">Comprar boleto →</a>
  <p style="color:rgba(212,175,55,0.3);font-size:11px;margin:28px 0 0;font-family:Arial,sans-serif;">Esta disponibilidad es limitada y puede agotarse pronto.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function notificarPrimeroListaEspera(fecha, funcionNombre, env) {
  if (!env.VENTAS || !env.RESEND_API_KEY) return;
  let listResult;
  try { listResult = await env.VENTAS.list({ prefix: `lista:${fecha}:`, limit: 20 }); } catch { return; }
  if (!listResult.keys.length) return;

  // Keys son lista:{fecha}:{timestamp} — orden lexicográfico = cronológico (timestamps 13 dígitos)
  const primerKey = listResult.keys.sort((a, b) => a.name.localeCompare(b.name))[0].name;
  let raw;
  try { raw = await env.VENTAS.get(primerKey); } catch { return; }
  if (!raw) return;

  let entrada;
  try { entrada = JSON.parse(raw); } catch { return; }

  const enviado = await enviarEmail(
    entrada.email,
    `Hay disponibilidad — EL GORILA`,
    htmlAvisoListaEspera(entrada, funcionNombre),
    env
  );
  if (enviado) await env.VENTAS.delete(primerKey);
}

// ─── CONSTANTES DE NEGOCIO ────────────────────────────────────────────────────

const TIPOS_BOLETO = {
  general:    { precio: 350, nombre: 'General' },
  inapam:     { precio: 245, nombre: 'INAPAM' },
  estudiante: { precio: 245, nombre: 'Estudiante' },
  maestro:    { precio: 245, nombre: 'Maestro' },
};

const CAPACIDAD   = 200;       // boletos por función (capacidad total)
const RESERVA_TTL = 900;       // reserva temporal: 15 min
const TOKEN_TTL   = 8 * 60 * 60; // JWT: 8 horas

// ─── HANDLERS: AUTENTICACIÓN ──────────────────────────────────────────────────

async function handleLogin(request, env) {
  if (!env.JWT_SECRET) return json({ error: 'Configuración incompleta.' }, 500, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const { usuario, password } = body;
  if (!usuario || !password) return json({ error: 'Faltan usuario o contraseña.' }, 400, request);

  let usuarios;
  try {
    const raw = await env.INVENTARIO.get('sistema:usuarios');
    if (!raw) return json({ error: 'Sistema no inicializado.' }, 503, request);
    usuarios = JSON.parse(raw);
  } catch { return json({ error: 'Error interno.' }, 500, request); }

  const user = usuarios[usuario.trim()];
  const salt       = user?.salt ?? '00000000000000000000000000000000';
  const storedHash = user?.hash ?? '0'.repeat(64);
  const match      = await verifyPassword(password, salt, storedHash);

  if (!user || !user.activo || !match) return json({ error: 'Credenciales incorrectas.' }, 401, request);

  const now = Math.floor(Date.now() / 1000);
  const token = await signJWT(
    { usuario: user.id, nombre: user.nombre, rol: user.rol, iat: now, exp: now + TOKEN_TTL },
    env.JWT_SECRET,
  );
  return json({ token, usuario: user.id, nombre: user.nombre, rol: user.rol }, 200, request);
}

async function handleVerify(request, env) {
  if (!env.JWT_SECRET) return json({ valid: false }, 500, request);
  let body;
  try { body = await request.json(); } catch { return json({ valid: false }, 400, request); }
  const payload = body.token ? await verifyJWT(body.token, env.JWT_SECRET) : null;
  if (!payload) return json({ valid: false }, 200, request);
  return json({ valid: true, usuario: payload.usuario, nombre: payload.nombre, rol: payload.rol }, 200, request);
}

function handleLogout(request) {
  return json({ ok: true }, 200, request);
}

// ─── HANDLER: DISPONIBILIDAD ──────────────────────────────────────────────────

async function handleDisponibilidad(request, env) {
  const fecha = new URL(request.url).searchParams.get('fecha');
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Parámetro fecha inválido (YYYY-MM-DD).' }, 400, request);
  }
  const raw = await env.INVENTARIO.get(`funcion:${fecha}`);
  if (!raw) {
    return json({ fecha, total: CAPACIDAD, vendidos: 0, disponibles: CAPACIDAD, bloqueado: false }, 200, request);
  }
  const inv = JSON.parse(raw);
  const disponibles = Math.max(0, inv.total - inv.vendidos - (inv.reservados || 0));
  return json({ fecha, total: inv.total, vendidos: inv.vendidos, disponibles, bloqueado: inv.bloqueado || false }, 200, request);
}

// ─── HANDLER: CHECKOUT ────────────────────────────────────────────────────────

async function handleCheckout(request, env) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Pagos no configurados.' }, 503, request);

  // CF-Connecting-IP es inyectado por Cloudflare — no puede ser falsificado.
  // X-Forwarded-For es ignorado deliberadamente: es trivialmente manipulable.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(ip, env)) {
    return json({ error: 'Demasiadas solicitudes. Intenta en 15 minutos.' }, 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const { items, fecha } = body;

  // ── Validar items ─────────────────────────────────────────────────────────
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'El carrito está vacío.' }, 400, request);
  }

  let cantidadTotal = 0;
  const tiposVistos = new Set();
  const itemsValidados = [];

  for (const item of items) {
    const tipo     = typeof item.tipo === 'string' ? item.tipo.toLowerCase().trim() : '';
    const cantidad = item.cantidad;
    if (!TIPOS_BOLETO[tipo]) {
      return json({ error: `Tipo de boleto inválido: "${tipo}".` }, 400, request);
    }
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      return json({ error: 'Cantidad inválida en uno o más tipos.' }, 400, request);
    }
    if (tiposVistos.has(tipo)) {
      return json({ error: 'Tipo de boleto duplicado en el carrito.' }, 400, request);
    }
    tiposVistos.add(tipo);
    cantidadTotal += cantidad;
    itemsValidados.push({ tipo, cantidad });
  }

  if (cantidadTotal > 50) {
    return json({ error: 'El máximo es 50 boletos por compra.' }, 400, request);
  }

  // ── Validar fecha ─────────────────────────────────────────────────────────
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Fecha inválida.' }, 400, request);
  }

  const funcionesRaw = await env.INVENTARIO.get('funciones:activas');
  if (!funcionesRaw) return json({ error: 'No hay funciones activas. Contacta al administrador.' }, 503, request);

  let funciones, funcion;
  try {
    funciones = JSON.parse(funcionesRaw);
    funcion   = funciones.find(f => f.fecha_iso === fecha && f.activa !== false);
  } catch {
    return json({ error: 'Error al leer configuración. Intenta de nuevo.' }, 500, request);
  }
  if (!funcion) return json({ error: 'Fecha de función no válida.' }, 400, request);

  // ── Verificar disponibilidad ──────────────────────────────────────────────
  const invRaw = await env.INVENTARIO.get(`funcion:${fecha}`);
  let inv;
  try {
    inv = invRaw ? JSON.parse(invRaw) : { total: CAPACIDAD, vendidos: 0, reservados: 0, bloqueado: false };
  } catch {
    inv = { total: CAPACIDAD, vendidos: 0, reservados: 0, bloqueado: false };
  }

  if (inv.bloqueado) return json({ error: 'Ventas cerradas para esta función.' }, 409, request);

  const disponibles = inv.total - inv.vendidos - (inv.reservados || 0);
  if (disponibles < cantidadTotal) {
    return json({ error: `Solo quedan ${Math.max(0, disponibles)} boleto(s) disponibles.` }, 409, request);
  }

  // ── Promo grupo: 25% descuento en generales si ≥5 generales sin especiales ─
  const generalItem     = itemsValidados.find(i => i.tipo === 'general');
  const tieneEspeciales = itemsValidados.some(i => i.tipo !== 'general');
  const promoGrupo      = !!(generalItem && generalItem.cantidad >= 5 && !tieneEspeciales);

  // ── Reserva temporal (15 min) ─────────────────────────────────────────────
  const reservaId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  inv.reservados  = (inv.reservados || 0) + cantidadTotal;
  await env.INVENTARIO.put(`funcion:${fecha}`, JSON.stringify(inv));
  await env.INVENTARIO.put(
    `reserva:${reservaId}`,
    JSON.stringify({ fecha, cantidad: cantidadTotal }),
    { expirationTtl: RESERVA_TTL },
  );

  // ── Crear sesión Stripe con un line item por tipo ─────────────────────────
  const params = new URLSearchParams({
    mode:        'payment',
    success_url: 'https://elgorilateatro.com.mx/confirmacion.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:  'https://elgorilateatro.com.mx/boletos.html?cancelado=1',
    'metadata[fecha]':          fecha,
    'metadata[cantidad]':       String(cantidadTotal),
    'metadata[reservaId]':      reservaId,
    'metadata[items]':          JSON.stringify(itemsValidados),
    'metadata[funcionNombre]':  funcion.nombre,
    'metadata[promoGrupo]':     String(promoGrupo),
  });

  itemsValidados.forEach((item, idx) => {
    const tipo         = TIPOS_BOLETO[item.tipo];
    const unitCentavos = (promoGrupo && item.tipo === 'general')
      ? Math.round(tipo.precio * 0.75 * 100)
      : tipo.precio * 100;
    params.set(`line_items[${idx}][price_data][currency]`,                  'mxn');
    params.set(`line_items[${idx}][price_data][product_data][name]`,        `EL GORILA — ${tipo.nombre}${promoGrupo && item.tipo === 'general' ? ' (25% desc.)' : ''}`);
    params.set(`line_items[${idx}][price_data][product_data][description]`, funcion.nombre);
    params.set(`line_items[${idx}][price_data][unit_amount]`,               String(unitCentavos));
    params.set(`line_items[${idx}][quantity]`,                              String(item.cantidad));
  });

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(session.error?.message || 'Stripe error');
    return json({ url: session.url, sessionId: session.id }, 200, request);

  } catch (err) {
    // Rollback reserva
    inv.reservados = Math.max(0, inv.reservados - cantidadTotal);
    await env.INVENTARIO.put(`funcion:${fecha}`, JSON.stringify(inv));
    await env.INVENTARIO.delete(`reserva:${reservaId}`);
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

  // ── Sesión expirada: liberar reserva + notificar waitlist ─────────────────
  if (event.type === 'checkout.session.expired') {
    const fecha    = meta.fecha;
    const cantidad = parseInt(meta.cantidad, 10) || 0;
    if (fecha && cantidad) {
      const invRaw = await env.INVENTARIO.get(`funcion:${fecha}`);
      if (invRaw) {
        const inv  = JSON.parse(invRaw);
        inv.reservados = Math.max(0, (inv.reservados || 0) - cantidad);
        await env.INVENTARIO.put(`funcion:${fecha}`, JSON.stringify(inv));
      }
      if (meta.reservaId) await env.INVENTARIO.delete(`reserva:${meta.reservaId}`);
      const funcionNombre = meta.funcionNombre || fecha;
      ctx.waitUntil(notificarPrimeroListaEspera(fecha, funcionNombre, env));
    }
    return new Response('ok', { status: 200 });
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response('ok', { status: 200 });
  }

  const sessionId = session.id;

  // Idempotencia
  const existing = await env.VENTAS.get(`venta:${sessionId}`);
  if (existing) return new Response('ok', { status: 200 });

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

  const codigo = `CERT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const venta = {
    sessionId,
    codigo,
    fecha,
    funcionNombre,
    cantidad,
    items,
    email:       session.customer_details?.email || session.customer_email || null,
    nombre:      session.customer_details?.name  || null,
    total:       session.amount_total != null ? session.amount_total / 100 : 0,
    fechaCompra: new Date().toISOString(),
    estado:      'completada',
  };

  await env.VENTAS.put(`venta:${sessionId}`, JSON.stringify(venta));
  await env.VENTAS.put(`cert:${codigo}`,     JSON.stringify({ sessionId }));

  // Inventario: reservado → vendido
  const invRaw = await env.INVENTARIO.get(`funcion:${fecha}`);
  if (invRaw) {
    const inv  = JSON.parse(invRaw);
    inv.vendidos   = (inv.vendidos   || 0) + cantidad;
    inv.reservados = Math.max(0, (inv.reservados || 0) - cantidad);
    await env.INVENTARIO.put(`funcion:${fecha}`, JSON.stringify(inv));
  }
  if (reservaId) await env.INVENTARIO.delete(`reserva:${reservaId}`);

  // ── Emails fire-and-forget ────────────────────────────────────────────────
  const emailPromises = [
    enviarEmail('elgorilateatro@gmail.com', `[GORILA] Venta ${codigo}`, htmlAvisoAdmin(venta, funcionNombre, TIPOS_BOLETO), env),
  ];
  if (venta.email) {
    emailPromises.push(
      enviarEmail(venta.email, `Tu boleto — EL GORILA`, htmlBoleto(venta, funcionNombre, TIPOS_BOLETO), env)
    );
  }
  ctx.waitUntil(Promise.all(emailPromises));

  return new Response('ok', { status: 200 });
}

// ─── HANDLER: VENTA (confirmación) ────────────────────────────────────────────

async function handleVenta(id, request, env) {
  try {
    // Buscar por session_id (redirect de Stripe → confirmacion.html?session_id=...)
    let ventaRaw = await env.VENTAS.get(`venta:${id}`);

    // Buscar por código CERT si no se encontró por session_id
    if (!ventaRaw) {
      const certRaw = await env.VENTAS.get(`cert:${id}`);
      if (certRaw) {
        const { sessionId } = JSON.parse(certRaw);
        ventaRaw = await env.VENTAS.get(`venta:${sessionId}`);
      }
    }

    if (!ventaRaw) return json({ error: 'Venta no encontrada.' }, 404, request);

    const venta = JSON.parse(ventaRaw);

    // Devolver datos necesarios para mostrar confirmación. Sin datos de tarjeta.
    return json({
      sessionId:     venta.sessionId,
      codigo:        venta.codigo,
      numeroOrden:   venta.codigo,
      fecha:         venta.fecha,
      funcionNombre: venta.funcionNombre || venta.fecha,
      cantidad:      venta.cantidad,
      items:         venta.items || [],
      email:         venta.email,
      nombre:        venta.nombre  || null,
      total:         venta.total,
      fechaCompra:   venta.fechaCompra,
      estado:        venta.estado,
      usado:         venta.usado   || false,
      usadoEn:       venta.usadoEn || null,
    }, 200, request);
  } catch {
    return json({ error: 'Error al obtener la venta.' }, 500, request);
  }
}

// ─── ADMIN AUTH HELPERS ───────────────────────────────────────────────────────

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Still iterate to prevent length timing leak
    for (let i = 0; i < a.length; i++) { /* */ }
    return false;
  }
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
}

async function requireAdmin(request, env) {
  if (!env.JWT_SECRET) return null;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || payload.rol !== 'admin') return null;
  return payload;
}

// ─── HANDLER: ADMIN LOGIN (secrets) ───────────────────────────────────────────

async function handleAdminLogin(request, env) {
  if (!env.JWT_SECRET)   return json({ error: 'Configuración incompleta.' }, 500, request);
  if (!env.ADMIN_USER || !env.ADMIN_PASS)
    return json({ error: 'Cuentas admin no configuradas en el Worker.' }, 503, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const { usuario, password } = body || {};
  if (!usuario || !password) return json({ error: 'Faltan usuario o contraseña.' }, 400, request);

  const u = usuario.trim();
  let match = timingSafeEqual(u, env.ADMIN_USER) && timingSafeEqual(password, env.ADMIN_PASS);
  if (!match && env.ADMIN_USER_2 && env.ADMIN_PASS_2)
    match = timingSafeEqual(u, env.ADMIN_USER_2) && timingSafeEqual(password, env.ADMIN_PASS_2);

  if (!match) {
    await new Promise(r => setTimeout(r, 300)); // breve pausa anti-brute-force
    return json({ error: 'Credenciales incorrectas.' }, 401, request);
  }

  const now     = Math.floor(Date.now() / 1000);
  const TTL_30D = 30 * 24 * 60 * 60;
  const token   = await signJWT({ usuario: u, nombre: 'Admin', rol: 'admin', iat: now, exp: now + TTL_30D }, env.JWT_SECRET);
  return json({ token, usuario: u, nombre: 'Admin', rol: 'admin' }, 200, request);
}

// ─── HANDLER: CANJEAR BOLETO ──────────────────────────────────────────────────

async function handleCanjear(codigo, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!codigo || !codigo.startsWith('CERT-')) return json({ error: 'Código de folio inválido.' }, 400, request);

  const certRaw = await env.VENTAS.get(`cert:${codigo}`);
  if (!certRaw) return json({ error: 'Folio no encontrado.' }, 404, request);

  const { sessionId } = JSON.parse(certRaw);
  const ventaRaw = await env.VENTAS.get(`venta:${sessionId}`);
  if (!ventaRaw) return json({ error: 'Venta no encontrada.' }, 404, request);

  const venta = JSON.parse(ventaRaw);

  if (venta.usado) {
    const cuandoMX = new Date(venta.usadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    return json({ error: `Ya fue canjeado el ${cuandoMX}.`, usadoEn: venta.usadoEn }, 409, request);
  }

  venta.usado   = true;
  venta.usadoEn = new Date().toISOString();
  await env.VENTAS.put(`venta:${sessionId}`, JSON.stringify(venta));

  return json({ ok: true, usadoEn: venta.usadoEn }, 200, request);
}

// ─── HANDLER: LISTADO DE VENTAS (admin) ───────────────────────────────────────

async function handleVentas(request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);

  const listResult = await env.VENTAS.list({ prefix: 'venta:', limit: 100 });

  const ventas = [];
  for (const key of listResult.keys) {
    const raw = await env.VENTAS.get(key.name);
    if (!raw) continue;
    const v = JSON.parse(raw);
    ventas.push({
      codigo:        v.codigo,
      fecha:         v.fecha,
      funcionNombre: v.funcionNombre || v.fecha,
      cantidad:      v.cantidad,
      items:         v.items || [],
      email:         v.email,
      nombre:        v.nombre || null,
      total:         v.total,
      fechaCompra:   v.fechaCompra,
      usado:         v.usado   || false,
      usadoEn:       v.usadoEn || null,
    });
  }

  ventas.sort((a, b) => new Date(b.fechaCompra) - new Date(a.fechaCompra));
  return json({ ventas }, 200, request);
}

// ─── HANDLER: LISTA DE ESPERA ─────────────────────────────────────────────────

async function handleListaEspera(request, env) {
  if (!env.VENTAS) return json({ error: 'KV no disponible' }, 503, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400, request); }

  const { clave, fechaIso, nombre, email } = body || {};

  // Aceptar clave (frontend) o fechaIso; usar fechaIso como clave KV para coincidir con webhook
  const listaId = (fechaIso && /^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) ? fechaIso : clave;
  if (!listaId || typeof listaId !== 'string' || !/^[a-z0-9_-]+$/.test(listaId))
    return json({ error: 'Función inválida' }, 400, request);
  if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.trim().length > 100)
    return json({ error: 'Nombre inválido' }, 400, request);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: 'Correo inválido' }, 400, request);

  const key = `lista:${listaId}:${Date.now()}`;
  await env.VENTAS.put(key, JSON.stringify({
    clave:    clave   || listaId,
    fechaIso: fechaIso || null,
    nombre:   nombre.trim().substring(0, 100),
    email:    email.trim().substring(0, 254),
    ts:       new Date().toISOString(),
  }));

  return json({ ok: true }, 200, request);
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const { pathname } = new URL(request.url);
    const method       = request.method;

    // Webhook primero (necesita raw body, no parsear antes)
    if (method === 'POST' && pathname === '/api/webhook') {
      return handleWebhook(request, env, ctx);
    }

    if (method === 'GET' && pathname === '/api/health') {
      return json({ status: 'ok', version: '1.0' }, 200, request);
    }

    // Auth
    if (method === 'POST' && pathname === '/api/auth/login')  return handleLogin(request, env);
    if (method === 'POST' && pathname === '/api/auth/verify') return handleVerify(request, env);
    if (method === 'POST' && pathname === '/api/auth/logout') return handleLogout(request);

    // Checkout público
    if (method === 'GET'  && pathname === '/api/disponibilidad') return handleDisponibilidad(request, env);
    if (method === 'POST' && pathname === '/api/checkout')       return handleCheckout(request, env);
    if (method === 'POST' && pathname === '/api/lista-espera')   return handleListaEspera(request, env);

    // Admin auth (secrets — token 30 días en localStorage)
    if (method === 'POST' && pathname === '/api/admin/login')    return handleAdminLogin(request, env);

    // Admin: canjear folio y listado de ventas
    const canjearMatch = pathname.match(/^\/api\/canjear\/([^/]+)$/);
    if (method === 'POST' && canjearMatch)
      return handleCanjear(decodeURIComponent(canjearMatch[1]), request, env);
    if (method === 'GET'  && pathname === '/api/ventas')         return handleVentas(request, env);

    // Confirmación de venta (acepta session_id o código CERT)
    const ventaMatch = pathname.match(/^\/api\/venta\/([^/]+)$/);
    if (method === 'GET' && ventaMatch) {
      return handleVenta(decodeURIComponent(ventaMatch[1]), request, env);
    }

    return json({ error: 'not found' }, 404, request);
  },
};
