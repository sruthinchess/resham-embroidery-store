'use strict';
/**
 * Minimal Tajima DST reader — used at import time to read a design's real
 * stitch count, bounds and colour stops straight out of the file (never trust
 * a readme when the binary is right there).
 */
function readDst(buf) {
  const header = buf.slice(0, 512).toString('ascii');
  const declared = Number((header.match(/ST:\s*(\d+)/) || [])[1] || 0);
  const co = Number((header.match(/CO:\s*(\d+)/) || [])[1] || 0);
  const rec = (b0, b1, b2) => ({
    jump: !!(b2 & 0x80),
    dx: ((b2 & 0x04) ? 81 : 0) - ((b2 & 0x08) ? 81 : 0)
      + ((b1 & 0x04) ? 27 : 0) - ((b1 & 0x08) ? 27 : 0)
      + ((b0 & 0x04) ? 9 : 0) - ((b0 & 0x08) ? 9 : 0)
      + ((b1 & 0x01) ? 3 : 0) - ((b1 & 0x02) ? 3 : 0)
      + ((b0 & 0x01) ? 1 : 0) - ((b0 & 0x02) ? 1 : 0),
    dy: -(((b2 & 0x20) ? 81 : 0) - ((b2 & 0x10) ? 81 : 0)
      + ((b1 & 0x20) ? 27 : 0) - ((b1 & 0x10) ? 27 : 0)
      + ((b0 & 0x20) ? 9 : 0) - ((b0 & 0x10) ? 9 : 0)
      + ((b1 & 0x80) ? 3 : 0) - ((b1 & 0x40) ? 3 : 0)
      + ((b0 & 0x80) ? 1 : 0) - ((b0 & 0x40) ? 1 : 0))
  });
  let x = 0, y = 0, stitches = 0, jumps = 0, colorChanges = 0, trims = 0;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (let i = 512; i + 2 < buf.length; i += 3) {
    const b0 = buf[i], b1 = buf[i + 1], b2 = buf[i + 2];
    if (b2 === 0xF3) break;                                   // end of design
    if (b2 === 0xC3) { colorChanges++; continue; }            // colour change
    const r = rec(b0, b1, b2);
    x += r.dx; y += r.dy;
    if (r.jump) { jumps++; continue; }                        // jump / trim
    stitches++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return {
    declaredStitches: declared, stitches, jumps, colorChanges,
    widthMm: Math.round((maxX - minX) / 10), heightMm: Math.round((maxY - minY) / 10),
    colors: colorChanges + 1
  };
}
module.exports = { readDst };
