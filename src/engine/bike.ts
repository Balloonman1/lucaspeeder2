// Hero hover bike ("Scout"). TEMPORARY ASSET: built in code from lofted cross-sections and detail parts with
// full PBR materials. It is the stand-in until a commissioned or licensed model replaces it (see CREDITS.md).
import { Scene, Mesh, MeshBuilder, Vector3, Color3, PBRMaterial, StandardMaterial, TransformNode, Texture, Path3D, Matrix, Quaternion } from '@babylonjs/core';
import { scuffTexture } from './textures';

export interface BikeParts { root: TransformNode; hull: Mesh; rotors: Mesh[]; exhausts: Mesh[]; glows: Mesh[]; seatNode: TransformNode; barsNode: TransformNode; shadowCasters: Mesh[]; paint: PBRMaterial; trim: PBRMaterial; }
export interface BikeSpec { color: string; accent: string; }

let shared: { scuff: Texture } | null = null;

export function buildBike(scene: Scene, spec: BikeSpec): BikeParts {
  if (!shared) shared = { scuff: scuffTexture(scene) };
  const root = new TransformNode('bike', scene);
  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial | StandardMaterial, parent: TransformNode = root) => { m.material = mat; m.parent = parent; m.isPickable = false; parts.push(m); return m; };

  // ---- materials ----
  const paint = new PBRMaterial('paint', scene); paint.albedoColor = Color3.FromHexString(spec.color).toLinearSpace(); paint.metallic = 0.25; paint.roughness = 0.38;
  paint.clearCoat.isEnabled = true; paint.clearCoat.intensity = 1; paint.clearCoat.roughness = 0.08; paint.metallicTexture = shared.scuff; paint.useRoughnessFromMetallicTextureGreen = true; paint.useMetallnessFromMetallicTextureBlue = false; paint.useRoughnessFromMetallicTextureAlpha = false;
  const trimC = Color3.FromHexString(spec.accent).toLinearSpace();
  const trim = new PBRMaterial('trim', scene); trim.albedoColor = trimC; trim.metallic = 0.1; trim.roughness = 0.35; trim.emissiveColor = trimC.scale(2.2);
  const dark = new PBRMaterial('darkMetal', scene); dark.albedoColor = new Color3(0.08, 0.085, 0.09); dark.metallic = 0.85; dark.roughness = 0.55; dark.metallicTexture = shared.scuff; dark.useRoughnessFromMetallicTextureGreen = true; dark.useMetallnessFromMetallicTextureBlue = false; dark.useRoughnessFromMetallicTextureAlpha = false;
  const brushed = new PBRMaterial('brushed', scene); brushed.albedoColor = new Color3(0.55, 0.55, 0.56); brushed.metallic = 1; brushed.roughness = 0.42; brushed.anisotropy.isEnabled = true; brushed.anisotropy.intensity = 0.7;
  const rubber = new PBRMaterial('rubber', scene); rubber.albedoColor = new Color3(0.06, 0.06, 0.06); rubber.metallic = 0; rubber.roughness = 0.92;
  const canvas = new PBRMaterial('canvas', scene); canvas.albedoColor = new Color3(0.36, 0.28, 0.18); canvas.metallic = 0; canvas.roughness = 0.95; canvas.sheen.isEnabled = true; canvas.sheen.intensity = 0.5;
  const leather = new PBRMaterial('leather', scene); leather.albedoColor = new Color3(0.16, 0.1, 0.07); leather.metallic = 0; leather.roughness = 0.6; leather.metallicTexture = shared.scuff; leather.useRoughnessFromMetallicTextureGreen = true; leather.useMetallnessFromMetallicTextureBlue = false;
  const glass = new PBRMaterial('glass', scene); glass.albedoColor = new Color3(0.2, 0.3, 0.4); glass.metallic = 0; glass.roughness = 0.05; glass.alpha = 0.35; glass.transparencyMode = 2; glass.backFaceCulling = false; glass.environmentIntensity = 1.5;
  const core = new StandardMaterial('core', scene); core.emissiveColor = new Color3(0.6, 0.9, 1.8); core.disableLighting = true;
  const exhaustM = new StandardMaterial('exhaustM', scene); exhaustM.emissiveColor = new Color3(0.35, 0.65, 1.6); exhaustM.alpha = 0.45; exhaustM.disableLighting = true; exhaustM.backFaceCulling = false; exhaustM.alphaMode = 1 /* ADD */;
  const headlightM = new StandardMaterial('headlight', scene); headlightM.emissiveColor = new Color3(1.8, 1.7, 1.5); headlightM.disableLighting = true;

  // ---- hull: lofted cross-sections, nose at +z ----
  const stations: [number, number, number, number][] = [
    // z, half-width, half-height, centre-y
    [2.05, 0.05, 0.05, 0.62], [1.85, 0.22, 0.14, 0.62], [1.55, 0.34, 0.22, 0.6], [1.2, 0.42, 0.3, 0.6], [0.8, 0.46, 0.34, 0.62], [0.4, 0.47, 0.36, 0.64], [0.0, 0.46, 0.35, 0.65], [-0.4, 0.44, 0.33, 0.66], [-0.8, 0.42, 0.31, 0.66], [-1.2, 0.36, 0.27, 0.65], [-1.5, 0.26, 0.2, 0.63], [-1.7, 0.1, 0.1, 0.62], [-1.78, 0.02, 0.02, 0.62],
  ];
  const ring = (w: number, h: number, cy: number, z: number) => { const pts: Vector3[] = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2; let x = Math.cos(a), y = Math.sin(a); // flatter underside, slight chine
      const k = y < 0 ? 0.75 : 1.0; y *= k; x *= 1 + 0.12 * Math.abs(Math.sin(a * 2)) * (y < 0 ? 1 : 0.3); pts.push(new Vector3(x * w, cy + y * h, z)); } return pts; };
  const hull = add(MeshBuilder.CreateRibbon('hull', { pathArray: stations.map(s => ring(s[1], s[2], s[3], s[0])), closePath: true, sideOrientation: Mesh.FRONTSIDE }, scene), paint);
  // underside skid plate and frame
  const skid = add(MeshBuilder.CreateRibbon('skid', { pathArray: [[-1.3, 0.3], [-0.6, 0.38], [0.4, 0.4], [1.2, 0.38], [1.6, 0.3]].map(([z, w]) => [new Vector3(-w, 0.33, z), new Vector3(-w * 0.9, 0.27, z), new Vector3(0, 0.25, z), new Vector3(w * 0.9, 0.27, z), new Vector3(w, 0.33, z)]), sideOrientation: Mesh.DOUBLESIDE }, scene), dark);
  skid.position.y = 0.0;
  for (const sx of [-1, 1]) { const tube = add(MeshBuilder.CreateTube('frameTube', { path: [new Vector3(sx * 0.3, 0.3, -1.5), new Vector3(sx * 0.42, 0.28, -0.6), new Vector3(sx * 0.44, 0.3, 0.6), new Vector3(sx * 0.3, 0.36, 1.5)], radius: 0.035, tessellation: 10 }, scene), brushed); }
  // front cowl, windscreen and headlight
  const cowl = add(MeshBuilder.CreateRibbon('cowl', { pathArray: [[1.0, 0.3, 0.86, 0.7], [1.25, 0.34, 0.95, 0.5], [1.45, 0.3, 1.0, 0.3], [1.6, 0.18, 0.98, 0.12]].map(([z, w, y, d]) => [new Vector3(-w, y - d, z), new Vector3(-w * 0.7, y, z), new Vector3(0, y + 0.04, z), new Vector3(w * 0.7, y, z), new Vector3(w, y - d, z)]), sideOrientation: Mesh.DOUBLESIDE }, scene), paint);
  const screen = add(MeshBuilder.CreateRibbon('screen', { pathArray: [[1.0, 0.3, 0.9], [1.1, 0.33, 1.1], [1.15, 0.3, 1.26]].map(([z, w, y]) => [new Vector3(-w, y, z - 0.1), new Vector3(0, y + 0.03, z), new Vector3(w, y, z - 0.1)]), sideOrientation: Mesh.DOUBLESIDE }, scene), glass);
  const headlight = add(MeshBuilder.CreateSphere('headlight', { diameter: 0.26, segments: 12 }, scene), headlightM); headlight.position.set(0, 0.62, 1.92); headlight.scaling.set(1, 0.7, 0.4);
  const lightRim = add(MeshBuilder.CreateTorus('lightRim', { diameter: 0.3, thickness: 0.03, tessellation: 20 }, scene), brushed); lightRim.position.copyFrom(headlight.position); lightRim.rotation.x = Math.PI / 2;
  // handlebars
  const barsNode = new TransformNode('bars', scene); barsNode.parent = root; barsNode.position.set(0, 0.98, 1.12);
  const stem = add(MeshBuilder.CreateCylinder('stem', { height: 0.42, diameter: 0.07, tessellation: 10 }, scene), brushed, barsNode); stem.position.y = -0.2; stem.rotation.x = 0.35;
  const bar = add(MeshBuilder.CreateTube('bar', { path: [new Vector3(-0.42, 0.02, -0.12), new Vector3(-0.3, 0.05, 0.02), new Vector3(0, 0.07, 0.05), new Vector3(0.3, 0.05, 0.02), new Vector3(0.42, 0.02, -0.12)], radius: 0.022, tessellation: 10 }, scene), brushed, barsNode);
  for (const sx of [-1, 1]) { const grip = add(MeshBuilder.CreateCylinder('grip', { height: 0.14, diameter: 0.06, tessellation: 10 }, scene), rubber, barsNode); grip.position.set(sx * 0.4, 0.02, -0.1); grip.rotation.z = Math.PI / 2; grip.rotation.y = sx * 0.6;
    const lever = add(MeshBuilder.CreateBox('lever', { width: 0.12, height: 0.012, depth: 0.03 }, scene), brushed, barsNode); lever.position.set(sx * 0.34, 0.0, 0.0); }
  const dash = add(MeshBuilder.CreateBox('dash', { width: 0.26, height: 0.12, depth: 0.05 }, scene), dark, barsNode); dash.position.set(0, 0.12, 0.08); dash.rotation.x = -0.5;
  const dashScreen = add(MeshBuilder.CreatePlane('dashScreen', { width: 0.22, height: 0.08 }, scene), trim, barsNode); dashScreen.position.set(0, 0.125, 0.053); dashScreen.rotation.x = -0.5; dashScreen.rotation.y = Math.PI;
  // seat, tank and rider frame
  const seatNode = new TransformNode('seat', scene); seatNode.parent = root; seatNode.position.set(0, 0.98, -0.25);
  const seat = add(MeshBuilder.CreateSphere('seat', { diameter: 1, segments: 14 }, scene), leather, seatNode); seat.scaling.set(0.46, 0.1, 0.9);
  const seatBack = add(MeshBuilder.CreateSphere('seatBack', { diameter: 1, segments: 12 }, scene), leather, seatNode); seatBack.scaling.set(0.42, 0.22, 0.18); seatBack.position.set(0, 0.08, -0.52);
  const tank = add(MeshBuilder.CreateSphere('tank', { diameter: 1, segments: 16 }, scene), paint); tank.scaling.set(0.5, 0.26, 0.75); tank.position.set(0, 1.0, 0.5);
  const tankCap = add(MeshBuilder.CreateCylinder('tankCap', { height: 0.03, diameter: 0.12, tessellation: 16 }, scene), brushed); tankCap.position.set(0, 1.12, 0.55);
  // fuel cell and saddlebags
  const cell = add(MeshBuilder.CreateCapsule('fuelCell', { height: 0.6, radius: 0.16, tessellation: 16, capSubdivisions: 6 }, scene), brushed); cell.position.set(0, 0.95, -1.0); cell.rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) { const bag = add(MeshBuilder.CreateBox('bag', { width: 0.28, height: 0.4, depth: 0.62 }, scene), canvas); bag.position.set(sx * 0.6, 0.72, -0.75); bag.rotation.z = sx * 0.08;
    for (let s = 0; s < 2; s++) { const strap = add(MeshBuilder.CreateBox('strap', { width: 0.3, height: 0.05, depth: 0.04 }, scene), leather); strap.position.set(sx * 0.6, 0.6 + s * 0.24, -0.95 + s * 0.4); strap.rotation.z = sx * 0.08; }
    const buckle = add(MeshBuilder.CreateBox('buckle', { width: 0.04, height: 0.06, depth: 0.03 }, scene), brushed); buckle.position.set(sx * 0.75, 0.72, -0.75); }
  // rear twin turbines
  const rotors: Mesh[] = []; const exhausts: Mesh[] = []; const glows: Mesh[] = [];
  const turbine = (sx: number, z: number, r: number, y: number, parent: TransformNode, forwardDuct: boolean) => {
    const duct = add(MeshBuilder.CreateCylinder('duct', { height: 1.1, diameterTop: r * 2, diameterBottom: r * 2.2, tessellation: 28 }, scene), dark, parent); duct.rotation.x = Math.PI / 2; duct.position.set(sx, y, z);
    const lip = add(MeshBuilder.CreateTorus('lip', { diameter: r * 2.05, thickness: 0.06, tessellation: 28 }, scene), brushed, parent); lip.position.set(sx, y, z + 0.55);
    const lip2 = add(MeshBuilder.CreateTorus('lip2', { diameter: r * 2.25, thickness: 0.06, tessellation: 28 }, scene), brushed, parent); lip2.position.set(sx, y, z - 0.55);
    const hub = add(MeshBuilder.CreateCylinder('hub', { height: 0.5, diameter: r * 0.5, tessellation: 16 }, scene), brushed, parent); hub.rotation.x = Math.PI / 2; hub.position.set(sx, y, z + 0.2);
    const blades = new TransformNode('blades', scene); blades.parent = parent; blades.position.set(sx, y, z + 0.35);
    for (let i = 0; i < 11; i++) { const b = add(MeshBuilder.CreateBox('blade', { width: 0.05, height: r * 1.7, depth: 0.018 }, scene), brushed, blades); b.rotation.z = i / 11 * Math.PI * 2; b.rotation.y = 0.5; }
    const bladesMesh = Mesh.MergeMeshes(blades.getChildMeshes() as Mesh[], true, true, undefined, false, false)!; bladesMesh.parent = blades; bladesMesh.material = brushed; parts.push(bladesMesh); rotors.push(bladesMesh);
    const coreDisc = add(MeshBuilder.CreateDisc('core', { radius: r * 0.8, tessellation: 24 }, scene), core, parent); coreDisc.position.set(sx, y, z - 0.4); coreDisc.rotation.y = Math.PI; glows.push(coreDisc);
    const ex = add(MeshBuilder.CreateCylinder('exhaust', { height: 1.6, diameterTop: r * 1.6, diameterBottom: r * 0.4, tessellation: 20 }, scene), exhaustM, parent); ex.rotation.x = -Math.PI / 2; ex.position.set(sx, y, z - 1.3); exhausts.push(ex);
    for (let k = 0; k < 6; k++) { const vane = add(MeshBuilder.CreateBox('vane', { width: 0.02, height: r * 0.9, depth: 0.3 }, scene), dark, parent); vane.position.set(sx, y, z - 0.45); vane.rotation.z = k / 6 * Math.PI; }
  };
  turbine(-0.52, -1.25, 0.36, 0.62, root, false); turbine(0.52, -1.25, 0.36, 0.62, root, false);
  // front vectoring pods under the canards
  for (const sx of [-1, 1]) {
    const canard = add(MeshBuilder.CreateBox('canard', { width: 0.7, height: 0.035, depth: 0.42 }, scene), paint); canard.position.set(sx * 0.62, 0.5, 1.15); canard.rotation.z = sx * 0.12; canard.rotation.y = -sx * 0.25;
    const pod = add(MeshBuilder.CreateCylinder('pod', { height: 0.3, diameter: 0.4, tessellation: 20 }, scene), dark); pod.position.set(sx * 0.95, 0.32, 1.1); pod.rotation.x = 0.25;
    const podGlow = add(MeshBuilder.CreateDisc('podGlow', { radius: 0.15, tessellation: 20 }, scene), core); podGlow.position.set(sx * 0.95, 0.165, 1.14); podGlow.rotation.x = Math.PI / 2 + 0.25; glows.push(podGlow);
    const podRing = add(MeshBuilder.CreateTorus('podRing', { diameter: 0.42, thickness: 0.035, tessellation: 20 }, scene), trim); podRing.position.set(sx * 0.95, 0.2, 1.12); podRing.rotation.x = 0.25;
    const tip = add(MeshBuilder.CreateBox('tip', { width: 0.05, height: 0.14, depth: 0.3 }, scene), trim); tip.position.set(sx * 0.98, 0.5, 1.12); tip.rotation.y = -sx * 0.25;
  }
  // tail fin and lights
  const fin = add(MeshBuilder.CreateBox('fin', { width: 0.04, height: 0.5, depth: 0.7 }, scene), paint); fin.position.set(0, 1.05, -1.45); fin.rotation.x = -0.55;
  const tailLight = add(MeshBuilder.CreateBox('tailLight', { width: 0.08, height: 0.08, depth: 0.4 }, scene), trim); tailLight.position.set(0, 1.28, -1.6); tailLight.rotation.x = -0.55;
  // foot pegs and side vents
  for (const sx of [-1, 1]) { const peg = add(MeshBuilder.CreateCylinder('peg', { height: 0.22, diameter: 0.035, tessellation: 8 }, scene), rubber); peg.position.set(sx * 0.6, 0.38, -0.05); peg.rotation.z = Math.PI / 2;
    for (let v = 0; v < 4; v++) { const vent = add(MeshBuilder.CreateBox('vent', { width: 0.02, height: 0.06, depth: 0.22 }, scene), dark); vent.position.set(sx * 0.46, 0.62 + v * 0.07 - 0.1, 0.1); vent.rotation.z = sx * 0.15; } }
  // cables and antenna
  const cable = add(MeshBuilder.CreateTube('cable', { path: [new Vector3(0.2, 0.98, 1.0), new Vector3(0.35, 0.78, 0.7), new Vector3(0.4, 0.7, 0.2), new Vector3(0.44, 0.75, -0.6)], radius: 0.012, tessellation: 8 }, scene), rubber);
  const cable2 = add(MeshBuilder.CreateTube('cable2', { path: [new Vector3(-0.2, 0.98, 1.0), new Vector3(-0.36, 0.76, 0.6), new Vector3(-0.42, 0.72, 0.0), new Vector3(-0.42, 0.78, -0.7)], radius: 0.012, tessellation: 8 }, scene), rubber);
  const antenna = add(MeshBuilder.CreateCylinder('antenna', { height: 0.6, diameterTop: 0.008, diameterBottom: 0.02, tessellation: 6 }, scene), dark); antenna.position.set(0.3, 1.3, -1.3); antenna.rotation.x = 0.4;
  // rivets along the hull seams (thin instances of one tiny sphere)
  const rivet = MeshBuilder.CreateSphere('rivet', { diameter: 0.03, segments: 6 }, scene); rivet.material = brushed; rivet.parent = root; rivet.isPickable = false; parts.push(rivet);
  const rm: number[] = []; const mm = new Matrix(); const q0 = Quaternion.Identity(); const sv = new Vector3(1, 1, 1);
  for (let i = 1; i < stations.length - 1; i++) { const s = stations[i]; for (const sx of [-1, 1]) for (const yy of [0.15, -0.1]) { Matrix.ComposeToRef(sv, q0, new Vector3(sx * s[1] * 0.98, s[3] + yy * s[2] * 2, s[0]), mm); rm.push(...mm.asArray()); } }
  rivet.thinInstanceSetBuffer('matrix', new Float32Array(rm), 16, true);

  for (const p of parts) { p.receiveShadows = true; }
  return { root, hull, rotors, exhausts, glows, seatNode, barsNode, shadowCasters: parts.filter(p => p.material !== exhaustM && p.material !== glass && p !== rivet), paint, trim };
}
