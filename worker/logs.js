/**
 * Logs seguros + métricas agregadas (datos, no personas).
 * Cloudflare Workers Logs recibe JSON estructurado sin PII.
 * KV `metrica:dia:YYYY-MM-DD` acumula contadores por categoría.
 */

const EMAIL_RE   = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CARD_RE    = /\b(?:\d[ -]*?){13,19}\b/g;
const PHONE_RE   = /\+?\d[\d\s().-]{7,}\d/g;

function redactString(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(EMAIL_RE, '[email]')
    .replace(CARD_RE, '[card]')
    .replace(PHONE_RE, '[tel]')
    .slice(0, 500);
}

export function maskEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.indexOf('@');
  if (at < 1) return '[email]';
  const domain = email.slice(at + 1).toLowerCase();
  return `***@${domain}`;
}

export function truncateId(id, visible = 8) {
  if (!id || typeof id !== 'string') return null;
  if (id.length <= visible) return id;
  return `…${id.slice(-visible)}`;
}

function sanitizeValue(v) {
  if (v == null) return v;
  if (typeof v === 'string') return redactString(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (typeof v === 'object') return sanitizeObject(v);
  return v;
}

export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const skip = new Set([
    'email', 'nombre', 'telefono', 'password', 'token', 'secret',
    'customer_email', 'customer_details', 'rawBody', 'authorization',
  ]);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (skip.has(k)) continue;
    out[k] = sanitizeValue(v);
  }
  return out;
}

function emit(level, tag, meta = {}) {
  const line = JSON.stringify({
    level,
    tag,
    ts: new Date().toISOString(),
    ...sanitizeObject(meta),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logInfo(tag, meta)  { emit('info', tag, meta); }
export function logWarn(tag, meta)  { emit('warn', tag, meta); }
export function logError(tag, meta) { emit('error', tag, meta); }

function franjaHorariaMx(date = new Date()) {
  const h = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }).format(date),
    10,
  );
  if (h < 12) return 'manana';
  if (h < 18) return 'tarde';
  return 'noche';
}

function diaSemanaMx(date = new Date()) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long' }).format(date);
}

function diaContableMx(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

export function categorizarMetodoPago(metodo) {
  const m = String(metodo || 'card').toLowerCase();
  if (m.includes('oxxo')) return 'oxxo';
  if (m.includes('spei')) return 'spei';
  if (m.includes('cash') || m.includes('efectivo')) return 'efectivo';
  if (m.includes('card') || m.includes('link')) return 'tarjeta';
  return m.split(',')[0].trim() || 'otro';
}

function contarItems(items = []) {
  const tipos = {};
  const secciones = {};
  for (const item of items) {
    const t = item.tipo || 'general';
    const c = item.cantidad || 1;
    tipos[t] = (tipos[t] || 0) + c;
    const s = item.seccion || 'general';
    secciones[s] = (secciones[s] || 0) + c;
  }
  return { tipos, secciones };
}

export function metricaFromVenta({
  tid,
  venta = {},
  items,
  seccionCantidades,
  utm = {},
  metodoPago,
  codigoCupon,
  referidoDe,
  canal = 'web',
}) {
  const list = items || venta.items || [];
  const { tipos, secciones: secItems } = contarItems(list);
  const secciones = { ...secItems, ...(seccionCantidades || venta.seccionCantidades || {}) };
  for (const k of Object.keys(secciones)) {
    if (!secciones[k]) delete secciones[k];
  }

  const utmCat = {};
  for (const k of ['source', 'medium', 'campaign', 'content', 'term']) {
    const v = utm[k];
    if (v) utmCat[k] = String(v).slice(0, 80);
  }

  return {
    canal,
    teatroId: tid || venta.teatroId,
    fecha_funcion: venta.fecha,
    cantidad: venta.cantidad || list.reduce((s, i) => s + (i.cantidad || 1), 0),
    total_mxn: venta.total != null ? Number(venta.total) : 0,
    tipos,
    secciones,
    utm: utmCat,
    metodo_pago: categorizarMetodoPago(metodoPago || venta.metodoPago),
    cupon: codigoCupon || venta.codigoCupon ? String(codigoCupon || venta.codigoCupon).toUpperCase() : null,
    referido: referidoDe || venta.referidoDe ? 'invitacion' : null,
    hora_mx: franjaHorariaMx(),
    dia_semana: diaSemanaMx(),
  };
}

function bumpNested(target, key, delta) {
  if (!delta || typeof delta !== 'object') return;
  if (!target[key]) target[key] = {};
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === 'number') target[key][k] = (target[key][k] || 0) + v;
  }
}

function bumpScalar(target, key, delta) {
  if (typeof delta !== 'number') return;
  target[key] = Math.round(((target[key] || 0) + delta) * 100) / 100;
}

