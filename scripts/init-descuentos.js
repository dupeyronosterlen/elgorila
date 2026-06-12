#!/usr/bin/env node
/**
 * Catálogo de cupones → KV "codigos:descuento"
 *
 * REGLAS (sincronizadas con Worker + boletos.html):
 * - INAPAM / estudiante / maestro: NO son cupones — tarifa $245 en su fila de la boletera.
 * - Todos los cupones activos aplican solo a boletos GENERALES (sin mezclar credenciales).
 * - No hay descuentos automáticos: todo pasa por código al pagar.
 *
 * Guía para agencia: CUPONES-AGENCIA.template.txt
 *
 * USO:
 *   node scripts/init-descuentos.js 2>/dev/null > /tmp/descuentos.json
 *   npx wrangler kv key put "codigos:descuento" --binding INVENTARIO \
 *     --path /tmp/descuentos.json --preview false --remote
 */

'use strict';

const codigos = {
  // ── Campañas de ads ───────────────────────────────────────────────────────
  ESPEJO: {
    tipo:           'par_fijo',
    nombre:         'Espejo (pareja)',
    total_mxn:      600,
    min_general:    2,
    solo_generales: true,
    activo:         true,
    agencia:        'Ads pareja · "llévate a alguien" · exactamente 2 generales = $600',
  },
  GRUPO20: {
    tipo:           'porcentaje',
    porcentaje:     20,
    nombre:         'Grupo 20%',
    min_general:    5,
    solo_generales: true,
    activo:         true,
    agencia:        'Ads grupo / squad · 5+ generales · −20%',
  },
  PRENSA30: {
    tipo:           'porcentaje',
    porcentaje:     30,
    nombre:         'Prensa / influencers',
    max_general:    4,
    solo_generales: true,
    activo:         true,
    agencia:        'Prensa, influencers, vecindad · hasta 4 generales · −30%',
  },

  // ── Referidos (NO usar en ads) ────────────────────────────────────────────
  INVITADO25: {
    tipo:           'porcentaje',
    porcentaje:     25,
    nombre:         'Invitado (referido)',
    solo_generales: true,
    activo:         true,
    referido:       true,
    agencia:        'NO ads · enlace personal post-función (invitacion.html)',
  },

  // ── QA interno ────────────────────────────────────────────────────────────
  WILQA7K2M9X4P8N3: {
    tipo:           'porcentaje',
    porcentaje:     99,
    nombre:         'Prueba interna',
    activo:         true,
    max_usos:       100,
    solo_prueba:    true,
    agencia:        'Solo equipo técnico — no publicar',
  },

  // ── Legacy desactivados (conservar clave por historial de usos en KV) ─────
  MANADA:      { porcentaje: 15, nombre: 'Manada (legacy)',      activo: false },
  TRIBU:       { porcentaje: 20, nombre: 'Tribu (legacy)',       activo: false },
  COYOACAN:    { porcentaje: 30, nombre: 'Coyoacán (legacy)',    activo: false },
  ESPEJO10:    { porcentaje: 10, nombre: 'Espejo % (legacy)',    activo: false },
  ESTUDIANTE:  { porcentaje: 15, nombre: 'Estudiante (legacy)',  activo: false },
  MAESTRO:     { porcentaje: 15, nombre: 'Maestro (legacy)',     activo: false },
  INAPAM:      { porcentaje: 30, nombre: 'INAPAM (legacy)',      activo: false },
};

process.stdout.write(JSON.stringify(codigos, null, 2) + '\n');

process.stderr.write('\n✅ JSON generado. Subir a KV:\n\n');
process.stderr.write('  node scripts/init-descuentos.js 2>/dev/null > /tmp/descuentos.json\n');
process.stderr.write('  npx wrangler kv key put "codigos:descuento" --binding INVENTARIO \\\n');
process.stderr.write('    --path /tmp/descuentos.json --preview false --remote\n\n');
