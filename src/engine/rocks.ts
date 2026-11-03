// Boulders, hoodoo stacks and comms masts. Boulder geometry is procedural (noise-displaced icospheres with
// facet sharpening), wrapped in scanned sandstone via triplanar PBR. Placement is seeded so every run matches.
import { Scene, Mesh, MeshBuilder, Matrix, Vector3, Quaternion, Texture, Color3, VertexData, PBRMaterial, StandardMaterial, TransformNode } from '@babylonjs/core';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial';
import type { Terrain } from './terrain';
import type { Quality } from './quality';
import type { SplatSampler } from './vegetation';
import { SeededRandom, smooth } from '../shared/random';
import { fbm3, snoise3 } from '../shared/noise';

export interface Obstacle { x: number; z: number; r: number; h: number; kind: 'rock' | 'hoodoo' | 'mast' | 'butte'; }

function triplanarRock(scene: Scene, q: Quality, name: string, diff: string, nor: string, arm: string | null, tint: Color3, scale: number): PBRCustomMaterial {
  const res = q.texRes; const T = (n: string, srgb = false) => { const t = new Texture(`assets/textures/${res}/${n}_${res}.jpg`, scene); t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = q.anisotropy; (t as any).gammaSpace = srgb; return t; };
  const m = new PBRCustomMaterial(name, scene); m.metallic = 0; m.roughness = 1; m.albedoColor = tint; m.specularIntensity = 0.45;
  m.AddUniform('tD', 'sampler2D', T(diff, true)); m.AddUniform('tN', 'sampler2D', T(nor)); if (arm) m.AddUniform('tA', 'sampler2D', T(arm)); m.AddUniform('triScale', 'float', scale);
  m.Fragment_Definitions(`vec3 gRockN = vec3(0.0); float gRockR = 0.9; vec3 nrmR(vec3 n){ return normalize(n * 2.0 - 1.0); }`);
  m.Fragment_Custom_Albedo(`
    vec3 wp = vPositionW; vec3 gN = normalize(vNormalW);
    vec3 bw = abs(gN); bw = pow(bw, vec3(5.0)); bw /= (bw.x + bw.y + bw.z);
    float cs = triScale;
    vec3 cx = pow(texture2D(tD, wp.zy * cs).rgb, vec3(2.2)), cy = pow(texture2D(tD, wp.xz * cs).rgb, vec3(2.2)), cz = pow(texture2D(tD, wp.xy * cs).rgb, vec3(2.2));
    vec3 col = cx * bw.x + cy * bw.y + cz * bw.z;
    vec3 nx = nrmR(texture2D(tN, wp.zy * cs).rgb), ny = nrmR(texture2D(tN, wp.xz * cs).rgb), nz = nrmR(texture2D(tN, wp.xy * cs).rgb);
    vec3 nTS = normalize(nx * bw.x + ny * bw.y + nz * bw.z);
    ${arm ? 'vec3 ax = texture2D(tA, wp.zy * cs).rgb, ay = texture2D(tA, wp.xz * cs).rgb, az = texture2D(tA, wp.xy * cs).rgb; vec3 armv = ax * bw.x + ay * bw.y + az * bw.z; col *= 0.6 + 0.4 * armv.r; gRockR = 0.65 + 0.35 * armv.g;' : 'gRockR = 0.88;'}
    // dust settles on upward faces, darker underside
    col = mix(col, col * vec3(1.08, 0.98, 0.85), smoothstep(0.3, 0.9, gN.y) * 0.5);
    col *= 0.55 + 0.45 * smoothstep(-0.9, 0.5, gN.y);
    vec3 tT = normalize(cross(vec3(0.0, 0.0, 1.0), gN)); vec3 tB = cross(gN, tT);
    gRockN = normalize(tT * nTS.x + tB * nTS.y + gN * nTS.z);
    surfaceAlbedo *= col;
  `);
  m.Fragment_Before_Lights(`if (gRockN.x != 0.0 || gRockN.y != 0.0) normalW = normalize(mix(normalize(vNormalW), gRockN, 0.9));`);
  m.Fragment_Custom_MetallicRoughness(`metallicRoughness.g = gRockR;`);
  return m;
}

function boulderGeometry(scene: Scene, name: string, seed: number, angular: number): Mesh {
  const m = MeshBuilder.CreateIcoSphere(name, { radius: 1, subdivisions: 5, flat: false }, scene);
  const pos = m.getVerticesData('position')!; const rng = new SeededRandom(seed);
  const sx = 0.8 + rng.next() * 0.6, sy = 0.55 + rng.next() * 0.45, sz = 0.8 + rng.next() * 0.6; const off = rng.range(0, 100);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    let n = fbm3(x * 1.3 + off, y * 1.3, z * 1.3, 4, 2.2, 0.5);           // large lumps
    const facets = Math.abs(snoise3(x * 2.6 + off, y * 2.6, z * 2.6));    // ridge-like facets
    n = n * 0.35 + (1 - facets) * 0.2 * angular;
    const fine = snoise3(x * 7 + off, y * 7, z * 7) * 0.04;
    let r = 1 + n + fine;
    // flatten the base so it sits in the ground
    const base = smooth(-0.1, -0.7, y); r *= 1 - 0.35 * base;
    pos[i] = x * r * sx; pos[i + 1] = y * r * sy; pos[i + 2] = z * r * sz;
  }
  m.setVerticesData('position', pos); const nor: number[] = []; VertexData.ComputeNormals(pos, m.getIndices()!, nor); m.setVerticesData('normal', nor);
  return m;
}

