// Generates the Veyra Canyon heightfield, splat map and trail data.
// Output: public/assets/levels/veyra/{height.bin, splat.png, meta.json}
// Run: npm run terrain
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const OUT = path.resolve('public/assets/levels/veyra');
fs.mkdirSync(OUT, { recursive: true });

const N = 1024;              // samples per side
const SIZE = 1100;           // metres per side
const HALF = SIZE / 2;
const PLAY = 260;            // play-area half size (520 m square)
const STEP = SIZE / (N - 1);

// ---------- deterministic noise ----------
let seed = 1337;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const perm = new Uint8Array(512); { const p = []; for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const grad2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
function simplex(x, y) {
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2;
  const x0 = x - (i - t), y0 = y - (j - t); const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255; let n = 0;
  const c = (tx, ty, g) => { let t0 = 0.5 - tx * tx - ty * ty; if (t0 < 0) return 0; t0 *= t0; return t0 * t0 * (g[0] * tx + g[1] * ty); };
  n += c(x0, y0, grad2[perm[ii + perm[jj]] & 7]); n += c(x1, y1, grad2[perm[ii + i1 + perm[jj + j1]] & 7]); n += c(x2, y2, grad2[perm[ii + 1 + perm[jj + 1]] & 7]);
  return 70 * n;
}
function fbm(x, y, oct = 6, lac = 2.0, gain = 0.5) { let a = 1, f = 1, s = 0, w = 0; for (let o = 0; o < oct; o++) { s += simplex(x * f, y * f) * a; w += a; a *= gain; f *= lac; } return s / w; }
function ridged(x, y, oct = 5) { let a = 1, f = 1, s = 0, w = 0; for (let o = 0; o < oct; o++) { const n = 1 - Math.abs(simplex(x * f, y * f)); s += n * n * a; w += a; a *= 0.5; f *= 2.1; } return s / w; }
const smooth = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- trail splines (world metres) ----------
function catmull(pts, closed, samples) {
  const out = []; const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < samples; k++) { const t = k / samples, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  return out;
}
// main loop trail around the valley plus two washes crossing it
const mainCtrl = [[-200, -40], [-150, -160], [-20, -210], [120, -190], [210, -90], [215, 60], [150, 180], [10, 215], [-130, 190], [-215, 90]];
const washA = [[-240, 30], [-120, 10], [0, -10], [110, 20], [240, 10]];
const washB = [[-60, -250], [-40, -120], [10, 0], [60, 120], [40, 250]];
const trails = [catmull(mainCtrl, true, 24), catmull(washA, false, 30), catmull(washB, false, 30)];

// distance to nearest trail polyline, on a coarse grid then bilinear
const DG = 512; const dist = new Float32Array(DG * DG); const trailId = new Uint8Array(DG * DG);
{
  const seg = []; trails.forEach((t, id) => { for (let i = 0; i < t.length - 1; i++) seg.push([t[i], t[i + 1], id]); });
  for (let j = 0; j < DG; j++) for (let i = 0; i < DG; i++) {
    const x = -HALF + i / (DG - 1) * SIZE, z = -HALF + j / (DG - 1) * SIZE; let best = 1e9, bid = 0;
    for (const [a, b, id] of seg) { const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = Math.max(0, Math.min(1, t)); const px = a[0] + dx * t - x, pz = a[1] + dz * t - z; const d = px * px + pz * pz; if (d < best) { best = d; bid = id; } }
    dist[j * DG + i] = Math.sqrt(best); trailId[j * DG + i] = bid;
  }
}
function trailDist(x, z) { const u = (x + HALF) / SIZE * (DG - 1), v = (z + HALF) / SIZE * (DG - 1); const i = Math.max(0, Math.min(DG - 2, Math.floor(u))), j = Math.max(0, Math.min(DG - 2, Math.floor(v))); const fu = u - i, fv = v - j; const a = dist[j * DG + i], b = dist[j * DG + i + 1], c = dist[(j + 1) * DG + i], d = dist[(j + 1) * DG + i + 1]; return lerp(lerp(a, b, fu), lerp(c, d, fu), fv); }

// ---------- height field ----------
const H = new Float32Array(N * N);
function baseHeight(x, z) {
  // domain-warped coordinates so rim shapes are irregular
  const wx = x + 90 * fbm(x * 0.0015 + 3.1, z * 0.0015 + 7.7, 3), wz = z + 90 * fbm(x * 0.0015 - 5.2, z * 0.0015 + 1.3, 3);
  const r = Math.max(Math.abs(wx), Math.abs(wz));            // squarish valley
  const rr = Math.hypot(wx, wz);
  const edge = lerp(r, rr, 0.45);
  // valley floor: gentle rolling + fine detail
  let floor = 2.4 * fbm(x * 0.012, z * 0.012, 4) + 0.9 * fbm(x * 0.05, z * 0.05, 3) + 0.25 * fbm(x * 0.25, z * 0.25, 2);
  // rim: terraced sandstone mesas
  const rimT = smooth(235, 320, edge);                         // 0 on floor, 1 on plateau
  const strata = ridged(wx * 0.004, wz * 0.004, 4);
  let plateau = 70 + 55 * strata + 16 * fbm(x * 0.02, z * 0.02, 3);
  // terraces: quantise the rise into steps with soft risers
  const steps = 9; let tq = rimT * steps; const fl = Math.floor(tq); const fr = tq - fl; const riser = smooth(0.3, 0.75, fr);
  const terrace = (fl + riser) / steps;
  let h = floor + terrace * plateau;
  // isolated buttes on the floor
  const buttes = [[-150, 120, 34, 22], [170, -140, 30, 18], [60, 160, 26, 15], [-60, -170, 28, 20]];
  for (const [bx, bz, br, bh] of buttes) { const d = Math.hypot(x - bx, z - bz) + 10 * fbm(x * 0.05 + bx, z * 0.05 + bz, 2); const m = smooth(br, br * 0.55, d); const bq = Math.floor(m * 3 + smooth(0.2, 0.8, (m * 3) % 1)) / 3; h += bq * bh * (0.8 + 0.4 * strata); }
  return h;
}
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = -HALF + i * STEP, z = -HALF + j * STEP;
  let h = baseHeight(x, z);
  const td = trailDist(x, z);
  // carve trails: 0.7 m deep, 9 m wide bed with soft banks and a slight crown
  const carve = smooth(10, 3.5, td) * 0.7 + 0.25 * Math.exp(-(td * td) / 12);
  h -= carve * smooth(330, 250, Math.max(Math.abs(x), Math.abs(z)));
  H[j * N + i] = h;
}
// thermal erosion: talus slopes on the rim
const TALUS = 1.15 * STEP; // ~49 degrees
for (let it = 0; it < 14; it++) {
  const D = new Float32Array(N * N);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const c = H[j * N + i]; let total = 0; const ds = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = H[(j + dj) * N + i + di]; const d = c - n; if (d > TALUS) { ds.push([di, dj, d]); total += d; } }
    if (!total) continue; const move = 0.5 * (ds[0] ? Math.max(...ds.map(d => d[2])) - TALUS : 0);
    for (const [di, dj, d] of ds) { const share = move * d / total; D[j * N + i] -= share; D[(j + dj) * N + i + di] += share; }
  }
  for (let k = 0; k < N * N; k++) H[k] += D[k];
}
let hmin = 1e9, hmax = -1e9; for (let k = 0; k < N * N; k++) { hmin = Math.min(hmin, H[k]); hmax = Math.max(hmax, H[k]); }
fs.writeFileSync(path.join(OUT, 'height.bin'), Buffer.from(H.buffer));

