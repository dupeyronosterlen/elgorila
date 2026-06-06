#!/usr/bin/env node
/**
 * Genera el JSON de funciones activas para subirlo a KV.
 * Clave en INVENTARIO KV: "funciones:activas"
 *
 * USO:
 *   node scripts/init-funciones.js > /tmp/funciones.json
 *   npx wrangler kv key put "funciones:activas" \
 *     --binding INVENTARIO \
 *     --path /tmp/funciones.json
 *   rm /tmp/funciones.json
 *
 * Para desarrollo (namespace preview):
 *   npx wrangler kv key put "funciones:activas" \
 *     --binding INVENTARIO --preview \
 *     --path /tmp/funciones.json
 *
 * Para desactivar una función sin borrarla: cambiar activa a false y volver a subir.
 */

'use strict';

const funciones = [
  { fecha_iso: '2026-06-10', nombre: 'Miércoles 10 Jun — 20:30 hrs', activa: true },
  { fecha_iso: '2026-06-17', nombre: 'Miércoles 17 Jun — 20:30 hrs', activa: true },
  { fecha_iso: '2026-06-24', nombre: 'Miércoles 24 Jun — 20:30 hrs', activa: true },
  { fecha_iso: '2026-07-01', nombre: 'Miércoles 1 Jul — 20:30 hrs',  activa: true },
  { fecha_iso: '2026-07-08', nombre: 'Miércoles 8 Jul — 20:30 hrs',  activa: true },
  { fecha_iso: '2026-07-15', nombre: 'Miércoles 15 Jul — 20:30 hrs', activa: true },
  { fecha_iso: '2026-07-22', nombre: 'Miércoles 22 Jul — 20:30 hrs', activa: true },
  { fecha_iso: '2026-07-29', nombre: 'Miércoles 29 Jul — 20:30 hrs', activa: true },
];

process.stdout.write(JSON.stringify(funciones, null, 2) + '\n');

process.stderr.write('\n✅ JSON generado. Ejecuta:\n\n');
process.stderr.write('  node scripts/init-funciones.js > /tmp/funciones.json\n');
process.stderr.write('  npx wrangler kv key put "funciones:activas" \\\n');
process.stderr.write('    --binding INVENTARIO \\\n');
process.stderr.write('    --path /tmp/funciones.json\n');
process.stderr.write('  rm /tmp/funciones.json\n\n');
