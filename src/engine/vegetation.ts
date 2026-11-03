// Grass tufts, scrub and flowers as thin instances with vertex wind.
import { Scene, Mesh, MeshBuilder, Matrix, Vector3, Quaternion, Texture, Color3 } from '@babylonjs/core';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial';
import type { Terrain } from './terrain';
import type { Quality } from './quality';
import { grassAtlas } from './textures';
import { SeededRandom } from '../shared/random';

export interface SplatSampler { sample(x: number, z: number): [number, number, number, number]; }

export async function loadSplatSampler(size: number): Promise<SplatSampler> {
  const img = new Image(); img.src = 'assets/levels/veyra/splat.png'; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, 512, 512);
  const d = ctx.getImageData(0, 0, 512, 512).data;
  return { sample(x, z) { const i = Math.max(0, Math.min(511, Math.floor((x / size + 0.5) * 511))), j = Math.max(0, Math.min(511, Math.floor((1 - (z / size + 0.5)) * 511))); const k = (j * 512 + i) * 4; return [d[k] / 255, d[k + 1] / 255, d[k + 2] / 255, d[k + 3] / 255]; } };
}

function windMaterial(scene: Scene, atlas: Texture, name: string): PBRCustomMaterial {
  const m = new PBRCustomMaterial(name, scene);
  m.albedoTexture = atlas; m.useAlphaFromAlbedoTexture = true; m.transparencyMode = 1 /* ALPHATEST */; m.alphaCutOff = 0.45;
  m.backFaceCulling = false; m.twoSidedLighting = true; m.metallic = 0; m.roughness = 0.9; m.specularIntensity = 0.3; m.environmentIntensity = 0.8;
  m.albedoColor = new Color3(1.0, 1.0, 1.0); m.ambientColor = new Color3(0.4, 0.4, 0.4);
  m.AddUniform('windTime', 'float', 0.001);
  m.Vertex_Before_PositionUpdated(`
    #ifdef INSTANCES
    vec3 wpos = world3.xyz;
    #else
    vec3 wpos = vec3(0.0);
    #endif
    float sway = position.y * position.y * 0.8;
    float w = sin(windTime * 1.7 + wpos.x * 0.35 + wpos.z * 0.21) * 0.6 + sin(windTime * 3.1 + wpos.z * 0.9) * 0.25;
    positionUpdated.x += w * 0.12 * sway; positionUpdated.z += w * 0.06 * sway;
  `);
  m.onBindObservable.add(() => { const e = m.getEffect(); if (e) e.setFloat('windTime', performance.now() / 1000); });
  return m;
}

function cardMesh(scene: Scene, name: string, cell: number, w: number, h: number, planes: number): Mesh {
  const pieces: Mesh[] = [];
  for (let p = 0; p < planes; p++) {
    const q = MeshBuilder.CreatePlane(name + p, { width: w, height: h, sideOrientation: Mesh.DOUBLESIDE }, scene);
    q.position.y = h / 2; q.rotation.y = p * Math.PI / planes; q.rotation.z = 0;
    // atlas cell uv: cells 0..3 in a 2x2 grid; uv.y stays 0 at ground, 1 at the tip (used by wind)
    const src = q.getVerticesData('uv')!; const uvs = new Float32Array(src.length); const cx = cell % 2, cy = Math.floor(cell / 2);
    // plane v runs 0 (bottom) .. 1 (top); atlas row cy occupies v in [1-(cy+1)*0.5, 1-cy*0.5]
    for (let i = 0; i < src.length; i += 2) { uvs[i] = cx * 0.5 + src[i] * 0.5; uvs[i + 1] = (1 - (cy + 1) * 0.5) + src[i + 1] * 0.5; }
    q.setVerticesData('uv', uvs); pieces.push(q);
  }
  const merged = Mesh.MergeMeshes(pieces, true, true, undefined, false, false)!; merged.name = name;
  return merged;
}

