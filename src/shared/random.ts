export class SeededRandom {
  private s: number;
  constructor(seed: number) { this.s = seed | 0; }
  next(): number { this.s |= 0; this.s = this.s + 0x6D2B79F5 | 0; let t = Math.imul(this.s ^ this.s >>> 15, 1 | this.s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  range(a: number, b: number): number { return a + this.next() * (b - a); }
  int(n: number): number { return Math.floor(this.next() * n); }
  pick<T>(arr: T[]): T { return arr[this.int(arr.length)]; }
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, t: number) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
