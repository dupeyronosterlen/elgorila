#!/usr/bin/env node
/**
 * Optimiza imágenes en img/ para Cloudflare (< 25 MB por archivo) y carga rápida (~1 MB).
 * Usa sharp: redimensiona según carpeta y comprime. Sobrescribe archivos in situ.
 * Uso: npm install && node scripts/optimize-images.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('Instala dependencias: npm install');
  process.exit(1);
}

const IMG_DIR = path.join(__dirname, '..', 'img');
const MAX_CLOUDFLARE_BYTES = 25 * 1024 * 1024;
const TARGET_MAX_BYTES = 1 * 1024 * 1024;
const EXT_IMAGES = /\.(png|jpg|jpeg|webp|gif)$/i;
const SKIP_FILES = /^\.DS_Store$|README\.txt$/i;

// Max width por tipo de carpeta (OPTIMIZACION_IMAGENES.md)
function maxWidthForDir(relDir) {
  const d = relDir.toUpperCase();
  if (d.includes('LOGO')) return 400;
  if (d.includes('GALERIA')) return 1280;
  if (d.includes('ARIEL') || d.includes('ODILA')) return 1280;
  return 1920;
}

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
      files.push({ rel, full, size: stat.size, dir: base || path.basename(dir) });
    }
  }
  return files;
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB';
  return n + ' B';
}

async function optimizeFile(file, dryRun) {
  const { full, size, rel, dir } = file;
  if (size <= TARGET_MAX_BYTES && size <= MAX_CLOUDFLARE_BYTES) return { skipped: true, rel, before: size };
  const ext = path.extname(full).toLowerCase();
  const maxW = maxWidthForDir(dir);
  let buf;
  let meta = {};
  try {
    let pipeline = sharp(full);
    meta = await pipeline.metadata();
    const w = meta.width || 1920;
    const needResize = w > maxW;
    if (needResize) pipeline = pipeline.resize(maxW, null, { withoutEnlargement: true });
    if (ext === '.jpg' || ext === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
    } else if (ext === '.png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: 82 });
    } else {
      pipeline = pipeline.jpeg({ quality: 82 });
    }
    buf = await pipeline.toBuffer();
  } catch (err) {
    return { error: err.message, rel };
  }
  let outSize = buf.length;
  let quality = 82;
  let attempt = 0;
  while (outSize > MAX_CLOUDFLARE_BYTES && quality >= 40 && attempt < 3) {
    attempt++;
    quality -= 15;
    try {
      let p = sharp(buf);
      if (ext === '.jpg' || ext === '.jpeg') p = p.jpeg({ quality, mozjpeg: true });
      else if (ext === '.png') p = p.png({ compressionLevel: 9 });
      else p = p.jpeg({ quality });
      buf = await p.toBuffer();
      outSize = buf.length;
    } catch (_) { break; }
  }
  if (outSize > MAX_CLOUDFLARE_BYTES) {
    const halfW = Math.min(meta.width || 1920, 960);
    try {
      let p = sharp(buf).resize(halfW, null, { withoutEnlargement: true });
      if (ext === '.png') buf = await p.png({ compressionLevel: 9 }).toBuffer();
      else buf = await p.jpeg({ quality: 75, mozjpeg: true }).toBuffer();
      outSize = buf.length;
    } catch (_) {}
  }
  if (!dryRun && buf) fs.writeFileSync(full, buf);
  return { skipped: false, rel, before: size, after: outSize };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const all = walkDir(IMG_DIR);
  const toProcess = all.filter(f => f.size > TARGET_MAX_BYTES || f.size > MAX_CLOUDFLARE_BYTES);
  console.log('Imágenes a optimizar:', toProcess.length, dryRun ? '(dry-run)' : '');
  const results = { ok: 0, skipped: 0, error: 0 };
  for (const file of toProcess) {
    const r = await optimizeFile(file, dryRun);
    if (r.error) { results.error++; console.log('  ERROR', r.rel, r.error); continue; }
    if (r.skipped) { results.skipped++; continue; }
    results.ok++;
    console.log('  ', r.rel, formatBytes(r.before), '->', formatBytes(r.after), dryRun ? '(no escrito)' : '');
  }
  console.log('\nProcesados:', results.ok, 'Omitidos:', results.skipped, 'Errores:', results.error);
  if (!dryRun) {
    console.log('\nVerificación final...');
    const exitCode = require('child_process').spawnSync('node', [path.join(__dirname, 'audit-images.js')], { cwd: path.join(__dirname, '..'), stdio: 'inherit' }).status;
    process.exit(exitCode === undefined ? 0 : exitCode);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
