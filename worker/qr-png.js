/**
 * QR → PNG para correos. Solo usa la matriz de `qrcode` (sin canvas ni qrserver).
 */
import QRCode from 'qrcode';

const DARK = [0x1a, 0x14, 0x11];
const LIGHT = [0xf1, 0xea, 0xd9];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function chunk(type, data) {
  const t = new TextEncoder().encode(type);
  const len = u32(data.length);
  const crcBuf = new Uint8Array(t.length + data.length);
  crcBuf.set(t, 0);
  crcBuf.set(data, t.length);
  const crc = u32(crc32(crcBuf));
  const out = new Uint8Array(8 + data.length + 4);
  out.set(len, 0);
  out.set(t, 4);
  out.set(data, 8);
  out.set(crc, 8 + data.length);
  return out;
}

function zlibStore(raw) {
  const blocks = [];
  let pos = 0;
  while (pos < raw.length) {
    const n = Math.min(65535, raw.length - pos);
    const last = pos + n >= raw.length;
    const block = new Uint8Array(5 + n);
    block[0] = last ? 1 : 0;
    block[1] = n & 255;
    block[2] = (n >> 8) & 255;
    block[3] = (~n) & 255;
    block[4] = ((~n) >> 8) & 255;
    block.set(raw.subarray(pos, pos + n), 5);
    blocks.push(block);
    pos += n;
  }
  const adler = adler32(raw);
  let total = 2 + 4;
  for (const b of blocks) total += b.length;
  const out = new Uint8Array(total);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  for (const b of blocks) {
    out.set(b, o);
    o += b.length;
  }
  out.set(u32(adler), o);
  return out;
}

function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function qrPngBytes(text, opts = {}) {
  const width = opts.width || 148;
  const qr = QRCode.create(String(text || ''), { errorCorrectionLevel: 'M' });
  const mods = qr.modules;
  const n = mods.size;
  const quiet = 2;
  const total = n + quiet * 2;
  const scale = Math.max(1, Math.floor(width / total));
  const px = total * scale;

  const raw = new Uint8Array(px * (1 + px * 3));
  let ri = 0;
  for (let y = 0; y < px; y++) {
    raw[ri++] = 0;
    const my = Math.floor(y / scale) - quiet;
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const on = mx >= 0 && my >= 0 && mx < n && my < n && mods.get(mx, my);
      const c = on ? DARK : LIGHT;
      raw[ri++] = c[0];
      raw[ri++] = c[1];
      raw[ri++] = c[2];
    }
  }

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk('IHDR', new Uint8Array([
    ...u32(px), ...u32(px), 8, 2, 0, 0, 0,
  ]));
  const idat = chunk('IDAT', zlibStore(raw));
  const iend = chunk('IEND', new Uint8Array(0));
  return concat([sig, ihdr, idat, iend]);
}
