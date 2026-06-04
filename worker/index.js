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

// ─── CONSTANTES DE NEGOCIO ────────────────────────────────────────────────────

const PRECIO_BASE    = 350;  // MXN all-in (8% impuesto absorbido)
const CAPACIDAD      = 200;  // boletos por función
const RESERVA_TTL    = 900;  // 15 min en segundos
const TOKEN_TTL      = 8 * 60 * 60; // 8 horas

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

  // Rate limiting por IP
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0].trim()
    || 'unknown';
  if (!await checkRateLimit(ip, env)) {
    return json({ error: 'Demasiadas solicitudes. Intenta en 15 minutos.' }, 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const { cantidad, fecha, codigoDescuento } = body;

  // Validar cantidad
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 8) {
    return json({ error: 'Cantidad inválida (1–8 boletos).' }, 400, request);
  }

  // Validar formato de fecha
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json({ error: 'Fecha inválida.' }, 400, request);
  }

  // Validar fecha contra funciones:activas en KV
  const funcionesRaw = await env.INVENTARIO.get('funciones:activas');
  if (!funcionesRaw) return json({ error: 'No hay funciones activas. Contacta al administrador.' }, 503, request);

  const funciones = JSON.parse(funcionesRaw);
  const funcion   = funciones.find(f => f.fecha_iso === fecha && f.activa !== false);
  if (!funcion) return json({ error: 'Fecha de función no válida.' }, 400, request);

  // Validar código de descuento (server-side, nunca en el frontend)
  let descuentoPct = 0;
  if (codigoDescuento) {
    const codigosRaw = await env.INVENTARIO.get('codigos:descuento');
    if (codigosRaw) {
      const entry = JSON.parse(codigosRaw)[codigoDescuento.trim().toUpperCase()];
      if (entry && entry.activo !== false) descuentoPct = entry.porcentaje || 0;
    }
    // Código inválido → silenciosamente sin descuento (no revelar cuáles existen)
  }

  // Precio calculado SIEMPRE en el Worker
  const subtotal  = PRECIO_BASE * cantidad;
  const descuento = Math.round(subtotal * descuentoPct / 100);
  const total     = subtotal - descuento;
  const centavos  = total * 100;

  // Leer inventario y verificar disponibilidad
  const invRaw = await env.INVENTARIO.get(`funcion:${fecha}`);
  const inv    = invRaw ? JSON.parse(invRaw) : { total: CAPACIDAD, vendidos: 0, reservados: 0, bloqueado: false };

  if (inv.bloqueado) return json({ error: 'Ventas cerradas para esta función.' }, 409, request);

  const disponibles = inv.total - inv.vendidos - (inv.reservados || 0);
  if (disponibles < cantidad) {
    return json({ error: `Solo quedan ${Math.max(0, disponibles)} boleto(s) disponibles.` }, 409, request);
  }

  // Reservar temporalmente (15 min)
  const reservaId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  inv.reservados  = (inv.reservados || 0) + cantidad;
  await env.INVENTARIO.put(`funcion:${fecha}`, JSON.stringify(inv));
  await env.INVENTARIO.put(`reserva:${reservaId}`, JSON.stringify({ fecha, cantidad }), { expirationTtl: RESERVA_TTL });

  // Crear sesión Stripe (REST directo — sin SDK, sin dependencias externas)
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]':                        'mxn',
    'line_items[0][price_data][product_data][name]':              `EL GORILA — ${funcion.nombre}`,
    'line_items[0][price_data][product_data][description]':       `${cantidad} boleto${cantidad !== 1 ? 's' : ''}`,
    'line_items[0][price_data][unit_amount]':                     String(centavos),
    'line_items[0][quantity]':                                    '1',
    success_url: 'https://elgorilateatro.com.mx/confirmacion.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:  'https://elgorilateatro.com.mx/boletos.html?cancelado=1',
    'metadata[fecha]':            fecha,
    'metadata[cantidad]':         String(cantidad),
    'metadata[reservaId]':        reservaId,
    'metadata[codigoDescuento]':  codigoDescuento ? codigoDescuento.trim().toUpperCase() : '',
    'metadata[descuento]':        String(descuento),
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
    inv.reservados = Math.max(0, inv.reservados - cantidad);
    await env.INVENTARIO.put(`funcion:${fecha}`, JSON.stringify(inv));
    await env.INVENTARIO.delete(`reserva:${reservaId}`);
    console.error('Stripe checkout error:', err.message);
    return json({ error: 'Error al crear sesión de pago. Intenta de nuevo.' }, 500, request);
  }
}

