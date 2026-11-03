// Engine-agnostic match simulation: riders, hover physics, items, bots, tomatoes, energy and standings.
// Ported from the original game.js hostSim/movePhysics/botUpdate with a real hover model.
import { BIKES, FOODS, RULES, PLAY_HALF, MAX_PLAYERS, CANYON_FOODS } from './rules';
import { SeededRandom, clamp } from '../shared/random';

export interface GroundQuery { height(x: number, z: number): number; normal(x: number, z: number): { x: number; y: number; z: number }; surface(x: number, z: number): { grip: number; kind: 'trail' | 'sand' | 'ground' }; }
export interface Obstacle { x: number; z: number; r: number; h: number; }
export interface Input { fwd: boolean; back: boolean; left: boolean; right: boolean; turn?: number; jump: boolean; flip: boolean; throw: boolean; }

export interface Rider {
  id: string; name: string; color: string; accent: string; bike: string; bot: boolean; clone: boolean; owner?: string;
  x: number; y: number; z: number; vx: number; vz: number; vy: number; heading: number; speed: number; lean: number; pitch: number; roll: number;
  energy: number; alive: boolean; blind: number; boost: number; tomatoes: number; foodEaten: number; survived: number; hitCd: number;
  airborne: boolean; airT: number; flipping: boolean; flipA: number; flipStart: number; wasAir: boolean; jumpedOver: Record<string, 1>;
  combo: number; comboT: number; throwCd: number; wander: number; botTarget: Item | null; crashes: number; closeCalls: number; jumpCost: number; steer: number;
}
export interface Item { id: number; kind: 'food' | 'drink' | 'tomato' | 'cherry'; type: string; x: number; z: number; alive: boolean; respawn: number; phase: number; }
export interface Tomato { x: number; y: number; z: number; target: string; from: string; life: number; done?: boolean; }
export type MatchEvent =
  | { t: 'msg'; text: string; cls: string; to: string }
  | { t: 'announce'; text: string; sub?: string; cls: string; to: string }
  | { t: 'sound'; name: string; to: string }
  | { t: 'pickup'; item: Item; by: Rider }
  | { t: 'crash'; rider: Rider } | { t: 'jump'; rider: Rider; flip: boolean } | { t: 'land'; rider: Rider; force: number }
  | { t: 'throw'; rider: Rider } | { t: 'hit'; tomato: Tomato; target: Rider }
  | { t: 'out'; rider: Rider } | { t: 'clone'; rider: Rider; owner: Rider } | { t: 'over' };

export interface Standing { id: string; name: string; bot: boolean; t: number; }

export class Match {
  t = 0; len: number; countdown = RULES.countdown; over = false; running = true;
  riders: Rider[] = []; items: Item[] = []; toms: Tomato[] = []; standings: Standing[] = []; elim: string[] = [];
  localId: string; events: MatchEvent[] = []; warned60 = false; warned10 = false; lowWarned = false;
  private rng: SeededRandom;
  constructor(seed: number, len: number, localId: string, private ground: GroundQuery, private obstacles: Obstacle[]) { this.rng = new SeededRandom(seed); this.len = len; this.localId = localId; }

  emit(e: MatchEvent) { this.events.push(e); }
  msg(text: string, cls: string, to: string) { this.emit({ t: 'msg', text, cls, to }); }