function hoodooGeometry(scene: Scene, name: string, seed: number): Mesh {
  const rng = new SeededRandom(seed); const parts: Mesh[] = []; let y = 0; const n = 3 + rng.int(3);
  for (let s = 0; s < n; s++) {
    const h = rng.range(0.9, 2.2), rTop = rng.range(0.6, 1.1), rBot = rTop * rng.range(1.05, 1.4);
    const c = MeshBuilder.CreateCylinder(name + s, { height: h, diameterTop: rTop * 2, diameterBottom: rBot * 2, tessellation: 28, subdivisions: 6 }, scene);
    const pos = c.getVerticesData('position')!; const off = rng.range(0, 50);
    for (let i = 0; i < pos.length; i += 3) { const x = pos[i], yy = pos[i + 1], z = pos[i + 2]; const k = 1 + 0.18 * fbm3(x * 1.5 + off, yy * 0.8, z * 1.5, 3) + 0.06 * snoise3(x * 6, yy * 6 + off, z * 6); pos[i] = x * k; pos[i + 2] = z * k; }
    c.setVerticesData('position', pos); c.position.y = y + h / 2; c.position.x = rng.range(-0.15, 0.15); c.position.z = rng.range(-0.15, 0.15); y += h * 0.96; parts.push(c);
  }
  const cap = boulderGeometry(scene, name + 'cap', seed + 7, 0.6); cap.scaling.set(1.3, 0.55, 1.3); cap.position.y = y + 0.2; parts.push(cap);
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!; merged.name = name;
  const nor: number[] = []; VertexData.ComputeNormals(merged.getVerticesData('position')!, merged.getIndices()!, nor); merged.setVerticesData('normal', nor);
  return merged;
}

function buildMast(scene: Scene, name: string): Mesh {
  const metal = new PBRMaterial('mastMetal', scene); metal.albedoColor = new Color3(0.42, 0.4, 0.38); metal.metallic = 0.9; metal.roughness = 0.45;
  const rust = new PBRMaterial('mastRust', scene); rust.albedoColor = new Color3(0.45, 0.22, 0.12); rust.metallic = 0.3; rust.roughness = 0.85;
  const concrete = new PBRMaterial('mastConcrete', scene); concrete.albedoColor = new Color3(0.55, 0.52, 0.48); concrete.metallic = 0; concrete.roughness = 0.95;
  const beaconM = new StandardMaterial('beacon', scene); beaconM.emissiveColor = new Color3(0.3, 1.6, 1.8); beaconM.disableLighting = true;
  const parts: Mesh[] = [];
  const base = MeshBuilder.CreateCylinder('base', { height: 1.2, diameter: 4.2, tessellation: 10 }, scene); base.position.y = 0.4; base.material = concrete; parts.push(base);
  const H = 16;
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [0, 1.0]]) { const leg = MeshBuilder.CreateCylinder('leg', { height: H, diameterTop: 0.16, diameterBottom: 0.26, tessellation: 10 }, scene); leg.position.set(dx, H / 2 + 0.8, dz); leg.rotation.x = -dz * 0.035; leg.rotation.z = dx * 0.035; leg.material = metal; parts.push(leg); }
  for (let i = 1; i < 7; i++) { const ring = MeshBuilder.CreateTorus('ring', { diameter: 2.2 - i * 0.2, thickness: 0.08, tessellation: 18 }, scene); ring.position.y = 0.8 + i * 2.3; ring.material = i % 2 ? rust : metal; parts.push(ring); }
  const box = MeshBuilder.CreateBox('cab', { width: 1.6, height: 1.1, depth: 1.2 }, scene); box.position.y = 4.4; box.material = rust; parts.push(box);
  const dish = MeshBuilder.CreateCylinder('dish', { height: 0.3, diameterTop: 2.4, diameterBottom: 0.6, tessellation: 24 }, scene); dish.position.set(0.9, 12, 0); dish.rotation.z = -1.1; dish.material = metal; parts.push(dish);
  const beacon = MeshBuilder.CreateSphere('beacon', { diameter: 0.5, segments: 10 }, scene); beacon.position.y = H + 1.2; beacon.material = beaconM; parts.push(beacon);
  const spike = MeshBuilder.CreateCylinder('spike', { height: 2.2, diameterTop: 0.03, diameterBottom: 0.12, tessellation: 8 }, scene); spike.position.y = H + 0.4; spike.material = metal; parts.push(spike);
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!; merged.name = name;
  return merged;
}

export interface RockField { obstacles: Obstacle[]; meshes: Mesh[]; }