// ─── HANDLER: WEBHOOK STRIPE ──────────────────────────────────────────────────

async function handleWebhook(request, env) {
  // Leer raw body ANTES de cualquier parse (requerido para verificar firma)
  const rawBody = await request.text();
  const sig     = request.headers.get('stripe-signature') || '';

  const firmaValida = await verificarFirmaStripe(rawBody, sig, env.STRIPE_WEBHOOK_SECRET || '');
  if (!firmaValida) {
    return new Response('Webhook signature invalid', { status: 400 });
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return new Response('Invalid JSON', { status: 400 }); }

  // Solo procesar pagos completados
  if (event.type !== 'checkout.session.completed') {
    return new Response('ok', { status: 200 });
  }

  const session   = event.data.object;
  const sessionId = session.id;

  // Idempotencia: rechazar si ya fue procesado
  const existing = await env.VENTAS.get(`venta:${sessionId}`);
  if (existing) return new Response('ok', { status: 200 });

  const meta      = session.metadata || {};
  const fecha     = meta.fecha;
  const cantidad  = parseInt(meta.cantidad, 10);
  const reservaId = meta.reservaId;
  const descuento = parseInt(meta.descuento, 10) || 0;

  if (!fecha || !cantidad) {
    console.error('Webhook: metadata incompleta en sesión', sessionId);
    return new Response('ok', { status: 200 });
  }

  // Código único de confirmación
  const codigo = `CERT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const venta = {
    sessionId,
    codigo,
    fecha,
    cantidad,
    email: session.customer_details?.email || session.customer_email || null,
    total: session.amount_total != null ? session.amount_total / 100 : 0,
    codigoDescuento: meta.codigoDescuento || null,
    descuento,
    fechaCompra: new Date().toISOString(),
    estado: 'completada',
  };

  // Guardar en VENTAS KV (doble índice: por session_id y por código CERT)
  await env.VENTAS.put(`venta:${sessionId}`, JSON.stringify(venta));
  await env.VENTAS.put(`cert:${codigo}`,     JSON.stringify({ sessionId }));

  // Actualizar inventario: reservado → vendido
  const invRaw = await env.INVENTARIO.get(`funcion:${fecha}`);
  if (invRaw) {
    const inv   = JSON.parse(invRaw);
    inv.vendidos   = (inv.vendidos   || 0) + cantidad;
    inv.reservados = Math.max(0, (inv.reservados || 0) - cantidad);
    await env.INVENTARIO.put(`funcion:${fecha}`, JSON.stringify(inv));
  }

  if (reservaId) await env.INVENTARIO.delete(`reserva:${reservaId}`);

  return new Response('ok', { status: 200 });
}

// ─── HANDLER: VENTA (confirmación) ────────────────────────────────────────────

async function handleVenta(id, request, env) {
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
    sessionId:       venta.sessionId,
    codigo:          venta.codigo,
    numeroOrden:     venta.codigo,   // alias para compatibilidad con confirmacion.js
    fecha:           venta.fecha,
    cantidad:        venta.cantidad,
    email:           venta.email,
    total:           venta.total,
    codigoDescuento: venta.codigoDescuento || null,
    descuento:       venta.descuento || 0,
    fechaCompra:     venta.fechaCompra,
    estado:          venta.estado,
  }, 200, request);
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
      return handleWebhook(request, env);
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

    // Confirmación de venta (acepta session_id o código CERT)
    const ventaMatch = pathname.match(/^\/api\/venta\/([^/]+)$/);
    if (method === 'GET' && ventaMatch) {
      return handleVenta(decodeURIComponent(ventaMatch[1]), request, env);
    }

    return json({ error: 'not found' }, 404, request);
  },
};