  addRider(spec: Partial<Rider> & { id: string; name: string }): Rider {
    const r: Rider = Object.assign({ color: '#3b7bff', accent: '#4df0e0', bike: 'scout', bot: false, clone: false, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, heading: 0, speed: 0, lean: 0, pitch: 0, roll: 0,
      energy: 100, alive: true, blind: 0, boost: 0, tomatoes: 0, foodEaten: 0, survived: 0, hitCd: 0, airborne: false, airT: 0, flipping: false, flipA: 0, flipStart: 0, wasAir: false, jumpedOver: {},
      combo: 0, comboT: 0, throwCd: 3, wander: 0, botTarget: null, crashes: 0, closeCalls: 0, jumpCost: 0, steer: 0 }, spec) as Rider;
    r.y = this.ground.height(r.x, r.z) + 0.9; this.riders.push(r); return r;
  }
  freeSpot(): [number, number] {
    for (let k = 0; k < 80; k++) { const x = this.rng.range(-PLAY_HALF + 25, PLAY_HALF - 25), z = this.rng.range(-PLAY_HALF + 25, PLAY_HALF - 25);
      if (Math.hypot(x, z) < 30) continue; if (this.ground.normal(x, z).y < 0.9) continue;
      if (this.obstacles.every(o => Math.hypot(o.x - x, o.z - z) > o.r + 4) && this.items.every(i => !i.alive || Math.hypot(i.x - x, i.z - z) > 14) && this.riders.every(e => Math.hypot(e.x - x, e.z - z) > 16)) return [x, z]; }
    return [this.rng.range(-200, 200), this.rng.range(-200, 200)];
  }
  spawnItem(kind: Item['kind'], type?: string): Item { const [x, z] = this.freeSpot(); if (kind === 'food') type = type || CANYON_FOODS[this.rng.int(CANYON_FOODS.length)]; const it: Item = { id: this.items.length, kind, type: type || kind, x, z, alive: true, respawn: 0, phase: this.rng.range(0, 6) }; this.items.push(it); return it; }
  spawnAllItems() { for (let i = 0; i < RULES.foodsPerMatch; i++) this.spawnItem('food', CANYON_FOODS[i % CANYON_FOODS.length]); for (let i = 0; i < RULES.drinks; i++) this.spawnItem('drink'); for (let i = 0; i < RULES.cherries; i++) this.spawnItem('cherry'); for (let i = 0; i < RULES.tomatoes; i++) this.spawnItem('tomato'); }
  killItem(it: Item, delay: number) { it.alive = false; it.respawn = delay; }
  reviveItem(it: Item) { const [x, z] = this.freeSpot(); it.x = x; it.z = z; it.alive = true; }
  aliveRiders() { return this.riders.filter(e => e.alive && !e.clone); }
  nearestItem(x: number, z: number, pred: (it: Item) => boolean): [Item | null, number] { let b: Item | null = null, bd = 1e9; for (const it of this.items) { if (!it.alive || !pred(it)) continue; const d = Math.hypot(it.x - x, it.z - z); if (d < bd) { bd = d; b = it; } } return [b, bd]; }
  stat(e: Rider) { return BIKES[e.bike] || BIKES.scout; }

