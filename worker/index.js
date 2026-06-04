/**
 * EL GORILA — Cloudflare Worker API
 * Maneja autenticación JWT y endpoints de la boletera.
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
  const body = b64uEncodeStr(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const key = await importHmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return `${input}.${b64uEncode(sig)}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const input = `${header}.${body}`;
  const key = await importHmacKey(secret, 'verify');
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    b64uDecode(sig),
    new TextEncoder().encode(input),
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(body)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── CONTRASEÑAS (PBKDF2 + salt) ─────────────────────────────────────────────
// Mismos parámetros que scripts/init-usuarios.js. NO cambiar independientemente.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN_BITS = 256; // 32 bytes

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Verifica password contra salt+hash almacenados en KV.
// Usa comparación de bytes en tiempo constante para evitar timing attacks.
async function verifyPassword(password, saltHex, storedHashHex) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBytes(saltHex),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_KEYLEN_BITS,
  );
  const derived = new Uint8Array(derivedBits);
  const stored = hexToBytes(storedHashHex);
  if (derived.length !== stored.length) return false;
  let acc = 0;
  for (let i = 0; i < derived.length; i++) acc |= derived[i] ^ stored[i];
  return acc === 0;
}

const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 horas

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

async function handleLogin(request, env) {
  if (!env.JWT_SECRET) {
    return json({ error: 'Configuración incompleta en el servidor.' }, 500, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo de petición inválido.' }, 400, request);
  }

  const { usuario, password } = body;
  if (!usuario || !password) {
    return json({ error: 'Faltan usuario o contraseña.' }, 400, request);
  }

  // Leer tabla de usuarios desde KV (puesta por scripts/init-usuarios.js)
  let usuarios;
  try {
    const raw = await env.INVENTARIO.get('sistema:usuarios');
    if (!raw) {
      return json(
        { error: 'Sistema no inicializado. Ejecuta scripts/init-usuarios.js.' },
        503,
        request,
      );
    }
    usuarios = JSON.parse(raw);
  } catch {
    return json({ error: 'Error interno al leer usuarios.' }, 500, request);
  }

  const user = usuarios[usuario.trim()];

  // Siempre derivar aunque el usuario no exista → previene user-enumeration por timing.
  const salt = user?.salt ?? '00000000000000000000000000000000';
  const storedHash = user?.hash ?? '0'.repeat(64);
  const hashMatch = await verifyPassword(password, salt, storedHash);

  if (!user || !user.activo || !hashMatch) {
    return json({ error: 'Credenciales incorrectas.' }, 401, request);
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    usuario: user.id,
    nombre: user.nombre,
    rol: user.rol,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const token = await signJWT(payload, env.JWT_SECRET);
  return json({ token, usuario: user.id, nombre: user.nombre, rol: user.rol }, 200, request);
}

async function handleVerify(request, env) {
  if (!env.JWT_SECRET) {
    return json({ valid: false, error: 'Configuración incompleta.' }, 500, request);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ valid: false }, 400, request);
  }
  const { token } = body;
  if (!token) return json({ valid: false }, 200, request);

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return json({ valid: false }, 200, request);
  return json({ valid: true, usuario: payload.usuario, nombre: payload.nombre, rol: payload.rol }, 200, request);
}

function handleLogout(request) {
  return json({ ok: true }, 200, request);
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const { pathname } = new URL(request.url);
    const method = request.method;

    if (method === 'GET' && pathname === '/api/health') {
      return json({ status: 'ok', version: '1.0' }, 200, request);
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      return handleLogin(request, env);
    }

    if (method === 'POST' && pathname === '/api/auth/verify') {
      return handleVerify(request, env);
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      return handleLogout(request);
    }

    return json({ error: 'not found' }, 404, request);
  },
};
