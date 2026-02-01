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
const GALERIA_MAX_WIDTH = 480;
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

async function generateWebP(inputPath, outputPath, maxWidth) {
  const w = maxWidth ?? MOBILE_MAX_WIDTH;
  const stat = fs.statSync(inputPath);
  const buf = await sharp(inputPath)
    .resize(w, null, { withoutEnlargement: true })
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

  const modal37Dir = path.join(IMG_DIR, '37');
  const modal37MobileDir = path.join(modal37Dir, 'mobile');
  ensureDir(modal37MobileDir);
  console.log('--- MODAL 37 (1-5) ---');
  for (let i = 1; i <= 5; i++) {
    const input = path.join(modal37Dir, i + '.png');
    const output = path.join(modal37MobileDir, i + '.webp');
    if (!fs.existsSync(input)) {
      console.log('Saltar (no existe):', input);
      continue;
    }
    const { before, after } = await generateWebP(input, output);
    console.log(i + '.webp:', formatBytes(before), '->', formatBytes(after));
  }

  const sinopsisDir = path.join(IMG_DIR, 'SINOPSIS');
  const sinopsisMobileDir = path.join(sinopsisDir, 'mobile');
  ensureDir(sinopsisMobileDir);
  console.log('--- SINOPSIS (1-7, fondos secciones) ---');
  for (let i = 1; i <= 7; i++) {
    const input = path.join(sinopsisDir, i + '.png');
    const output = path.join(sinopsisMobileDir, i + '.webp');
    if (!fs.existsSync(input)) {
      console.log('Saltar (no existe):', input);
      continue;
    }
    const { before, after } = await generateWebP(input, output);
    console.log(i + '.webp:', formatBytes(before), '->', formatBytes(after));
  }

  const galeriaDir = path.join(IMG_DIR, 'GALERIA');
  const galeriaMobileDir = path.join(galeriaDir, 'mobile');
  ensureDir(galeriaMobileDir);
  const galeriaFiles = [
    '01.jpeg', '02.png', '03.jpeg', '04.png', '05.jpeg', '06.png', '07.jpeg', '08.png', '09.jpeg',
    '011.jpeg', '013.jpeg', '014.png', '015.jpeg', '016.png', '017.jpeg', '018.png', '019.jpeg',
    '021.jpeg', '022.png', '023.jpeg', '025.jpeg', '026.jpeg', '027.jpeg', '028.jpeg', '029.jpeg',
    '030.jpeg', '031.jpeg', '032.jpeg', '033.jpeg', '034.jpeg', '035.jpeg', '036.jpeg', '037.jpeg',
    '038.jpeg', '039.jpeg', '040.jpeg', '041.jpeg', '042.png', '043.png', '044.png', '045.png',
    '046.png', '047.png', '048.png', '049.png', '050.png', '051.png', '052.png', '053.png',
    '054.png', '055.png', '056.png', '057.png', '058.png', '059.png', '061.png', '062.png',
    '063.png', '064.png', '066.png', '067.png', '068.png', '069.png', '070.png', '071.png',
    '072.png', '073.png', '074.png', '075.png', '076.png'
  ];
  console.log('--- GALERIA (miniaturas móvil ' + GALERIA_MAX_WIDTH + 'px) ---');
  for (const name of galeriaFiles) {
    const base = name.replace(/\.(jpe?g|png)$/i, '');
    const input = path.join(galeriaDir, name);
    const output = path.join(galeriaMobileDir, base + '.webp');
    if (!fs.existsSync(input)) {
      console.log('Saltar (no existe):', input);
      continue;
    }
    const { before, after } = await generateWebP(input, output, GALERIA_MAX_WIDTH);
    console.log(base + '.webp:', formatBytes(before), '->', formatBytes(after));
  }

  console.log(DRY_RUN ? '(dry-run: no se escribieron archivos)' : 'Listo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
