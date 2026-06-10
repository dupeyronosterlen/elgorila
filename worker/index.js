// ─── WORKER: EL GORILA — BOLETAJE MULTI-VENUE v3.0 ────────────────────────────
//
// KV SCHEMA (namespaces: VENTAS, INVENTARIO)
//
// INVENTARIO:
//   {tid}:config                   → JSON VenueConfig (nombre, venue, direccion, secciones[])
//   {tid}:funciones:activas        → JSON array FuncionConfig
//   {tid}:funcion:{YYYY-MM-DD}     → JSON InventarioFuncion (version, bloqueado, secciones:{})
//   {tid}:reserva:{reservaId}      → JSON { fecha, seccionCantidades } — TTL 900s
//   ratelimit:{ip}:{ventana}       → '1' — TTL 900s  ← GLOBAL, sin prefijo tid
//
// VENTAS:
//   {tid}:venta:{sessionId}        → JSON Venta
//   {tid}:cert:{codigo}            → JSON { sessionId }
//   {tid}:ventaIdx:{fecha}:{sid}   → sessionId
//   {tid}:lista:{fecha}:{ts}       → JSON entrada lista espera
//   {tid}:fiscal:reserva:acumulado → JSON { acumulado: number }
//
// COMPAT GORILA: ventas pre-v3 no tienen prefijo tid. handleVenta / handleCanjear
//                buscan primero con prefijo y como fallback sin prefijo (solo gorila).
// ──────────────────────────────────────────────────────────────────────────────

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

async function enviarEmail(to, subject, html, env) {
  if (!env.RESEND_API_KEY) { console.error('RESEND_API_KEY no configurada'); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'El Gorila Teatro <boletos@elgorilateatro.com.mx>', to, subject, html }),
    });
    if (!res.ok) { console.error('Resend error', res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error('enviarEmail exception:', e.message); return false; }
}

// ─── EMAIL: BOLETO PARA EL COMPRADOR ─────────────────────────────────────────

function htmlBoleto(venta, funcionNombre, config) {
  const multiSeccion = config.secciones && config.secciones.length > 1;

  const itemsHtml = (venta.items || []).map(item => {
    const tipoNombre = TIPOS_BOLETO[item.tipo]?.nombre || item.tipo;
    const secNombre  = (multiSeccion && item.seccion)
      ? ` · ${config.secciones.find(s => s.id === item.seccion)?.nombre || item.seccion}`
      : '';
    return `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${tipoNombre}${secNombre}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">${item.cantidad}</td>
    </tr>`;
  }).join('');

  const waText = encodeURIComponent(
    `¡Voy a ver EL GORILA — "${funcionNombre}"! 🎭 📍 ${config.venue}. ¿Me acompañas?`
  );
  const waUrl = `https://wa.me/?text=${waText}`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tu boleto — EL GORILA</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);">
  <tr><td style="background:#1a1a1a;padding:32px;text-align:center;">
    <h1 style="color:#e8c84a;font-size:28px;margin:0;letter-spacing:4px;">EL GORILA</h1>
    <p style="color:#aaa;font-size:13px;margin:8px 0 0;letter-spacing:2px;">BOLETO OFICIAL</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="font-size:20px;margin:0 0 4px;color:#1a1a1a;">${funcionNombre}</h2>
    <p style="color:#555;font-size:14px;margin:0 0 24px;">
      📍 ${config.venue}<br>
      <span style="font-size:12px;color:#888;">${config.direccion}</span>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:4px;margin-bottom:24px;">
      <tr style="background:#f9f9f9;">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;font-weight:normal;letter-spacing:1px;">TIPO</th>
        <th style="padding:8px 12px;text-align:center;font-size:12px;color:#888;font-weight:normal;letter-spacing:1px;">CANT.</th>
      </tr>
      ${itemsHtml}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="font-size:13px;color:#555;">Folio</td>
        <td style="font-size:13px;color:#1a1a1a;font-weight:bold;text-align:right;">${venta.codigo}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#555;padding-top:6px;">Total pagado</td>
        <td style="font-size:16px;color:#1a1a1a;font-weight:bold;text-align:right;padding-top:6px;">$${venta.total?.toFixed(2)} MXN</td>
      </tr>
    </table>
    <div style="background:#fffbea;border:1px solid #e8c84a;border-radius:6px;padding:16px;margin-bottom:24px;font-size:13px;color:#555;line-height:1.6;">
      <strong>¿Cómo ingresar?</strong><br>
      Presenta este folio en la entrada o muestra este correo. Tu folio es único — no lo compartas en redes.
    </div>
    <a href="${waUrl}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-family:sans-serif;">
      📱 Compartir por WhatsApp
    </a>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:16px;text-align:center;font-size:11px;color:#aaa;">
    ${config.venue} · ${config.direccion}
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ─── EMAIL: AVISO ADMIN ───────────────────────────────────────────────────────

