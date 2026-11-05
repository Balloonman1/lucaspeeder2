// Speeder Forager 2.0: boot, scene assembly, match loop, camera, HUD and input.
import { Vector3, Color3, Color4, TransformNode, MeshBuilder, Mesh, StandardMaterial, PBRMaterial, AssetContainer, ParticleSystem, Quaternion, Matrix } from '@babylonjs/core';
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
import { Net, type NetMsg } from './net/net';
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
  const CAMS = ['chase', 'far', 'hood'] as const; type CamMode = typeof CAMS[number]; let camMode: CamMode = 'chase'; try { const c = localStorage.getItem('sf2.cam') as CamMode; if (CAMS.includes(c)) camMode = c; } catch {}
  const camSel = $('camSel') as HTMLSelectElement; camSel.value = camMode; camSel.onchange = () => { camMode = camSel.value as CamMode; try { localStorage.setItem('sf2.cam', camMode); } catch {} };
  paintSel.value = me.color; trimSel.value = me.accent; ($('nameIn') as HTMLInputElement).value = me.name; qualitySel.value = q.name;
  qualitySel.onchange = () => { saveQuality(qualitySel.value); location.reload(); };
  let matchLen = 90; for (const b of Array.from(document.querySelectorAll('.mode')) as HTMLButtonElement[]) b.onclick = () => { document.querySelectorAll('.mode').forEach(x => x.classList.remove('on')); b.classList.add('on'); matchLen = +b.dataset.len!; };
  $('startNote').textContent = `Renderer: ${backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'} · ${q.name} preset`;
  $('loading').classList.add('hidden'); $('start').classList.remove('hidden');

  // ---------- match state ----------
  let match: Match | null = null; let riderVis = new Map<string, RiderVis>(); let itemVis = new Map<number, ItemVis>(); let tomatoMeshes: Mesh[] = [];
  let paused = false; let spectating: string | null = null; let shake = 0; let lastT = performance.now();
  const keys: Record<string, boolean> = {}; const jumpReq = { jump: false, flip: false }; let lastJump = 0; let throwReq = false;
  const tomatoM = new PBRMaterial('tomatoFlight', scene); tomatoM.albedoColor = new Color3(0.8, 0.05, 0.03); tomatoM.roughness = 0.2; tomatoM.clearCoat.isEnabled = true;

  const foodKindOf = (it: Item): FoodKind => it.kind === 'food' ? (it.type as FoodKind) : it.kind;
  const locColor = (it: Item) => it.kind === 'food' ? new Color3(1, 0.85, 0.45) : it.kind === 'drink' ? new Color3(0.2, 0.9, 1) : it.kind === 'tomato' ? new Color3(1, 0.4, 0.3) : new Color3(1, 0.4, 0.8);

  function clearMatch() {
    for (const v of riderVis.values()) { v.bike.root.dispose(false, true); v.rider.root.dispose(false, true); for (const w of v.wash) w.dispose(); }
    for (const v of itemVis.values()) { v.node.dispose(false, true); v.locator.dispose(false, true); } for (const m of tomatoMeshes) m.dispose(); tomatoMeshes = [];
    riderVis = new Map(); itemVis = new Map();
  }
  // ---------- multiplayer state ----------
  const net = new Net(); let mode: 'solo' | 'host' | 'client' = 'solo';
  let outbox: NetMsg[] = []; let snapAcc = 0; let inAcc = 0; let lostHostT = 0;
  const spawnSpots = () => { const out: [number, number][] = []; for (let i = 0; i < MAX_PLAYERS; i++) { const a = i / MAX_PLAYERS * Math.PI * 2; out.push([Math.cos(a) * 16, Math.sin(a) * 16]); } return out; };
  const headingFor = (x: number, z: number) => Math.atan2(-x, -z) + Math.PI;

  function beginMatchVisuals() {
    for (const r of match!.riders) addRiderVis(r);
    for (const it of match!.items) addItemVis(it);
    $('start').classList.add('hidden'); $('over').classList.add('hidden'); $('room').classList.add('hidden'); hud.show(true); hud.countdown(4); hud.message('Follow the light beams and the marker to food. W to go.', 'boost');
    world.camera.fov = 1.05; world.setTimeOfDay(START_CLOCK); camInit = false;
  }
  /** Solo or host: build the roster (humans first, bots fill the rest) and spawn items. */
  function startMatch() {
    clearMatch(); audio.ensure();
    const seed = Math.floor(Math.random() * 1e9); match = new Match(seed, matchLen, mode === 'host' ? net.myId : 'p0', ground, obstacles); spectating = null; paused = false;
    const rng = new SeededRandom(seed); const spots = spawnSpots();
    const humans = mode === 'host' ? net.lobby.slice(0, MAX_PLAYERS) : [{ id: 'p0', name: me.name, color: me.color, accent: me.accent }];
    const used = new Set(humans.map(h => h.name)); const botNames = BOT_NAMES.filter(n => !used.has(n));
    const roster: any[] = [];
    humans.forEach((h, i) => { const [x, z] = spots[i]; roster.push({ id: h.id, name: h.name, color: h.color, accent: h.accent, bike: 'scout', bot: false, x, z, heading: headingFor(x, z) }); });
    for (let i = humans.length; i < MAX_PLAYERS; i++) { const [x, z] = spots[i]; roster.push({ id: 'b' + i, name: botNames[(i * 7) % botNames.length], color: BIKE_COLORS[(i * 3 + 1) % BIKE_COLORS.length], accent: TRIMS[rng.int(TRIMS.length)], bike: 'scout', bot: true, x, z, heading: headingFor(x, z) }); }
    for (const r of roster) match.addRider(r);
    match.spawnAllItems();
    if (mode === 'host') { net.racing = true; outbox = []; net.broadcast({ t: 'start', seed, len: matchLen, players: roster, items: match.items.map(it => ({ kind: it.kind, type: it.type, x: it.x, z: it.z })) }); }
    beginMatchVisuals();
  }
  /** Player in someone else's room: build the same race from the host's start message. */
  function startClientMatch(d: NetMsg) {
    clearMatch(); audio.ensure(); mode = 'client'; matchLen = d.len;
    match = new Match(d.seed, d.len, net.myId, ground, obstacles); spectating = null; paused = false; lostHostT = 0;
    for (const p of d.players) match.addRider(p);
    d.items.forEach((it: any, i: number) => match!.items.push({ id: i, kind: it.kind, type: it.type, x: it.x, z: it.z, alive: true, respawn: 0, phase: (i * 1.7) % 6 }));
    beginMatchVisuals();
  }

  // ---------- host: snapshots and events out, player inputs in ----------
  function serialise(e: MatchEvent): NetMsg | null {
    switch (e.t) {
      case 'msg': return { t: 'msg', text: e.text, cls: e.cls, to: e.to };
      case 'announce': return { t: 'announce', text: e.text, sub: e.sub, cls: e.cls, to: e.to };
      case 'sound': return { t: 'sound', name: e.name, to: e.to };
      case 'pickup': return { t: 'pickup', i: e.item.id, by: e.by.id };
      case 'crash': return { t: 'crash', r: e.rider.id };
      case 'jump': return { t: 'jump', r: e.rider.id, flip: e.flip };
      case 'land': return { t: 'land', r: e.rider.id, force: e.force };
      case 'throw': return { t: 'throw', r: e.rider.id };
      case 'hit': return { t: 'hit', x: e.tomato.x, y: e.tomato.y, z: e.tomato.z, target: e.target.id };
      case 'out': return { t: 'out', r: e.rider.id };
      case 'clone': { const c = e.rider; return { t: 'clone', r: { id: c.id, name: c.name, color: c.color, accent: c.accent, bike: c.bike, bot: true, clone: true, owner: c.owner, x: c.x, z: c.z, heading: c.heading } }; }
      case 'over': return { t: 'over', standings: match!.standings };
    }
    return null;
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  function sendSnapshot() {
    const m = match!;
    net.broadcast({ t: 'snap', gt: r2(m.t), cd: r2(m.countdown),
      ents: m.riders.map(e => [e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.heading), r2(e.speed), r2(e.lean), r2(e.pitch), r2(e.roll), Math.round(e.energy * 10) / 10, e.alive ? 1 : 0, r2(e.blind), r2(e.boost), e.tomatoes, e.foodEaten, e.flipping ? r2(e.flipA) : 0, e.airborne ? 1 : 0, r2(e.steer), Math.floor(e.survived)]),
      items: m.items.map(it => [it.alive ? 1 : 0, r2(it.x), r2(it.z)]), toms: m.toms.map(t => [r2(t.x), r2(t.y), r2(t.z)]), ev: outbox.splice(0) });
  }
  net.onHostMsg = (from, d) => {
    const m = match; if (!m || mode !== 'host') return; const e = m.riders.find(r => r.id === from); if (!e || !e.alive || e.bot) return;
    if (d.t === 'in') { e.x = d.x; e.y = d.y; e.z = d.z; e.heading = d.h; e.speed = d.s; e.lean = d.l; e.pitch = d.p; e.roll = d.r; e.steer = d.st; e.airborne = !!d.air; e.flipping = d.fa > 0; e.flipA = d.fa;
      if (d.cr) { e.crashes += d.cr; m.emit({ t: 'crash', rider: e }); } if (d.cc) e.closeCalls += d.cc; if (d.jc) e.jumpCost += d.jc; }
    else if (d.t === 'throw') { if (e.tomatoes > 0) m.hostThrow(e); }
  };
  net.onDrop = id => { const m = match; if (!m || mode !== 'host') return; const e = m.riders.find(r => r.id === id); if (e && e.alive && !e.bot) { e.bot = true; m.msg(e.name + ' lost connection. A bot takes over.', 'bad', 'all'); } };

  // ---------- player: apply host snapshots and events ----------
  net.onClientMsg = d => {
    if (d.t === 'start') { startClientMatch(d); return; }
    const m = match; if (!m || mode !== 'client') return;
    if (d.t === 'snap') {
      m.t = d.gt; m.countdown = d.cd;
      for (const a of d.ents) { let e = m.riders.find(r => r.id === a[0]);
        if (!e) continue;
        const [, x, y, z, h, sp, l, p, ro, en, al, bl, bo, tm, fd, fa, air, st, sv] = a;
        e.energy = en; e.alive = !!al; e.blind = bl; e.boost = bo; e.tomatoes = tm; e.foodEaten = fd; e.survived = sv;
        if (e.id !== m.localId) { const n = (e as any).net || ((e as any).net = {}); Object.assign(n, { x, y, z, h, sp, l, p, ro, fa, air, st, at: performance.now() }); if ((e as any).fresh !== false) { e.x = x; e.y = y; e.z = z; e.heading = h; (e as any).fresh = false; } } }
      d.items.forEach((a: any[], i: number) => { const it = m.items[i]; if (!it) return; it.alive = !!a[0]; it.x = a[1]; it.z = a[2]; });
      m.toms = d.toms.map((t: number[]) => ({ x: t[0], y: t[1], z: t[2], target: '', from: '', life: 1 }));
      for (const ev of d.ev) applyRemoteEvent(ev);
    }
  };
  function applyRemoteEvent(ev: NetMsg) {
    const m = match!; const R = (id: string) => m.riders.find(r => r.id === id);
    switch (ev.t) {
      case 'msg': case 'announce': case 'sound': handle(ev as any); break;
      case 'pickup': { const it = m.items[ev.i], by = R(ev.by); if (it && by) handle({ t: 'pickup', item: it, by }); break; }
      case 'crash': case 'jump': case 'land': case 'throw': { if (ev.r === m.localId) break; const r = R(ev.r); if (r) handle({ ...(ev as any), rider: r }); break; }
      case 'hit': { const tg = R(ev.target); if (tg) handle({ t: 'hit', tomato: { x: ev.x, y: ev.y, z: ev.z, target: ev.target, from: '', life: 0 }, target: tg }); break; }
      case 'out': break;
      case 'clone': { if (!R(ev.r.id)) { const c = m.addRider(ev.r); addRiderVis(c); } break; }
      case 'over': { m.standings = ev.standings; m.over = true; handle({ t: 'over' }); break; }
    }
  }
  /** Player side: drive our own bike locally, interpolate everyone else, send our state to the host. */
  let clientFirstStep = true;
  function clientTick(dt: number) {
    const m = match!; const meR = m.riders.find(r => r.id === m.localId)!;
    if (m.countdown > 0) m.countdown -= dt; else m.t += dt;
    const inp = clientFirstStep ? readInput() : { ...lastInput, jump: false, flip: false, throw: false }; clientFirstStep = false; const wantThrow = inp.throw; inp.throw = false;
    if (meR.alive && m.countdown <= 0 && !m.over) m.movePhysics(meR, inp, dt);
    for (const e of m.events.splice(0)) handle(e);   // local fx: crash sparks, jump, landing, close calls
    if (wantThrow && meR.tomatoes > 0) net.sendHost({ t: 'throw' });
    for (const e of m.riders) { if (e.id === m.localId) continue; const n = (e as any).net; if (!n) continue;
      const lead = Math.min(0.15, (performance.now() - n.at) / 1000); const tx = n.x + Math.sin(n.h) * n.sp * lead, tz = n.z + Math.cos(n.h) * n.sp * lead; const k = Math.min(1, 12 * dt);
      e.x += (tx - e.x) * k; e.z += (tz - e.z) * k; e.y += (n.y - e.y) * k; e.heading += Math.atan2(Math.sin(n.h - e.heading), Math.cos(n.h - e.heading)) * k;
      e.speed = n.sp; e.lean = n.l; e.pitch = n.p; e.roll = n.ro; e.steer = n.st; e.airborne = !!n.air; e.flipping = n.fa > 0; e.flipA = n.fa; }
    inAcc += dt; if (inAcc > 0.05 && meR.alive) { inAcc = 0;
      net.sendHost({ t: 'in', x: r2(meR.x), y: r2(meR.y), z: r2(meR.z), h: r2(meR.heading), s: r2(meR.speed), l: r2(meR.lean), p: r2(meR.pitch), r: r2(meR.roll), st: r2(meR.steer), air: meR.airborne ? 1 : 0, fa: meR.flipping ? r2(meR.flipA) : 0, cr: meR.crashes, cc: meR.closeCalls, jc: meR.jumpCost });
      meR.crashes = 0; meR.closeCalls = 0; meR.jumpCost = 0; }
    if (!m.over && performance.now() - net.lastSnap > 5000) { lostHostT += dt; if (lostHostT > 0.1 && lostHostT < 0.2) hud.message('Lost contact with the host, waiting…', 'bad'); if (lostHostT > 15) { m.over = true; m.running = false; hud.show(false); net.close(); mode = 'solo'; $('over').classList.add('hidden'); $('start').classList.remove('hidden'); setStatus('The host left the race.', true); } } else lostHostT = 0;
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
      case 'over': { net.racing = false; $('overNote').textContent = mode === 'client' ? 'Waiting for the host to start the next race…' : ''; $('againBtn').classList.toggle('hidden', mode === 'client'); const meR = m.riders.find(r => r.id === m.localId)!; hud.showOver(m, meR); const place = m.standings.findIndex(s => s.id === meR.id) + 1; audio.play(place === 1 ? 'win' : 'bad', 0.8); audio.engine(0, false, false); hud.show(false); m.running = false; break; }
    }
  }

  // ---------- input ----------
  addEventListener('keydown', ev => { const k = ev.key.toLowerCase(); keys[k] = true; if (k === ' ') { ev.preventDefault(); requestJump(); } if (k === 'f') throwReq = true; if (k === 'p' && match && match.running && mode === 'solo') togglePause(); if (k === 'c') { camMode = CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]; camSel.value = camMode; try { localStorage.setItem('sf2.cam', camMode); } catch {} hud.message('Camera: ' + camSel.options[camSel.selectedIndex].text, 'boost'); } if (k === 'tab' && match && !match.riders.find(r => r.id === match!.localId)!.alive) { ev.preventDefault(); cycleSpectate(); } });
  addEventListener('keyup', ev => { keys[ev.key.toLowerCase()] = false; });
  function requestJump() { const now = performance.now(); if (now - lastJump < 420) jumpReq.flip = true; jumpReq.jump = true; lastJump = now; }
  function togglePause() { paused = !paused; $('pause').classList.toggle('hidden', !paused); }
  $('resumeBtn').onclick = () => togglePause();
  function cycleSpectate() { if (!match) return; const alive = match.riders.filter(r => r.alive && !r.clone); if (!alive.length) return; const i = alive.findIndex(r => r.id === spectating); spectating = alive[(i + 1) % alive.length].id; }
  let lastInput: Input = { fwd: false, back: false, left: false, right: false, jump: false, flip: false, throw: false };
  function readInput(): Input { lastInput = readInputRaw(); return lastInput; }
  function readInputRaw(): Input {
    const j = jumpReq.jump, fl = jumpReq.flip, th = throwReq; jumpReq.jump = false; jumpReq.flip = false; throwReq = false;
    if (params.has('drive') && match) { const r = match.riders.find(x => x.id === match!.localId)!; const [t] = match.nearestItem(r.x, r.z, it => it.kind === 'food'); let turn = 0; if (t) { const d = Math.atan2(t.x - r.x, t.z - r.z) - r.heading; turn = clamp(Math.atan2(Math.sin(d), Math.cos(d)) * 2, -1, 1); } return { fwd: true, back: false, left: false, right: false, turn, jump: match.t > 4 && match.t % 9 < 0.03, flip: false, throw: th }; }
    return { fwd: !!(keys['w'] || keys['arrowup']), back: !!(keys['s'] || keys['arrowdown']), left: !!(keys['a'] || keys['arrowleft']), right: !!(keys['d'] || keys['arrowright']), jump: j, flip: fl, throw: th };
  }
  const saveMe = () => { me.name = ($('nameIn') as HTMLInputElement).value.trim().slice(0, 14) || 'Rider'; me.color = paintSel.value; me.accent = trimSel.value; try { localStorage.setItem('sf2.rider', JSON.stringify(me)); } catch {} };
  function setStatus(text: string, bad = false) { const el = $('netStatus'); el.textContent = text; el.classList.toggle('bad', bad); }
  net.onStatus = t => setStatus(t);
  function showRoom() {
    $('start').classList.add('hidden'); $('over').classList.add('hidden'); $('room').classList.remove('hidden'); $('roomCode').textContent = net.code;
    $('copyLink').classList.toggle('hidden', false); $('roomStartBtn').classList.toggle('hidden', !net.host); $('roomModes').classList.toggle('hidden', !net.host);
    $('roomNote').textContent = net.host ? 'You are the host. Start when everyone is in.' : 'Waiting for the host to start the race…'; renderLobby();
  }
  function renderLobby() {
    const box = $('plist'); box.innerHTML = '';
    for (let i = 0; i < MAX_PLAYERS; i++) { const p = net.lobby[i]; const d = document.createElement('div'); d.className = 'pl' + (p ? '' : ' bot');
      const sw = document.createElement('i'); sw.style.background = p ? p.color : '#444'; d.appendChild(sw); const nm = document.createElement('span'); nm.textContent = p ? p.name : 'Bot'; d.appendChild(nm);
      if (p && p.id === 'p0') { const b = document.createElement('b'); b.textContent = 'HOST'; d.appendChild(b); } else if (p && p.id === net.myId) { const b = document.createElement('b'); b.textContent = 'YOU'; d.appendChild(b); }
      box.appendChild(d); }
  }
  net.onLobby = () => { if (!match || !match.running) { if (net.welcomed) showRoom(); } renderLobby(); };
  for (const b of Array.from(document.querySelectorAll('#roomModes .mode')) as HTMLButtonElement[]) b.onclick = () => { document.querySelectorAll('#roomModes .mode').forEach(x => x.classList.remove('on')); b.classList.add('on'); matchLen = +b.dataset.len!; };
  $('playBtn').onclick = () => { saveMe(); net.close(); mode = 'solo'; startMatch(); canvas.focus(); };
  $('hostBtn').onclick = async () => { saveMe(); ($('hostBtn') as HTMLButtonElement).disabled = ($('joinBtn') as HTMLButtonElement).disabled = true;
    try { await net.hostRoom({ name: me.name, color: me.color, accent: me.accent }); mode = 'host'; matchLen = 90; showRoom(); } catch (err: any) { setStatus('Online play failed: ' + (err?.message || err) + '. Solo still works.', true); net.close(); }
    ($('hostBtn') as HTMLButtonElement).disabled = ($('joinBtn') as HTMLButtonElement).disabled = false; };
  async function join(code: string) { saveMe(); code = code.trim().toUpperCase(); if (code.length !== 4) { setStatus('Room codes are 4 letters.', true); return; }
    ($('hostBtn') as HTMLButtonElement).disabled = ($('joinBtn') as HTMLButtonElement).disabled = true;
    try { await net.joinRoom(code, { name: me.name, color: me.color, accent: me.accent }); mode = 'client'; showRoom(); } catch (err: any) { setStatus(err?.message || String(err), true); net.close(); mode = 'solo'; }
    ($('hostBtn') as HTMLButtonElement).disabled = ($('joinBtn') as HTMLButtonElement).disabled = false; }
  $('joinBtn').onclick = () => join(($('codeIn') as HTMLInputElement).value);
  ($('codeIn') as HTMLInputElement).addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') join(($('codeIn') as HTMLInputElement).value); });
  ($('nameIn') as HTMLInputElement).addEventListener('keydown', ev => ev.stopPropagation());
  $('roomStartBtn').onclick = () => { if (net.host) { mode = 'host'; startMatch(); canvas.focus(); } };
  $('leaveBtn').onclick = () => { net.close(); mode = 'solo'; $('room').classList.add('hidden'); $('start').classList.remove('hidden'); setStatus(''); };
  $('copyLink').onclick = async () => { try { await navigator.clipboard.writeText(net.inviteLink()); $('copyNote').textContent = 'Copied: ' + net.inviteLink(); } catch { $('copyNote').textContent = net.inviteLink(); } };
  $('againBtn').onclick = () => { if (mode === 'host') startMatch(); else if (mode === 'solo') startMatch(); };
  $('menuBtn').onclick = () => { $('over').classList.add('hidden'); if (net.online) showRoom(); else $('start').classList.remove('hidden'); };
  addEventListener('beforeunload', () => net.close());
  const roomParam = params.get('room'); if (roomParam) { ($('codeIn') as HTMLInputElement).value = roomParam.toUpperCase(); setTimeout(() => join(roomParam), 300); }
  $('btnFull').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); };
  $('btnMute').onclick = () => { audio.setMuted(!audio.muted); $('btnMute').textContent = audio.muted ? '🔇' : '🔊'; };
  $('btnSettings').onclick = () => { if (match && match.running && mode === 'solo') togglePause(); };
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
      const far = camMode === 'far' ? 1.6 : 1;
      const back = (7.4 + Math.abs(e.speed) * 0.11 + (e.boost > 0 ? 1.2 : 0)) * far, up = (2.5 + spdN * 0.4) * far + e.y - ground - 0.9;
      const lag = clamp(e.steer * 1.4, -1.6, 1.6); // lateral lag on turns
      const cx = e.x - fx_ * back - fz_ * lag, cz = e.z - fz_ * back + fx_ * lag;
      const cy = Math.max(terrain.height(cx, cz) + 1.6, ground + up);
      wantPos = new Vector3(cx, cy, cz); wantTgt = new Vector3(e.x + fx_ * 5 * far, e.y + 0.8, e.z + fz_ * 5 * far);
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
      Quaternion.RotationYawPitchRollToRef(r.heading, r.pitch - flipAng, r.lean * 0.9 + r.roll, tmpQ); if (!v.bike.root.rotationQuaternion) v.bike.root.rotationQuaternion = new Quaternion(); v.bike.root.rotationQuaternion.copyFrom(tmpQ);
      const spin = (2 + Math.abs(r.speed) * 0.9 + (r.boost > 0 ? 30 : 0)) * dt * 6; for (const rot of v.bike.rotors) rot.rotation.z += spin;
      v.bike.barsNode.rotation.y = r.steer * 0.25;
      v.rider.setLean(-r.lean, r.airborne ? -0.4 : 0, r.airborne ? 1 : clamp(Math.abs(r.speed) / 30, 0, 1));
      const ground = terrain.height(r.x, r.z); const hover = r.y - ground; const onTrail = splat.sample(r.x, r.z)[0] > 0.4;
      const rate = r.airborne || hover > 2.2 ? 0 : clamp(Math.abs(r.speed) / 28, 0.1, 1) * (onTrail ? 70 : 35) * (q.particles / 900);
      for (const w of v.wash) { w.emitRate = rate; const s = splat.sample(r.x, r.z); const sand = s[1]; w.color1.set(0.78 - sand * 0.05, 0.66, 0.5 + sand * 0.1, onTrail ? 0.4 : 0.22); w.color2.copyFrom(w.color1); w.color2.a *= 0.7; }
    }
    for (const it of m.items) { const v = itemVis.get(it.id); if (!v) continue; const en = it.alive; if (v.node.isEnabled() !== en) { v.node.setEnabled(en); v.locator.setEnabled(en); if (en) placeItem(it); }
      if (en) { v.locator.rotation.y = t * 0.6 + it.phase; const sc = 1 + 0.06 * Math.sin(t * 3 + it.phase); v.locator.scaling.set(sc, 1, sc);
        // Full brightness from 25 m out to 300 m; eases to a third of that up close so the food stays clear.
        const d = Math.hypot(it.x - cam.position.x, it.z - cam.position.z); const vis = (0.35 + 0.65 * clamp((d - 8) / 17, 0, 1)) * clamp((340 - d) / 40, 0, 1);
        for (const c of v.locator.getChildMeshes()) if (c.name === 'beam' || c.name === 'beamCore') c.visibility = vis; else if (c.name === 'beacon') { c.visibility = 1; c.position.y = 3.6 + 0.25 * Math.sin(t * 2.5 + it.phase); } } }
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
        const before = Math.ceil(Math.max(0, m.countdown));
        // On a slow frame, run several 50 ms steps (up to 250 ms) so game time stays real time for everyone.
        const steps = Math.max(1, Math.min(5, Math.ceil(Math.min(0.25, raw) / 0.05))); const sdt = Math.min(0.25, Math.max(raw, dt)) / steps;
        if (mode === 'client') { clientFirstStep = true; for (let k = 0; k < steps; k++) clientTick(sdt); }
        else { const simx = mode === 'solo' ? +(params.get('simx') || 1) : 1;
          for (let k = 1; k < simx; k++) { m.step(dt, readInput()); m.events.length = 0; }
          for (let k = 0; k < steps; k++) m.step(sdt, k === 0 ? readInput() : { ...lastInput, jump: false, flip: false, throw: false });
          for (const e of m.events.splice(0)) { if (mode === 'host') { const se = serialise(e); if (se) outbox.push(se); } handle(e); }
          if (mode === 'host') { snapAcc += dt; if (snapAcc > 0.066 || m.over) { snapAcc = 0; sendSnapshot(); } } }
        const after = Math.ceil(Math.max(0, m.countdown));
        if (after !== before) { hud.countdown(after > 0 ? after : 0); audio.play('click', 0.5, after > 0 ? 1 : 1.5); if (after <= 0) setTimeout(() => hud.countdown(null), 600); }
        if (m.t > 1) hud.countdown(null);
        if (match !== m) return;
        const clock = (START_CLOCK + m.t / DAY_LEN) % 1; world.setTimeOfDay(clock);
        syncVisuals(dt, m.t);
        let view = meR; if (!meR.alive) { if (!spectating || !m.riders.find(r => r.id === spectating)?.alive) cycleSpectate(); view = m.riders.find(r => r.id === spectating) || meR; }
        updateCamera(dt, view, riderVis.get(view.id));
        if (m.running) { hud.update(m, meR, view, Math.abs(view.speed) * 3.6);
          const jam = view.blind > 0 && view === meR; const [tgt] = jam ? [null] : m.nearestItem(view.x, view.z, it => it.kind === 'food');
          if (tgt) { const wp = new Vector3(tgt.x, terrain.height(tgt.x, tgt.z) + 2.2, tgt.z); const p = Vector3.Project(wp, Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
            const inFront = Vector3.Dot(wp.subtract(cam.position), cam.getForwardRay().direction) > 0; const sx = p.x / engine.getHardwareScalingLevel(), sy = p.y / engine.getHardwareScalingLevel();
            const dist = Math.hypot(tgt.x - view.x, tgt.z - view.z); hud.marker({ x: clamp(sx, 40, innerWidth - 40), y: clamp(sy, 60, innerHeight - 120), visible: inFront && dist > 14 }, Math.round(dist) + ' m'); }
          else hud.marker(null, ''); }
        audio.engine(Math.min(1, Math.abs(meR.speed) / 28), meR.boost > 0, meR.alive);
        // auto step-down when the frame rate stays low
        if (m.countdown <= 0 && !stepped) { perfAcc += raw; perfN++; perfT += raw; if (perfT > 7) { const fps = perfN / perfAcc; perfAcc = perfN = perfT = 0; const order = ['low', 'medium', 'high', 'ultra']; const i = order.indexOf(q.name); if (fps < 38 && i > 0) { stepped = true; saveQuality(order[i - 1]); hud.message('Graphics set to ' + order[i - 1] + ' for next race to keep it smooth', 'boost'); } } }
      }
    } else { // idle: slow orbit over the valley behind the start screen
      const a = now * 0.00004; cam.position.set(Math.cos(a) * 60, terrain.height(Math.cos(a) * 60, Math.sin(a) * 60) + 14, Math.sin(a) * 60); cam.setTarget(new Vector3(0, terrain.height(0, 0) + 2, 0)); world.setTimeOfDay(START_CLOCK);
    }
    scene.render();
  });
  let lastBg = performance.now();
  setInterval(() => { if (!document.hidden || mode !== 'host' || !match || !match.running) { lastBg = performance.now(); return; }
    const now = performance.now(); const dt = Math.min(0.1, (now - lastBg) / 1000); lastBg = now; const m = match;
    m.step(dt, { fwd: false, back: false, left: false, right: false, jump: false, flip: false, throw: false });
    for (const e of m.events.splice(0)) { const se = serialise(e); if (se) outbox.push(se); if (e.t === 'over') handle(e); }
    sendSnapshot(); }, 66);
  addEventListener('resize', () => engine.resize());
  (window as any).__sf2 = { scene, engine, get match() { return match; }, startMatch, backend, q, net, get mode() { return mode; } };
}
main().catch(err => { console.error(err); $('loadTxt').textContent = 'Failed to start: ' + (err?.message || err); });
