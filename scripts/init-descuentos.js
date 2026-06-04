#!/usr/bin/env node
/**
 * Genera el JSON de códigos de descuento para subirlo a KV.
 * Clave en INVENTARIO KV: "codigos:descuento"
 *
 * USO:
 *   node scripts/init-descuentos.js > /tmp/descuentos.json
 *   npx wrangler kv key put "codigos:descuento" \
 *     --binding INVENTARIO \
 *     --path /tmp/descuentos.json
 *   (Agrega --preview para el namespace de desarrollo.)
 *   rm /tmp/descuentos.json
 *
 * Para agregar o modificar códigos: editar este objeto y volver a subir.
 * Para desactivar un código sin borrarlo: cambiar activo a false.
 */

'use strict';

const codigos = {
  ESPEJO:      { porcentaje: 10, nombre: 'Espejo',      activo: true },
  MANADA:      { porcentaje: 15, nombre: 'Manada',      activo: true },
  TRIBU:       { porcentaje: 20, nombre: 'Tribu',       activo: true },
  ESTUDIANTE:  { porcentaje: 15, nombre: 'Estudiante',  activo: true },
};

process.stdout.write(JSON.stringify(codigos, null, 2) + '\n');

process.stderr.write('\n✅ JSON generado. Ejecuta:\n\n');
process.stderr.write('  node scripts/init-descuentos.js > /tmp/descuentos.json\n\n');
process.stderr.write('  npx wrangler kv key put "codigos:descuento" \\\n');
process.stderr.write('    --binding INVENTARIO \\\n');
process.stderr.write('    --path /tmp/descuentos.json\n\n');
process.stderr.write('  (Agrega --preview para desarrollo.)\n\n');