  // ---------- hover physics for a controlled rider ----------
  movePhysics(e: Rider, inp: Input, dt: number) {
    const st = this.stat(e); const surf = this.ground.surface(e.x, e.z); const grip = surf.grip;
    const boosting = e.boost > 0, maxS = boosting ? st.speed * 2 : st.speed;
    if (!e.airborne) { if (inp.fwd) e.speed += (boosting ? st.accel * 1.8 : st.accel) * dt; else if (inp.back) e.speed -= 40 * grip * dt; else e.speed *= Math.max(0, 1 - 1.6 * dt); }
    e.speed = clamp(e.speed, -10, e.airborne ? Math.max(maxS, e.speed) : maxS);
    const turnIn = inp.turn !== undefined ? inp.turn : (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    e.steer += (turnIn - e.steer) * Math.min(1, 10 * dt);
    const turnRate = st.turn * (e.airborne ? 0.35 : grip) * Math.min(1, 0.35 + Math.abs(e.speed) / 14);
    e.heading += e.steer * turnRate * dt * (e.speed >= 0 ? 1 : -1);
    e.lean += (e.steer * 0.42 * Math.min(1, Math.abs(e.speed) / 10) - e.lean) * Math.min(1, 7 * dt);
    const ground = this.ground.height(e.x, e.z); const ride = 0.9;
    const grounded = !e.airborne;
    if (inp.jump && grounded) { const flip = !!inp.flip; e.vy = flip ? st.jump + 5 : st.jump; e.airborne = true; e.jumpedOver = {}; e.flipping = flip; e.flipA = 0; e.airT = 0; e.flipStart = 0;
      if (e.speed > 4) e.speed = Math.min(e.boost > 0 ? st.speed * 2 + 4 : st.speed + 6, e.speed + (flip ? 7 : 4)); e.jumpCost += flip ? RULES.flipCost : RULES.jumpCost; this.emit({ t: 'jump', rider: e, flip }); }
    else if (inp.jump && !grounded && !e.flipping && e.airT < 0.45 && e.vy > 0) { e.vy = Math.max(e.vy, st.jump + 5 - 24 * e.airT); e.flipping = true; e.flipA = 0; e.flipStart = e.airT; e.speed = Math.min(e.boost > 0 ? st.speed * 2 + 4 : st.speed + 6, e.speed + 3); e.jumpCost += 3; this.emit({ t: 'jump', rider: e, flip: true }); }
    // vertical: spring to ride height when near the ground, ballistic when launched
    const desired = ground + ride;
    if (e.airborne) { e.airT += dt; e.vy -= 24 * dt; e.y += e.vy * dt;
      if (e.y <= desired && e.vy <= 0) { const force = -e.vy; e.airborne = false; e.vy *= -0.15; e.y = desired - 0.1; this.emit({ t: 'land', rider: e, force }); if (e.flipping && e.airT > 0.2) { e.flipping = false; e.flipA = 0; e.flipStart = 0; } }
    } else {
      const k = 55, c = 10; const acc = (desired - e.y) * k - e.vy * c; e.vy += acc * dt; e.y += e.vy * dt;
      // launched off a crest: the ground dropped away faster than the spring follows
      if (e.y - ground > ride + 0.9 && e.vy > 2 && Math.abs(e.speed) > 14) { e.airborne = true; e.airT = 0; e.jumpedOver = {}; }
      if (e.y < ground + 0.35) { e.y = ground + 0.35; e.vy = Math.max(0, e.vy); }
    }
    if (e.flipping) { const s0 = e.flipStart; const total = Math.max(0.6, 2 * 19 / 24 - s0); e.flipA = Math.min(1, (e.airT - s0) / total); }
    // lateral slip: velocity follows heading with surface grip
    const fx = Math.sin(e.heading), fz = Math.cos(e.heading); const tx = fx * e.speed, tz = fz * e.speed;
    const follow = Math.min(1, (e.airborne ? 0.6 : 3.5 + 6 * grip) * dt); e.vx += (tx - e.vx) * follow; e.vz += (tz - e.vz) * follow;
    e.x += e.vx * dt; e.z += e.vz * dt;
    // visual pitch/roll from terrain normal plus acceleration
    const n = this.ground.normal(e.x, e.z);
    const tPitch = e.airborne ? clamp(-e.vy * 0.02, -0.25, 0.35) : clamp((n.x * fx + n.z * fz) * -1.2, -0.3, 0.3) - Math.min(0.08, Math.max(0, inp.fwd ? 0.05 : 0));
    const tRoll = e.airborne ? e.lean * 0.6 : clamp((n.x * fz - n.z * fx) * 1.2, -0.3, 0.3);
    e.pitch += (tPitch - e.pitch) * Math.min(1, 6 * dt); e.roll += (tRoll - e.roll) * Math.min(1, 6 * dt);
    const lim = PLAY_HALF - 8;
    if (Math.abs(e.x) > lim || Math.abs(e.z) > lim) { e.x = clamp(e.x, -lim, lim); e.z = clamp(e.z, -lim, lim); e.speed *= -0.3; e.vx *= -0.3; e.vz *= -0.3; if (e.id === this.localId && e.hitCd <= 0) { this.msg('Edge of the scan zone. Turn back.', 'bad', e.id); e.hitCd = 1; } }
    if (e.hitCd > 0) e.hitCd -= dt;
    const alt = e.y - ground - ride;
    for (const o of this.obstacles) { const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz) || 0.01; const rr = o.r + 1.2; if (d >= rr) continue;
      const key = o.x + ',' + o.z;
      if (alt >= o.h && o.h < 90 && !e.jumpedOver[key]) { e.jumpedOver[key] = 1; e.closeCalls++; if (e.id === this.localId) { this.emit({ t: 'announce', text: 'CLOSE CALL!', sub: '+3 energy', cls: 'good', to: e.id }); this.emit({ t: 'sound', name: 'close', to: e.id }); } }
      if (alt < o.h) { e.x = o.x + dx / d * rr; e.z = o.z + dz / d * rr; e.speed *= -0.45; e.vx *= -0.3; e.vz *= -0.3;
        if (e.hitCd <= 0) { e.hitCd = 0.6; e.crashes++; this.emit({ t: 'crash', rider: e }); if (e.id === this.localId) this.msg('Crash! -8 energy', 'bad', e.id); } } }
    if (inp.throw && e.tomatoes > 0 && e.hitCd <= 0.3) { this.hostThrow(e); }
  }