export interface VegetationHandles { meshes: Mesh[]; }

export async function buildVegetation(scene: Scene, terrain: Terrain, q: Quality, splat: SplatSampler, blocked: (x: number, z: number) => boolean): Promise<VegetationHandles> {
  const atlas = grassAtlas(scene);
  const rng = new SeededRandom(4242);
  const R = terrain.meta.play + 40;
  const layers: { mesh: Mesh; count: number; pick: (x: number, z: number) => number; scale: [number, number]; shadows: boolean }[] = [
    { mesh: cardMesh(scene, 'grassDry', 0, 1.1, 0.75, 2), count: Math.round(q.grass * 0.55), scale: [0.7, 1.4], shadows: false,
      pick: (x, z) => { const s = splat.sample(x, z); return (1 - s[0]) * (0.55 + 0.45 * (1 - s[1])) * (1 - 0.6 * terrain.slope(x, z) * 3); } },
    { mesh: cardMesh(scene, 'grassGreen', 1, 1.0, 0.7, 2), count: Math.round(q.grass * 0.45), scale: [0.6, 1.3], shadows: false,
      pick: (x, z) => { const s = splat.sample(x, z); const g = Math.max(0, 1 - s[0] - s[1] - 0.5 * s[2]); return g * g * (1 - 0.6 * terrain.slope(x, z) * 3); } },
    { mesh: cardMesh(scene, 'scrub', 2, 1.6, 1.2, 3), count: q.shrubs, scale: [0.8, 1.8], shadows: true,
      pick: (x, z) => { const s = splat.sample(x, z); return (1 - s[0]) * (0.6 + 0.4 * s[2]) * (1 - 0.5 * terrain.slope(x, z) * 3) * 0.8; } },
    { mesh: cardMesh(scene, 'flowers', 3, 1.0, 0.8, 2), count: Math.round(q.shrubs * 0.6), scale: [0.7, 1.2], shadows: false,
      pick: (x, z) => { const s = splat.sample(x, z); const g = Math.max(0, 1 - s[0] - s[1]); return g * (0.3 + 0.7 * Math.max(0, Math.sin(x * 0.045) * Math.cos(z * 0.038))) ; } },
  ];
  const meshes: Mesh[] = [];
  for (const L of layers) {
    const mat = windMaterial(scene, atlas, L.mesh.name + 'Mat'); L.mesh.material = mat; L.mesh.isPickable = false;
    const mats: number[] = []; let placed = 0, tries = 0; const m = new Matrix(); const q0 = new Quaternion(); const pos = new Vector3(); const sc = new Vector3();
    let cx = 0, cz = 0, left = 0;
    while (placed < L.count && tries < L.count * 6) {
      tries++;
      if (left <= 0) { cx = rng.range(-R, R); cz = rng.range(-R, R); left = 3 + rng.int(9); }
      const x = cx + rng.range(-3.5, 3.5), z = cz + rng.range(-3.5, 3.5); left--;
      if (blocked(x, z)) continue;
      const w = L.pick(x, z); if (rng.next() > w) continue;
      const s = rng.range(L.scale[0], L.scale[1]); const y = terrain.height(x, z) - 0.04;
      Quaternion.RotationYawPitchRollToRef(rng.range(0, 6.28), 0, 0, q0); pos.set(x, y, z); sc.set(s, s * rng.range(0.85, 1.15), s);
      Matrix.ComposeToRef(sc, q0, pos, m); mats.push(...m.asArray()); placed++;
    }
    L.mesh.thinInstanceSetBuffer('matrix', new Float32Array(mats), 16, true);
    L.mesh.thinInstanceEnablePicking = false; L.mesh.alwaysSelectAsActiveMesh = true; L.mesh.receiveShadows = false;
    (L.mesh as any).__castsShadows = L.shadows;
    meshes.push(L.mesh);
  }
  return { meshes };
}
