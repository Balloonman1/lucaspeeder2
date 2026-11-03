// Pickups. TEMPORARY ASSETS: foods are modeled in code with PBR materials (rice grains, berry seeds, bread
// crust, labels). The energy drink body is the Khronos WaterBottle sample (CC-BY 4.0). Replace with scanned
// food models when available (see CREDITS.md and docs/missing-assets.md).
import { Scene, Mesh, MeshBuilder, TransformNode, Vector3, Color3, PBRMaterial, StandardMaterial, Matrix, Quaternion, DynamicTexture, Texture, SceneLoader, VertexData } from '@babylonjs/core';
import { SeededRandom } from '../shared/random';
import { snoise3 } from '../shared/noise';
import { ringTexture } from './textures';

export type FoodKind = 'rice' | 'veg' | 'strawberry' | 'raspberry' | 'milk' | 'bagel' | 'toast' | 'tomato' | 'cherry' | 'drink';

let M: Record<string, PBRMaterial> = {}; let ringTex: Texture | null = null; let bottleProto: Mesh[] | null = null;
function pbr(scene: Scene, name: string, color: Color3, rough: number, metal = 0, extra?: (m: PBRMaterial) => void): PBRMaterial {
  if (M[name]) return M[name]; const m = new PBRMaterial(name, scene); m.albedoColor = color; m.roughness = rough; m.metallic = metal; m.specularIntensity = 0.6; extra?.(m); M[name] = m; return m;
}
function labelTexture(scene: Scene, draw: (ctx: CanvasRenderingContext2D, S: number) => void, name: string): Texture {
  const dt = new DynamicTexture(name, { width: 512, height: 512 }, scene, true); const ctx = dt.getContext() as unknown as CanvasRenderingContext2D; draw(ctx, 512); dt.update(); return dt;
}
function displaceSphere(m: Mesh, amp: number, freq: number, seed: number) {
  const pos = m.getVerticesData('position')!; for (let i = 0; i < pos.length; i += 3) { const n = snoise3(pos[i] * freq + seed, pos[i + 1] * freq, pos[i + 2] * freq); const k = 1 + n * amp; pos[i] *= k; pos[i + 1] *= k; pos[i + 2] *= k; }
  m.setVerticesData('position', pos); const nor: number[] = []; VertexData.ComputeNormals(pos, m.getIndices()!, nor); m.setVerticesData('normal', nor);
}
function scatter(scene: Scene, proto: Mesh, n: number, rng: SeededRandom, place: (i: number) => [Vector3, Vector3, number]) {
  const arr: number[] = []; const m = new Matrix(); const q = new Quaternion();
  for (let i = 0; i < n; i++) { const [p, rot, s] = place(i); Quaternion.RotationYawPitchRollToRef(rot.y, rot.x, rot.z, q); Matrix.ComposeToRef(new Vector3(s, s, s), q, p, m); arr.push(...m.asArray()); }
  proto.thinInstanceSetBuffer('matrix', new Float32Array(arr), 16, true);
}
const setParent = (m: Mesh, p: TransformNode, mat: PBRMaterial) => { m.parent = p; m.material = mat; m.isPickable = false; m.receiveShadows = true; return m; };

export async function preloadItems(scene: Scene): Promise<void> {
  ringTex = ringTexture(scene);
  try { const r = await SceneLoader.ImportMeshAsync('', 'assets/models/', 'WaterBottle.glb', scene); bottleProto = r.meshes.filter(m => (m as Mesh).geometry) as Mesh[]; for (const m of r.meshes) m.setEnabled(false); } catch (e) { console.warn('bottle model missing', e); }
}

