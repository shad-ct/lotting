import type { Response } from 'express';
import { sanitizeFilename } from '@lotto/shared/credentials.js';
import { renderUnmarkedCached, type CardRenderInput } from './renderCard.js';

/**
 * Minimal deterministic ZIP writer (stored entries, no compression).
 * Streams straight to the HTTP response: renders and appends sequentially,
 * never buffers all images at once. Fixed DOS timestamp keeps output stable.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Fixed DOS timestamp 2024-01-01 00:00:00 for determinism.
const DOS_TIME = (0 << 11) | (0 << 5) | 0;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;

interface Entry {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
}

function localHeader(name: Buffer, crc: number, size: number): Buffer {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0x0800, 6); // UTF-8 filenames
  h.writeUInt16LE(0, 8); // stored
  h.writeUInt16LE(DOS_TIME, 10);
  h.writeUInt16LE(DOS_DATE, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(size, 18);
  h.writeUInt32LE(size, 22);
  h.writeUInt16LE(name.length, 26);
  h.writeUInt16LE(0, 28);
  return h;
}

function centralHeader(e: Entry): Buffer {
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(20, 6);
  h.writeUInt16LE(0x0800, 8);
  h.writeUInt16LE(0, 10);
  h.writeUInt16LE(DOS_TIME, 12);
  h.writeUInt16LE(DOS_DATE, 14);
  h.writeUInt32LE(e.crc, 16);
  h.writeUInt32LE(e.size, 20);
  h.writeUInt32LE(e.size, 24);
  h.writeUInt16LE(e.name.length, 28);
  h.writeUInt16LE(0, 30);
  h.writeUInt16LE(0, 32);
  h.writeUInt16LE(0, 34);
  h.writeUInt16LE(0, 36);
  h.writeUInt32LE(0, 38);
  h.writeUInt32LE(e.offset, 42);
  return h;
}

export interface ZipEntry {
  serial: number;
  name: string;
  input: CardRenderInput;
}

export async function streamCardsZip(res: Response, entries: ZipEntry[]): Promise<void> {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="lotto-cards.zip"');
  const central: Entry[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    const base = sanitizeFilename(entry.name, entry.serial);
    let filename = `${base}.png`;
    let suffix = 2;
    while (seen.has(filename)) filename = `${base}_${suffix++}.png`;
    seen.add(filename);
    const data = renderUnmarkedCached(entry.input);
    const name = Buffer.from(filename, 'utf8');
    const header = localHeader(name, crc32(data), data.length);
    res.write(header);
    res.write(name);
    res.write(data);
    central.push({ name, crc: crc32(data), size: data.length, offset });
    offset += header.length + name.length + data.length;
  }
  let centralSize = 0;
  const centralStart = offset;
  for (const e of central) {
    const h = centralHeader(e);
    res.write(h);
    res.write(e.name);
    offset += h.length + e.name.length;
    centralSize += h.length + e.name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  res.write(end);
  res.end();
  await new Promise<void>((resolve) => res.on('finish', resolve));
}
