#!/usr/bin/env node
/**
 * Inicializa el usuario administrador raíz en KV (INVENTARIO → "sistema:usuarios").
 * Crea únicamente el usuario "osterlen" con rol "admin".
 *
 * Los demás usuarios (gerente, taquilla, acomodador, etc.) se crean desde
 * el panel de administración en runtime, una vez que osterlen haya iniciado sesión.
 *
 * Roles soportados por el sistema: admin, gerente, taquilla, acomodador
 *
 * IMPORTANTE:
 *  - La contraseña se pide de forma interactiva. NUNCA se guarda en código ni en git.
 *  - El JSON de salida contiene únicamente salt + hash PBKDF2. Sin texto plano.
 *  - Ejecutar UNA sola vez (o para resetear la contraseña de osterlen).
 *
 * Parámetros PBKDF2 — deben coincidir exactamente con worker/index.js:
 *   algoritmo  : SHA-256
 *   iteraciones: 100 000
 *   longitud   : 32 bytes (256 bits)
 *   salt       : 16 bytes aleatorios
 *
 * USO:
 *   1. node scripts/init-usuarios.js > /tmp/usuarios.json
 *   2. Revisar el JSON (sin contraseñas en texto plano).
 *   3. npx wrangler kv key put "sistema:usuarios" \
 *        --binding INVENTARIO \
 *        --path /tmp/usuarios.json
 *      (Agregar --preview para el namespace de desarrollo.)
 *   4. Borrar /tmp/usuarios.json.
 */

'use strict';

const crypto   = require('crypto');
const readline = require('readline');
const { promisify } = require('util');

const pbkdf2 = promisify(crypto.pbkdf2);

// ─── Parámetros PBKDF2 ────────────────────────────────────────────────────────
// MANTENER SINCRONIZADOS con worker/index.js → PBKDF2_ITERATIONS / PBKDF2_KEYLEN_BITS

const ITERATIONS = 100_000;
const KEYLEN     = 32;  // bytes (256 bits)
const SALTLEN    = 16;  // bytes

// ─── Utilidades ───────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const saltBytes = crypto.randomBytes(SALTLEN);
  const key = await pbkdf2(password, saltBytes, ITERATIONS, KEYLEN, 'sha256');
  return {
    salt: saltBytes.toString('hex'),
    hash: key.toString('hex'),
  };
}

// Prompt escribe en stderr → no contamina el JSON que va a stdout.
function createPrompter() {
  const rl = readline.createInterface({
    input:    process.stdin,
    output:   process.stderr,
    terminal: process.stderr.isTTY,
  });
  const ask   = (q) => new Promise((resolve) => rl.question(q, resolve));
  const close = () => rl.close();
  return { ask, close };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { ask, close } = createPrompter();

  process.stderr.write('\n╔══════════════════════════════════════════════════╗\n');
  process.stderr.write('║  INICIALIZACIÓN — USUARIO ADMINISTRADOR          ║\n');
  process.stderr.write('╚══════════════════════════════════════════════════╝\n');
  process.stderr.write('\nSe creará únicamente el usuario "osterlen" (admin).\n');
  process.stderr.write('Los demás usuarios se gestionan desde el panel admin en runtime.\n\n');
  process.stderr.write('La contraseña se deriva con PBKDF2 (SHA-256, 100k iter, salt aleatorio).\n');
  process.stderr.write('El texto plano NUNCA se almacena en ningún lugar.\n\n');

  const password = await ask('Contraseña para "osterlen" [rol: admin]: ');
  process.stderr.write('  Calculando hash...\n');

  const { salt, hash } = await hashPassword(password);

  close();

  const resultado = {
    osterlen: {
      id:            'osterlen',
      nombre:        'osterlen',
      rol:           'admin',
      salt,
      hash,
      activo:        true,
      fechaCreacion: new Date().toISOString(),
    },
  };

  // JSON limpio a stdout — redirigir a archivo.
  process.stdout.write(JSON.stringify(resultado, null, 2) + '\n');

  process.stderr.write('\n  ✓ osterlen (admin)\n');
  process.stderr.write('\n╔══════════════════════════════════════════════════╗\n');
  process.stderr.write('║  JSON generado. Siguiente paso:                  ║\n');
  process.stderr.write('╚══════════════════════════════════════════════════╝\n\n');
  process.stderr.write('  npx wrangler kv key put "sistema:usuarios" \\\n');
  process.stderr.write('    --binding INVENTARIO \\\n');
  process.stderr.write('    --path /tmp/usuarios.json\n\n');
  process.stderr.write('  (Agrega --preview para el namespace de desarrollo.)\n');
  process.stderr.write('  Después borra /tmp/usuarios.json.\n\n');
}

main().catch((err) => {
  process.stderr.write(`\n❌ Error: ${err.message}\n`);
  process.exit(1);
});
