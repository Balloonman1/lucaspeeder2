// Rider: the Mixamo "Vanguard" soldier from the three.js examples (Soldier.glb), posed on the bike by bone
// rotations. The file's animations are discarded; the riding pose is procedural so it can lean with the bike.
import { Scene, SceneLoader, TransformNode, Quaternion, Vector3, AbstractMesh, PBRMaterial, Color3, AssetContainer, Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export interface Rider { root: TransformNode; bones: Map<string, TransformNode>; meshes: AbstractMesh[]; setLean(lean: number, pitch: number, brace: number): void; }

const D = Math.PI / 180;
// base riding pose: yaw/pitch/roll in degrees applied on top of the bind pose
const POSE: Record<string, [number, number, number]> = {
  'mixamorig:Hips': [0, 10, 0],
  'mixamorig:Spine': [0, 30, 0], 'mixamorig:Spine1': [0, 18, 0], 'mixamorig:Spine2': [0, 10, 0],
  'mixamorig:Neck': [0, -30, 0], 'mixamorig:Head': [0, -18, 0],
  'mixamorig:LeftArm': [0, -30, -55], 'mixamorig:RightArm': [0, -30, 55],
  'mixamorig:LeftForeArm': [0, -38, -30], 'mixamorig:RightForeArm': [0, -38, 30],
  'mixamorig:LeftHand': [0, 0, 15], 'mixamorig:RightHand': [0, 0, -15],
  'mixamorig:LeftUpLeg': [-16, -95, 0], 'mixamorig:RightUpLeg': [16, -95, 0],
  'mixamorig:LeftLeg': [0, 100, 0], 'mixamorig:RightLeg': [0, 100, 0],
  'mixamorig:LeftFoot': [0, -25, 0], 'mixamorig:RightFoot': [0, -25, 0],
};

export async function loadRiderContainer(scene: Scene): Promise<AssetContainer> {
  const c = await SceneLoader.LoadAssetContainerAsync('assets/models/', 'Soldier.glb', scene);
  for (const ag of c.animationGroups) ag.stop();
  return c;
}

export function makeRider(container: AssetContainer, scene: Scene, parent: TransformNode, suitTint: Color3, visorTint: Color3): Rider {
  const inst = container.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
  for (const ag of inst.animationGroups) { ag.stop(); ag.dispose(); }
  const root = inst.rootNodes[0] as TransformNode; root.name = 'rider'; root.parent = parent;
  root.scaling.set(0.9, 0.9, 0.9); root.position.set(0, 0.92, -0.12); root.rotationQuaternion = null; root.rotation.set(0, 0, 0);
  const bones = new Map<string, TransformNode>(); const base = new Map<string, Quaternion>();
  for (const n of root.getChildTransformNodes()) { const key = n.name.slice(n.name.indexOf('mixamorig:')); if (n.name.includes('mixamorig:')) { bones.set(key, n); if (!n.rotationQuaternion) n.rotationQuaternion = Quaternion.FromEulerVector(n.rotation); base.set(key, n.rotationQuaternion.clone()); } }
  const apply = (lean: number, pitch: number, brace: number) => {
    for (const [name, [y, p, r]] of Object.entries(POSE)) {
      const b = bones.get(name); const b0 = base.get(name); if (!b || !b0) continue;
      let yy = y, pp = p, rr = r;
      if (name === 'mixamorig:Spine' || name === 'mixamorig:Hips') { rr += lean * 12; pp += pitch * 8 + brace * 10; }
      if (name === 'mixamorig:Head' || name === 'mixamorig:Neck') { yy += lean * 10; pp -= brace * 6; }
      const dq = Quaternion.RotationYawPitchRoll(yy * D, pp * D, rr * D);
      b.rotationQuaternion!.copyFrom(b0.multiply(dq));
    }
  };
  apply(0, 0, 0);
  const meshes: AbstractMesh[] = root.getChildMeshes();
  for (const m of meshes) { m.isPickable = false; m.receiveShadows = true;
    const mat = m.material as PBRMaterial | null; if (mat && mat.getClassName() === 'PBRMaterial') { const mm = mat.clone(mat.name + '_' + suitTint.toHexString()); m.material = mm; if (m.name.toLowerCase().includes('visor')) { mm.metallic = 1; mm.roughness = 0.06; mm.albedoColor = visorTint; mm.clearCoat.isEnabled = true; } else { mm.albedoColor = suitTint; mm.roughness = 0.85; } } }
  return { root, bones, meshes, setLean: apply };
}
