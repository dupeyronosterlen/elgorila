#!/usr/bin/env node
/**
 * Genera versiones móvil (WebP, ancho max 960px) para el hero:
 * - img/CARTEL ROTATORIO/01-09.png → img/CARTEL ROTATORIO/mobile/01-09.webp
 * - img/CARTEL INFORMATIVO/1.png, 2.png → img/CARTEL INFORMATIVO/mobile/1.webp, 2.webp
 * Objetivo: < 250 KB por cartel rotatorio, < 150-200 KB por informativo.
 * Uso: npm install && node scripts/generate-hero-mobile.js [--dry-run]
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
const MOBILE_MAX_WIDTH = 800;
const WEBP_QUALITY = 75;
const DRY_RUN = process.argv.includes('--dry-run');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (!DRY_RUN) fs.mkdirSync(dir, { recursive: true });
    console.log('Creada carpeta:', dir);
  }
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB';
  return n + ' B';
}

async function generateWebP(inputPath, outputPath) {
  const stat = fs.statSync(inputPath);
  const buf = await sharp(inputPath)
    .resize(MOBILE_MAX_WIDTH, null, { withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  if (!DRY_RUN) fs.writeFileSync(outputPath, buf);
  return { before: stat.size, after: buf.length };
}

async function main() {
  const cartelRotatorioDir = path.join(IMG_DIR, 'CARTEL ROTATORIO');
  const cartelRotatorioMobileDir = path.join(cartelRotatorioDir, 'mobile');
  const cartelInformativoDir = path.join(IMG_DIR, 'CARTEL INFORMATIVO');
  const cartelInformativoMobileDir = path.join(cartelInformativoDir, 'mobile');

  ensureDir(cartelRotatorioMobileDir);
  ensureDir(cartelInformativoMobileDir);

  console.log('--- CARTEL ROTATORIO (01-09) ---');
  for (let i = 1; i <= 9; i++) {
    const num = i.toString().padStart(2, '0');
    const input = path.join(cartelRotatorioDir, num + '.png');
    const output = path.join(cartelRotatorioMobileDir, num + '.webp');
    if (!fs.existsSync(input)) {
      console.log('Saltar (no existe):', input);
      continue;
    }
    const { before, after } = await generateWebP(input, output);
    console.log(num + '.webp:', formatBytes(before), '->', formatBytes(after));
  }

  console.log('--- CARTEL INFORMATIVO (1, 2) ---');
  for (const name of ['1', '2']) {
    const input = path.join(cartelInformativoDir, name + '.png');
    const output = path.join(cartelInformativoMobileDir, name + '.webp');
    if (!fs.existsSync(input)) {
      console.log('Saltar (no existe):', input);
      continue;
    }
    const { before, after } = await generateWebP(input, output);
    console.log(name + '.webp:', formatBytes(before), '->', formatBytes(after));
  }

  console.log(DRY_RUN ? '(dry-run: no se escribieron archivos)' : 'Listo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