  // ---------- bots and clones ----------
  botUpdate(e: Rider, dt: number) {
    let target: Item | null = null, desired = e.heading;
    if (e.blind > 0) { e.wander += (this.rng.next() - 0.5) * dt * 3; desired = e.heading + e.wander * 0.2; }
    else { const wantFood = e.clone || e.energy < 75 || e.tomatoes >= 3;
      [target] = this.nearestItem(e.x, e.z, it => it.kind === 'food' ? wantFood : it.kind === 'tomato' ? (!e.clone && e.tomatoes < 3) : it.kind === 'drink' ? !e.clone : false);
      if (!target) [target] = this.nearestItem(e.x, e.z, it => it.kind === 'food');
      if (target) desired = Math.atan2(target.x - e.x, target.z - e.z); }
    let diff = Math.atan2(Math.sin(desired - e.heading), Math.cos(desired - e.heading));
    const dx = Math.sin(e.heading), dz = Math.cos(e.heading); let push = 0;
    for (const o of this.obstacles) { const ox = o.x - e.x, oz = o.z - e.z; const fwd = ox * dx + oz * dz; if (fwd < 0 || fwd > 16) continue; const lat = ox * dz - oz * dx; if (Math.abs(lat) < o.r + 2.6) push += (lat > 0 ? -1 : 1) * (1 - fwd / 16); }
    if (Math.abs(push) > 0.01) diff = push * 2.2;
    const turn = clamp(diff, -2.6 * dt, 2.6 * dt); e.heading += turn; e.steer += (clamp(diff * 2, -1, 1) - e.steer) * Math.min(1, 6 * dt);
    const maxS = (e.clone ? 23 : (this.stat(e).speed - 9) + Math.min(7, this.t * 0.05)) * (e.boost > 0 ? 1.8 : 1);
    e.speed += (maxS - e.speed) * Math.min(1, 1.5 * dt); if (Math.abs(diff) > 1.2) e.speed *= 0.97;
    // simple integration (bots do not use the input model for speed)
    e.vx = Math.sin(e.heading) * e.speed; e.vz = Math.cos(e.heading) * e.speed; e.x += e.vx * dt; e.z += e.vz * dt;
    e.x = clamp(e.x, -PLAY_HALF + 8, PLAY_HALF - 8); e.z = clamp(e.z, -PLAY_HALF + 8, PLAY_HALF - 8);
    for (const o of this.obstacles) { const ddx = e.x - o.x, ddz = e.z - o.z, d = Math.hypot(ddx, ddz) || 0.01; if (d < o.r + 1.1) { e.x = o.x + ddx / d * (o.r + 1.1); e.z = o.z + ddz / d * (o.r + 1.1); e.speed *= 0.5; } }
    e.lean += (-turn / dt * 0.12 - e.lean) * Math.min(1, 6 * dt);
    const ground = this.ground.height(e.x, e.z); const desiredY = ground + 0.9; const acc = (desiredY - e.y) * 55 - e.vy * 10; e.vy += acc * dt; e.y += e.vy * dt;
    const n = this.ground.normal(e.x, e.z); const fx = Math.sin(e.heading), fz = Math.cos(e.heading);
    e.pitch += (clamp((n.x * fx + n.z * fz) * -1.2, -0.3, 0.3) - e.pitch) * Math.min(1, 6 * dt); e.roll += (clamp((n.x * fz - n.z * fx) * 1.2, -0.3, 0.3) - e.roll) * Math.min(1, 6 * dt);
    if (!e.clone && e.tomatoes > 0) { e.throwCd -= dt; if (e.throwCd <= 0) { e.throwCd = this.rng.range(2, 5); if (this.rng.next() < 0.5) this.hostThrow(e); } }
  }

