// Veyra Canyon terrain: heightfield mesh from the generated height.bin and a 4-layer PBR splat material
// (scanned Poly Haven sets, CC0) with slope-driven triplanar sandstone on cliffs.
import { Scene, Mesh, VertexData, Texture, Vector3, Color3, PBRMaterial } from '@babylonjs/core';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial';
import type { Quality } from './quality';

export interface TerrainMeta { size: number; samples: number; play: number; hmin: number; hmax: number; spawn: { x: number; z: number; heading: number }; trails: number[][][]; }

export class Terrain {
  meta!: TerrainMeta;
  heights!: Float32Array;
  inner!: Mesh; outer!: Mesh;
  material!: PBRCustomMaterial;
  private N = 0; private size = 0; private half = 0; private step = 0;

  async load(scene: Scene, q: Quality): Promise<void> {
    const [metaR, binR] = await Promise.all([fetch('assets/levels/veyra/meta.json'), fetch('assets/levels/veyra/height.bin')]);
    this.meta = await metaR.json(); this.heights = new Float32Array(await binR.arrayBuffer());
    this.N = this.meta.samples; this.size = this.meta.size; this.half = this.size / 2; this.step = this.size / (this.N - 1);
    this.material = this.buildMaterial(scene, q);
    const playR = this.meta.play + 60;
    this.inner = this.buildGrid(scene, 'terrainInner', -playR, playR, 1.25, null);
    this.outer = this.buildGrid(scene, 'terrainOuter', -this.half, this.half, 5, playR);
    for (const m of [this.inner, this.outer]) { m.material = this.material; m.receiveShadows = true; m.isPickable = false; m.freezeWorldMatrix(); m.alwaysSelectAsActiveMesh = true; }
  }

