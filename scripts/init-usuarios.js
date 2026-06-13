#!/usr/bin/env node
/**
 * Inicializa un usuario administrador en KV (INVENTARIO → "sistema:usuarios").
 *
 * Los demás usuarios se crean desde el panel admin en runtime.
 *
 * IMPORTANTE:
 *  - La contraseña se pide de forma interactiva. NUNCA se guarda en código ni en git.
 *  - El JSON de salida contiene únicamente salt + hash PBKDF2.
 *
 * USO:
 *   node scripts/init-usuarios.js > /tmp/usuarios.json
 *   npx wrangler kv key put "sistema:usuarios" --binding INVENTARIO --path /tmp/usuarios.json --preview false --remote
 *   rm /tmp/usuarios.json
 */

'use strict';

const crypto   = require('crypto');
const readline = require('readline');
const { promisify } = require('util');

const pbkdf2 = promisify(crypto.pbkdf2);

const ITERATIONS = 100_000;
const KEYLEN     = 32;
const SALTLEN    = 16;

async function hashPassword(password) {
  const saltBytes = crypto.randomBytes(SALTLEN);
  const key = await pbkdf2(password, saltBytes, ITERATIONS, KEYLEN, 'sha256');
  return {
    salt: saltBytes.toString('hex'),
    hash: key.toString('hex'),
  };
}

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

function normalizarId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
}

async function main() {
  const { ask, close } = createPrompter();

  process.stderr.write('\nInicialización de usuario admin (PBKDF2, sin texto plano en disco).\n\n');

  const idRaw = await ask('ID de usuario (ej. admin): ');
  const id = normalizarId(idRaw);
  if (!id || id.length < 3) {
    close();
    throw new Error('ID de usuario inválido (mínimo 3 caracteres alfanuméricos).');
  }

  const nombre = (await ask(`Nombre visible [${id}]: `)).trim() || id;
  const password = await ask(`Contraseña para "${id}" [rol: admin]: `);
  if (!password || password.length < 8) {
    close();
    throw new Error('Contraseña demasiado corta (mínimo 8 caracteres).');
  }

  process.stderr.write('  Calculando hash...\n');
  const { salt, hash } = await hashPassword(password);
  close();

  const resultado = {
    [id]: {
      id,
      nombre,
      rol:           'admin',
      salt,
      hash,
      activo:        true,
      fechaCreacion: new Date().toISOString(),
    },
  };

  process.stdout.write(JSON.stringify(resultado, null, 2) + '\n');
  process.stderr.write(`\n  ✓ ${id} (admin)\n`);
  process.stderr.write('\nSube el JSON a KV con wrangler kv key put "sistema:usuarios" …\n\n');
}

main().catch((err) => {
  process.stderr.write(`\n❌ Error: ${err.message}\n`);
  process.exit(1);
});
