#!/usr/bin/env node
/**
 * Genera el JSON de funciones activas para subirlo a KV.
 * Clave en INVENTARIO KV: "funciones:activas"
 *
 * ANTES DE GO-LIVE: reemplaza las fechas placeholder con las fechas reales
 * de la temporada. El formato de nombre es el que verá el comprador en Stripe.
 *
 * USO:
 *   node scripts/init-funciones.js > /tmp/funciones.json
 *   npx wrangler kv key put "funciones:activas" \
 *     --binding INVENTARIO \
 *     --path /tmp/funciones.json
 *   (Agrega --preview para desarrollo.)
 *   rm /tmp/funciones.json
 *
 * Para desactivar una función sin borrarla: cambiar activa a false y volver a subir.
 * Para bloquear ventas el día de la función: usar el campo bloqueada en
 *   funcion:{fecha_iso} en KV directamente (lo gestiona el Worker).
 */

'use strict';

const funciones = [
  {
    fecha_iso: '2026-08-01',
    nombre:    'Sábado 1 Ago — 19:10 hrs',
    activa:    true,
  },
  {
    fecha_iso: '2026-08-08',
    nombre:    'Sábado 8 Ago — 19:10 hrs',
    activa:    true,
  },
  {
    fecha_iso: '2026-08-15',
    nombre:    'Sábado 15 Ago — 19:10 hrs',
    activa:    true,
  },
  {
    fecha_iso: '2026-08-22',
    nombre:    'Sábado 22 Ago — 19:10 hrs',
    activa:    true,
  },
];

process.stdout.write(JSON.stringify(funciones, null, 2) + '\n');

process.stderr.write('\n✅ JSON generado. Ejecuta:\n\n');
process.stderr.write('  node scripts/init-funciones.js > /tmp/funciones.json\n');
process.stderr.write('  npx wrangler kv key put "funciones:activas" \\\n');
process.stderr.write('    --binding INVENTARIO \\\n');
process.stderr.write('    --path /tmp/funciones.json\n\n');
process.stderr.write('  (Agrega --preview para desarrollo.)\n\n');
process.stderr.write('  ⚠️  Reemplaza las fechas placeholder con las reales antes de go-live.\n\n');
