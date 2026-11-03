// Audio: Kenney CC0 one-shots plus a synthesized hover-engine bed (Web Audio). Replace the bed with recorded
// thruster layers when available.
export class GameAudio {
  private ctx: AudioContext | null = null; private master!: GainNode; private buffers = new Map<string, AudioBuffer>();
  private engOsc: OscillatorNode[] = []; private engGain!: GainNode; private engFilter!: BiquadFilterNode; private noise!: AudioBufferSourceNode; private noiseGain!: GainNode;
  muted = false; private ready = false;
  private files: Record<string, string> = { pickup: 'confirmation_001.ogg', click: 'click_001.ogg', crash: 'impactMetal_medium_000.ogg', land: 'impactSoft_heavy_000.ogg', bad: 'error_008.ogg', win: 'jingles_STEEL02.ogg', glass: 'glass_001.ogg' };
  ensure(): boolean {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try { this.ctx = new AudioContext(); } catch { return false; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(c.destination);
    for (const [k, f] of Object.entries(this.files)) fetch('assets/audio/' + f).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).then(buf => this.buffers.set(k, buf)).catch(() => {});
    // engine bed: two detuned saws through a lowpass plus filtered noise for the hover wash
    this.engGain = c.createGain(); this.engGain.gain.value = 0; this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 400; this.engFilter.Q.value = 2;
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    for (const d of [0, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55; o.detune.value = d; o.connect(this.engFilter); o.start(); this.engOsc.push(o); }
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const data = nb.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = c.createBufferSource(); this.noise.buffer = nb; this.noise.loop = true; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.6; this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0; this.noise.connect(nf); nf.connect(this.noiseGain); this.noiseGain.connect(this.master); this.noise.start();
    this.ready = true; return true;
  }
  play(name: string, vol = 1, rate = 1) { if (!this.ctx || !this.buffers.has(name)) return; const s = this.ctx.createBufferSource(); s.buffer = this.buffers.get(name)!; s.playbackRate.value = rate; const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.master); s.start(); }
  engine(speedN: number, boost: boolean, on: boolean) {
    if (!this.ready || !this.ctx) return; const t = this.ctx.currentTime;
    const base = 48 + speedN * 110 + (boost ? 40 : 0); for (const o of this.engOsc) o.frequency.setTargetAtTime(base, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(300 + speedN * 1400 + (boost ? 800 : 0), t, 0.1);
    this.engGain.gain.setTargetAtTime(on ? 0.06 + speedN * 0.08 : 0, t, 0.15); this.noiseGain.gain.setTargetAtTime(on ? 0.02 + speedN * 0.1 : 0, t, 0.15);
  }
  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
}
