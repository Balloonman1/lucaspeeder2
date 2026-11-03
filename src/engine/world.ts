// Scene, sun, sky, image-based lighting, cascaded shadows, fog and the post-processing chain.
import {
  Scene, Color3, Color4, Vector3, DirectionalLight, HemisphericLight, UniversalCamera, MeshBuilder, Mesh,
  CascadedShadowGenerator, ShadowGenerator, HDRCubeTexture, DefaultRenderingPipeline, SSAO2RenderingPipeline,
  ImageProcessingConfiguration, Texture, StandardMaterial, GlowLayer,
} from '@babylonjs/core';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import { SkyMaterial } from '@babylonjs/materials/sky/skyMaterial';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { Quality } from './quality';

export interface World {
  scene: Scene;
  camera: UniversalCamera;
  sun: DirectionalLight;
  hemi: HemisphericLight;
  csm: CascadedShadowGenerator;
  sky: Mesh;
  skyMat: SkyMaterial;
  sunDisc: Mesh;
  pipeline: DefaultRenderingPipeline;
  glow: GlowLayer;
  setTimeOfDay(t: number): void;   // 0..1, 0.25 = sunrise, 0.5 = noon
  sunDir: Vector3;                 // direction TO the sun
}

export function createWorld(engine: AbstractEngine, q: Quality): World {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.7, 0.9, 1);
  scene.ambientColor = new Color3(0.0, 0.0, 0.0);
  scene.skipFrustumClipping = false;
  scene.autoClear = true;

  const camera = new UniversalCamera('cam', new Vector3(0, 6, -12), scene);
  camera.minZ = 0.3; camera.maxZ = 2400; camera.fov = 1.05; camera.inertia = 0;

  // sun + sky fill
  const sun = new DirectionalLight('sun', new Vector3(-0.4, -0.7, 0.5), scene);
  sun.intensity = 4.5; sun.diffuse = new Color3(1, 0.93, 0.84); sun.specular = sun.diffuse;
  sun.shadowMinZ = 1; sun.shadowMaxZ = 600;
  const hemi = new HemisphericLight('hemi', Vector3.Up(), scene);
  hemi.intensity = 0.35; hemi.diffuse = new Color3(0.72, 0.82, 1.0); hemi.groundColor = new Color3(0.42, 0.3, 0.2); hemi.specular = Color3.Black();

  // cascaded shadow maps
  const csm = new CascadedShadowGenerator(q.shadowMap, sun);
  csm.numCascades = q.cascades; csm.lambda = 0.92; csm.shadowMaxZ = 420; csm.stabilizeCascades = true;
  csm.depthClamp = true; csm.cascadeBlendPercentage = 0.12; csm.autoCalcDepthBounds = false;
  csm.filter = ShadowGenerator.FILTER_PCF; csm.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  csm.bias = 0.0025; csm.normalBias = 0.06; csm.penumbraDarkness = 0.6;
  const dbg = new URLSearchParams(location.search); if (dbg.has('nos')) sun.shadowEnabled = false;

  // sky dome (Preetham model) and a sun disc used for glare
  const skyMat = new SkyMaterial('sky', scene);
  skyMat.backFaceCulling = false; skyMat.useSunPosition = true; skyMat.turbidity = 2.6; skyMat.luminance = 1.0;
  skyMat.rayleigh = 2.4; skyMat.mieCoefficient = 0.007; skyMat.mieDirectionalG = 0.86; skyMat.dithering = true; skyMat.disableDepthWrite = true;
  const sky = MeshBuilder.CreateSphere('skydome', { diameter: 2200, segments: 24 }, scene);
  sky.material = skyMat; sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;
  const sunDisc = MeshBuilder.CreateDisc('sunDisc', { radius: 26, tessellation: 32 }, scene);
  const sunMat = new StandardMaterial('sunMat', scene); sunMat.emissiveColor = new Color3(1, 0.96, 0.9); sunMat.disableLighting = true; sunMat.backFaceCulling = false;
  sunDisc.material = sunMat; sunDisc.infiniteDistance = true; sunDisc.isPickable = false; sunDisc.applyFog = false; sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL;

  // image-based lighting from a dawn HDRI; the sky colour grades on top of it
  const env = new HDRCubeTexture('assets/hdri/kiara_1_dawn_1k.hdr', scene, 128, false, true, false, true);
  env.rotationY = 1.2;
  scene.environmentTexture = env; scene.environmentIntensity = 0.9;

  // atmospheric depth
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.0014; scene.fogColor = new Color3(0.86, 0.82, 0.74);

  // post chain
  const pipeline = new DefaultRenderingPipeline('post', true, scene, [camera]);
  pipeline.samples = q.msaa; pipeline.fxaaEnabled = q.msaa <= 1;
  pipeline.bloomEnabled = q.bloom; pipeline.bloomThreshold = 1.15; pipeline.bloomWeight = 0.22; pipeline.bloomKernel = 48; pipeline.bloomScale = 0.5;
  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing; ip.toneMappingEnabled = true; ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES; ip.exposure = 1.05; ip.contrast = 1.08;
  ip.vignetteEnabled = true; ip.vignetteWeight = 1.6; ip.vignetteStretch = 0.5; ip.vignetteColor = new Color4(0, 0, 0, 0); ip.vignetteCameraFov = 1.0;
  pipeline.chromaticAberrationEnabled = true; pipeline.chromaticAberration.aberrationAmount = 6; pipeline.chromaticAberration.radialIntensity = 0.8;
  pipeline.grainEnabled = true; pipeline.grain.intensity = 4; pipeline.grain.animated = true;
  pipeline.sharpenEnabled = true; pipeline.sharpen.edgeAmount = 0.22; pipeline.sharpen.colorAmount = 1;
  if (q.ssao) {
    const ssao = new SSAO2RenderingPipeline('ssao', scene, 0.6, [camera]);
    ssao.radius = 1.6; ssao.totalStrength = 1.1; ssao.base = 0.1; ssao.samples = 16; ssao.maxZ = 120; ssao.minZAspect = 0.25; ssao.epsilon = 0.02;
  }
  const glow = new GlowLayer('glow', scene, { blurKernelSize: 24, mainTextureRatio: 0.5 });
  glow.intensity = 0.5;

  const sunDir = new Vector3();
  const world: World = {
    scene, camera, sun, hemi, csm, sky, skyMat, sunDisc, pipeline, glow, sunDir,
    setTimeOfDay(t: number) {
      // sun path: rises at t=0.25 in the east (+x), sets at 0.75 in the west
      const a = (t - 0.25) * Math.PI * 2;
      const elev = Math.sin(a) * 1.05, az = Math.cos(a);
      sunDir.set(az * 0.78, Math.max(elev, -0.2), -0.52).normalize();
      sun.direction.copyFrom(sunDir.scale(-1));
      skyMat.sunPosition.copyFrom(sunDir.scale(100));
      const h = Math.max(0, sunDir.y);
      const low = Math.pow(1 - Math.min(1, h / 0.35), 2);            // 1 at horizon
      sun.intensity = 1.5 + 4.0 * Math.min(1, h / 0.22) * (1 - 0.35 * low);
      sun.diffuse.set(1, 0.93 - 0.3 * low, 0.84 - 0.5 * low); sun.specular.copyFrom(sun.diffuse);
      hemi.intensity = 0.18 + 0.3 * Math.min(1, h / 0.3);
      skyMat.turbidity = 2.8 + 5 * low; skyMat.rayleigh = 2.2 + 1.6 * low; skyMat.mieCoefficient = 0.006 + 0.02 * low;
      scene.fogColor.set(0.86 - 0.05 * low, 0.82 - 0.18 * low, 0.74 - 0.3 * low);
      scene.fogDensity = 0.0014 + 0.0012 * low;
      scene.environmentIntensity = 0.6 + 0.4 * Math.min(1, h / 0.3);
      sunDisc.position.copyFrom(camera.position).addInPlace(sunDir.scale(900));
    },
  };
  world.setTimeOfDay(0.3);
  scene.onBeforeRenderObservable.add(() => { sunDisc.position.copyFrom(camera.position).addInPlace(sunDir.scale(900)); });
  Texture.prototype.anisotropicFilteringLevel = q.anisotropy;
  return world;
}