  hostThrow(e: Rider) {
    let best: Rider | null = null, bd = RULES.tomatoRange;
    for (const o of this.riders) { if (o === e || !o.alive || o.clone) continue; const d = Math.hypot(o.x - e.x, o.z - e.z); if (d < bd) { bd = d; best = o; } }
    if (!best) { if (!e.bot) this.msg('No rider in range for a tomato', 'bad', e.id); return; }
    e.tomatoes--; e.hitCd = Math.max(e.hitCd, 0.5); this.toms.push({ x: e.x, y: e.y + 1.2, z: e.z, target: best.id, from: e.id, life: 4 });
    this.msg('Tomato thrown at ' + best.name + '!', 'good', e.id); this.emit({ t: 'throw', rider: e });
  }
  hostPickup(e: Rider, it: Item) {
    if (!it.alive) return; const owner = e.clone ? this.riders.find(r => r.id === e.owner) : e; if (!owner) return;
    this.emit({ t: 'pickup', item: it, by: e });
    if (it.kind === 'food') { const f = FOODS[it.type]; let gain = f.energy;
      if (!e.clone) { owner.combo = owner.comboT > 0 ? owner.combo + 1 : 1; owner.comboT = RULES.comboWindow; if (owner.combo >= 2) { gain += owner.combo * 2; this.msg('COMBO x' + owner.combo + '! +' + (owner.combo * 2) + ' bonus', 'good', owner.id); if (owner.id === this.localId) this.emit({ t: 'announce', text: 'COMBO x' + owner.combo + '!', cls: 'boost', to: owner.id }); } }
      owner.energy = Math.min(100, owner.energy + gain); owner.foodEaten++;
      this.msg((e.clone ? 'Clone brought back ' : '') + f.name + ' +' + f.energy + ' energy', 'good', owner.id); this.killItem(it, RULES.foodRespawn); }
    else if (e.clone) return;
    else if (it.kind === 'drink') { e.boost = RULES.drinkSeconds; this.msg('Energy drink! Double speed for 8s', 'boost', e.id); if (e.id === this.localId) this.emit({ t: 'announce', text: 'MEGA BOOST!', sub: 'double speed for 8 seconds', cls: 'boost', to: e.id }); this.killItem(it, RULES.drinkRespawn); }
    else if (it.kind === 'tomato') { if (e.tomatoes >= RULES.maxTomatoes) return; e.tomatoes++; this.msg('Tomato picked up. Throw it with F', 'good', e.id); this.killItem(it, RULES.tomatoRespawn); }
    else { const clones = this.riders.filter(c => c.clone && c.owner === e.id && c.alive).length;
      if (clones < RULES.maxClones && !e.bot) { const c = this.addRider({ id: 'c' + Math.floor(this.rng.next() * 1e6), name: e.name + "'s clone", color: '#7cff8a', accent: '#7cff8a', bike: e.bike, bot: true, clone: true, owner: e.id, x: e.x - Math.sin(e.heading) * 4, z: e.z - Math.cos(e.heading) * 4, heading: e.heading }); this.msg('Cherries! A clone joins you and gathers food', 'good', e.id); this.emit({ t: 'clone', rider: c, owner: e }); if (e.id === this.localId) this.emit({ t: 'announce', text: 'CLONE ARMY!', sub: 'a helper gathers food for you', cls: 'good', to: e.id }); }
      else { e.energy = Math.min(100, e.energy + 15); this.msg('Cherries +15 energy', 'good', e.id); } this.killItem(it, RULES.cherryRespawn); }
  }

