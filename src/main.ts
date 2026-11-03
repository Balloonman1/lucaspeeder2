// Speeder Forager 2.0: boot, scene assembly, match loop, camera, HUD and input.
import { Vector3, Color3, Color4, TransformNode, MeshBuilder, Mesh, StandardMaterial, PBRMaterial, AssetContainer, ParticleSystem, Quaternion } from '@babylonjs/core';
import { bootEngine } from './engine/boot';
import { createWorld, type World } from './engine/world';
import { Terrain } from './engine/terrain';
import { loadQuality, saveQuality, QUALITY } from './engine/quality';
import { buildVegetation, loadSplatSampler, type SplatSampler } from './engine/vegetation';
import { buildRocks, type Obstacle } from './engine/rocks';
import { buildBike, type BikeParts } from './engine/bike';
import { loadRiderContainer, makeRider, type Rider as RiderView } from './engine/rider';
import { preloadItems, buildFood, buildLocator, type FoodKind } from './engine/items';
import { FX } from './engine/fx';
import { GameAudio } from './engine/audio';
import { Match, type Rider, type Item, type Input, type MatchEvent } from './game/match';
import { BIKE_COLORS, TRIMS, BOT_NAMES, MAX_PLAYERS, FOODS, RULES } from './game/rules';
import { HUD } from './ui/hud';
import { SeededRandom, clamp, lerp } from './shared/random';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const DAY_LEN = 600; const START_CLOCK = +(params.get('clock') || 0.315);

interface RiderVis { bike: BikeParts; rider: RiderView; wash: ParticleSystem[]; }
interface ItemVis { node: TransformNode; locator: TransformNode; }