export function buildRocks(scene: Scene, terrain: Terrain, q: Quality, splat: SplatSampler, keepClear: (x: number, z: number) => boolean): RockField {
  const rng = new SeededRandom(9001); const obstacles: Obstacle[] = []; const meshes: Mesh[] = [];
  const R = terrain.meta.play + 20;
  const sandstone = triplanarRock(scene, q, 'rockSandstone', 'rock_face_03_diff', 'rock_face_03_nor_gl', 'rock_face_03_arm', new Color3(1, 0.86, 0.7), 0.34);
  const boulderMat = triplanarRock(scene, q, 'rockBoulder', 'rock_boulder_dry_diff', 'rocks_ground_02_nor_gl', 'rocks_ground_02_arm', new Color3(0.95, 0.88, 0.8), 0.42);
  const place = (minR: number, extra?: (x: number, z: number) => boolean): [number, number] | null => {
    for (let k = 0; k < 40; k++) { const x = rng.range(-R, R), z = rng.range(-R, R); if (Math.hypot(x, z) < 26) continue; if (keepClear(x, z)) continue; if (extra && !extra(x, z)) continue; if (terrain.slope(x, z) > 0.35) continue;
      if (obstacles.every(o => Math.hypot(o.x - x, o.z - z) > o.r + minR + 2.5)) return [x, z]; }
    return null;
  };
  // boulders: 6 base shapes, thin-instanced
  const bases = [0, 1, 2, 3, 4, 5].map(i => { const g = boulderGeometry(scene, 'boulder' + i, 100 + i * 13, i % 2 ? 1 : 0.5); g.material = i % 3 === 0 ? boulderMat : sandstone; g.isPickable = false; g.receiveShadows = true; return g; });
  const perBase: number[][] = bases.map(() => []); const m = new Matrix(); const qr = new Quaternion(); const pv = new Vector3(); const sv = new Vector3();
  for (let i = 0; i < q.rocks; i++) {
    const p = place(2); if (!p) continue; const r = rng.range(1.2, 3.6); const b = rng.int(bases.length);
    const y = terrain.height(p[0], p[1]) + r * 0.22 * (0.55 + 0.45 * 0.6);
    Quaternion.RotationYawPitchRollToRef(rng.range(0, 6.28), rng.range(-0.12, 0.12), rng.range(-0.12, 0.12), qr); pv.set(p[0], y - r * 0.35, p[1]); sv.set(r, r * rng.range(0.75, 1.05), r);
    Matrix.ComposeToRef(sv, qr, pv, m); perBase[b].push(...m.asArray());
    obstacles.push({ x: p[0], z: p[1], r: r * 0.95, h: Math.min(r * 1.15, 3.4), kind: 'rock' });
  }
  bases.forEach((b, i) => { if (perBase[i].length) { b.thinInstanceSetBuffer('matrix', new Float32Array(perBase[i]), 16, true); meshes.push(b); } else b.setEnabled(false); });
  // hoodoos
  const hoodoos = [0, 1, 2, 3].map(i => { const g = hoodooGeometry(scene, 'hoodoo' + i, 300 + i * 31); g.material = sandstone; g.isPickable = false; g.receiveShadows = true; return g; });
  const perH: number[][] = hoodoos.map(() => []);
  for (let i = 0; i < Math.round(q.rocks * 0.22); i++) {
    const p = place(3, (x, z) => splat.sample(x, z)[0] < 0.2); if (!p) continue; const s = rng.range(1.1, 2.1); const b = rng.int(hoodoos.length);
    Quaternion.RotationYawPitchRollToRef(rng.range(0, 6.28), 0, 0, qr); pv.set(p[0], terrain.height(p[0], p[1]) - 0.3, p[1]); sv.set(s, s * rng.range(0.9, 1.3), s);
    Matrix.ComposeToRef(sv, qr, pv, m); perH[b].push(...m.asArray());
    obstacles.push({ x: p[0], z: p[1], r: 1.4 * s, h: 99, kind: 'hoodoo' });
  }
  hoodoos.forEach((h, i) => { if (perH[i].length) { h.thinInstanceSetBuffer('matrix', new Float32Array(perH[i]), 16, true); meshes.push(h); } else h.setEnabled(false); });
  // comms masts (the glowing beacon pylons of the original, now steel)
  const mast = buildMast(scene, 'mast'); mast.isPickable = false; const perM: number[] = [];
  for (let i = 0; i < 12; i++) { const p = place(5); if (!p) continue; Quaternion.RotationYawPitchRollToRef(rng.range(0, 6.28), 0, 0, qr); pv.set(p[0], terrain.height(p[0], p[1]) - 0.2, p[1]); sv.set(1, 1, 1); Matrix.ComposeToRef(sv, qr, pv, m); perM.push(...m.asArray()); obstacles.push({ x: p[0], z: p[1], r: 2.4, h: 99, kind: 'mast' }); }
  mast.thinInstanceSetBuffer('matrix', new Float32Array(perM), 16, true); meshes.push(mast);
  for (const mesh of meshes) { mesh.alwaysSelectAsActiveMesh = true; mesh.thinInstanceEnablePicking = false; }
  return { obstacles, meshes };
}