function htmlAvisoAdmin(venta, funcionNombre, config) {
  const multiSeccion = config.secciones && config.secciones.length > 1;

  const itemsStr = (venta.items || []).map(item => {
    const tipoNombre = TIPOS_BOLETO[item.tipo]?.nombre || item.tipo;
    const secLabel   = (multiSeccion && item.seccion)
      ? ` [${config.secciones.find(s => s.id === item.seccion)?.nombre || item.seccion}]`
      : '';
    return `${tipoNombre}${secLabel}: ${item.cantidad}`;
  }).join(' · ');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Nueva venta — EL GORILA</title></head>
<body style="font-family:sans-serif;padding:24px;color:#222;">
<h2 style="color:#1a1a1a;">🎟 Nueva venta — ${config.nombre}</h2>
<table style="border-collapse:collapse;font-size:14px;">
  <tr><td style="padding:4px 12px 4px 0;color:#888;">TeatroId</td><td><strong>${config.id}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">Función</td><td><strong>${funcionNombre}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">Folio</td><td><strong>${venta.codigo}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">Boletos</td><td>${itemsStr || venta.cantidad}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">Total</td><td><strong>$${venta.total?.toFixed(2)} MXN</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">Email</td><td>${venta.email || '—'}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">Nombre</td><td>${venta.nombre || '—'}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">Compra</td><td>${venta.fechaCompra}</td></tr>
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

function kv(tid, key) { return `${tid}:${key}`; }

// ─── VENUES VÁLIDOS ───────────────────────────────────────────────────────────

const VALID_TEATROS = new Set(['gorila', 'wilberto', 'ccc']);

// ─── VENUE CONFIG ────────────────────────────────────────────────────────────

async function getVenueConfig(tid, env) {
  const raw = await env.INVENTARIO.get(kv(tid, 'config'));
  if (raw) {
    try { return JSON.parse(raw); } catch {}
  }
  // Fallback para gorila sin KV config (compat con datos pre-v3)
  return {
    id:        'gorila',
    nombre:    'El Gorila — CCC',
    venue:     'Centro Cultural Coyoacanense',
    direccion: 'Felipe Carrillo Puerto 54, Coyoacán, CDMX',
    secciones: [{ id: 'general', nombre: 'General', total: 200, precio_general: 350, precio_descuento: 245 }],
  };
}

// ─── NORMALIZAR INVENTARIO (compat flat → zone-based) ────────────────────────

function normalizeInventario(raw, config) {
  if (!raw) {
    const secciones = {};
    for (const s of config.secciones) {
      secciones[s.id] = { total: s.total, vendidos: 0, reservados: 0 };
    }
    return { version: 0, bloqueado: false, secciones };
  }
  const inv = JSON.parse(raw);
  if (inv.secciones) return inv; // ya formato nuevo
  // Formato legacy (gorila pre-v3): flat → sección 'general'
  return {
    version:  inv.version  ?? 0,
    bloqueado: inv.bloqueado || false,
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
const RESERVA_TTL       = 900; // segundos
const VENTA_404_MAX     = 40;  // máx. folios NO encontrados por IP / 15 min (anti-enumeración)

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

async function reservarOptimista(tid, fecha, seccionCantidades, env) {
  for (let intento = 0; intento < 3; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 50 + Math.random() * 150));

    const invRaw = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const inv    = normalizeInventario(invRaw, { secciones: [] });
    const version = inv.version ?? 0;

    if (inv.bloqueado) return { ok: false, status: 409, error: 'Ventas cerradas para esta función.' };

    // Verificar disponibilidad en cada sección solicitada
    for (const [secId, cant] of Object.entries(seccionCantidades)) {
      const sInv       = inv.secciones[secId] || { total: CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
      const disponibles = sInv.total - (sInv.vendidos || 0) - (sInv.reservados || 0);
      if (disponibles < cant) {
        const secLabel = secId.charAt(0).toUpperCase() + secId.slice(1);
        return { ok: false, status: 409, error: `Solo quedan ${Math.max(0, disponibles)} boleto(s) en ${secLabel}.` };
      }
    }

    // Incrementar reservados por sección
    const secciones = { ...inv.secciones };
    for (const [secId, cant] of Object.entries(seccionCantidades)) {
      const sInv = secciones[secId] || { total: CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
      secciones[secId] = { ...sInv, reservados: (sInv.reservados || 0) + cant };
    }
    const invNuevo = { ...inv, secciones, version: version + 1 };
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(invNuevo));

    const check    = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const checkInv = check ? JSON.parse(check) : {};
    if ((checkInv.version ?? -1) === version + 1) return { ok: true };
    // Conflicto de escritura — reintentar
  }
  return { ok: false, status: 503, error: 'Sistema concurrido. Intenta de nuevo en unos segundos.' };
}

async function liberarReservaOptimista(tid, fecha, seccionCantidades, env) {
  for (let intento = 0; intento < 3; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 50 + Math.random() * 150));

    const invRaw = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    if (!invRaw) return;
    const inv     = JSON.parse(invRaw);
    const version = inv.version ?? 0;

    const secciones = { ...inv.secciones };
    for (const [secId, cant] of Object.entries(seccionCantidades)) {
      const sInv = secciones[secId];
      if (sInv) secciones[secId] = { ...sInv, reservados: Math.max(0, (sInv.reservados || 0) - cant) };
    }
    const invNuevo = { ...inv, secciones, version: version + 1 };
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(invNuevo));

    const check    = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const checkInv = check ? JSON.parse(check) : {};
    if ((checkInv.version ?? -1) === version + 1) return;
  }
  console.error(`liberarReserva: conflicto persistente para ${tid}/${fecha}`);
}

