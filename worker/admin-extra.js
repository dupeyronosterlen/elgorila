// Admin: usuarios KV, auditoría, sitio, reagendar, búsqueda ventas

export const PBKDF2_ITERATIONS = 100_000;

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPasswordPBKDF2(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc  = new TextEncoder();
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256,
  );
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}

export async function verifyPasswordPBKDF2(password, saltHex, hashHex) {
  try {
    const enc  = new TextEncoder();
    const salt = hexToBytes(saltHex);
    const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      key, 256,
    );
    return timingSafeEqual(bytesToHex(bits), hashHex);
  } catch { return false; }
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
}

const USUARIOS_KEY = 'sistema:usuarios';

export async function getUsuariosKV(env) {
  const raw = await env.INVENTARIO.get(USUARIOS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export async function saveUsuariosKV(env, usuarios) {
  await env.INVENTARIO.put(USUARIOS_KEY, JSON.stringify(usuarios));
}

export async function findKVUser(usuario, password, env) {
  const usuarios = await getUsuariosKV(env);
  const u        = usuarios[usuario];
  if (!u || u.activo === false) return null;
  if (!u.salt || !u.hash) return null;
  const ok = await verifyPasswordPBKDF2(password, u.salt, u.hash);
  if (!ok) return null;
  return u;
}

export async function registrarAuditoria(env, data) {
  const id  = `AUD-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const ts  = new Date().toISOString();
  const entry = {
    id,
    ts,
    usuarioId:  data.usuarioId  || data.usuario || '—',
    usuario:    data.usuario    || data.usuarioId || '—',
    rol:        data.rol        || '—',
    accion:     data.accion     || 'accion',
    detalles:   data.detalles   || '',
    teatroId:   data.teatroId   || null,
    meta:       data.meta       || null,
  };
  await env.INVENTARIO.put(`auditoria:${ts}:${id}`, JSON.stringify(entry));
  return entry;
}

export async function listAuditoria(env, { limite = 100, cursor } = {}) {
  const list = await env.INVENTARIO.list({
    prefix: 'auditoria:',
    limit:  limite,
    cursor: cursor || undefined,
  });
  const entries = (await Promise.all(list.keys.map(k => env.INVENTARIO.get(k.name))))
    .filter(Boolean)
    .map(r => JSON.parse(r));
  entries.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  return { entries, cursor: list.list_complete ? null : list.cursor };
}

const SITIO_KEY = 'sistema:sitio-config';

export async function getSitioConfig(env) {
  const raw = await env.INVENTARIO.get(SITIO_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export async function saveSitioConfig(env, config) {
  await env.INVENTARIO.put(SITIO_KEY, JSON.stringify(config));
}
