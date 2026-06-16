#!/usr/bin/env node
/**
 * Catálogo de cupones → KV "codigos:descuento"
 *
 * REGLAS (sincronizadas con Worker + boletos.html):
 * - INAPAM / estudiante / maestro: NO son cupones — tarifa $245 en su fila de la boletera.
 * - Todos los cupones activos aplican solo a boletos GENERALES (sin mezclar credenciales).
 * - GRUPO20 se activa sola con 5+ generales (sin credencial). ESPEJO y demás van manual al pagar.
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

  // ── Regalo post-función (email 22:00) ─────────────────────────────────────
  REGALO25: {
    tipo:           'porcentaje',
    porcentaje:     25,
    nombre:         'Regalo post-función',
    solo_generales: false,
    activo:         true,
    referido:       true,
    agencia:        'Encuesta post-función · −25% generales · regalo a terceros',
  },

  OTRA50: {
    tipo:           'porcentaje',
    porcentaje:     50,
    nombre:         'Vuelve otra noche',
    solo_generales: false,
    activo:         true,
    referido:       true,
    agencia:        'Encuesta post-función · −50% generales · solo quien volvería',
  },

  MANADA15: {
    tipo:           'porcentaje',
    porcentaje:     15,
    nombre:         'La manada',
    min_general:    3,
    solo_generales: false,
    activo:         true,
    referido:       true,
    agencia:        'Encuesta post-función · −15% con 3+ generales · vino en grupo',
  },

  // ── QA Stripe (1 boleto general = $10 MXN — mínimo Stripe) ─────────────────
  PRUEBA99: {
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
  },

  // QA interno — NO incluir en KV de producción desde este repo. Crear manualmente en Cloudflare si hace falta.
  // WILQA7K2M9X4P8N3: { porcentaje: 99, nombre: 'Prueba interna', activo: false, max_usos: 100, solo_prueba: true },

  // ── Legacy desactivados (conservar clave por historial de usos en KV) ─────
  MANADA:      { porcentaje: 15, nombre: 'Manada (legacy)',      activo: false },
  TRIBU:       { porcentaje: 20, nombre: 'Tribu (legacy)',       activo: false },
  COYOACAN:    { porcentaje: 30, nombre: 'Coyoacán (legacy)',    activo: false },
  ESPEJO10:    { porcentaje: 10, nombre: 'Espejo % (legacy)',    activo: false },
  ESTUDIANTE:  { porcentaje: 15, nombre: 'Estudiante (legacy)',  activo: false },
  MAESTRO:     { porcentaje: 15, nombre: 'Maestro (legacy)',     activo: false },
  INAPAM:      { porcentaje: 30, nombre: 'INAPAM (legacy)',      activo: false },
  WILQA7K2M9X4P8N3: { porcentaje: 99, nombre: 'QA (legacy)',   activo: false, solo_prueba: true },
};

process.stdout.write(JSON.stringify(codigos, null, 2) + '\n');

process.stderr.write('\n✅ JSON generado. Subir a KV:\n\n');
process.stderr.write('  node scripts/init-descuentos.js 2>/dev/null > /tmp/descuentos.json\n');
process.stderr.write('  npx wrangler kv key put "codigos:descuento" --binding INVENTARIO \\\n');
process.stderr.write('    --path /tmp/descuentos.json --preview false --remote\n\n');
