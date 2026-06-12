#!/usr/bin/env node
/**
 * Genera el JSON de códigos de descuento para subirlo a KV.
 * Clave en INVENTARIO KV: "codigos:descuento"
 *
 * REGLAS DE DESCUENTO (Worker + boletos.html):
 * - Manada automática: 5+ boletos GENERALES en la misma compra → 20% solo en generales.
 *   No aplica si hay INAPAM / estudiante / maestro en el carrito (van aparte a $245).
 * - Cupones de código: no se acumulan con Manada automática; solo reducen boletos generales.
 * - INVITADO25: requiere enlace de invitación (referidoDe); uso ilimitado para medir referidos.
 *
 * USO:
 *   node scripts/init-descuentos.js > /tmp/descuentos.json
 *   npx wrangler kv key put "codigos:descuento" \
 *     --binding INVENTARIO \
 *     --path /tmp/descuentos.json
 *   (Agrega --preview para desarrollo.)
 *   rm /tmp/descuentos.json
 *
 * Para desactivar un código sin borrarlo: cambiar activo a false y volver a subir.
 */

'use strict';

const codigos = {
  // Identidad / comunidad
  ESPEJO:      { porcentaje: 10, nombre: 'Espejo',      activo: true },
  MANADA:      { porcentaje: 15, nombre: 'Manada',      activo: true },
  TRIBU:       { porcentaje: 20, nombre: 'Tribu',       activo: true },
  COYOACAN:    { porcentaje: 30, nombre: 'Coyoacán',    activo: true },

  // Descuentos sociales
  ESTUDIANTE:  { porcentaje: 15, nombre: 'Estudiante',  activo: true },
  MAESTRO:     { porcentaje: 15, nombre: 'Maestro',     activo: true },
  INAPAM:      { porcentaje: 30, nombre: 'INAPAM',      activo: true },

  // QA interno — no publicar. 99% off, máx. 100 usos. Código difícil de adivinar.
  WILQA7K2M9X4P8N3: {
    porcentaje: 99,
    nombre:     'Prueba interna',
    activo:     true,
    max_usos:   100,
    solo_prueba: true,
  },

  // Invitados por recomendación — uso ilimitado (contamos cada redención en KV).
  INVITADO25: {
    porcentaje: 25,
    nombre:     'Invitado',
    activo:     true,
    referido:   true,
  },
};

process.stdout.write(JSON.stringify(codigos, null, 2) + '\n');

process.stderr.write('\n✅ JSON generado. Ejecuta:\n\n');
process.stderr.write('  node scripts/init-descuentos.js > /tmp/descuentos.json\n');
process.stderr.write('  npx wrangler kv key put "codigos:descuento" \\\n');
process.stderr.write('    --binding INVENTARIO \\\n');
process.stderr.write('    --path /tmp/descuentos.json\n\n');
process.stderr.write('  (Agrega --preview para desarrollo.)\n\n');
