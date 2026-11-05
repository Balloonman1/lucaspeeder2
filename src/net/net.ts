// Multiplayer over a public MQTT relay (WebSocket). No server to host: the host's browser runs the race,
// players send their own bike state, the host sends snapshots of everything back ~15 times a second.
// Same design as the original Speeder Forager, ported to TypeScript.
import mqtt, { type MqttClient } from 'mqtt';

export interface PlayerSpec { id: string; name: string; color: string; accent: string; }
export type NetMsg = Record<string, any> & { t: string };

const DEFAULT_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081'];
const ROOT = 'speeder-forager-2/veyra';

export class Net {
  client: MqttClient | null = null; code = ''; myId = ''; host = false; online = false; welcomed = false;
  lobby: PlayerSpec[] = []; lastSnap = 0; private seen = new Map<string, number>(); private timers: number[] = [];
  onStatus: (text: string) => void = () => {};
  onLobby: () => void = () => {};
  onHostMsg: (from: string, m: NetMsg) => void = () => {};   // host side
  onClientMsg: (m: NetMsg) => void = () => {};               // player side
  onDrop: (id: string) => void = () => {};                   // host side: a player went quiet
  private brokers: string[];
  constructor() { const b = new URLSearchParams(location.search).get('broker'); this.brokers = b ? [b] : DEFAULT_BROKERS; }

  private topic(sub: string) { return `${ROOT}/${this.code}/${sub}`; }
  static randomCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }

  private connect(): Promise<MqttClient> {
    return new Promise((resolve, reject) => {
      let i = 0;
      const tryNext = () => {
        if (i >= this.brokers.length) { reject(new Error('could not reach any relay server')); return; }
        const url = this.brokers[i++]; this.onStatus(`Connecting to relay ${i} of ${this.brokers.length}…`);
        let c: MqttClient; let ok = false;
        try { c = mqtt.connect(url, { connectTimeout: 7000, reconnectPeriod: 2000, keepalive: 20, clean: true }); } catch { tryNext(); return; }
        const fail = () => { if (ok) return; ok = true; try { c.end(true); } catch {} tryNext(); };
        c.on('connect', () => { if (ok) return; ok = true; this.client = c; resolve(c); });
        c.on('error', fail);
        setTimeout(fail, 8000);
      };
      tryNext();
    });
  }
  private send(sub: string, m: NetMsg) { if (!this.client) return; try { this.client.publish(this.topic(sub), JSON.stringify(m), { qos: 0 }); } catch {} }
  broadcast(m: NetMsg) { this.send('all', m); }
  sendTo(id: string, m: NetMsg) { this.send('c/' + id, m); }
  sendHost(m: NetMsg) { this.send('h', { ...m, from: this.myId }); }

  async hostRoom(me: Omit<PlayerSpec, 'id'>): Promise<string> {
    this.close(); this.code = Net.randomCode(); this.host = true; this.myId = 'p0'; this.lobby = [{ id: 'p0', ...me }];
    const c = await this.connect(); this.online = true; this.welcomed = true; this.onStatus('');
    c.subscribe(this.topic('h'), { qos: 0 });
    c.on('message', (_tp, payload) => { let d: any; try { d = JSON.parse(payload.toString()); } catch { return; } if (!d || !d.from) return; this.seen.set(d.from, performance.now()); this.hostHandle(d); });
    this.timers.push(window.setInterval(() => {
      const now = performance.now();
      const limit = +(new URLSearchParams(location.search).get('drop') || 20000);
      for (const [id, t] of this.seen) if (now - t > limit) { this.seen.delete(id); this.lobby = this.lobby.filter(p => p.id !== id); this.onDrop(id); this.broadcast({ t: 'lobby', players: this.lobby, code: this.code }); this.onLobby(); }
      this.broadcast({ t: 'lobby', players: this.lobby, code: this.code });
    }, 2000));
    this.onLobby();
    return this.code;
  }
  racing = false; // set by the game while a race is on (late joiners are turned away)
  private hostHandle(d: NetMsg) {
    const id = d.from as string;
    if (d.t === 'join') {
      if (this.lobby.some(p => p.id === id)) { this.sendTo(id, { t: 'welcome', id, code: this.code }); return; }
      if (this.lobby.length >= 10 || this.racing) { this.sendTo(id, { t: 'full', racing: this.racing }); return; }
      this.lobby.push({ id, name: String(d.name || 'Rider').slice(0, 14), color: d.color || '#3b7bff', accent: d.accent || '#4df0e0' });
      this.sendTo(id, { t: 'welcome', id, code: this.code }); this.broadcast({ t: 'lobby', players: this.lobby, code: this.code }); this.onLobby(); return;
    }
    if (d.t === 'leave') { this.seen.delete(id); this.lobby = this.lobby.filter(p => p.id !== id); this.onDrop(id); this.broadcast({ t: 'lobby', players: this.lobby, code: this.code }); this.onLobby(); return; }
    if (d.t === 'hb') return;
    this.onHostMsg(id, d);
  }

  async joinRoom(code: string, me: Omit<PlayerSpec, 'id'>): Promise<void> {
    this.close(); this.code = code.toUpperCase(); this.host = false; this.myId = 'p' + Math.random().toString(36).slice(2, 8);
    const c = await this.connect(); this.online = true;
    c.subscribe([this.topic('all'), this.topic('c/' + this.myId)], { qos: 0 });
    c.on('message', (_tp, payload) => { let d: any; try { d = JSON.parse(payload.toString()); } catch { return; } this.clientHandle(d); });
    this.onStatus('Relay connected. Looking for room ' + this.code + '…');
    await new Promise<void>((resolve, reject) => {
      let tries = 0; const ask = () => this.sendHost({ t: 'join', ...me });
      const iv = window.setInterval(() => { if (this.welcomed) { clearInterval(iv); resolve(); return; } if (this.fullReason) { clearInterval(iv); reject(new Error(this.fullReason)); return; } if (++tries > 8) { clearInterval(iv); reject(new Error('No open room with code ' + this.code + '. Check the code and make sure the host is on the lobby screen.')); return; } ask(); }, 1000);
      ask();
    });
    this.timers.push(window.setInterval(() => { if (this.welcomed) this.sendHost({ t: 'hb' }); }, 2000));
  }
  private fullReason = '';
  private clientHandle(d: NetMsg) {
    if (d.t === 'welcome') { this.welcomed = true; this.onStatus(''); this.onLobby(); return; }
    if (d.t === 'full') { if (!this.welcomed) this.fullReason = d.racing ? 'That room is in the middle of a race. Try again when it finishes.' : 'That room is full (10 riders).'; return; }
    if (!this.welcomed) return;
    if (d.t === 'lobby') { this.lobby = d.players; this.onLobby(); return; }
    if (d.t === 'snap') this.lastSnap = performance.now();
    this.onClientMsg(d);
  }
  close() {
    if (this.client && !this.host && this.welcomed) this.sendHost({ t: 'leave' });
    for (const t of this.timers) clearInterval(t); this.timers = [];
    if (this.client) { const c = this.client; setTimeout(() => { try { c.end(true); } catch {} }, 150); }
    this.client = null; this.online = false; this.host = false; this.welcomed = false; this.lobby = []; this.seen.clear(); this.fullReason = ''; this.racing = false;
  }
  inviteLink() { const u = new URL(location.href); u.search = '?room=' + this.code; u.hash = ''; return u.toString(); }
}
