#!/usr/bin/env node
/**
 * Genera JSON de funciones por teatro para KV (INVENTARIO).
 *
 * Temporada 2026 Wilberto:
 * - 12 sábados 18:00 en venta (estreno 11 jul – cierre 26 sep)
 * - 1 sábado 4 jul oculto (activable desde admin)
 * - 13 miércoles 20:30 ocultos (activables desde admin)
 *
 * USO:
 *   node scripts/init-funciones.js wilberto > /tmp/wilberto-funciones.json
 *   npx wrangler kv key put "wilberto:funciones:activas" --binding INVENTARIO --path /tmp/wilberto-funciones.json
 */

'use strict';

const MIERCOLES_2026 = [
  { fecha_iso: '2026-07-08', nombre: 'Miércoles 8 Jul — 20:30 hrs',  activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-07-15', nombre: 'Miércoles 15 Jul — 20:30 hrs', activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-07-22', nombre: 'Miércoles 22 Jul — 20:30 hrs', activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-07-29', nombre: 'Miércoles 29 Jul — 20:30 hrs', activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-08-05', nombre: 'Miércoles 5 Ago — 20:30 hrs',  activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-08-12', nombre: 'Miércoles 12 Ago — 20:30 hrs', activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-08-19', nombre: 'Miércoles 19 Ago — 20:30 hrs', activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-08-26', nombre: 'Miércoles 26 Ago — 20:30 hrs', activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-09-02', nombre: 'Miércoles 2 Sep — 20:30 hrs',  activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-09-09', nombre: 'Miércoles 9 Sep — 20:30 hrs',  activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-09-16', nombre: 'Miércoles 16 Sep — 20:30 hrs', activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-09-23', nombre: 'Miércoles 23 Sep — 20:30 hrs', activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-09-30', nombre: 'Miércoles 30 Sep — 20:30 hrs', activa: false, numero_obra: 1300 },
];

const SABADOS_2026 = [
  { fecha_iso: '2026-07-04', nombre: 'Sábado 4 Jul — 18:00 hrs',  activa: false, numero_obra: 1300 },
  { fecha_iso: '2026-07-11', nombre: 'Sábado 11 Jul — 18:00 hrs', activa: true,  estreno: true, numero_obra: 1300 },
  { fecha_iso: '2026-07-18', nombre: 'Sábado 18 Jul — 18:00 hrs', activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-07-25', nombre: 'Sábado 25 Jul — 18:00 hrs', activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-08-01', nombre: 'Sábado 1 Ago — 18:00 hrs',  activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-08-08', nombre: 'Sábado 8 Ago — 18:00 hrs',  activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-08-15', nombre: 'Sábado 15 Ago — 18:00 hrs', activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-08-22', nombre: 'Sábado 22 Ago — 18:00 hrs', activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-08-29', nombre: 'Sábado 29 Ago — 18:00 hrs', activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-09-05', nombre: 'Sábado 5 Sep — 18:00 hrs',  activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-09-12', nombre: 'Sábado 12 Sep — 18:00 hrs', activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-09-19', nombre: 'Sábado 19 Sep — 18:00 hrs', activa: true,  numero_obra: 1300 },
  { fecha_iso: '2026-09-26', nombre: 'Sábado 26 Sep — 18:00 hrs', activa: true,  numero_obra: 1300 },
];

const FUNCIONES_OFICIALES = [...MIERCOLES_2026, ...SABADOS_2026]
  .sort((a, b) => a.fecha_iso.localeCompare(b.fecha_iso));

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
  const enVenta = POR_TEATRO[tid].filter(f => f.activa !== false).length;
  process.stderr.write(`\n✅ ${tid}: ${POR_TEATRO[tid].length} funciones (${enVenta} en venta). Sube a KV con:\n`);
  process.stderr.write(`  npx wrangler kv key put "${tid}:funciones:activas" --binding INVENTARIO --path /tmp/${tid}-funciones.json\n\n`);
}
