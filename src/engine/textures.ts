// Procedurally drawn textures (grass blade atlas, flowers, soft particles, decals). Drawn once at startup.
import { Scene, DynamicTexture, Texture } from '@babylonjs/core';

function makeTex(scene: Scene, name: string, size: number, draw: (ctx: CanvasRenderingContext2D, S: number) => void, opts: { srgb?: boolean; wrap?: boolean; alpha?: boolean } = {}): Texture {
  const dt = new DynamicTexture(name, { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size); draw(ctx, size); dt.update(false);
  dt.hasAlpha = !!opts.alpha; dt.wrapU = dt.wrapV = opts.wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  (dt as any).gammaSpace = opts.srgb !== false; dt.anisotropicFilteringLevel = 8;
  return dt;
}
let seed = 7; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const r = (a: number, b: number) => a + rnd() * (b - a);

/** 4-cell atlas: dry grass tuft, green grass tuft, scrub twig, purple flower stalk */
export function grassAtlas(scene: Scene): Texture {
  return makeTex(scene, 'grassAtlas', 1024, (x, S) => {
    const cell = S / 2;
    const blades = (ox: number, oy: number, n: number, cols: string[], h: number, w: number, curl: number) => {
      for (let i = 0; i < n; i++) {
        const bx = ox + cell * 0.5 + r(-cell * 0.3, cell * 0.3), bh = cell * h * r(0.55, 1), bw = w * r(0.6, 1.2), lean = r(-curl, curl);
        const c = cols[Math.floor(rnd() * cols.length)];
        const g = x.createLinearGradient(0, oy + cell, 0, oy + cell - bh); g.addColorStop(0, shade(c, 0.7)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, 1.3));
        x.fillStyle = g; x.beginPath(); x.moveTo(bx - bw, oy + cell); x.quadraticCurveTo(bx + lean * 0.3, oy + cell - bh * 0.6, bx + lean, oy + cell - bh); x.quadraticCurveTo(bx + lean * 0.3 + bw * 0.4, oy + cell - bh * 0.6, bx + bw, oy + cell); x.closePath(); x.fill();
      }
    };
    // dry desert grass
    blades(0, 0, 60, ['#c9b06d', '#d8c27e', '#b9a35c', '#e2cf8f', '#a8b05a'], 0.95, 7, 70);
    // greener tuft
    blades(cell, 0, 60, ['#8fae4a', '#a4c05a', '#7a9a3c', '#b9cc70', '#c4b85a'], 0.85, 8, 50);
    // scrub twigs with small leaves
    x.save(); x.translate(0, cell);
    for (let i = 0; i < 14; i++) { const bx = cell * 0.5 + r(-cell * 0.25, cell * 0.25); x.strokeStyle = '#5a4630'; x.lineWidth = r(3, 6); x.beginPath(); x.moveTo(bx, cell); const tx = bx + r(-cell * 0.35, cell * 0.35), ty = r(cell * 0.1, cell * 0.5); x.quadraticCurveTo(bx + r(-40, 40), cell * 0.6, tx, ty); x.stroke();
      for (let k = 0; k < 26; k++) { const t = r(0.2, 1); const px = bx + (tx - bx) * t + r(-18, 18), py = cell + (ty - cell) * t + r(-18, 18); x.fillStyle = ['#7c8f3d', '#9aa851', '#657a33', '#b1b36a'][Math.floor(rnd() * 4)]; x.beginPath(); x.ellipse(px, py, r(4, 8), r(2, 4), r(0, 3), 0, 6.3); x.fill(); } }
    x.restore();
    // flower stalks
    x.save(); x.translate(cell, cell);
    blades(0, 0, 30, ['#7a8d44', '#5f7034'], 0.8, 4, 40);
    for (let i = 0; i < 24; i++) { const px = cell * 0.5 + r(-cell * 0.3, cell * 0.3), py = r(cell * 0.15, cell * 0.6); x.strokeStyle = '#6a7d3a'; x.lineWidth = 3; x.beginPath(); x.moveTo(px, cell); x.lineTo(px + r(-10, 10), py); x.stroke();
      const col = ['#b36ad1', '#c982e0', '#8f4fb8', '#e7a1f0', '#f0c84a'][Math.floor(rnd() * 5)]; for (let p = 0; p < 5; p++) { const a = p / 5 * 6.28; x.fillStyle = col; x.beginPath(); x.ellipse(px + Math.cos(a) * 9, py + Math.sin(a) * 9, 7, 5, a, 0, 6.3); x.fill(); } x.fillStyle = '#f5e27a'; x.beginPath(); x.arc(px, py, 4, 0, 6.3); x.fill(); }
    x.restore();
  }, { alpha: true });
}
function shade(hex: string, k: number): string { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return `rgb(${c[0]},${c[1]},${c[2]})`; }

/** soft radial puff for dust and smoke */
export function puffTexture(scene: Scene): Texture {
  return makeTex(scene, 'puff', 256, (x, S) => {
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // break up the puff with darker blotches
    for (let i = 0; i < 40; i++) { const gg = x.createRadialGradient(r(60, 196), r(60, 196), 0, S / 2, S / 2, r(20, 50)); gg.addColorStop(0, 'rgba(0,0,0,0.12)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gg; x.fillRect(0, 0, S, S); }
  }, { alpha: true });
}
/** spark */
export function sparkTexture(scene: Scene): Texture {
  return makeTex(scene, 'spark', 64, (x, S) => { const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,220,160,0.8)'); g.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); }, { alpha: true });
}
/** locator ring for pickups */
export function ringTexture(scene: Scene): Texture {
  return makeTex(scene, 'ring', 256, (x, S) => { x.strokeStyle = 'rgba(255,220,120,1)'; x.lineWidth = 10; x.beginPath(); x.arc(S / 2, S / 2, S * 0.42, 0, 6.3); x.stroke(); x.strokeStyle = 'rgba(255,240,180,0.5)'; x.lineWidth = 4; x.beginPath(); x.arc(S / 2, S / 2, S * 0.33, 0, 6.3); x.stroke(); for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28; x.fillStyle = 'rgba(255,230,140,0.9)'; x.beginPath(); x.arc(S / 2 + Math.cos(a) * S * 0.46, S / 2 + Math.sin(a) * S * 0.46, 3, 0, 6.3); x.fill(); } }, { alpha: true });
}
/** carbon-fibre / scuffed metal detail for the bike */
export function scuffTexture(scene: Scene): Texture {
  return makeTex(scene, 'scuff', 512, (x, S) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S); for (let i = 0; i < 3000; i++) { x.strokeStyle = `rgba(0,0,0,${r(0.02, 0.12)})`; x.lineWidth = r(0.5, 2); x.beginPath(); const px = r(0, S), py = r(0, S); x.moveTo(px, py); x.lineTo(px + r(-30, 30), py + r(-4, 4)); x.stroke(); } for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(0,0,0,${r(0.05, 0.25)})`; x.beginPath(); x.arc(r(0, S), r(0, S), r(1, 4), 0, 6.3); x.fill(); } }, { wrap: true, srgb: false });
}
export function noiseTexture(scene: Scene, size = 256, base = 128, amp = 60): Texture {
  return makeTex(scene, 'noise' + size + base, size, (x, S) => { const img = x.createImageData(S, S); for (let i = 0; i < S * S; i++) { const v = base + (rnd() - 0.5) * amp; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; } x.putImageData(img, 0, 0); }, { wrap: true, srgb: false });
}