async function confirmarVentaOptimista(tid, fecha, seccionCantidades, env) {
  for (let intento = 0; intento < 3; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 50 + Math.random() * 150));

    const invRaw  = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const inv     = normalizeInventario(invRaw, { secciones: [] });
    const version = inv.version ?? 0;

    const secciones = { ...inv.secciones };
    for (const [secId, cant] of Object.entries(seccionCantidades)) {
      const sInv = secciones[secId] || { total: CAPACIDAD_DEFAULT, vendidos: 0, reservados: 0 };
      secciones[secId] = {
        ...sInv,
        vendidos:   (sInv.vendidos   || 0) + cant,
        reservados: Math.max(0, (sInv.reservados || 0) - cant),
      };
    }
    const invNuevo = { ...inv, secciones, version: version + 1 };
    await env.INVENTARIO.put(kv(tid, `funcion:${fecha}`), JSON.stringify(invNuevo));

    const check    = await env.INVENTARIO.get(kv(tid, `funcion:${fecha}`));
    const checkInv = check ? JSON.parse(check) : {};
    if ((checkInv.version ?? -1) === version + 1) return;
  }
  console.error(`confirmarVenta: conflicto persistente para ${tid}/${fecha}`);
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

async function requireAdmin(request, env) {
  if (!env.JWT_SECRET) return null;
  const auth  = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || payload.rol !== 'admin') return null;
  return payload;
}

// ─── HANDLER: FUNCIONES ACTIVAS (público) ────────────────────────────────────

