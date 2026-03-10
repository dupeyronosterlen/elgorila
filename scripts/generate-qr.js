#!/usr/bin/env node
/**
 * Genera códigos QR para programas de mano (v1–v4).
 * Salida: codigos-qr/qr-v1.png … qr-v4.png (colores distintos, listos para imprimir).
 * Uso: npm install qrcode && node scripts/generate-qr.js
 */

const fs = require('fs');
const path = require('path');

let QRCode;
try {
  QRCode = require('qrcode');
} catch (e) {
  console.error('Instala dependencias: npm install qrcode');
  process.exit(1);
}

const BASE_URL = 'https://elgorilateatro.com.mx/programa';
const OUT_DIR = path.join(__dirname, '..', 'codigos-qr');
const SIZE = 600;      // px, buen tamaño para imprimir
const MARGIN = 3;      // quiet zone

const variants = [
  { id: 'v1', color: '#D43A1A', name: 'Programa v1' },   // rojo
  { id: 'v2', color: '#B8923A', name: 'Programa v2' }, // dorado
  { id: 'v3', color: '#1e2a1e', name: 'Programa v3' }, // verde oscuro
  { id: 'v4', color: '#6B2D35', name: 'Programa v4' }, // granate
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Creada carpeta:', dir);
  }
}

async function main() {
  ensureDir(OUT_DIR);

  for (const v of variants) {
    const url = `${BASE_URL}/${v.id}.html`;
    const outPath = path.join(OUT_DIR, `qr-${v.id}.png`);
    const options = {
      width: SIZE,
      margin: MARGIN,
      color: {
        dark: v.color,
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    };
    await QRCode.toFile(outPath, url, options);
    console.log('Generado:', outPath, `(${v.name}, ${v.color})`);
  }

  console.log('Listo. Archivos en', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
