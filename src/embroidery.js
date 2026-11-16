'use strict';
/**
 * embroidery.js — design geometry and file writers.
 *
 * Everything a buyer downloads is generated here, at download time, from the
 * design's stitch data:
 *   DST   Tajima 3-byte records   (verified against pyembroidery)
 *   EXP   Melco 2-byte records    (verified against pyembroidery)
 *   SVG   vector stitch paths
 *   PNG   rasterised stitch-out
 *   PDF   printable design sheet
 * plus a minimal ZIP packer to bundle the chosen formats.
 *
 * Units are 0.1 mm, origin at the design centre, y positive upwards.
 */

const zlib = require('zlib');

/* ------------------------------------------------------------------ geometry */
const STEP = 6;            // stitch spacing, 0.6 mm — satin density
const MAX_DELTA = 121;     // DST record limit

/** Walks a polyline, emitting stitches no longer than STEP. */
function run(pts, out, color) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / STEP));
    for (let s = 1; s <= n; s++) {
      out.push({ x: x0 + (x1 - x0) * s / n, y: y0 + (y1 - y0) * s / n, color });
    }
  }
}
const arc = (cx, cy, rx, ry, a0, a1, steps) => {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
};
const circle = (cx, cy, r, steps = 64) => arc(cx, cy, r, r, 0, Math.PI * 2, steps);
const bezier = (p0, p1, p2, p3, steps = 26) => {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ]);
  }
  return pts;
};

const MOTIFS = {
  /** A ring of petals around a satin centre. */
  petalRing(p = {}) {
    const petals = p.petals || 12, R = p.r || 360, pr = p.pr || 120, out = [];
    // satin-filled petals: parallel rows across each petal, the way a digitizer would lay them
    const rows = 20;
    for (let i = 0; i < petals; i++) {
      const a = (Math.PI * 2 * i) / petals, ca = Math.cos(a), sa = Math.sin(a);
      const cx = ca * R * 0.72, cy = sa * R * 0.72;
      for (let r = 0; r < rows; r++) {
        const t = -1 + (2 * r) / (rows - 1);
        const y = t * pr * 0.94;
        const half = pr * 0.44 * Math.sqrt(Math.max(0, 1 - t * t));
        if (half < 2.5) continue;
        const P = (px, py) => [cx + px * ca - py * sa, cy + px * sa + py * ca];
        run([P(-half, y), P(half, y)], out, i % 2);
      }
    }
    run(circle(0, 0, R * 0.22), out, 2);
    run(circle(0, 0, R * 0.30), out, 2);
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      run([[Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22], [Math.cos(a) * R * 0.30, Math.sin(a) * R * 0.30]], out, 2);
    }
    return out;
  },

  /** A climbing vine with alternating leaves. */
  vine(p = {}) {
    const len = p.len || 780, amp = p.amp || 150, leaves = p.leaves || 7, out = [];
    const stem = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      stem.push([-len / 2 + len * t, Math.sin(t * Math.PI * 3) * amp]);
    }
    run(stem, out, 0);
    for (let i = 0; i < leaves; i++) {
      const t = (i + 0.5) / leaves;
      const x = -len / 2 + len * t, y = Math.sin(t * Math.PI * 3) * amp;
      const dir = i % 2 ? 1 : -1, size = 92 - (i % 3) * 12;
      run(bezier([x, y], [x + dir * size, y + size * 0.7], [x + dir * size * 1.5, y + size * 1.6], [x + dir * size * 0.4, y + size * 1.9]), out, 1);
      run(bezier([x + dir * size * 0.4, y + size * 1.9], [x - dir * size * 0.2, y + size * 1.2], [x, y + size * 0.4], [x, y]), out, 1);
    }
    return out;
  },

  /** Paisley / boteh with an inner curl. */
  paisley(p = {}) {
    const s = p.size || 420, out = [];
    run(bezier([0, -s], [-s * 0.95, -s * 0.35], [-s * 0.75, s * 0.75], [s * 0.1, s * 0.9], 60), out, 0);
    run(bezier([s * 0.1, s * 0.9], [s * 0.95, s * 0.55], [s * 0.8, -s * 0.5], [0, -s], 60), out, 0);
    run(bezier([s * 0.05, -s * 0.62], [-s * 0.5, -s * 0.2], [-s * 0.42, s * 0.42], [s * 0.06, s * 0.5], 40), out, 1);
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.55;
      run(circle(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42, s * 0.07, 22), out, 2);
    }
    return out;
  },

  /** Horizontal scalloped border. */
  border(p = {}) {
    const w = p.width || 720, h = p.height || 150, n = p.scallops || 6, out = [];
    const pts = [];
    for (let i = 0; i <= n * 20; i++) {
      const t = i / (n * 20);
      pts.push([-w / 2 + w * t, Math.abs(Math.sin(t * Math.PI * n)) * h - h / 2]);
    }
    run(pts, out, 0);
    run([[-w / 2, -h / 2 - 26], [w / 2, -h / 2 - 26]], out, 1);
    run([[-w / 2, h / 2 + 12], [w / 2, h / 2 + 12]], out, 1);
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + (w * i) / n;
      run(circle(x, -h / 2 - 26, 22, 18), out, 2);
    }
    return out;
  },

  /** Laurel wreath with a small star at the top. */
  wreath(p = {}) {
    const R = p.r || 330, leaves = p.leaves || 14, out = [];
    run(circle(0, 0, R), out, 0);
    for (let i = 0; i < leaves; i++) {
      const a = Math.PI * 0.15 + (Math.PI * 1.7 * i) / (leaves - 1);
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      const tx = -Math.sin(a), ty = Math.cos(a);
      run(bezier([x, y], [x + tx * 70 + Math.cos(a) * 40, y + ty * 70 + Math.sin(a) * 40],
        [x + tx * 120 + Math.cos(a) * 20, y + ty * 120 + Math.sin(a) * 20], [x + tx * 96, y + ty * 96], 20), out, 1);
    }
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
      run([[0, R * 0.42], [Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2]], out, 2);
    }
    return out;
  },

  /** Concentric medallion with radial spokes. */
  medallion(p = {}) {
    const rings = p.rings || 3, R = p.r || 400, out = [];
    for (let i = 0; i < rings; i++) run(circle(0, 0, R * (0.35 + i * 0.22)), out, i % 2);
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      run([[Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35], [Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9]], out, 2);
    }
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16 + Math.PI / 16;
      run(circle(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, 18, 14), out, 1);
    }
    return out;
  },

  /** Dotted field, for borders and blouse panels. */
  dots(p = {}) {
    const cols = p.cols || 7, rows = p.rows || 5, gap = p.gap || 96, out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * gap, y = (r - (rows - 1) / 2) * gap;
      run(circle(x, y, 26, 20), out, (r + c) % 3);
    }
    return out;
  }
};