export function buildFood(scene: Scene, kind: FoodKind, seed: number): TransformNode {
  const rng = new SeededRandom(seed); const g = new TransformNode('food_' + kind, scene);
  const wood = pbr(scene, 'wood', new Color3(0.35, 0.22, 0.12), 0.85);
  const ceramic = pbr(scene, 'ceramic', new Color3(0.18, 0.3, 0.42), 0.25, 0, m => { m.clearCoat.isEnabled = true; m.clearCoat.roughness = 0.1; });
  const greenLeaf = pbr(scene, 'leaf', new Color3(0.12, 0.35, 0.1), 0.6);
  if (kind === 'rice') {
    const bowl = setParent(MeshBuilder.CreateLathe('bowl', { shape: [new Vector3(0, 0, 0), new Vector3(0.22, 0, 0), new Vector3(0.4, 0.08, 0), new Vector3(0.5, 0.25, 0), new Vector3(0.52, 0.36, 0), new Vector3(0.46, 0.36, 0), new Vector3(0.44, 0.3, 0), new Vector3(0.36, 0.1, 0), new Vector3(0.2, 0.04, 0), new Vector3(0, 0.04, 0)], tessellation: 40, sideOrientation: Mesh.DOUBLESIDE }, scene), g, ceramic);
    const heap = setParent(MeshBuilder.CreateSphere('heap', { diameter: 0.9, segments: 24 }, scene), g, pbr(scene, 'riceHeap', new Color3(0.93, 0.9, 0.82), 0.55)); heap.scaling.set(1, 0.42, 1); heap.position.y = 0.18; displaceSphere(heap, 0.05, 6, seed);
    const grain = setParent(MeshBuilder.CreateCapsule('grain', { height: 0.05, radius: 0.009, tessellation: 6, capSubdivisions: 2 }, scene), g, pbr(scene, 'rice', new Color3(0.98, 0.96, 0.9), 0.45, 0, m => { m.subSurface.isTranslucencyEnabled = true; m.subSurface.translucencyIntensity = 0.6; }));
    scatter(scene, grain, 320, rng, () => { const a = rng.range(0, 6.28), r = rng.range(0, 0.42); const y = 0.18 + 0.19 * Math.sqrt(Math.max(0, 1 - (r / 0.45) ** 2)); return [new Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new Vector3(rng.range(-0.6, 0.6), rng.range(0, 6.28), rng.range(0.9, 1.8)), rng.range(0.9, 1.2)]; });
    const bean = setParent(MeshBuilder.CreateCapsule('bean', { height: 0.07, radius: 0.02, tessellation: 10, capSubdivisions: 3 }, scene), g, pbr(scene, 'bean', new Color3(0.2, 0.08, 0.05), 0.3));
    scatter(scene, bean, 40, rng, () => { const a = rng.range(0, 6.28), r = rng.range(0, 0.36); const y = 0.2 + 0.19 * Math.sqrt(Math.max(0, 1 - (r / 0.45) ** 2)); return [new Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new Vector3(rng.range(-0.4, 0.4), rng.range(0, 6.28), rng.range(1.2, 1.9)), 1]; });
    for (let i = 0; i < 3; i++) { const herb = setParent(MeshBuilder.CreateDisc('herb', { radius: 0.05, tessellation: 7 }, scene), g, greenLeaf); herb.position.set(rng.range(-0.2, 0.2), 0.4, rng.range(-0.2, 0.2)); herb.rotation.set(Math.PI / 2 + rng.range(-0.5, 0.5), rng.range(0, 6), 0); herb.scaling.set(1, 0.5, 1); }
    const spoon = setParent(MeshBuilder.CreateCapsule('spoon', { height: 0.5, radius: 0.012, tessellation: 8 }, scene), g, pbr(scene, 'steel', new Color3(0.7, 0.7, 0.72), 0.25, 1)); spoon.position.set(0.3, 0.42, -0.15); spoon.rotation.z = -0.9; spoon.rotation.x = 0.3;
  } else if (kind === 'strawberry' || kind === 'raspberry') {
    const basket = setParent(MeshBuilder.CreateLathe('basket', { shape: [new Vector3(0, 0, 0), new Vector3(0.3, 0, 0), new Vector3(0.38, 0.22, 0), new Vector3(0.36, 0.22, 0), new Vector3(0.29, 0.03, 0), new Vector3(0, 0.03, 0)], tessellation: 24, sideOrientation: Mesh.DOUBLESIDE }, scene), g, pbr(scene, 'basket', new Color3(0.55, 0.42, 0.22), 0.9));
    const slat = setParent(MeshBuilder.CreateBox('slat', { width: 0.035, height: 0.22, depth: 0.01 }, scene), g, wood); scatter(scene, slat, 24, rng, i => { const a = i / 24 * 6.28; return [new Vector3(Math.cos(a) * 0.34, 0.11, Math.sin(a) * 0.34), new Vector3(0, -a + Math.PI / 2, 0), 1]; });
    if (kind === 'strawberry') {
      const berryM = pbr(scene, 'strawberry', new Color3(0.75, 0.03, 0.05), 0.28, 0, m => { m.clearCoat.isEnabled = true; m.clearCoat.roughness = 0.25; m.subSurface.isTranslucencyEnabled = true; m.subSurface.translucencyIntensity = 0.4; });
      const seedM = pbr(scene, 'seed', new Color3(0.9, 0.8, 0.4), 0.5);
      for (let i = 0; i < 7; i++) {
        const b = setParent(MeshBuilder.CreateSphere('berry', { diameter: 0.16, segments: 16 }, scene), g, berryM); const a = i / 7 * 6.28; b.position.set(Math.cos(a) * 0.16 * (i ? 1 : 0), 0.26 + (i ? 0 : 0.08), Math.sin(a) * 0.16 * (i ? 1 : 0)); b.scaling.set(1, 1.3, 1); b.rotation.set(rng.range(-0.8, 0.8), rng.range(0, 6), rng.range(-0.8, 0.8)); displaceSphere(b, 0.03, 20, i);
        const seeds = setParent(MeshBuilder.CreateSphere('seedP', { diameter: 0.012, segments: 4 }, scene), b, seedM); scatter(scene, seeds, 36, rng, () => { const u = rng.range(0, 6.28), v = rng.range(-1.2, 1.1); const rr = 0.08 * Math.cos(v); return [new Vector3(Math.cos(u) * rr, 0.08 * Math.sin(v) * 1.3, Math.sin(u) * rr), new Vector3(0, 0, 0), 1]; });
        for (let k = 0; k < 5; k++) { const l = setParent(MeshBuilder.CreateCylinder('leaf', { height: 0.09, diameterTop: 0, diameterBottom: 0.03, tessellation: 4 }, scene), b, greenLeaf); const la = k / 5 * 6.28; l.position.set(Math.cos(la) * 0.03, 0.1, Math.sin(la) * 0.03); l.rotation.set(Math.sin(la) * 1.3, 0, -Math.cos(la) * 1.3); }
      }
    } else {
      const drupe = setParent(MeshBuilder.CreateSphere('drupe', { diameter: 0.028, segments: 8 }, scene), g, pbr(scene, 'raspberry', new Color3(0.72, 0.05, 0.25), 0.22, 0, m => { m.clearCoat.isEnabled = true; m.subSurface.isTranslucencyEnabled = true; m.subSurface.translucencyIntensity = 0.5; }));
      const centers: Vector3[] = []; for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; centers.push(new Vector3(Math.cos(a) * 0.17 * (i < 7 ? 1 : 0.5), 0.27 + (i >= 7 ? 0.1 : 0) + rng.range(-0.02, 0.02), Math.sin(a) * 0.17 * (i < 7 ? 1 : 0.5))); }
      scatter(scene, drupe, centers.length * 40, rng, i => { const c = centers[Math.floor(i / 40)]; const k = i % 40; const v = (k / 40) * Math.PI * 0.9, u = k * 2.4; const rr = 0.055 * Math.sin(v); return [new Vector3(c.x + Math.cos(u) * rr, c.y + 0.06 - 0.06 * Math.cos(v) * 1.2, c.z + Math.sin(u) * rr), new Vector3(0, 0, 0), rng.range(0.85, 1.1)]; });
    }
  } else if (kind === 'veg') {
    for (let i = 0; i < 4; i++) { const plank = setParent(MeshBuilder.CreateBox('plank', { width: 0.7, height: 0.06, depth: 0.1 }, scene), g, wood); plank.position.set(0, 0.03 + (i % 2) * 0.14, -0.2 + i * 0.13); }
    for (const sx of [-1, 1]) { const side = setParent(MeshBuilder.CreateBox('side', { width: 0.06, height: 0.26, depth: 0.5 }, scene), g, wood); side.position.set(sx * 0.33, 0.13, 0); }
    const carrotM = pbr(scene, 'carrot', new Color3(0.9, 0.35, 0.05), 0.5, 0, m => { m.subSurface.isTranslucencyEnabled = true; m.subSurface.translucencyIntensity = 0.3; });
    for (let i = 0; i < 3; i++) { const c = setParent(MeshBuilder.CreateCylinder('carrot', { height: 0.42, diameterTop: 0.07, diameterBottom: 0.012, tessellation: 12, subdivisions: 6 }, scene), g, carrotM); c.position.set(-0.15 + i * 0.1, 0.22, 0.05 * i - 0.05); c.rotation.z = 1.25; c.rotation.y = i * 0.3;
      for (let k = 0; k < 4; k++) { const top = setParent(MeshBuilder.CreateCylinder('top', { height: 0.16, diameterTop: 0.002, diameterBottom: 0.012, tessellation: 5 }, scene), c, greenLeaf); top.position.set(rng.range(-0.02, 0.02), 0.28, rng.range(-0.02, 0.02)); top.rotation.set(rng.range(-0.5, 0.5), 0, rng.range(-0.5, 0.5)); } }
    const broc = setParent(MeshBuilder.CreateSphere('broc', { diameter: 0.2, segments: 16 }, scene), g, pbr(scene, 'broccoli', new Color3(0.08, 0.3, 0.1), 0.95)); broc.position.set(0.18, 0.3, -0.12); displaceSphere(broc, 0.12, 25, 3);
    const stalk = setParent(MeshBuilder.CreateCylinder('stalk', { height: 0.14, diameterTop: 0.05, diameterBottom: 0.07, tessellation: 10 }, scene), g, pbr(scene, 'stalk', new Color3(0.6, 0.75, 0.45), 0.8)); stalk.position.set(0.18, 0.2, -0.12);
    const pepper = setParent(MeshBuilder.CreateLathe('pepper', { shape: [new Vector3(0, 0, 0), new Vector3(0.07, 0, 0), new Vector3(0.1, 0.05, 0), new Vector3(0.09, 0.16, 0), new Vector3(0.05, 0.2, 0), new Vector3(0, 0.19, 0)], tessellation: 24, sideOrientation: Mesh.DOUBLESIDE }, scene), g, pbr(scene, 'pepper', new Color3(0.85, 0.65, 0.05), 0.22, 0, m => { m.clearCoat.isEnabled = true; })); pepper.position.set(0.12, 0.24, 0.15); displaceSphere(pepper, 0.08, 7, 5);
    const tom = setParent(MeshBuilder.CreateSphere('tomV', { diameter: 0.16, segments: 16 }, scene), g, pbr(scene, 'tomato', new Color3(0.8, 0.05, 0.03), 0.2, 0, m => { m.clearCoat.isEnabled = true; m.clearCoat.roughness = 0.1; })); tom.position.set(-0.22, 0.3, 0.14); displaceSphere(tom, 0.03, 5, 9);
    for (let i = 0; i < 2; i++) { const rad = setParent(MeshBuilder.CreateSphere('radish', { diameter: 0.07, segments: 12 }, scene), g, pbr(scene, 'radish', new Color3(0.75, 0.1, 0.3), 0.3)); rad.position.set(-0.05 + i * 0.1, 0.3, 0.2); }
  } else if (kind === 'bagel') {
    const bagelM = pbr(scene, 'bagel', new Color3(0.72, 0.45, 0.18), 0.75, 0, m => { m.subSurface.isTranslucencyEnabled = true; m.subSurface.translucencyIntensity = 0.3; });
    const paper = setParent(MeshBuilder.CreateDisc('paper', { radius: 0.42, tessellation: 24, sideOrientation: Mesh.DOUBLESIDE }, scene), g, pbr(scene, 'paper', new Color3(0.8, 0.7, 0.55), 1)); paper.rotation.x = Math.PI / 2; paper.position.y = 0.01;
    const seedM = pbr(scene, 'sesame', new Color3(0.92, 0.85, 0.6), 0.5);
    for (let i = 0; i < 3; i++) { const t = setParent(MeshBuilder.CreateTorus('bagelT', { diameter: 0.34, thickness: 0.15, tessellation: 36 }, scene), g, bagelM); t.position.set(i === 2 ? 0.1 : 0, 0.075 + i * 0.14, i === 2 ? -0.06 : 0); t.rotation.set(i === 2 ? 0.3 : 0, i * 0.8, 0); displaceSphere(t, 0.06, 9, i * 3);
      const seeds = setParent(MeshBuilder.CreateSphere('sesameP', { diameter: 0.012, segments: 4 }, scene), t, seedM); scatter(scene, seeds, 90, rng, () => { const u = rng.range(0, 6.28), v = rng.range(0.2, 1.6); const R = 0.17, r = 0.075; return [new Vector3(Math.cos(u) * (R + r * Math.cos(v)), r * Math.sin(v), Math.sin(u) * (R + r * Math.cos(v))), new Vector3(0, 0, 0), rng.range(0.8, 1.3)]; }); }
  } else if (kind === 'toast') {
    const plate = setParent(MeshBuilder.CreateLathe('plate', { shape: [new Vector3(0, 0, 0), new Vector3(0.3, 0, 0), new Vector3(0.38, 0.03, 0), new Vector3(0.4, 0.04, 0), new Vector3(0, 0.02, 0)], tessellation: 40, sideOrientation: Mesh.DOUBLESIDE }, scene), g, pbr(scene, 'plate', new Color3(0.9, 0.9, 0.92), 0.15, 0, m => { m.clearCoat.isEnabled = true; }));
    const toastTex = labelTexture(scene, (x, S) => { const gr = x.createRadialGradient(S / 2, S / 2, 30, S / 2, S / 2, S * 0.7); gr.addColorStop(0, '#e9c78c'); gr.addColorStop(0.6, '#c99a52'); gr.addColorStop(1, '#6b3d16'); x.fillStyle = gr; x.fillRect(0, 0, S, S); for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(80,40,10,${Math.random() * 0.35})`; x.fillRect(Math.random() * S, Math.random() * S, 3, 3); } }, 'toastTex');
    const toastM = pbr(scene, 'toast', Color3.White(), 0.9, 0, m => { m.albedoTexture = toastTex; });
    for (let i = 0; i < 2; i++) { const s = new TransformNode('slice', scene); s.parent = g; s.position.set(-0.06 + i * 0.12, 0.2, -0.08 + i * 0.1); s.rotation.set(-0.3, i * 0.35, 0);
      const body = setParent(MeshBuilder.CreateBox('toastBody', { width: 0.32, height: 0.3, depth: 0.04 }, scene), s, toastM);
      const top = setParent(MeshBuilder.CreateCylinder('toastTop', { height: 0.04, diameter: 0.17, tessellation: 20 }, scene), s, toastM); top.rotation.x = Math.PI / 2; top.position.set(-0.08, 0.15, 0); const top2 = top.clone('toastTop2'); top2.position.x = 0.08;
      const butter = setParent(MeshBuilder.CreateBox('butter', { width: 0.09, height: 0.06, depth: 0.015 }, scene), s, pbr(scene, 'butter', new Color3(0.95, 0.8, 0.3), 0.3, 0, m => { m.subSurface.isTranslucencyEnabled = true; })); butter.position.set(0.02, 0.03, 0.028); butter.rotation.z = 0.3; }
  } else if (kind === 'milk') {
    const label = labelTexture(scene, (x, S) => { x.fillStyle = '#f7f7fb'; x.fillRect(0, 0, S, S); x.fillStyle = '#2a5fd0'; x.fillRect(0, S * 0.62, S, S * 0.16); x.fillRect(0, S * 0.16, S, 10); x.font = 'bold 110px sans-serif'; x.textAlign = 'center'; x.fillText('MILK', S / 2, S * 0.5); x.font = 'bold 40px sans-serif'; x.fillText('VEYRA DAIRY · WHOLE · 1L', S / 2, S * 0.9); x.fillStyle = '#f7f7fb'; x.font = 'bold 52px sans-serif'; x.fillText('★ FRESH ★', S / 2, S * 0.735); }, 'milkLabel');
    const milkM = pbr(scene, 'milkCarton', Color3.White(), 0.55, 0, m => { m.albedoTexture = label; });
    const body = setParent(MeshBuilder.CreateBox('carton', { width: 0.26, height: 0.42, depth: 0.26 }, scene), g, milkM); body.position.y = 0.21;
    const gable = setParent(MeshBuilder.CreateCylinder('gable', { height: 0.26, diameter: 0.26, tessellation: 3 }, scene), g, pbr(scene, 'cartonTop', new Color3(0.95, 0.95, 0.97), 0.55)); gable.rotation.z = Math.PI / 2; gable.rotation.x = Math.PI / 6; gable.position.y = 0.42 + 0.075; gable.scaling.set(1, 1, 1.0);
    const cap = setParent(MeshBuilder.CreateCylinder('cap', { height: 0.025, diameter: 0.06, tessellation: 16 }, scene), g, pbr(scene, 'capBlue', new Color3(0.15, 0.35, 0.8), 0.4)); cap.position.set(0, 0.52, 0.08); cap.rotation.x = -0.52;
  } else if (kind === 'tomato') {
    const tM = pbr(scene, 'tomato', new Color3(0.8, 0.05, 0.03), 0.2, 0, m => { m.clearCoat.isEnabled = true; m.clearCoat.roughness = 0.1; m.subSurface.isTranslucencyEnabled = true; m.subSurface.translucencyIntensity = 0.4; });
    for (let i = 0; i < 4; i++) { const t = setParent(MeshBuilder.CreateSphere('tomato', { diameter: 0.2, segments: 18 }, scene), g, tM); const a = i / 3 * 6.28; t.position.set(i < 3 ? Math.cos(a) * 0.11 : 0, i < 3 ? 0.1 : 0.27, i < 3 ? Math.sin(a) * 0.11 : 0); t.scaling.set(1, 0.88, 1); displaceSphere(t, 0.025, 4, i * 2);
      const calyx = setParent(MeshBuilder.CreateCylinder('calyx', { height: 0.02, diameterTop: 0.0, diameterBottom: 0.06, tessellation: 5 }, scene), t, greenLeaf); calyx.position.y = 0.09; }
  } else if (kind === 'cherry') {
    const cM = pbr(scene, 'cherry', new Color3(0.45, 0.01, 0.04), 0.12, 0, m => { m.clearCoat.isEnabled = true; m.clearCoat.roughness = 0.05; });
    for (let i = 0; i < 6; i++) { const c = setParent(MeshBuilder.CreateSphere('cherry', { diameter: 0.11, segments: 16 }, scene), g, cM); const a = i / 6 * 6.28; c.position.set(Math.cos(a) * 0.12, 0.06 + (i % 2) * 0.04, Math.sin(a) * 0.12); c.scaling.set(1, 0.9, 1);
      const stem = setParent(MeshBuilder.CreateTube('stem', { path: [new Vector3(0, 0.04, 0), new Vector3(0.02, 0.12, 0.01), new Vector3(0.0, 0.2, 0.03)], radius: 0.004, tessellation: 6 }, scene), c, pbr(scene, 'stemW', new Color3(0.35, 0.3, 0.15), 0.8)); }
  } else if (kind === 'drink') {
    if (bottleProto) {
      for (const p of bottleProto) { const inst = p.clone('bottle', g)!; inst.setEnabled(true); inst.isPickable = false; inst.position.set(0, 0.0, 0); inst.scaling.set(3.2, 3.2, 3.2); inst.rotation.set(0, 0, 0); inst.position.y = 0.26; }
      const band = setParent(MeshBuilder.CreateCylinder('band', { height: 0.12, diameter: 0.26, tessellation: 24 }, scene), g, pbr(scene, 'drinkBand', new Color3(0.1, 0.9, 1), 0.3, 0, m => { m.emissiveColor = new Color3(0.1, 1.2, 1.4); })); band.position.y = 0.3;
    } else { const can = setParent(MeshBuilder.CreateCylinder('can', { height: 0.5, diameter: 0.22, tessellation: 24 }, scene), g, pbr(scene, 'drinkCan', new Color3(0.1, 0.8, 0.9), 0.3, 0.8)); can.position.y = 0.25; }
  }
  g.scaling.set(1.6, 1.6, 1.6);
  return g;
}

/** Locator: a slim ring on the ground and a soft light column. */
export function buildLocator(scene: Scene, color: Color3): TransformNode {
  const g = new TransformNode('locator', scene);
  const ringM = new StandardMaterial('ringM' + color.toHexString(), scene); ringM.diffuseTexture = ringTex!; ringM.opacityTexture = ringTex!; ringM.emissiveColor = color; ringM.disableLighting = true; ringM.alphaMode = 1; ringM.backFaceCulling = false;
  const ring = MeshBuilder.CreatePlane('ring', { size: 3.2 }, scene); ring.material = ringM; ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; ring.parent = g; ring.isPickable = false;
  const colM = new StandardMaterial('colM' + color.toHexString(), scene); colM.emissiveColor = color.scale(1.6); colM.alpha = 0.28; colM.disableLighting = true; colM.alphaMode = 1; colM.backFaceCulling = false;
  const col = MeshBuilder.CreateCylinder('column', { height: 60, diameterTop: 0.25, diameterBottom: 1.6, tessellation: 16, cap: Mesh.NO_CAP }, scene); col.material = colM; col.position.y = 30; col.applyFog = false; col.parent = g; col.isPickable = false;
  return g;
}
