'use strict';
/**
 * pack.js — bundles a purchased design into a ZIP: the exact machine formats the
 * buyer chose, read straight from src/designs/<slug>/, plus the designer's readme.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Every format the packs ship. Order matters: the popular ones come first. */
const FORMATS = {
  pes: { label: 'PES', note: 'Brother · Babylock · Bernina' },
  dst: { label: 'DST', note: 'Tajima — commercial standard' },
  jef: { label: 'JEF', note: 'Janome' },
  exp: { label: 'EXP', note: 'Melco · Bernina' },
  vp3: { label: 'VP3', note: 'Pfaff · Husqvarna Viking' },
  hus: { label: 'HUS', note: 'Husqvarna' },
  xxx: { label: 'XXX', note: 'Singer' },
  sew: { label: 'SEW', note: 'Janome (older models)' },
  pec: { label: 'PEC', note: 'Brother colour file' },
  dsb: { label: 'DSB', note: 'Barudan' },
  dsz: { label: 'DSZ', note: 'ZSK' },
  zxy: { label: 'ZXY', note: 'ZSK (ZXY)' },
  emd: { label: 'EMD', note: 'Elna · Melco' },
  gt: { label: 'GT', note: 'Gold Thread' },
  inb: { label: 'INB', note: 'Inbro' },
  new: { label: 'NEW', note: 'NEC · New Home' },
  jpx: { label: 'JPX', note: 'Janome JPX' },
  pcd: { label: 'PCD', note: 'Pfaff PCD' },
  pcm: { label: 'PCM', note: 'Pfaff PCM' },
  pcq: { label: 'PCQ', note: 'Pfaff Creative MAXI' },
  pcs: { label: 'PCS', note: 'Pfaff (large hoop)' },
  stx: { label: 'STX', note: 'Data Stitch' },
  tap: { label: 'TAP', note: 'Happy' },
  tbf: { label: 'TBF', note: 'Tajima blocks' },
  u01: { label: 'U01', note: 'Barudan' }
};
/** What the shop sells: the formats almost every machine reads. The rest of the
 *  24 files stay in the pack on disk but are not offered. */
const MAIN = ['pes', 'dst', 'jef', 'exp', 'vp3', 'hus', 'xxx', 'sew'];
const POPULAR = MAIN;

/* ------------------------------------------------------------- zip writer */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}
function toZip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

/** Builds the ZIP for one design: the chosen formats + the designer's readme. */
function packDesign(design, formats) {
  const dir = path.join(ROOT, design.dir);
  const available = (design.formats || []).filter(f => formats.includes(f.key));
  if (!available.length) throw new Error('No formats selected.');
  const files = [];
  for (const f of available) {
    const abs = path.join(dir, f.file);
    if (!fs.existsSync(abs)) continue;
    files.push({ name: f.file, data: fs.readFileSync(abs) });
  }
  const readme = path.join(dir, 'README.txt');
  if (fs.existsSync(readme)) files.push({ name: 'README.txt', data: fs.readFileSync(readme) });
  if (!files.length) throw new Error('The design files are missing on the server.');
  return toZip(files);
}

module.exports = { FORMATS, MAIN, POPULAR, toZip, packDesign };