async function handleFunciones(tid, request, env) {
  const raw = await env.INVENTARIO.get(kv(tid, 'funciones:activas'));
  if (!raw) return json([], 200, request);
  try {
    const funciones = JSON.parse(raw).filter(f => f.activa !== false);
    return json(funciones, 200, request);
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
  const inv    = normalizeInventario(raw, config);

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

  return json({ fecha, secciones: seccionesDisp, bloqueado: inv.bloqueado || false }, 200, request);
}

// ─── HANDLER: CHECKOUT ────────────────────────────────────────────────────────

async function handleCheckout(tid, request, env) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Pagos no configurados.' }, 503, request);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(ip, env)) {
    return json({ error: 'Demasiadas solicitudes. Intenta en 15 minutos.' }, 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Cuerpo inválido.' }, 400, request); }

  const { items, fecha } = body;
  const utmClean = sanitizarUTM(body.utm);

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
    const seccion  = item.seccion || (config.secciones.length === 1 ? config.secciones[0].id : null);

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

  // Optimistic lock: reservar antes de llamar a Stripe
  const reserva = await reservarOptimista(tid, fecha, seccionCantidades, env);
  if (!reserva.ok) return json({ error: reserva.error }, reserva.status, request);

  // Promo grupo: 25% desc en general cuando ≥5 general y sin tipos especiales
  const cantidadGeneral = itemsValidados.filter(i => i.tipo === 'general').reduce((s, i) => s + i.cantidad, 0);
  const tieneEspeciales = itemsValidados.some(i => i.tipo !== 'general');
  const promoGrupo      = cantidadGeneral >= 5 && !tieneEspeciales;

  const reservaId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await env.INVENTARIO.put(
    kv(tid, `reserva:${reservaId}`),
    JSON.stringify({ fecha, seccionCantidades }),
    { expirationTtl: RESERVA_TTL },
  );

  const baseUrl = tid === 'gorila'
    ? 'https://elgorilateatro.com.mx'
    : `https://elgorilateatro.com.mx`;

  const params = new URLSearchParams({
    mode:        'payment',
    success_url: `${baseUrl}/confirmacion.html?session_id={CHECKOUT_SESSION_ID}&teatro=${tid}`,
    cancel_url:  `${baseUrl}/boletos.html?cancelado=1&teatro=${tid}`,
    'metadata[teatroId]':       tid,
    'metadata[fecha]':          fecha,
    'metadata[cantidad]':       String(cantidadTotal),
    'metadata[reservaId]':      reservaId,
    'metadata[seccionCants]':   JSON.stringify(seccionCantidades),
    'metadata[items]':          JSON.stringify(itemsValidados),
    'metadata[funcionNombre]':  funcion.nombre,
    'metadata[promoGrupo]':     String(promoGrupo),
  });

  // UTM como metadata de Stripe
  for (const k of Object.keys(utmClean)) {
    params.set(`metadata[utm_${k}]`, utmClean[k]);
  }

  // Line items con precio dinámico desde config
  itemsValidados.forEach((item, idx) => {
    const seccionConfig  = seccionMap[item.seccion];
    const precioBase     = getPrecio(item.tipo, seccionConfig);
    const unitCentavos   = (promoGrupo && item.tipo === 'general')
      ? Math.round(precioBase * 0.75 * 100)
      : precioBase * 100;
    const tipoNombre     = TIPOS_BOLETO[item.tipo]?.nombre || item.tipo;
    const secLabel       = config.secciones.length > 1 ? ` — ${seccionConfig.nombre}` : '';
    const promoLabel     = promoGrupo && item.tipo === 'general' ? ' (25% desc.)' : '';
    const productName    = `EL GORILA — ${tipoNombre}${secLabel}${promoLabel}`;

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
    return json({ url: session.url, sessionId: session.id }, 200, request);

  } catch (err) {
    await liberarReservaOptimista(tid, fecha, seccionCantidades, env);
    await env.INVENTARIO.delete(kv(tid, `reserva:${reservaId}`));
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

  // teatroId con fallback para ventas pre-v3
  const tid = meta.teatroId || 'gorila';

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
      await liberarReservaOptimista(tid, fecha, seccionCantidades, env);
      if (meta.reservaId) await env.INVENTARIO.delete(kv(tid, `reserva:${meta.reservaId}`));
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

  // Folio criptográficamente aleatorio (impredecible / no enumerable).
  const codigo = `CERT-${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;

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
    codigo,
    fecha,
    funcionNombre,
    cantidad,
    items,
    seccionCantidades,
    email:        session.customer_details?.email || session.customer_email || null,
    nombre:       session.customer_details?.name  || null,
    total:        session.amount_total != null ? session.amount_total / 100 : 0,
    fechaCompra:  new Date().toISOString(),
    estado:       'completada',
    utm,
    metodoPago,
  };

  await env.VENTAS.put(kv(tid, `venta:${sessionId}`),  JSON.stringify(venta));
  await env.VENTAS.put(kv(tid, `cert:${codigo}`),       JSON.stringify({ sessionId }));
  await env.VENTAS.put(kv(tid, `ventaIdx:${fecha}:${sessionId}`), sessionId);

  // Inventario: reservado → vendido
  await confirmarVentaOptimista(tid, fecha, seccionCantidades, env);
  if (reservaId) await env.INVENTARIO.delete(kv(tid, `reserva:${reservaId}`));

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

  // Emails
  const config = await getVenueConfig(tid, env);
  const emailPromises = [
    enviarEmail('elgorilateatro@gmail.com', `[GORILA] Venta ${codigo} — ${config.nombre}`, htmlAvisoAdmin(venta, funcionNombre, config), env),
  ];
  if (venta.email) {
    emailPromises.push(
      enviarEmail(venta.email, `Tu boleto — EL GORILA`, htmlBoleto(venta, funcionNombre, config), env)
    );
  }
  ctx.waitUntil(Promise.all(emailPromises));

  // Webhook de marketing (Make/CAPI) — sin PII
  if (env.MAKE_WEBHOOK_URL) {
    const payloadMkt = {
      evento:          'venta.completada',
      teatroId:        tid,
      codigo,
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
  // 2. Fallback legacy gorila (sin prefijo)
  if (!ventaRaw && tid === 'gorila') {
    ventaRaw = await env.VENTAS.get(`venta:${id}`);
    if (!ventaRaw) {
      const certRaw = await env.VENTAS.get(`cert:${id}`);
      if (certRaw) {
        const { sessionId } = JSON.parse(certRaw);
        ventaRaw = await env.VENTAS.get(`venta:${sessionId}`);
      }
    }
  }
  return ventaRaw;
}

// ─── HANDLER: VENTA PÚBLICA (sin email) ───────────────────────────────────────

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
    const ventaRaw = await _lookupVenta(tid, id, env);
    if (!ventaRaw) {
      await env.INVENTARIO.put(rl404Key, String(rl404 + 1), { expirationTtl: 900 });
      return json({ error: 'Venta no encontrada.' }, 404, request);
    }
    const v = JSON.parse(ventaRaw);
    // Respuesta pública: sin email, nombre ni sessionId del comprador
    return json({
      teatroId:      v.teatroId      || tid,
      codigo:        v.codigo,
      fecha:         v.fecha,
      funcionNombre: v.funcionNombre || v.fecha,
      cantidad:      v.cantidad,
      items:         v.items         || [],
      total:         v.total,
      fechaCompra:   v.fechaCompra,
      estado:        v.estado,
      usado:         v.usado         || false,
      usadoEn:       v.usadoEn       || null,
    }, 200, request);
  } catch { return json({ error: 'Error al obtener la venta.' }, 500, request); }
}

// ─── HANDLER: VENTA DETALLE ADMIN (con email) ─────────────────────────────────

async function handleAdminVentaDetail(tid, id, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);

  try {
    const ventaRaw = await _lookupVenta(tid, id, env);
    if (!ventaRaw) return json({ error: 'Venta no encontrada.' }, 404, request);
    const v = JSON.parse(ventaRaw);
    return json({
      teatroId:      v.teatroId      || tid,
      sessionId:     v.sessionId,
      codigo:        v.codigo,
      fecha:         v.fecha,
      funcionNombre: v.funcionNombre || v.fecha,
      cantidad:      v.cantidad,
      items:         v.items         || [],
      email:         v.email         || null,
      nombre:        v.nombre        || null,
      total:         v.total,
      fechaCompra:   v.fechaCompra,
      estado:        v.estado,
      usado:         v.usado         || false,
      usadoEn:       v.usadoEn       || null,
    }, 200, request);
  } catch { return json({ error: 'Error al obtener la venta.' }, 500, request); }
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

  const u     = usuario.trim();
  let match   = timingSafeEqual(u, env.ADMIN_USER) && timingSafeEqual(password, env.ADMIN_PASS);
  if (!match && env.ADMIN_USER_2 && env.ADMIN_PASS_2)
    match = timingSafeEqual(u, env.ADMIN_USER_2) && timingSafeEqual(password, env.ADMIN_PASS_2);

  if (!match) {
    await new Promise(r => setTimeout(r, 300));
    return json({ error: 'Credenciales incorrectas.' }, 401, request);
  }

  const now     = Math.floor(Date.now() / 1000);
  const TTL_30D = 30 * 24 * 60 * 60;
  const token   = await signJWT({ usuario: u, nombre: 'Admin', rol: 'admin', iat: now, exp: now + TTL_30D }, env.JWT_SECRET);
  return json({ token, usuario: u, nombre: 'Admin', rol: 'admin' }, 200, request);
}

// ─── HANDLER: CANJEAR BOLETO ──────────────────────────────────────────────────

async function handleCanjear(tid, codigo, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);
  if (!codigo || !codigo.startsWith('CERT-')) return json({ error: 'Código de folio inválido.' }, 400, request);

  // Buscar cert con prefijo
  let certRaw = await env.VENTAS.get(kv(tid, `cert:${codigo}`));
  let ventaKey;
  if (certRaw) {
    const { sessionId } = JSON.parse(certRaw);
    ventaKey = kv(tid, `venta:${sessionId}`);
  } else if (tid === 'gorila') {
    // Fallback legacy gorila
    certRaw = await env.VENTAS.get(`cert:${codigo}`);
    if (certRaw) {
      const { sessionId } = JSON.parse(certRaw);
      ventaKey = `venta:${sessionId}`;
    }
  }

  if (!certRaw) return json({ error: 'Folio no encontrado.' }, 404, request);

  const ventaRaw = await env.VENTAS.get(ventaKey);
  if (!ventaRaw) return json({ error: 'Venta no encontrada.' }, 404, request);

  const venta = JSON.parse(ventaRaw);

  if (venta.usado) {
    const cuandoMX = new Date(venta.usadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    return json({ error: `Ya fue canjeado el ${cuandoMX}.`, usadoEn: venta.usadoEn }, 409, request);
  }

  venta.usado   = true;
  venta.usadoEn = new Date().toISOString();
  await env.VENTAS.put(ventaKey, JSON.stringify(venta));

  return json({ ok: true, usadoEn: venta.usadoEn }, 200, request);
}

// ─── HANDLER: LISTADO DE VENTAS (admin) ───────────────────────────────────────

function _formatVenta(v) {
  return {
    teatroId:      v.teatroId      || 'gorila',
    codigo:        v.codigo,
    fecha:         v.fecha,
    funcionNombre: v.funcionNombre || v.fecha,
    cantidad:      v.cantidad,
    items:         v.items         || [],
    email:         v.email         || null,
    nombre:        v.nombre        || null,
    total:         v.total,
    fechaCompra:   v.fechaCompra,
    usado:         v.usado         || false,
    usadoEn:       v.usadoEn       || null,
  };
}

async function handleVentas(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);

  const url         = new URL(request.url);
  const fechaFiltro = url.searchParams.get('fecha') || '';
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

  ventas.sort((a, b) => new Date(b.fechaCompra) - new Date(a.fechaCompra));
  return json({ ventas, cursor: nextCursor || null }, 200, request);
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

  const raw    = await env.VENTAS.get(kv(tid, 'fiscal:reserva:acumulado'));
  const fiscal = raw ? JSON.parse(raw) : { acumulado: 0 };
  return json({ teatroId: tid, acumulado: fiscal.acumulado || 0 }, 200, request);
}

async function handleFiscalReset(tid, request, env) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: 'No autorizado.' }, 401, request);

  await env.VENTAS.put(kv(tid, 'fiscal:reserva:acumulado'), JSON.stringify({ acumulado: 0 }));
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

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const { pathname } = new URL(request.url);
    const method       = request.method;

    // Rutas globales (sin teatroId)
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

    // ── /api/admin/{tid}/... ───────────────────────────────────────────────────
    if (parts[1] === 'admin') {
      const tid = parts[2];
      if (!tid || !VALID_TEATROS.has(tid)) {
        return json({ error: 'Teatro inválido.' }, 404, request);
      }
      const sub = parts.slice(3).join('/');

      if (method === 'GET'  && sub === 'ventas')         return handleVentas(tid, request, env);
      if (method === 'GET'  && sub === 'fiscal')         return handleFiscalReserva(tid, request, env);
      if (method === 'POST' && sub === 'fiscal/reset')   return handleFiscalReset(tid, request, env);

      const ventaAdminMatch = sub.match(/^venta\/([^/]+)$/);
      if (method === 'GET' && ventaAdminMatch)
        return handleAdminVentaDetail(tid, decodeURIComponent(ventaAdminMatch[1]), request, env);

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
    if (method === 'POST' && sub === 'checkout')       return handleCheckout(tid, request, env);
    if (method === 'POST' && sub === 'lista-espera')   return handleListaEspera(tid, request, env);

    const ventaMatch = sub.match(/^venta\/([^/]+)$/);
    if (method === 'GET' && ventaMatch)
      return handleVenta(tid, decodeURIComponent(ventaMatch[1]), request, env);

    return json({ error: 'Not found.' }, 404, request);
  },
};