async function main() {
  const canvas = $('game') as HTMLCanvasElement;
  const q = loadQuality();
  const setLoad = (p: number, txt?: string) => { $('loadFill').style.width = Math.round(p * 100) + '%'; if (txt) $('loadTxt').textContent = txt; };
  setLoad(0.02, 'Starting renderer');
  const { engine, backend } = await bootEngine(canvas);
  $('backend').textContent = backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'; engine.setHardwareScalingLevel(1 / q.renderScale);
  const world = createWorld(engine, q); const scene = world.scene;
  setLoad(0.1, 'Loading canyon');
  const terrain = new Terrain(); await terrain.load(scene, q);
  setLoad(0.35, 'Scattering rocks');
  const splat: SplatSampler = await loadSplatSampler(terrain.meta.size);
  const trails = terrain.meta.trails; const trailDist = (x: number, z: number) => { let d = 1e9; for (const t of trails) for (const p of t) { const dd = Math.hypot(p[0] - x, p[1] - z); if (dd < d) d = dd; } return d; };
  const rocks = buildRocks(scene, terrain, q, splat, (x, z) => trailDist(x, z) < 9);
  setLoad(0.55, 'Growing scrub');
  const veg = await buildVegetation(scene, terrain, q, splat, (x, z) => splat.sample(x, z)[0] > 0.45 || rocks.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.5));
  for (const m of rocks.meshes) world.csm.addShadowCaster(m, false);
  for (const m of veg.meshes) if ((m as any).__castsShadows) world.csm.addShadowCaster(m, false);
  setLoad(0.75, 'Loading rider and supplies');
  const riderContainer: AssetContainer = await loadRiderContainer(scene);
  await preloadItems(scene);
  const fx = new FX(scene, q); const audio = new GameAudio(); const hud = new HUD();
  setLoad(0.95, 'Compiling shaders');
  // watchdog: never leave the player on the loading screen. If shaders do not come up in time on WebGPU,
  // reload on the verified WebGL 2 path; on WebGL just continue (materials compile on first use).
  const ready = scene.whenReadyAsync(); let timedOut = false;
  await Promise.race([ready, new Promise<void>(r => setTimeout(() => { timedOut = true; r(); }, backend === 'webgpu' ? 25000 : 40000))]);
  if (timedOut && backend === 'webgpu') { const u = new URL(location.href); u.searchParams.delete('webgpu'); u.searchParams.set('webgl', '1'); location.replace(u.toString()); return; }

  // ---------- ground adapter for the simulation ----------
  const ground = { height: (x: number, z: number) => terrain.height(x, z), normal: (x: number, z: number) => { const n = terrain.normal(x, z); return { x: n.x, y: n.y, z: n.z }; },
    surface: (x: number, z: number) => { const s = splat.sample(x, z); if (s[0] > 0.45) return { grip: 1.0, kind: 'trail' as const }; if (s[1] > 0.5) return { grip: 0.8, kind: 'sand' as const }; return { grip: 0.92, kind: 'ground' as const }; } };
  const obstacles: Obstacle[] = rocks.obstacles;

  // ---------- menus ----------
  const me = { name: 'Rider', color: BIKE_COLORS[0], accent: TRIMS[0] }; try { Object.assign(me, JSON.parse(localStorage.getItem('sf2.rider') || '{}')); } catch {}
  const paintSel = $('paintSel') as HTMLSelectElement, trimSel = $('trimSel') as HTMLSelectElement, qualitySel = $('qualitySel') as HTMLSelectElement;
  BIKE_COLORS.forEach((c, i) => { const o = document.createElement('option'); o.value = c; o.textContent = ['Blue', 'Red', 'Orange', 'Green', 'Pink', 'Cyan', 'Purple', 'White', 'Tangerine', 'Black'][i]; paintSel.appendChild(o); });
  TRIMS.forEach((c, i) => { const o = document.createElement('option'); o.value = c; o.textContent = ['Cyan', 'Pink', 'Yellow', 'Green', 'White', 'Red', 'Blue', 'Purple'][i]; trimSel.appendChild(o); });
  paintSel.value = me.color; trimSel.value = me.accent; ($('nameIn') as HTMLInputElement).value = me.name; qualitySel.value = q.name;
  qualitySel.onchange = () => { saveQuality(qualitySel.value); location.reload(); };
  let matchLen = 90; for (const b of Array.from(document.querySelectorAll('.mode')) as HTMLButtonElement[]) b.onclick = () => { document.querySelectorAll('.mode').forEach(x => x.classList.remove('on')); b.classList.add('on'); matchLen = +b.dataset.len!; };
  $('startNote').textContent = `Renderer: ${backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'} · ${q.name} preset`;
  $('loading').classList.add('hidden'); $('start').classList.remove('hidden');

  // ---------- match state ----------
  let match: Match | null = null; let riderVis = new Map<string, RiderVis>(); let itemVis = new Map<number, ItemVis>(); let tomatoMeshes: Mesh[] = [];
  let paused = false; let camMode: 'chase' | 'hood' = 'chase'; let spectating: string | null = null; let shake = 0; let lastT = performance.now();
  const keys: Record<string, boolean> = {}; const jumpReq = { jump: false, flip: false }; let lastJump = 0; let throwReq = false;
  const tomatoM = new PBRMaterial('tomatoFlight', scene); tomatoM.albedoColor = new Color3(0.8, 0.05, 0.03); tomatoM.roughness = 0.2; tomatoM.clearCoat.isEnabled = true;

  const foodKindOf = (it: Item): FoodKind => it.kind === 'food' ? (it.type as FoodKind) : it.kind;
  const locColor = (it: Item) => it.kind === 'food' ? new Color3(1, 0.85, 0.45) : it.kind === 'drink' ? new Color3(0.2, 0.9, 1) : it.kind === 'tomato' ? new Color3(1, 0.4, 0.3) : new Color3(1, 0.4, 0.8);

  function clearMatch() {
    for (const v of riderVis.values()) { v.bike.root.dispose(false, true); v.rider.root.dispose(false, true); for (const w of v.wash) w.dispose(); }
    for (const v of itemVis.values()) { v.node.dispose(false, true); v.locator.dispose(false, true); } for (const m of tomatoMeshes) m.dispose(); tomatoMeshes = [];
    riderVis = new Map(); itemVis = new Map();
  }
  function startMatch() {
    clearMatch(); audio.ensure();
    const seed = Math.floor(Math.random() * 1e9); match = new Match(seed, matchLen, 'p0', ground, obstacles); spectating = null; paused = false;
    const rng = new SeededRandom(seed); const hats = BOT_NAMES.slice(); const spots: [number, number, number][] = [];
    for (let i = 0; i < MAX_PLAYERS; i++) { const a = i / MAX_PLAYERS * Math.PI * 2; spots.push([Math.cos(a) * 16, Math.sin(a) * 16, a]); }
    match.addRider({ id: 'p0', name: me.name, color: me.color, accent: me.accent, bike: 'scout', bot: false, x: spots[0][0], z: spots[0][1], heading: Math.atan2(-spots[0][0], -spots[0][1]) + Math.PI });
    for (let i = 1; i < MAX_PLAYERS; i++) { const s = spots[i]; match.addRider({ id: 'b' + i, name: hats[(i * 7) % hats.length], color: BIKE_COLORS[(i * 3 + 1) % BIKE_COLORS.length], accent: TRIMS[rng.int(TRIMS.length)], bike: 'scout', bot: true, x: s[0], z: s[1], heading: Math.atan2(-s[0], -s[1]) + Math.PI }); }
    match.spawnAllItems();
    for (const r of match.riders) addRiderVis(r);
    for (const it of match.items) addItemVis(it);
    $('start').classList.add('hidden'); $('over').classList.add('hidden'); hud.show(true); hud.countdown(4);
    world.camera.fov = 1.05; world.setTimeOfDay(START_CLOCK);
  }
  function addRiderVis(r: Rider) {
    const bike = buildBike(scene, { color: r.color, accent: r.accent });
    const rider = makeRider(riderContainer, scene, bike.root, r.clone ? new Color3(0.2, 0.5, 0.25) : Color3.FromHexString(r.color).toLinearSpace().scale(0.35).add(new Color3(0.08, 0.07, 0.06)), r.clone ? new Color3(0.5, 1, 0.6) : new Color3(0.85, 0.9, 1));
    for (const m of bike.shadowCasters) world.csm.addShadowCaster(m, false); for (const m of rider.meshes) world.csm.addShadowCaster(m as Mesh, false);
    const wash = [fx.washEmitter(bike.root, new Vector3(-0.5, -0.5, -1.2)), fx.washEmitter(bike.root, new Vector3(0.5, -0.5, -1.2))];
    riderVis.set(r.id, { bike, rider, wash });
  }
  function addItemVis(it: Item) {
    const node = buildFood(scene, foodKindOf(it), it.id * 31 + 7); const locator = buildLocator(scene, locColor(it));
    for (const m of node.getChildMeshes()) world.csm.addShadowCaster(m as Mesh, false);
    itemVis.set(it.id, { node, locator }); placeItem(it);
  }
  function placeItem(it: Item) { const v = itemVis.get(it.id); if (!v) return; const y = terrain.height(it.x, it.z); v.node.position.set(it.x, y + 0.05, it.z); v.locator.position.set(it.x, y, it.z); const n = terrain.normal(it.x, it.z); v.node.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), n, new Quaternion()); }

  // ---------- events ----------
  function handle(e: MatchEvent) {
    const m = match!; const local = (to: string) => to === 'all' || to === m.localId;
    switch (e.t) {
      case 'msg': if (local(e.to)) hud.message(e.text, e.cls); if (/is out of energy/.test(e.text)) { hud.announce(e.text.replace(' is out of energy!', '').toUpperCase() + ' IS OUT', 'bad'); audio.play('bad', 0.6); } if (/\+\d+ energy$/.test(e.text) && local(e.to)) audio.play('pickup', 0.7, 1 + Math.random() * 0.1); break;
      case 'announce': if (local(e.to)) hud.announce(e.text, e.cls, e.sub); break;
      case 'sound': if (local(e.to)) audio.play(e.name === 'close' ? 'glass' : 'click', 0.6); break;
      case 'pickup': { const v = itemVis.get(e.item.id); if (v) { v.node.setEnabled(false); v.locator.setEnabled(false); } const c = locColor(e.item); fx.burst(new Vector3(e.item.x, terrain.height(e.item.x, e.item.z) + 1, e.item.z), new Color4(c.r, c.g, c.b, 0.8), 36, 5); break; }
      case 'crash': { const p = new Vector3(e.rider.x, e.rider.y + 0.4, e.rider.z); fx.sparksAt(p, 50); fx.burst(p, new Color4(0.8, 0.68, 0.5, 0.6), 30, 6); if (e.rider.id === m.localId) { shake = 1.2; hud.flash(); audio.play('crash', 0.9); } break; }
      case 'jump': if (e.rider.id === m.localId) { audio.play('click', 0.5, e.flip ? 0.7 : 1); if (e.flip) hud.announce('BACKFLIP!', 'boost', '-5 energy'); else hud.message('Jump -2 energy', 'boost'); } break;
      case 'land': { fx.dustRing(new Vector3(e.rider.x, terrain.height(e.rider.x, e.rider.z) + 0.2, e.rider.z), clamp(e.force / 10, 0.5, 1.6)); if (e.rider.id === m.localId) { shake = Math.max(shake, 0.5); audio.play('land', clamp(e.force / 15, 0.2, 0.9)); } break; }
      case 'throw': if (e.rider.id === m.localId) audio.play('click', 0.6, 1.3); break;
      case 'hit': { fx.burst(new Vector3(e.tomato.x, e.tomato.y, e.tomato.z), new Color4(0.85, 0.1, 0.05, 0.9), 40, 7); if (e.target.id === m.localId) { shake = 1; hud.flash(); } break; }
      case 'out': break;
      case 'clone': addRiderVis(e.rider); break;
      case 'over': { const meR = m.riders.find(r => r.id === m.localId)!; hud.showOver(m, meR); const place = m.standings.findIndex(s => s.id === meR.id) + 1; audio.play(place === 1 ? 'win' : 'bad', 0.8); audio.engine(0, false, false); hud.show(false); m.running = false; break; }
    }
  }

  // ---------- input ----------
  addEventListener('keydown', ev => { const k = ev.key.toLowerCase(); keys[k] = true; if (k === ' ') { ev.preventDefault(); requestJump(); } if (k === 'f') throwReq = true; if (k === 'p' && match && match.running) togglePause(); if (k === 'c') camMode = camMode === 'chase' ? 'hood' : 'chase'; if (k === 'tab' && match && !match.riders.find(r => r.id === match!.localId)!.alive) { ev.preventDefault(); cycleSpectate(); } });
  addEventListener('keyup', ev => { keys[ev.key.toLowerCase()] = false; });
  function requestJump() { const now = performance.now(); if (now - lastJump < 420) jumpReq.flip = true; jumpReq.jump = true; lastJump = now; }
  function togglePause() { paused = !paused; $('pause').classList.toggle('hidden', !paused); }
  $('resumeBtn').onclick = () => togglePause();
  function cycleSpectate() { if (!match) return; const alive = match.riders.filter(r => r.alive && !r.clone); if (!alive.length) return; const i = alive.findIndex(r => r.id === spectating); spectating = alive[(i + 1) % alive.length].id; }
  function readInput(): Input {
    const j = jumpReq.jump, fl = jumpReq.flip, th = throwReq; jumpReq.jump = false; jumpReq.flip = false; throwReq = false;
    if (params.has('drive') && match) { const r = match.riders.find(x => x.id === match!.localId)!; const [t] = match.nearestItem(r.x, r.z, it => it.kind === 'food'); let turn = 0; if (t) { const d = Math.atan2(t.x - r.x, t.z - r.z) - r.heading; turn = clamp(Math.atan2(Math.sin(d), Math.cos(d)) * 2, -1, 1); } return { fwd: true, back: false, left: false, right: false, turn, jump: match.t > 4 && match.t % 9 < 0.03, flip: false, throw: th }; }
    return { fwd: !!(keys['w'] || keys['arrowup']), back: !!(keys['s'] || keys['arrowdown']), left: !!(keys['a'] || keys['arrowleft']), right: !!(keys['d'] || keys['arrowright']), jump: j, flip: fl, throw: th };
  }
  $('playBtn').onclick = () => { me.name = ($('nameIn') as HTMLInputElement).value.trim() || 'Rider'; me.color = paintSel.value; me.accent = trimSel.value; try { localStorage.setItem('sf2.rider', JSON.stringify(me)); } catch {} startMatch(); canvas.focus(); };
  $('againBtn').onclick = () => startMatch(); $('menuBtn').onclick = () => { $('over').classList.add('hidden'); $('start').classList.remove('hidden'); };
  $('btnFull').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); };
  $('btnMute').onclick = () => { audio.setMuted(!audio.muted); $('btnMute').textContent = audio.muted ? '🔇' : '🔊'; };
  $('btnSettings').onclick = () => { if (match && match.running) togglePause(); };
  canvas.addEventListener('pointerdown', () => audio.ensure());

  // ---------- camera ----------
  const cam = world.camera; const camPos = new Vector3(0, 8, -14); const camTgt = new Vector3(); let camInit = false;
  function updateCamera(dt: number, e: Rider, vis: RiderVis | undefined) {
    const m = match!; const ground = terrain.height(e.x, e.z);
    const fx_ = Math.sin(e.heading), fz_ = Math.cos(e.heading); const spdN = Math.min(1, Math.abs(e.speed) / 28);
    let wantPos: Vector3, wantTgt: Vector3;
    if (m.countdown > 0) { // crane down over the grid during the countdown
      const k = 1 - m.countdown / RULES.countdown; const a = k * 1.2 - 1.2;
      wantPos = new Vector3(e.x - fx_ * (22 - 14 * k) + Math.sin(a) * 10 * (1 - k), ground + 12 - 8 * k, e.z - fz_ * (22 - 14 * k) + Math.cos(a) * 10 * (1 - k)); wantTgt = new Vector3(e.x, ground + 1.2, e.z);
    } else if (camMode === 'hood') {
      wantPos = new Vector3(e.x + fx_ * 0.9, e.y + 1.35, e.z + fz_ * 0.9); wantTgt = new Vector3(e.x + fx_ * 12, e.y + 1.2, e.z + fz_ * 12);
    } else {
      const back = 7.4 + Math.abs(e.speed) * 0.11 + (e.boost > 0 ? 1.2 : 0), up = 2.5 + e.y - ground - 0.9 + spdN * 0.4;
      const lag = clamp(e.steer * 1.4, -1.6, 1.6); // lateral lag on turns
      const cx = e.x - fx_ * back + fz_ * lag, cz = e.z - fz_ * back - fx_ * lag;
      const cy = Math.max(terrain.height(cx, cz) + 1.6, ground + up);
      wantPos = new Vector3(cx, cy, cz); wantTgt = new Vector3(e.x + fx_ * 5, e.y + 0.8, e.z + fz_ * 5);
    }
    if (!camInit) { camPos.copyFrom(wantPos); camTgt.copyFrom(wantTgt); camInit = true; }
    const kP = m.countdown > 0 ? 3 : (camMode === 'hood' ? 30 : 7);
    camPos.addInPlace(wantPos.subtract(camPos).scale(Math.min(1, kP * dt))); camTgt.addInPlace(wantTgt.subtract(camTgt).scale(Math.min(1, 12 * dt)));
    if (shake > 0) { shake = Math.max(0, shake - dt * 2.5); camPos.x += (Math.random() - 0.5) * shake * 0.5; camPos.y += (Math.random() - 0.5) * shake * 0.4; }
    if (e.boost > 0) { camPos.x += (Math.random() - 0.5) * 0.05; camPos.y += (Math.random() - 0.5) * 0.05; }
    cam.position.copyFrom(camPos); cam.setTarget(camTgt);
    const tf = (e.boost > 0 ? 1.4 : 1.05) + spdN * 0.16; cam.fov += (tf - cam.fov) * Math.min(1, 4 * dt);
    // exhaust glow and rider pose
    if (vis) { const thr = clamp(Math.abs(e.speed) / 28, 0.15, 1) * (e.boost > 0 ? 1.5 : 1); for (const ex of vis.bike.exhausts) ex.scaling.set(0.8 + thr * 0.5, 0.8 + thr * 0.5, 0.6 + thr * 1.4); }
  }

  // ---------- visual sync ----------
  const tmpQ = new Quaternion();
  function syncVisuals(dt: number, t: number) {
    const m = match!;
    for (const r of m.riders) { const v = riderVis.get(r.id); if (!v) continue;
      v.bike.root.setEnabled(r.alive); if (!r.alive) { for (const w of v.wash) w.emitRate = 0; continue; }
      v.bike.root.position.set(r.x, r.y - 0.45, r.z);
      const flipAng = r.flipping ? r.flipA * Math.PI * 2 : 0;
      Quaternion.RotationYawPitchRollToRef(r.heading, r.pitch - flipAng, -r.lean * 0.9 + r.roll, tmpQ); if (!v.bike.root.rotationQuaternion) v.bike.root.rotationQuaternion = new Quaternion(); v.bike.root.rotationQuaternion.copyFrom(tmpQ);
      const spin = (2 + Math.abs(r.speed) * 0.9 + (r.boost > 0 ? 30 : 0)) * dt * 6; for (const rot of v.bike.rotors) rot.rotation.z += spin;
      v.bike.barsNode.rotation.y = -r.steer * 0.25;
      v.rider.setLean(r.lean, r.airborne ? -0.4 : 0, r.airborne ? 1 : clamp(Math.abs(r.speed) / 30, 0, 1));
      const ground = terrain.height(r.x, r.z); const hover = r.y - ground; const onTrail = splat.sample(r.x, r.z)[0] > 0.4;
      const rate = r.airborne || hover > 2.2 ? 0 : clamp(Math.abs(r.speed) / 28, 0.1, 1) * (onTrail ? 70 : 35) * (q.particles / 900);
      for (const w of v.wash) { w.emitRate = rate; const s = splat.sample(r.x, r.z); const sand = s[1]; w.color1.set(0.78 - sand * 0.05, 0.66, 0.5 + sand * 0.1, onTrail ? 0.4 : 0.22); w.color2.copyFrom(w.color1); w.color2.a *= 0.7; }
    }
    for (const it of m.items) { const v = itemVis.get(it.id); if (!v) continue; const en = it.alive; if (v.node.isEnabled() !== en) { v.node.setEnabled(en); v.locator.setEnabled(en); if (en) placeItem(it); }
      if (en) { v.locator.rotation.y = t * 0.6 + it.phase; const sc = 1 + 0.06 * Math.sin(t * 3 + it.phase); v.locator.scaling.set(sc, 1, sc); } }
    // tomatoes in flight
    while (tomatoMeshes.length < m.toms.length) { const s = MeshBuilder.CreateSphere('tomF', { diameter: 0.5, segments: 12 }, scene); s.material = tomatoM; s.isPickable = false; tomatoMeshes.push(s); }
    tomatoMeshes.forEach((s, i) => { const tm = m.toms[i]; s.setEnabled(!!tm); if (tm) { s.position.set(tm.x, tm.y, tm.z); s.rotation.x += dt * 12; } });
  }

  // ---------- loop ----------
  let autoStarted = false; let perfAcc = 0, perfN = 0, perfT = 0, stepped = false;
  engine.runRenderLoop(() => {
    const now = performance.now(); const raw = (now - lastT) / 1000 || 0; const dt = Math.min(0.05, raw); lastT = now;
    if (params.has('auto') && !autoStarted) { autoStarted = true; startMatch(); }
    if (match) {
      const m = match; const meR = m.riders.find(r => r.id === m.localId)!;
      if (m.running && !paused) {
        const simx = +(params.get('simx') || 1);
        for (let k = 1; k < simx; k++) { m.step(dt, readInput()); m.events.length = 0; }
        const before = Math.ceil(Math.max(0, m.countdown)); m.step(dt, readInput()); const after = Math.ceil(Math.max(0, m.countdown));
        if (after !== before) { hud.countdown(after > 0 ? after : 0); audio.play('click', 0.5, after > 0 ? 1 : 1.5); if (after <= 0) setTimeout(() => hud.countdown(null), 600); }
        if (m.t > 1) hud.countdown(null);
        for (const e of m.events.splice(0)) handle(e);
        if (match !== m) return;
        const clock = (START_CLOCK + m.t / DAY_LEN) % 1; world.setTimeOfDay(clock);
        syncVisuals(dt, m.t);
        let view = meR; if (!meR.alive) { if (!spectating || !m.riders.find(r => r.id === spectating)?.alive) cycleSpectate(); view = m.riders.find(r => r.id === spectating) || meR; }
        updateCamera(dt, view, riderVis.get(view.id));
        if (m.running) hud.update(m, meR, view, Math.abs(view.speed) * 3.6);
        audio.engine(Math.min(1, Math.abs(meR.speed) / 28), meR.boost > 0, meR.alive);
        // auto step-down when the frame rate stays low
        if (m.countdown <= 0 && !stepped) { perfAcc += raw; perfN++; perfT += raw; if (perfT > 7) { const fps = perfN / perfAcc; perfAcc = perfN = perfT = 0; const order = ['low', 'medium', 'high', 'ultra']; const i = order.indexOf(q.name); if (fps < 38 && i > 0) { stepped = true; saveQuality(order[i - 1]); hud.message('Graphics set to ' + order[i - 1] + ' for next race to keep it smooth', 'boost'); } } }
      }
    } else { // idle: slow orbit over the valley behind the start screen
      const a = now * 0.00004; cam.position.set(Math.cos(a) * 60, terrain.height(Math.cos(a) * 60, Math.sin(a) * 60) + 14, Math.sin(a) * 60); cam.setTarget(new Vector3(0, terrain.height(0, 0) + 2, 0)); world.setTimeOfDay(START_CLOCK);
    }
    scene.render();
  });
  addEventListener('resize', () => engine.resize());
  (window as any).__sf2 = { scene, engine, get match() { return match; }, startMatch, backend, q };
}
main().catch(err => { console.error(err); $('loadTxt').textContent = 'Failed to start: ' + (err?.message || err); });