  /** world height, bilinear */
  height(x: number, z: number): number {
    const N = this.N; const u = (x + this.half) / this.step, v = (z + this.half) / this.step;
    const i = Math.max(0, Math.min(N - 2, Math.floor(u))), j = Math.max(0, Math.min(N - 2, Math.floor(v)));
    const fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j)); const H = this.heights;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
  }
  normal(x: number, z: number, out = new Vector3()): Vector3 {
    const e = 0.8; const hx = this.height(x + e, z) - this.height(x - e, z), hz = this.height(x, z + e) - this.height(x, z - e);
    out.set(-hx, 2 * e, -hz); return out.normalize();
  }
  slope(x: number, z: number): number { const n = this.normal(x, z); return 1 - n.y; }

  private buildGrid(scene: Scene, name: string, lo: number, hi: number, spacing: number, hole: number | null): Mesh {
    const n = Math.floor((hi - lo) / spacing) + 1;
    const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2); const idx: number[] = [];
    const tmp = new Vector3();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = lo + i * spacing, z = lo + j * spacing; const k = j * n + i;
      pos[k * 3] = x; pos[k * 3 + 1] = this.height(x, z); pos[k * 3 + 2] = z;
      this.normal(x, z, tmp); nor[k * 3] = tmp.x; nor[k * 3 + 1] = tmp.y; nor[k * 3 + 2] = tmp.z;
      uv[k * 2] = (x + this.half) / this.size; uv[k * 2 + 1] = 1 - (z + this.half) / this.size;
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      if (hole !== null) { const cx = lo + (i + 0.5) * spacing, cz = lo + (j + 0.5) * spacing; if (Math.abs(cx) < hole && Math.abs(cz) < hole) continue; }
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, b, c, b, d, c);
    }
    const mesh = new Mesh(name, scene); const vd = new VertexData(); vd.positions = pos; vd.normals = nor; vd.uvs = uv; vd.indices = idx; vd.applyToMesh(mesh, false);
    return mesh;
  }

  /** Fallback: never let the world go black. A plain lit sandstone material replaces the splat shader. */
  private onTextureFailed(scene: Scene, name: string) {
    console.error('terrain texture failed to load: ' + name + ' (switching to fallback material)');
    if ((this as any)._fallback) return;
    const pm = new PBRMaterial('terrainFallback', scene); pm.albedoColor = new Color3(0.62, 0.47, 0.32); pm.roughness = 0.95; pm.metallic = 0; (this as any)._fallback = pm;
    for (const m of [this.inner, this.outer]) if (m) m.material = pm;
  }
  private buildMaterial(scene: Scene, q: Quality): PBRCustomMaterial {
    const res = q.texRes; const T = (n: string, srgb = false) => { const t = new Texture(`assets/textures/${res}/${n}_${res}.jpg`, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE, undefined, () => this.onTextureFailed(scene, n)); t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = q.anisotropy; (t as any).gammaSpace = srgb; return t; };
    const splat = new Texture('assets/levels/veyra/splat.png', scene, false, false, Texture.BILINEAR_SAMPLINGMODE); splat.wrapU = splat.wrapV = Texture.CLAMP_ADDRESSMODE; (splat as any).gammaSpace = false;
    const m = new PBRCustomMaterial('terrain', scene);
    m.metallic = 0; m.roughness = 1; m.albedoColor = Color3.White(); m.backFaceCulling = true; m.useRoughnessFromMetallicTextureAlpha = false;
    m.specularIntensity = 0.5; m.environmentIntensity = 1;
    m.AddUniform('splatMap', 'sampler2D', splat);
    m.AddUniform('tTrailD', 'sampler2D', T('rocky_trail_diff', true)); m.AddUniform('tTrailN', 'sampler2D', T('rocky_trail_nor_gl')); m.AddUniform('tTrailA', 'sampler2D', T('rocky_trail_arm'));
    m.AddUniform('tGroundD', 'sampler2D', T('forrest_ground_01_diff', true)); m.AddUniform('tGroundN', 'sampler2D', T('forrest_ground_01_nor_gl'));
    m.AddUniform('tSandD', 'sampler2D', T('sand_01_diff', true)); m.AddUniform('tSandN', 'sampler2D', T('sand_01_nor_gl'));
    m.AddUniform('tCliffD', 'sampler2D', T('rock_face_03_diff', true)); m.AddUniform('tCliffN', 'sampler2D', T('rock_face_03_nor_gl')); m.AddUniform('tCliffA', 'sampler2D', T('rock_face_03_arm'));
    m.AddUniform('terrainSize', 'float', this.size);
    const dbg = new URLSearchParams(location.search).get('tdbg');
    m.Fragment_Definitions(`
      ${dbg ? '#define TDBG ' + dbg : ''}
      vec3 gTerrainN = vec3(0.0); float gTerrainR = 1.0;
      vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
      vec3 nrm(vec3 n){ return normalize(n * 2.0 - 1.0); }
      // blend two tangent-space normals (RNM)
      vec3 blendN(vec3 n1, vec3 n2){ n1 += vec3(0.0, 0.0, 1.0); n2 *= vec3(-1.0, -1.0, 1.0); return normalize(n1 * dot(n1, n2) / n1.z - n2); }
    `);
    // computed inside the albedo block: layer weights, albedo, normal and roughness
    m.Fragment_Custom_Albedo(`
      vec3 wp = vPositionW;
      vec2 suv = vec2(wp.x / terrainSize + 0.5, 1.0 - (wp.z / terrainSize + 0.5));
      vec4 sw = texture2D(splatMap, suv);
      vec3 gN = normalize(vNormalW);
      float slope = 1.0 - gN.y;
      // macro variation to break tiling
      float macro = 0.75 + 0.5 * texture2D(tSandD, wp.xz * 0.0035).r;
      vec2 uvA = wp.xz * 0.19;      // trail 5.3 m tiles
      vec2 uvB = wp.xz * 0.16;      // ground
      vec2 uvC = wp.xz * 0.11;      // sand
      vec4 trailA = texture2D(tTrailA, uvA);
      vec3 cTrail = toLin(texture2D(tTrailD, uvA).rgb) * vec3(1.12, 0.9, 0.72) * macro; vec3 nTrail = nrm(texture2D(tTrailN, uvA).rgb);
      vec3 cGround = toLin(texture2D(tGroundD, uvB).rgb) * vec3(0.9, 1.0, 0.72) * macro; vec3 nGround = nrm(texture2D(tGroundN, uvB).rgb);
      vec3 cSand = toLin(texture2D(tSandD, uvC).rgb) * vec3(1.05, 0.9, 0.72) * macro; vec3 nSand = nrm(texture2D(tSandN, uvC).rgb);
      // weights: splat R trail, G sand/wash, B gravel (mapped to sand+trail mix), A mud (mapped to ground darker)
      float wTrail = sw.r; float wSand = sw.g + 0.5 * sw.b; float wGround = max(0.0, 1.0 - wTrail - wSand);
      // height-based blend sharpening using the trail arm (ao) as a height proxy
      float hTrail = trailA.r; wTrail = clamp(wTrail * (0.6 + 0.8 * hTrail) * 1.25, 0.0, 1.0);
      float sum = wTrail + wSand + wGround + 1e-4; wTrail /= sum; wSand /= sum; wGround /= sum;
      vec3 col = cTrail * wTrail + cGround * wGround + cSand * wSand;
      vec3 nTS = normalize(nTrail * wTrail + nGround * wGround + nSand * wSand);
      float rough = 0.95 * wTrail * (0.7 + 0.3 * trailA.g) + 0.9 * wGround + 0.85 * wSand;
      // cliff: triplanar sandstone where slope is steep
      float wCliff = smoothstep(0.16, 0.4, slope);
      if (wCliff > 0.001) {
        vec3 bw = abs(gN); bw = pow(bw, vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        float cs = 0.035; // 28 m tiles on walls
        vec3 cx = toLin(texture2D(tCliffD, wp.zy * cs).rgb), cy = toLin(texture2D(tCliffD, wp.xz * cs).rgb), cz = toLin(texture2D(tCliffD, wp.xy * cs).rgb);
        vec3 cCliff = (cx * bw.x + cy * bw.y + cz * bw.z) * vec3(1.0, 0.86, 0.72) * macro;
        vec3 nx = nrm(texture2D(tCliffN, wp.zy * cs).rgb), ny = nrm(texture2D(tCliffN, wp.xz * cs).rgb), nz = nrm(texture2D(tCliffN, wp.xy * cs).rgb);
        vec3 nCliffTS = normalize(nx * bw.x + ny * bw.y + nz * bw.z);
        float aCliff = texture2D(tCliffA, wp.zy * cs).r * bw.x + texture2D(tCliffA, wp.xz * cs).r * bw.y + texture2D(tCliffA, wp.xy * cs).r * bw.z;
        // strata banding on the rock by world height
        float band = 0.78 + 0.22 * smoothstep(-0.3, 0.3, sin(wp.y * 0.9 + 1.5 * sin(wp.y * 0.23)));
        cCliff *= band * (0.75 + 0.25 * aCliff);
        col = mix(col, cCliff, wCliff); nTS = normalize(mix(nTS, nCliffTS, wCliff)); rough = mix(rough, 0.82, wCliff);
      }
      // tangent frame from the terrain normal
      vec3 tT = normalize(cross(vec3(0.0, 0.0, 1.0), gN)); vec3 tB = cross(gN, tT);
      gTerrainN = normalize(tT * nTS.x + tB * nTS.y + gN * nTS.z);
      gTerrainR = rough;
      surfaceAlbedo = col;
      #ifdef TDBG
      surfaceAlbedo = TDBG;
      #endif
    `);
    m.Fragment_Before_Lights(`
      if (gTerrainN.x != 0.0 || gTerrainN.y != 0.0) normalW = normalize(mix(normalize(vNormalW), gTerrainN, 0.85));
    `);
    m.Fragment_Custom_MetallicRoughness(`metallicRoughness.g = gTerrainR;`);
    return m;
  }
}