/** Builds the full stitch list for a design definition. */
function build(design) {
  const motif = MOTIFS[design.motif] || MOTIFS.petalRing;
  const stitches = motif(design.params || {});
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of stitches) {
    if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
  }
  // stitch objects get integer 0.1mm coordinates, like a real machine file
  const rounded = stitches.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), color: s.color || 0 }));
  const colors = (design.colors && design.colors.length) ? design.colors : ['#8C2F39', '#C8A24A', '#2F4858'];
  return {
    stitches: rounded,
    colors,
    bounds: { minX: Math.round(minX), minY: Math.round(minY), maxX: Math.round(maxX), maxY: Math.round(maxY) },
    width: Math.round(maxX - minX), height: Math.round(maxY - minY),
    colorChanges: new Set(rounded.map(s => s.color)).size
  };
}

/* ------------------------------------------------------------------- writers */
const bit = n => 1 << n;

/** Tajima DST — 512-byte ASCII header + 3-byte records. */
function toDst(d) {
  const st = d.stitches;
  const head = [];
  const put = (label, value, width) => head.push(label + String(value).padStart(width) + '\r');
  put('LA:', 'Kalam Design', -16);      // left-aligned in the real format
  head[0] = 'LA:' + 'Kalam Design'.padEnd(16, ' ') + '\r';
  put('ST:', st.length, 7);
  put('CO:', Math.max(0, d.colorChanges - 1), 3);
  put('+X:', Math.abs(d.bounds.maxX), 5);
  put('-X:', Math.abs(d.bounds.minX), 5);
  put('+Y:', Math.abs(d.bounds.maxY), 5);
  put('-Y:', Math.abs(d.bounds.minY), 5);
  const last = st[st.length - 1] || { x: 0, y: 0 };
  head.push('AX:' + (last.x >= 0 ? '+' : '-') + String(Math.abs(Math.round(last.x))).padStart(5) + '\r');
  head.push('AY:' + (last.y >= 0 ? '+' : '-') + String(Math.abs(Math.round(last.y))).padStart(5) + '\r');
  head.push('MX:+' + String(0).padStart(5) + '\r');
  head.push('MY:+' + String(0).padStart(5) + '\r');
  head.push('PD:' + '******' + '\r');

  let header = head.join('');
  header = header.padEnd(512, ' ').slice(0, 512);

  const out = [Buffer.from(header, 'ascii')];
  const record = (dx, dy, flags) => {
    let y = -dy;                       // DST counts y upwards, records go down
    let b0 = 0, b1 = 0, b2 = 0;
    if (flags === 'jump') b2 += bit(7);
    b2 += bit(0); b2 += bit(1);
    if (dx > 40) { b2 += bit(2); dx -= 81; }
    if (dx < -40) { b2 += bit(3); dx += 81; }
    if (dx > 13) { b1 += bit(2); dx -= 27; }
    if (dx < -13) { b1 += bit(3); dx += 27; }
    if (dx > 4) { b0 += bit(2); dx -= 9; }
    if (dx < -4) { b0 += bit(3); dx += 9; }
    if (dx > 1) { b1 += bit(0); dx -= 3; }
    if (dx < -1) { b1 += bit(1); dx += 3; }
    if (dx > 0) { b0 += bit(0); dx -= 1; }
    if (dx < 0) { b0 += bit(1); dx += 1; }
    if (y > 40) { b2 += bit(5); y -= 81; }
    if (y < -40) { b2 += bit(4); y += 81; }
    if (y > 13) { b1 += bit(5); y -= 27; }
    if (y < -13) { b1 += bit(4); y += 27; }
    if (y > 4) { b0 += bit(5); y -= 9; }
    if (y < -4) { b0 += bit(4); y += 9; }
    if (y > 1) { b1 += bit(7); y -= 3; }
    if (y < -1) { b1 += bit(6); y += 3; }
    if (y > 0) { b0 += bit(7); y -= 1; }
    if (y < 0) { b0 += bit(6); y += 1; }
    return Buffer.from([b0 & 0xFF, b1 & 0xFF, b2 & 0xFF]);
  };
  const move = (dx, dy, jump) => {
    // split anything longer than the record limit
    let remainingX = dx, remainingY = dy;
    do {
      const stepX = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, remainingX));
      const stepY = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, remainingY));
      out.push(record(stepX, stepY, jump ? 'jump' : 'stitch'));
      remainingX -= stepX; remainingY -= stepY;
    } while (remainingX !== 0 || remainingY !== 0);
  };

  let px = 0, py = 0, color = st[0] ? st[0].color : 0;
  for (const s of st) {
    if (s.color !== color) {
      out.push(Buffer.from([0x00, 0x00, 0xC3]));   // colour change
      color = s.color;
    }
    const dx = s.x - px, dy = s.y - py;
    if (Math.abs(dx) > MAX_DELTA || Math.abs(dy) > MAX_DELTA) {
      move(dx, dy, true);                          // long move → jump
    } else {
      move(dx, dy, false);
    }
    px = s.x; py = s.y;
  }
  out.push(Buffer.from([0x00, 0x00, 0xF3]));       // end
  return Buffer.concat(out);
}

