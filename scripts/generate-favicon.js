#!/usr/bin/env node
/**
 * Genera un favicon ligero a partir de img/LOGO/1.jpg (hoy ~770 KB y servido como
 * icono en todas las páginas) y reconecta los <link rel="icon"> del sitio.
 *
 * Crea:
 *   img/favicon/favicon-32.png      (~1-2 KB)
 *   img/favicon/favicon-48.png
 *   img/favicon/apple-touch-icon.png (180x180)
 *
 * Y reescribe en cada HTML:
 *   <link rel="icon" type="image/jpeg" href="img/LOGO/1.jpg">
 * por un set moderno y liviano (icon 32/48 + apple-touch-icon).
 *
 * Es ATÓMICO: primero genera los binarios y SOLO si existen reconecta el HTML,
 * para no dejar nunca un favicon roto en producción.
 *
 * Uso:  npm install && node scripts/generate-favicon.js [--dry-run]
 *
 * No toca nada del funnel de venta: solo el icono del sitio.
 */
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); }
catch (e) { console.error('Instala dependencias primero: npm install'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'img', 'LOGO', '1.jpg');
const OUT_DIR = path.join(ROOT, 'img', 'favicon');
const DRY = process.argv.includes('--dry-run');

// Páginas donde reconectar el icono (NINGUNA lógica de funnel se modifica).
const PAGES = [
  'index.html', 'funciones.html', 'terminos.html',
  'programa/v1.html', 'programa/v2.html', 'programa/v3.html',
  'programa/v4.html',
  'presskit/presskit2026.html',
];

async function main() {
  if (!fs.existsSync(SRC)) { console.error('No existe la fuente:', SRC); process.exit(1); }
  if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });

  const targets = [
    { file: 'favicon-32.png', size: 32 },
    { file: 'favicon-48.png', size: 48 },
    { file: 'apple-touch-icon.png', size: 180 },
  ];

  for (const t of targets) {
    const out = path.join(OUT_DIR, t.file);
    if (DRY) { console.log('[dry-run] generaría', out, `(${t.size}x${t.size})`); continue; }
    await sharp(SRC).resize(t.size, t.size, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(out);
    const kb = (fs.statSync(out).size / 1024).toFixed(1);
    console.log('OK', path.relative(ROOT, out), `${kb} KB`);
  }

  // Verificar que existen antes de reconectar el HTML (atomicidad).
  if (!DRY) {
    for (const t of targets) {
      if (!fs.existsSync(path.join(OUT_DIR, t.file))) {
        console.error('Falló la generación; no se reconecta el HTML.'); process.exit(1);
      }
    }
  }

  const NEW_LINKS =
    '<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon/favicon-32.png"/>\n' +
    '<link rel="icon" type="image/png" sizes="48x48" href="/img/favicon/favicon-48.png"/>\n' +
    '<link rel="apple-touch-icon" href="/img/favicon/apple-touch-icon.png"/>';

  // Captura cualquier <link rel="icon" ... href=".../LOGO/1.jpg" ...> con o sin "/".
  const ICON_RE = /<link\s+rel="icon"[^>]*href="[^"]*LOGO\/1\.jpg"[^>]*\/?>/i;

  for (const rel of PAGES) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { console.warn('(omito, no existe)', rel); continue; }
    let html = fs.readFileSync(p, 'utf8');
    if (!ICON_RE.test(html)) { console.warn('(sin <link icon> LOGO/1.jpg)', rel); continue; }
    const next = html.replace(ICON_RE, NEW_LINKS);
    if (DRY) { console.log('[dry-run] reconectaría icono en', rel); continue; }
    fs.writeFileSync(p, next);
    console.log('icono reconectado en', rel);
  }

  console.log('\nListo. Revisa el sitio y commitea img/favicon/ + los HTML.');
  console.log('Nota: el JSON-LD/og:image siguen usando el logo grande para compartir; eso es correcto.');
}

main().catch((e) => { console.error(e); process.exit(1); });
