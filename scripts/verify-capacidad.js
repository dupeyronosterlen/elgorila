#!/usr/bin/env node
/**
 * Verifica que config KV y cada función activa respeten 325 butacas (250 platea + 75 galería).
 *
 * USO:
 *   node scripts/verify-capacidad.js
 *   node scripts/verify-capacidad.js --api https://elgorila-api.dupeyronosterlen.workers.dev
 */

'use strict';

const API = (() => {
  const i = process.argv.indexOf('--api');
  return (i >= 0 && process.argv[i + 1]) || 'https://elgorila-api.dupeyronosterlen.workers.dev';
})();

const ESPERADO = { platea: 250, galeria: 75, total: 325 };

const ok   = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const fail = (m) => { console.log(`  ❌ ${m}`); process.exitCode = 1; };

async function get(path) {
  const res = await fetch(`${API}${path}`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function main() {
  console.log('\n🎭 Capacidad Teatro Wilberto Cantón');
  console.log(`   API: ${API}`);
  console.log(`   Esperado: ${ESPERADO.platea} platea + ${ESPERADO.galeria} galería = ${ESPERADO.total} total\n`);

  const { res, body: funciones } = await get('/api/wilberto/funciones');
  if (!res.ok || !Array.isArray(funciones)) {
    fail('No se pudo leer funciones');
    return;
  }

  const activas = funciones.filter(f => f.activa !== false);
  ok(`${activas.length} funciones activas en venta`);

  for (const f of activas) {
    const secs = f.secciones || {};
    const pTot = secs.platea?.total ?? '?';
    const gTot = secs.galeria?.total ?? '?';
    const cap  = f.capacidad ?? '?';
    const vend = f.vendidos ?? 0;
    const disp = f.disponibles ?? '?';
    const pDisp = secs.platea?.disponibles ?? '?';

    const line = `${f.fecha_iso} · cap ${cap} · vend ${vend} · disp ${disp} · platea ${pTot}/${pDisp}`;

    if (Number(cap) !== ESPERADO.total) {
      fail(`${line} — capacidad API ≠ ${ESPERADO.total}`);
    } else if (Number(pTot) !== ESPERADO.platea || Number(gTot) !== ESPERADO.galeria) {
      warn(`${line} — sección con total distinto (Worker corrige al leer si está desplegado)`);
    } else if (Number(vend) + Number(pDisp) + Number(secs.platea?.reservados || 0) > ESPERADO.platea) {
      warn(`${line} — revisar consistencia platea`);
    } else {
      ok(line);
    }
  }

  console.log('\n📋 Reglas del sistema (no se pueden vender más de 325 por función):');
  console.log('   · Checkout y boletera consultan inventario KV antes de cobrar');
  console.log('   · Galería solo abre cuando platea = 0');
  console.log('   · Máx. 50 boletos por compra en línea');
  console.log('   · Certificado CERT-ORD-… se emite solo tras pago confirmado (webhook Stripe)\n');
}

main().catch(e => { console.error(e); process.exit(1); });