// ---------- splat map: R trail, G sand/wash, B gravel, A mud(cracked) ----------
const png = new PNG({ width: N, height: N });
const hAt = (i, j) => H[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = -HALF + i * STEP, z = -HALF + j * STEP; const td = trailDist(x, z);
  const slope = Math.hypot(hAt(i + 1, j) - hAt(i - 1, j), hAt(i, j + 1) - hAt(i, j - 1)) / (2 * STEP);
  const n1 = fbm(x * 0.02 + 11, z * 0.02 + 5, 3), n2 = fbm(x * 0.045 - 7, z * 0.045 + 2, 3);
  const trail = smooth(7.5, 2.5, td) * (0.85 + 0.15 * n2) + 0.35 * smooth(12, 6, td) * smooth(-0.2, 0.3, n2);
  const wash = smooth(0.1, 0.5, n1) * smooth(0.25, 0.05, slope) * (1 - trail);
  const gravel = smooth(0.12, 0.35, slope) * (1 - trail) + 0.5 * smooth(0.3, 0.6, n2) * (1 - trail) * (1 - wash);
  const mud = smooth(-0.15, -0.5, n1) * smooth(0.12, 0.03, slope) * (1 - trail);
  const k = (j * N + i) * 4;
  png.data[k] = Math.round(Math.min(1, trail) * 255); png.data[k + 1] = Math.round(Math.min(1, wash) * 255); png.data[k + 2] = Math.round(Math.min(1, gravel) * 255); png.data[k + 3] = Math.round(Math.min(1, mud) * 255);
}
fs.writeFileSync(path.join(OUT, 'splat.png'), PNG.sync.write(png));

// ---------- spawn and object placement data ----------
const main = trails[0];
const startIdx = 0; const sp = main[startIdx], sn = main[startIdx + 4];
const spawnHeading = Math.atan2(sn[0] - sp[0], sn[1] - sp[1]);
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ size: SIZE, samples: N, play: PLAY, hmin, hmax, spawn: { x: sp[0], z: sp[1], heading: spawnHeading }, trails: trails.map(t => t.filter((_, i) => i % 3 === 0).map(p => [+p[0].toFixed(1), +p[1].toFixed(1)])) }));
console.log(`terrain ${N}x${N} over ${SIZE} m, height ${hmin.toFixed(1)}..${hmax.toFixed(1)} m`);