function emptyAgg() {
  return {
    ventas: 0,
    boletos: 0,
    ingresos_mxn: 0,
    tipos: {},
    secciones: {},
    metodos: {},
    utm_source: {},
    utm_medium: {},
    utm_campaign: {},
    cupones: {},
    teatros: {},
    canales: {},
    franjas: {},
    dias_semana: {},
  };
}

function mergeMetricaIntoAgg(agg, m) {
  agg.ventas += 1;
  agg.boletos += m.cantidad || 0;
  bumpScalar(agg, 'ingresos_mxn', m.total_mxn || 0);
  bumpNested(agg, 'tipos', m.tipos);
  bumpNested(agg, 'secciones', m.secciones);
  if (m.metodo_pago) {
    agg.metodos[m.metodo_pago] = (agg.metodos[m.metodo_pago] || 0) + 1;
  }
  if (m.teatroId) {
    agg.teatros[m.teatroId] = (agg.teatros[m.teatroId] || 0) + 1;
  }
  if (m.canal) {
    agg.canales[m.canal] = (agg.canales[m.canal] || 0) + 1;
  }
  if (m.hora_mx) {
    agg.franjas[m.hora_mx] = (agg.franjas[m.hora_mx] || 0) + 1;
  }
  if (m.dia_semana) {
    agg.dias_semana[m.dia_semana] = (agg.dias_semana[m.dia_semana] || 0) + 1;
  }
  if (m.utm?.source) {
    const k = m.utm.source.slice(0, 60);
    agg.utm_source[k] = (agg.utm_source[k] || 0) + 1;
  }
  if (m.utm?.medium) {
    const k = m.utm.medium.slice(0, 60);
    agg.utm_medium[k] = (agg.utm_medium[k] || 0) + 1;
  }
  if (m.utm?.campaign) {
    const k = m.utm.campaign.slice(0, 60);
    agg.utm_campaign[k] = (agg.utm_campaign[k] || 0) + 1;
  }
  if (m.cupon) {
    agg.cupones[m.cupon] = (agg.cupones[m.cupon] || 0) + 1;
  }
  if (m.referido) {
    agg.referidos = agg.referidos || {};
    agg.referidos[m.referido] = (agg.referidos[m.referido] || 0) + 1;
  }
}

export async function registrarMetricaVenta(env, metrica) {
  const dia = diaContableMx();
  const key = `metrica:dia:${dia}`;
  try {
    const raw = await env.INVENTARIO.get(key);
    const agg = raw ? JSON.parse(raw) : emptyAgg();
    mergeMetricaIntoAgg(agg, metrica);
    agg.actualizado = new Date().toISOString();
    await env.INVENTARIO.put(key, JSON.stringify(agg));
    logInfo('metrica.venta', metrica);
    return { ok: true, dia };
  } catch (e) {
    logError('metrica.venta', { error: e.message, teatroId: metrica.teatroId });
    return { ok: false, error: e.message };
  }
}

export async function registrarMetricaCheckout(env, metrica) {
  const dia = diaContableMx();
  const key = `metrica:checkout:${dia}`;
  try {
    const raw = await env.INVENTARIO.get(key);
    const agg = raw ? JSON.parse(raw) : { intentos: 0, boletos: 0, tipos: {}, secciones: {}, utm_source: {}, teatros: {} };
    agg.intentos += 1;
    agg.boletos += metrica.cantidad || 0;
    bumpNested(agg, 'tipos', metrica.tipos);
    bumpNested(agg, 'secciones', metrica.secciones);
    if (metrica.teatroId) agg.teatros[metrica.teatroId] = (agg.teatros[metrica.teatroId] || 0) + 1;
    if (metrica.utm?.source) {
      const k = metrica.utm.source.slice(0, 60);
      agg.utm_source[k] = (agg.utm_source[k] || 0) + 1;
    }
    agg.actualizado = new Date().toISOString();
    await env.INVENTARIO.put(key, JSON.stringify(agg));
    logInfo('metrica.checkout', metrica);
    return { ok: true, dia };
  } catch (e) {
    logError('metrica.checkout', { error: e.message, teatroId: metrica.teatroId });
    return { ok: false, error: e.message };
  }
}

export async function listMetricasDias(env, { dias = 30 } = {}) {
  const n = Math.min(90, Math.max(1, parseInt(dias, 10) || 30));
  const out = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(d);
    const [ventasRaw, checkoutRaw] = await Promise.all([
      env.INVENTARIO.get(`metrica:dia:${dia}`),
      env.INVENTARIO.get(`metrica:checkout:${dia}`),
    ]);
    if (ventasRaw || checkoutRaw) {
      out.push({
        dia,
        ventas: ventasRaw ? JSON.parse(ventasRaw) : null,
        checkout: checkoutRaw ? JSON.parse(checkoutRaw) : null,
      });
    }
  }
  return out;
}
