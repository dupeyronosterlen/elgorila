#!/usr/bin/env node
/**
 * Genera JSON de funciones activas por teatro para KV (INVENTARIO).
 *
 * Temporada oficial: miércoles 8 jul – 30 sep 2026 (último miércoles), 20:30.
 * - wilberto: fechas oficiales (gorila en la API es alias → mismo KV)
 * - ccc: sin funciones (canceladas; el teatro se conserva para futuras fechas)
 *
 * USO:
 *   node scripts/init-funciones.js wilberto > /tmp/wilberto-funciones.json
 *   npx wrangler kv key put "wilberto:funciones:activas" --binding INVENTARIO --path /tmp/wilberto-funciones.json
 *
 *   node scripts/init-funciones.js ccc > /tmp/ccc-funciones.json
 *   npx wrangler kv key put "ccc:funciones:activas" --binding INVENTARIO --path /tmp/ccc-funciones.json
 */

'use strict';

const FUNCIONES_OFICIALES = [
  { fecha_iso: '2026-07-08', nombre: 'Miércoles 8 Jul — 20:30 hrs',  activa: true, estreno: true },
  { fecha_iso: '2026-07-15', nombre: 'Miércoles 15 Jul — 20:30 hrs', activa: true },
  { fecha_iso: '2026-07-22', nombre: 'Miércoles 22 Jul — 20:30 hrs', activa: true },
  { fecha_iso: '2026-07-29', nombre: 'Miércoles 29 Jul — 20:30 hrs', activa: true },
  { fecha_iso: '2026-08-05', nombre: 'Miércoles 5 Ago — 20:30 hrs',  activa: true },
  { fecha_iso: '2026-08-12', nombre: 'Miércoles 12 Ago — 20:30 hrs', activa: true },
  { fecha_iso: '2026-08-19', nombre: 'Miércoles 19 Ago — 20:30 hrs', activa: true },
  { fecha_iso: '2026-08-26', nombre: 'Miércoles 26 Ago — 20:30 hrs', activa: true },
  { fecha_iso: '2026-09-02', nombre: 'Miércoles 2 Sep — 20:30 hrs',  activa: true },
  { fecha_iso: '2026-09-09', nombre: 'Miércoles 9 Sep — 20:30 hrs',  activa: true },
  { fecha_iso: '2026-09-16', nombre: 'Miércoles 16 Sep — 20:30 hrs', activa: true },
  { fecha_iso: '2026-09-23', nombre: 'Miércoles 23 Sep — 20:30 hrs', activa: true },
  { fecha_iso: '2026-09-30', nombre: 'Miércoles 30 Sep — 20:30 hrs', activa: true },
];

const POR_TEATRO = {
  wilberto: FUNCIONES_OFICIALES,
  ccc:      [],
};

const tid = (process.argv[2] || 'wilberto').toLowerCase();
if (!POR_TEATRO[tid]) {
  process.stderr.write(`Teatro desconocido: ${tid}. Usa: wilberto | gorila | ccc\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify(POR_TEATRO[tid], null, 2) + '\n');

if (tid === 'ccc') {
  process.stderr.write('\n✅ CCC: array vacío (sin funciones activas; teatro conservado).\n');
} else {
  process.stderr.write(`\n✅ ${tid}: ${POR_TEATRO[tid].length} funciones. Sube a KV con:\n`);
  process.stderr.write(`  npx wrangler kv key put "${tid}:funciones:activas" --binding INVENTARIO --path /tmp/${tid}-funciones.json\n\n`);
}
