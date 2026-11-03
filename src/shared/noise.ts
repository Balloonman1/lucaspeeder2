// 3D simplex noise (Stefan Gustavson's reference, trimmed)
const grad3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
const p: number[] = []; { let s = 99; const r = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } }
const perm = new Array(512); const permMod12 = new Array(512); for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
const F3 = 1 / 3, G3 = 1 / 6;
export function snoise3(xin: number, yin: number, zin: number): number {
  const s = (xin + yin + zin) * F3; const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s); const t = (i + j + k) * G3;
  const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
  else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3, x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3, x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
  const ii = i & 255, jj = j & 255, kk = k & 255; let n = 0;
  const c = (tx: number, ty: number, tz: number, g: number[]) => { let t0 = 0.6 - tx * tx - ty * ty - tz * tz; if (t0 < 0) return 0; t0 *= t0; return t0 * t0 * (g[0] * tx + g[1] * ty + g[2] * tz); };
  n += c(x0, y0, z0, grad3[permMod12[ii + perm[jj + perm[kk]]]]); n += c(x1, y1, z1, grad3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]]);
  n += c(x2, y2, z2, grad3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]]); n += c(x3, y3, z3, grad3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]]);
  return 32 * n;
}
export function fbm3(x: number, y: number, z: number, oct = 4, lac = 2, gain = 0.5): number { let a = 1, f = 1, s = 0, w = 0; for (let o = 0; o < oct; o++) { s += snoise3(x * f, y * f, z * f) * a; w += a; a *= gain; f *= lac; } return s / w; }