/** Melco EXP — 2 bytes per stitch, 0x80-prefixed commands. */
function toExp(d) {
  const out = [];
  let px = 0, py = 0, color = d.stitches[0] ? d.stitches[0].color : 0;
  for (const s of d.stitches) {
    if (s.color !== color) { out.push(Buffer.from([0x80, 0x01, 0x00, 0x00])); color = s.color; }
    let dx = Math.round(s.x - px), dy = Math.round(s.y - py);
    // EXP deltas are signed bytes — a long move has to be walked in jumps
    while (Math.abs(dx) > 127 || Math.abs(dy) > 127) {
      const jx = Math.max(-127, Math.min(127, dx));
      const jy = Math.max(-127, Math.min(127, dy));
      out.push(Buffer.from([0x80, 0x04, jx & 0xFF, (-jy) & 0xFF]));
      px += jx; py += jy; dx -= jx; dy -= jy;
    }
    out.push(Buffer.from([dx & 0xFF, (-dy) & 0xFF]));
    px = s.x; py = s.y;
  }
  out.push(Buffer.from([0x80, 0x01, 0x00, 0x00]));
  return Buffer.concat(out);
}

/** SVG of the stitch-out, one path per thread colour. */
function toSvg(d, opts = {}) {
  const pad = 40;
  const w = d.width + pad * 2, h = d.height + pad * 2;
  const tx = x => (x - d.bounds.minX + pad);
  const ty = y => (d.bounds.maxY - y + pad);
  const paths = [];
  let cur = null, curColor = -1;
  const flush = () => { if (cur && cur.length > 1) paths.push(`<path d="${cur}" stroke="${d.colors[curColor] || '#222'}" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`); };
  for (const s of d.stitches) {
    if (s.color !== curColor) { flush(); cur = [`M${tx(s.x).toFixed(1)} ${ty(s.y).toFixed(1)}`]; curColor = s.color; }
    else cur.push(`L${tx(s.x).toFixed(1)} ${ty(s.y).toFixed(1)}`);
  }
  flush();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#FBF9F4"/>
  ${paths.join('\n  ')}
</svg>`;
}


/** Compact SVG for catalogue thumbnails: integer coords, relative line commands. */
function toSvgPreview(d, stride = 4) {
  const pad = 24;
  const w = d.width + pad * 2, h = d.height + pad * 2;
  const tx = x => Math.round(x - d.bounds.minX + pad);
  const ty = y => Math.round(d.bounds.maxY - y + pad);
  const out = [];
  let cur = null, color = -1, lx = 0, ly = 0;
  const flush = () => { if (cur && cur.length > 6) out.push(`<path d="${cur}" stroke="${d.colors[color] || '#222'}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`); };
  const src = d.stitches.filter((_, i) => i % stride === 0 || i === d.stitches.length - 1);
  for (const s of src) {
    const x = tx(s.x), y = ty(s.y);
    if (s.color !== color) {
      flush();
      cur = `M${x} ${y}`; color = s.color; lx = x; ly = y;
    } else {
      cur += `l${x - lx} ${y - ly}`; lx = x; ly = y;
    }
  }
  flush();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${out.join('')}</svg>`;
}

/* --------------------------------------------------------------------- PNG */
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
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function toPng(d, size = 900) {
  const scale = Math.min(size / (d.width + 80), size / (d.height + 80));
  const W = Math.round((d.width + 80) * scale), H = Math.round((d.height + 80) * scale);
  const px = Buffer.alloc(W * H * 3, 0xF7);           // paper
  const tx = x => Math.round((x - d.bounds.minX + 40) * scale);
  const ty = y => Math.round((d.bounds.maxY - y + 40) * scale);
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const dot = (x, y, col) => {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const X = x + ox, Y = y + oy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const i = (Y * W + X) * 3;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2];
    }
  };
  let prev = null;
  for (const s of d.stitches) {
    const x = tx(s.x), y = ty(s.y);
    const col = hex(d.colors[s.color] || '#222222');
    if (prev) {
      const steps = Math.max(Math.abs(x - prev.x), Math.abs(y - prev.y), 1);
      for (let i = 0; i <= steps; i++) dot(Math.round(prev.x + (x - prev.x) * i / steps), Math.round(prev.y + (y - prev.y) * i / steps), col);
    } else dot(x, y, col);
    prev = { x, y };
  }
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* --------------------------------------------------------------------- PDF */
function toPdf(d, design, formats) {
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const mm = n => (n / 10).toFixed(1);
  const lines = [
    [design.name, 22],
    ['Embroidery design sheet — Kalam Studio', 10],
    ['', 10],
    [`Stitch count   ${d.stitches.length.toLocaleString('en-IN')}`, 12],
    [`Colours        ${d.colors.length} (${d.colors.join('  ')})`, 12],
    [`Colour changes ${Math.max(0, d.colorChanges - 1)}`, 12],
    [`Size           ${mm(d.width)} mm x ${mm(d.height)} mm`, 12],
    [`Formats        ${formats.join(', ')}`, 12],
    ['', 10],
    ['Thread sequence', 13],
    ...d.colors.map((c, i) => [`  ${i + 1}.  ${c}`, 11]),
    ['', 10],
    ['Stitch order: dark to light, left to right. Hoop a test square first.', 10],
    ['Licence: one-person commercial use. Do not resell the files.', 10]
  ];
  const stream = ['BT', '60 780 Td', '16 TL']
    .concat(lines.map(([t, size], i) => (i === 0 ? `/F1 ${size} Tf` : `T* /F1 ${size} Tf`) + ` (${esc(t)}) Tj`))
    .concat(['ET']).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [5 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>'
  ];
  const buf = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets = [];
  let pos = buf[0].length;
  objs.forEach((body, i) => {
    offsets.push(pos);
    const b = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1');
    buf.push(b); pos += b.length;
  });
  const xref = pos;
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) tail += String(o).padStart(10, '0') + ' 00000 n \n';
  tail += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  buf.push(Buffer.from(tail, 'latin1'));
  return Buffer.concat(buf);
}

/* --------------------------------------------------------------------- ZIP */
function toZip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // utf-8 names
    local.writeUInt16LE(0, 8);           // stored
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);  // time/date (1980-ish)
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

/* ------------------------------------------------------------------ bundle */
const FORMATS = {
  dst: { label: 'DST', ext: 'dst', note: 'Tajima — most commercial machines' },
  exp: { label: 'EXP', ext: 'exp', note: 'Melco / Bernina' },
  svg: { label: 'SVG', ext: 'svg', note: 'Vector stitch paths' },
  png: { label: 'PNG', ext: 'png', note: 'Stitch-out preview' },
  pdf: { label: 'PDF', ext: 'pdf', note: 'Printable design sheet' }
};

/** Builds the ZIP a buyer receives for one design and their chosen formats. */
function packDesign(design, formats) {
  const d = build(design);
  const safe = (design.slug || 'design').toUpperCase();
  const files = [];
  for (const f of formats) {
    if (f === 'dst') files.push({ name: `${safe}.DST`, data: toDst(d) });
    else if (f === 'exp') files.push({ name: `${safe}.EXP`, data: toExp(d) });
    else if (f === 'svg') files.push({ name: `${safe}.svg`, data: Buffer.from(toSvg(d), 'utf8') });
    else if (f === 'png') files.push({ name: `${safe}-stitchout.png`, data: toPng(d) });
    else if (f === 'pdf') files.push({ name: `${safe}-design-sheet.pdf`, data: toPdf(d, design, formats.map(x => x.toUpperCase())) });
  }
  files.push({
    name: 'READ ME.txt',
    data: Buffer.from(
      `${design.name}\n${'='.repeat(design.name.length)}\n\n` +
      `Stitch count : ${d.stitches.length.toLocaleString('en-IN')}\n` +
      `Colours      : ${d.colors.join(', ')}\n` +
      `Size         : ${(d.width / 10).toFixed(1)} x ${(d.height / 10).toFixed(1)} mm\n` +
      `Formats here : ${formats.map(f => f.toUpperCase()).join(', ')}\n\n` +
      `How to sew\n  1. Open the .DST or .EXP in your machine software (Wilcom, Hatch,\n` +
      `     Embird, Pulse) or copy it to a USB stick for the machine.\n` +
      `  2. Hoop a test square of the same fabric and sew it out first.\n` +
      `  3. Colour sequence is listed on the PDF design sheet.\n\n` +
      `Licence: one-person commercial use, unlimited projects.\n` +
      `Do not resell or share the files themselves.\n\n` +
      `Kalam Studio\n`, 'utf8')
  });
  return toZip(files);
}

module.exports = { build, toDst, toExp, toSvg, toSvgPreview, toPng, toPdf, toZip, packDesign, FORMATS, MOTIFS };