  step(dt: number, localInput: Input) {
    if (this.countdown > 0) { this.countdown -= dt; return; }
    if (this.over) return;
    this.t += dt;
    for (const e of this.riders) { if (!e.alive) continue;
      if (e.bot) this.botUpdate(e, dt); else if (e.id === this.localId) this.movePhysics(e, localInput, dt);
      if (e.crashes > 0) { e.energy -= RULES.crashCost * e.crashes * this.stat(e).armor; e.crashes = 0; }
      if (e.closeCalls > 0) { e.energy = Math.min(100, e.energy + RULES.closeCallBonus * e.closeCalls); e.closeCalls = 0; }
      if (e.jumpCost > 0) { e.energy -= e.jumpCost; e.jumpCost = 0; }
      if (e.comboT > 0) { e.comboT -= dt; if (e.comboT <= 0) e.combo = 0; }
      if (e.boost > 0) e.boost -= dt; if (e.blind > 0) e.blind -= dt;
      for (const it of this.items) { if (it.alive && (e.y - this.ground.height(it.x, it.z)) < 3.4 && Math.hypot(it.x - e.x, it.z - e.z) < RULES.pickupRadius) this.hostPickup(e, it); }
      if (e.clone) continue;
      const lenK = 300 / this.len;
      e.energy -= (2.0 + this.t * 0.014 * lenK) * lenK * this.stat(e).drain * (e.boost > 0 ? 1.4 : 1) * (this.t > this.len - Math.min(60, this.len * 0.2) ? 2.2 : 1) * dt; e.survived = this.t;
      if (e.energy <= 0) { e.energy = 0; e.alive = false; this.elim.unshift(e.id); this.msg(e.name + ' is out of energy!', 'bad', 'all'); this.emit({ t: 'out', rider: e }); for (const c of this.riders) if (c.clone && c.owner === e.id) c.alive = false; }
    }
    // soft bumps
    const list = this.riders.filter(e => e.alive);
    for (const a of list) for (const b of list) { if (a === b || !a.bot) continue; const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz); if (d < 2.6 && d > 0.01) { const p = (2.6 - d) / 2; a.x += dx / d * p; a.z += dz / d * p; if (b.bot) { b.x -= dx / d * p; b.z -= dz / d * p; } } }
    for (const it of this.items) { if (!it.alive) { it.respawn -= dt; if (it.respawn <= 0) this.reviveItem(it); } }
    for (const tm of this.toms) { const tg = this.riders.find(r => r.id === tm.target); tm.life -= dt; if (!tg || !tg.alive || tm.life <= 0) { tm.done = true; continue; }
      const ty = tg.y + 0.8, dx = tg.x - tm.x, dy = ty - tm.y, dz = tg.z - tm.z, d = Math.hypot(dx, dy, dz);
      if (d < 1.8) { tm.done = true; tg.blind = RULES.jamSeconds; this.emit({ t: 'hit', tomato: tm, target: tg }); this.msg('Splat! ' + (this.riders.find(r => r.id === tm.from)?.name || 'Someone') + ' hit you. GPS jammed 10s', 'bad', tg.id); this.msg('Direct hit on ' + tg.name + '!', 'good', tm.from); if (tg.id === this.localId) this.emit({ t: 'announce', text: 'TOMATO ATTACK!', sub: 'GPS jammed 10 s', cls: 'bad', to: tg.id }); if (tm.from === this.localId) this.emit({ t: 'announce', text: 'DIRECT HIT!', cls: 'good', to: tm.from }); continue; }
      const s = Math.min(d, RULES.tomatoSpeed * dt); tm.x += dx / d * s; tm.y += dy / d * s + Math.sin(tm.life * 4) * dt * 2; tm.z += dz / d * s; }
    this.toms = this.toms.filter(t => !t.done);
    const left = this.len - this.t;
    if (left < Math.min(60, this.len * 0.2) && !this.warned60) { this.warned60 = true; this.msg('Final stretch! Food is running out', 'bad', 'all'); this.emit({ t: 'announce', text: 'FINAL STRETCH!', sub: 'energy drains twice as fast', cls: 'bad', to: this.localId }); }
    if (left < 10 && !this.warned10) { this.warned10 = true; this.msg('10 seconds! Highest energy wins', 'bad', 'all'); this.emit({ t: 'announce', text: '10 SECONDS!', cls: 'bad', to: this.localId }); }
    const alive = this.aliveRiders();
    if ((alive.length <= 1 || left <= 0) && !this.over) { this.over = true; const rest = alive.slice().sort((a, b) => a.energy - b.energy); for (const r of rest) { r.survived = this.t; this.elim.unshift(r.id); }
      this.standings = this.elim.map(id => { const r = this.riders.find(x => x.id === id)!; return { id, name: r.name, bot: !!r.bot, t: Math.floor(r.survived) }; }); this.emit({ t: 'over' }); }
  }
}
export { MAX_PLAYERS };
