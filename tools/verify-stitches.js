#!/usr/bin/env node
/**
 * Audits every design's stitch count against the actual machine files.
 *
 *   node tools/verify-stitches.js
 *
 * Reads the DST of each design, counts the stitches the machine would sew, and
 * compares that with what the catalogue claims and what the pack README says.
 * Exits non-zero if anything disagrees, so an import can never ship a wrong
 * number.
 */
const fs = require('fs');
const path = require('path');
const { readDst } = require('../src/dst');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/designs.json'), 'utf8'));
let bad = 0, checked = 0;

for (const d of seed.designs) {
  const dir = path.join(__dirname, '..', d.dir);
  const dst = (d.formats || []).find(f => f.key === 'dst');
  if (!dst) { console.log(`✗ ${d.slug}: no DST file`); bad++; continue; }
  const file = path.join(dir, dst.file);
  if (!fs.existsSync(file)) { console.log(`✗ ${d.slug}: missing ${dst.file}`); bad++; continue; }

  const meta = readDst(fs.readFileSync(file));
  const claimed = d.stitchCount;
  const actual = meta.stitches;
  checked++;

  // what the pack's own README says, when there is one
  let readme = null;
  const rp = path.join(dir, 'README.txt');
  if (fs.existsSync(rp)) {
    const m = /Stitch count\s*:\s*([\d,]+)/i.exec(fs.readFileSync(rp, 'utf8'));
    if (m) readme = Number(m[1].replace(/,/g, ''));
  }

  const problems = [];
  if (actual !== claimed) problems.push(`catalogue says ${claimed}, DST sews ${actual}`);
  if (readme !== null && readme !== actual) problems.push(`README says ${readme}, DST sews ${actual}`);
  // the DST reader counts the trailing stop as a colour change, so allow ±1
  if (meta.colors && Math.abs(d.colorCount - meta.colors) > 1) problems.push(`colours ${d.colorCount} vs ${meta.colors}`);

  if (problems.length) { bad++; console.log(`✗ ${d.slug}: ${problems.join(' · ')}`); }
  else console.log(`✓ ${d.slug.padEnd(22)} ${String(actual).padStart(6)} stitches · ${meta.colors}c · ${d.widthMm}×${d.heightMm}mm`);
}

console.log(`\n${checked - bad}/${checked} designs verified against their DST files`);
process.exit(bad ? 1 : 0);
