export interface Quality {
  name: 'low' | 'medium' | 'high' | 'ultra';
  renderScale: number;      // 1 = native resolution
  shadowMap: number;        // CSM atlas size per cascade
  cascades: number;
  ssao: boolean;
  bloom: boolean;
  msaa: number;
  grass: number;            // instances
  shrubs: number;
  rocks: number;
  particles: number;
  anisotropy: number;
  texRes: '1k' | '2k';
}
export const QUALITY: Record<Quality['name'], Quality> = {
  low:    { name: 'low',    renderScale: 0.75, shadowMap: 1024, cascades: 2, ssao: false, bloom: true,  msaa: 1, grass: 20000,  shrubs: 600,  rocks: 90,  particles: 300,  anisotropy: 2,  texRes: '1k' },
  medium: { name: 'medium', renderScale: 1.0,  shadowMap: 1024, cascades: 3, ssao: false, bloom: true,  msaa: 2, grass: 60000,  shrubs: 1400, rocks: 140, particles: 600,  anisotropy: 4,  texRes: '1k' },
  high:   { name: 'high',   renderScale: 1.0,  shadowMap: 2048, cascades: 3, ssao: true,  bloom: true,  msaa: 4, grass: 140000, shrubs: 2600, rocks: 190, particles: 900,  anisotropy: 8,  texRes: '2k' },
  ultra:  { name: 'ultra',  renderScale: 1.0,  shadowMap: 4096, cascades: 4, ssao: true,  bloom: true,  msaa: 4, grass: 240000, shrubs: 4000, rocks: 240, particles: 1400, anisotropy: 16, texRes: '2k' },
};
export function loadQuality(): Quality {
  const p = new URLSearchParams(location.search).get('q');
  if (p && (QUALITY as any)[p]) return (QUALITY as any)[p];
  try { const s = localStorage.getItem('sf2.quality'); if (s && (QUALITY as any)[s]) return (QUALITY as any)[s]; } catch {}
  return QUALITY.high;
}
export function saveQuality(name: string) { try { localStorage.setItem('sf2.quality', name); } catch {} }
