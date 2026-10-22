/**
 * @file server/core/pwaAssets.ts
 * Generates and serves compliant PNG icon assets (192x192, 512x512, maskable 512x512, apple-touch-icon 180x180)
 * from OS temporary storage (/tmp/omniflow-pwa-icons) so the Git workspace remains 100% pure UTF-8 text
 * with zero binary files that could block AI Studio's native GitHub integration push.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

export const PWA_ICON_TMP_DIR = path.join(os.tmpdir(), 'omniflow-pwa-icons');

function createPngBuffer(width: number, height: number, isMaskable = false): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);

  const cx = width / 2;
  const cy = height / 2;
  const ringOuter = width * (isMaskable ? 0.28 : 0.34);
  const ringInner = width * (isMaskable ? 0.21 : 0.26);
  const coreRadius = width * (isMaskable ? 0.1 : 0.12);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const idx = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Slate-900 background (#0f172a) with subtle emerald radial glow
      let r = 15;
      let g = 23;
      let b = 42;
      const a = 255;

      if (dist <= coreRadius) {
        // Emerald-400 center core (#10b981)
        r = 16;
        g = 185;
        b = 129;
      } else if (dist >= ringInner && dist <= ringOuter) {
        // Cyan/Emerald gradient ring
        const t = (x + y) / (width + height);
        r = Math.round(16 * (1 - t) + 14 * t);
        g = Math.round(185 * (1 - t) + 165 * t);
        b = Math.round(129 * (1 - t) + 233 * t);
      } else if (dist < ringInner) {
        r = 20;
        g = 34;
        b = 58;
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend),
  ]);
}

const iconCache = new Map<string, Buffer>();

export function ensurePwaIconsGenerated(): Record<string, string> {
  if (!fs.existsSync(PWA_ICON_TMP_DIR)) {
    fs.mkdirSync(PWA_ICON_TMP_DIR, { recursive: true });
  }

  const specs: Array<{ name: string; width: number; height: number; maskable: boolean }> = [
    { name: 'pwa-192x192.png', width: 192, height: 192, maskable: false },
    { name: 'pwa-512x512.png', width: 512, height: 512, maskable: false },
    { name: 'pwa-maskable-512x512.png', width: 512, height: 512, maskable: true },
    { name: 'apple-touch-icon.png', width: 180, height: 180, maskable: false },
  ];

  const paths: Record<string, string> = {};
  for (const spec of specs) {
    const filePath = path.join(PWA_ICON_TMP_DIR, spec.name);
    if (!iconCache.has(spec.name)) {
      const buf = createPngBuffer(spec.width, spec.height, spec.maskable);
      iconCache.set(spec.name, buf);
      fs.writeFileSync(filePath, buf);
    } else if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, iconCache.get(spec.name)!);
    }
    paths[spec.name] = filePath;
  }

  return paths;
}

export function getPwaIconBuffer(fileName: string): Buffer | null {
  ensurePwaIconsGenerated();
  return iconCache.get(fileName) || null;
}
