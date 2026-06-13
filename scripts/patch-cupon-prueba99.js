#!/usr/bin/env node
/**
 * Añade o actualiza PRUEBA99 en KV codigos:descuento (sin borrar otros cupones).
 *
 * Uso:
 *   node scripts/patch-cupon-prueba99.js           # muestra JSON y comando
 *   node scripts/patch-cupon-prueba99.js --apply     # sube a KV remoto
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const KV_KEY = 'codigos:descuento';

const PRUEBA99 = {
  tipo:           'par_fijo',
  nombre:         'Prueba QA ($10)',
  total_mxn:      10,
  min_general:    1,
  solo_generales: true,
  activo:         true,
  max_usos:       100,
  expira:         '2026-07-31',
  solo_prueba:    true,
  agencia:        'Solo pruebas internas · 1 general = $10 · expira 31 jul 2026 · NO ads',
};

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function fetchKvJson() {
  try {
    const out = execSync(
      `npx wrangler kv key get "${KV_KEY}" --binding INVENTARIO --remote --preview false`,
      { cwd: repoRoot(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const trimmed = out.trim();
    if (!trimmed) return {};
    return JSON.parse(trimmed);
  } catch (e) {
    if (String(e.message || e).includes('404') || String(e.stderr || '').includes('404')) {
      return {};
    }
    throw e;
  }
}

function main() {
  const apply = process.argv.includes('--apply');
  let codigos = {};

  if (apply) {
    console.log('📥 Leyendo cupones actuales de KV…');
    codigos = fetchKvJson();
  } else {
    try {
      const initPath = path.join(__dirname, 'init-descuentos.js');
      const gen = execSync(`node "${initPath}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      codigos = JSON.parse(gen.trim());
      console.log('ℹ️  Modo preview: partió de init-descuentos.js (usa --apply para merge en KV remoto).\n');
    } catch {
      codigos = {};
    }
  }

  codigos.PRUEBA99 = PRUEBA99;

  const tmp = path.join(os.tmpdir(), 'elgorila-descuentos-patch.json');
  fs.writeFileSync(tmp, JSON.stringify(codigos, null, 2));

  console.log('✅ PRUEBA99 configurado:');
  console.log('   · 1 boleto general = $10 MXN (mínimo Stripe)');
  console.log('   · Código: prueba99 (mayúsculas/minúsculas da igual)');
  console.log('   · Expira: 31 jul 2026 · máx. 100 usos\n');

  if (!apply) {
    console.log('Para activar en producción:\n');
    console.log(`  node scripts/patch-cupon-prueba99.js --apply\n`);
    console.log('O subir catálogo completo:\n');
    console.log('  node scripts/init-descuentos.js 2>/dev/null > /tmp/descuentos.json');
    console.log(`  npx wrangler kv key put "${KV_KEY}" --binding INVENTARIO --path /tmp/descuentos.json --remote\n`);
    return;
  }

  console.log('📤 Subiendo a KV remoto…');
  execSync(
    `npx wrangler kv key put "${KV_KEY}" --binding INVENTARIO --path "${tmp}" --remote --preview false`,
    { cwd: repoRoot(), stdio: 'inherit' },
  );
  console.log('\n✅ Listo. Prueba en boletos.html: 1 general + cupón prueba99 → $10 MXN');
}

main();
