#!/usr/bin/env node
/**
 * Genera VenueConfig por teatro para KV: {tid}:config
 *
 * BUTACAS (provisional — ajustar cuando tengan conteo oficial del recinto):
 *   Platea (abajo): venta principal, mismo precio actual
 *   Galería (arriba): se abre solo cuando platea = 0, mismo precio
 *
 * USO:
 *   node scripts/init-config.js wilberto > /tmp/wilberto-config.json
 *   npx wrangler kv key put "wilberto:config" --binding INVENTARIO --path /tmp/wilberto-config.json --remote --preview false
 */

'use strict';

/** Teatro Wilberto Cantón ~325 butacas (SOGEM). Reparto provisional. */
const SECCIONES_WILBERTO = [
  {
    id:               'platea',
    nombre:           'Platea (abajo)',
    total:            250,
    precio_general:   400,
    precio_descuento: 280,
  },
  {
    id:               'galeria',
    nombre:           'Galería (arriba)',
    total:            75,
    precio_general:   400,
    precio_descuento: 280,
  },
];

const SECCIONES_CCC = [
  { id: 'platea', nombre: 'Platea', total: 200, precio_general: 400, precio_descuento: 280 },
  { id: 'galeria', nombre: 'Galería', total: 50, precio_general: 400, precio_descuento: 280 },
];

const CONFIGS = {
  wilberto: {
    id:        'wilberto',
    nombre:    'El Gorila — Teatro Wilberto Cantón',
    venue:     'Teatro Wilberto Cantón',
    direccion: 'José María Velasco 59, San José Insurgentes, CDMX',
    secciones: SECCIONES_WILBERTO,
  },
  ccc: {
    id:        'ccc',
    nombre:    'El Gorila — Centro Cultural Coyoacanense',
    venue:     'Centro Cultural Coyoacanense',
    direccion: 'Felipe Carrillo Puerto 54, Coyoacán, CDMX',
    secciones: SECCIONES_CCC,
  },
};

const tid = (process.argv[2] || 'wilberto').toLowerCase();
if (!CONFIGS[tid]) {
  process.stderr.write(`Teatro desconocido: ${tid}. Usa: wilberto | ccc\n`);
  process.stderr.write(`(gorila es alias de wilberto en la API; no hace falta subir gorila:config)\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify(CONFIGS[tid], null, 2) + '\n');
const total = CONFIGS[tid].secciones.reduce((s, x) => s + x.total, 0);
process.stderr.write(`\n✅ Config ${tid} — ${total} butacas totales (provisional).\n`);
process.stderr.write(`  npx wrangler kv key put "${tid}:config" --binding INVENTARIO --path /tmp/${tid}-config.json --remote --preview false\n\n`);
