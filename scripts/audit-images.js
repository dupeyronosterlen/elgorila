#!/usr/bin/env node
/**
 * Auditoría de tamaños de imágenes en img/
 * Marca archivos > 25 MB (límite Cloudflare) y > 1 MB (prioridad optimización).
 * Uso: node scripts/audit-images.js
 */

const fs = require('fs');
const path = require('path');

const IMG_DIR = path.join(__dirname, '..', 'img');
const MAX_CLOUDFLARE_MB = 25;
const MAX_RECOMMENDED_MB = 1;
const EXT_IMAGES = /\.(png|jpg|jpeg|webp|gif)$/i;
const SKIP_FILES = /^\.DS_Store$|README\.txt$/i;

function walkDir(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      files.push(...walkDir(path.join(dir, e.name), rel));
    } else if (e.isFile() && EXT_IMAGES.test(e.name) && !SKIP_FILES.test(e.name)) {
      const full = path.join(dir, e.name);
      const stat = fs.statSync(full);
      files.push({ rel, full, size: stat.size });
    }
  }
  return files;
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB';
  return n + ' B';
}

const maxCloudflareBytes = MAX_CLOUDFLARE_MB * 1024 * 1024;
const maxRecommendedBytes = MAX_RECOMMENDED_MB * 1024 * 1024;

const all = walkDir(IMG_DIR);
const over25 = all.filter(f => f.size > maxCloudflareBytes);
const over1 = all.filter(f => f.size > maxRecommendedBytes && f.size <= maxCloudflareBytes);
const ok = all.filter(f => f.size <= maxRecommendedBytes);

console.log('=== Auditoría de imágenes (img/) ===\n');
console.log('Total archivos de imagen:', all.length);
console.log('Límite Cloudflare por archivo:', MAX_CLOUDFLARE_MB, 'MB');
console.log('Objetivo recomendado por archivo: <=', MAX_RECOMMENDED_MB, 'MB\n');

if (over25.length > 0) {
  console.log('--- SUPERAN 25 MB (deben optimizarse para Cloudflare) ---');
  over25.forEach(f => console.log('  ', f.rel, ' ', formatBytes(f.size)));
  console.log('');
}

if (over1.length > 0) {
  console.log('--- Entre 1 MB y 25 MB (prioridad optimización para carga rápida) ---');
  over1.forEach(f => console.log('  ', f.rel, ' ', formatBytes(f.size)));
  console.log('');
}

console.log('--- <= 1 MB (OK) ---');
console.log('  Cantidad:', ok.length);
if (ok.length <= 20) ok.forEach(f => console.log('  ', f.rel, ' ', formatBytes(f.size)));
else console.log('  (listado omitido; total', ok.length, 'archivos)\n');

const totalBytes = all.reduce((s, f) => s + f.size, 0);
console.log('Tamaño total imágenes:', formatBytes(totalBytes));

if (over25.length > 0) {
  console.log('\n[ERROR] Hay', over25.length, 'archivo(s) por encima de 25 MB. Ejecuta el script de optimización.');
  process.exit(1);
}
console.log('\n[OK] Ningún archivo supera 25 MB.');
process.exit(0);
