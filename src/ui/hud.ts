// DOM HUD driven by the match state every frame.
import type { Match, Rider } from '../game/match';
import { FOODS, MAX_PLAYERS } from '../game/rules';

const $ = (id: string) => document.getElementById(id)!;
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class HUD {
  private track = $('compassTrack'); private gaugeArc = $('gaugeArc') as unknown as SVGPathElement; private ticker = $('ticker'); private ann = $('announce');
  constructor() {
    // compass track: 3 copies of the rose so it can scroll
    let html = ''; for (let c = -1; c <= 1; c++) for (let i = 0; i < 16; i++) { const deg = c * 360 + i * 22.5; const major = i % 2 === 0; html += `<div class="tick${major ? ' major' : ''}" data-deg="${deg}">${major ? DIRS[i / 2] : '|'}</div>`; }
    this.track.innerHTML = html;
  }
  show(on: boolean) { $('hud').classList.toggle('hidden', !on); }
  flash() { const f = $('flash'); f.style.opacity = '0.35'; setTimeout(() => f.style.opacity = '0', 60); }
  message(text: string, cls: string) { const d = document.createElement('div'); d.className = cls; d.textContent = text; this.ticker.appendChild(d); while (this.ticker.children.length > 3) this.ticker.removeChild(this.ticker.firstChild!); setTimeout(() => d.remove(), 3300); }
  announce(text: string, cls: string, sub?: string) { const d = document.createElement('div'); d.className = 'ann ' + cls; d.textContent = text; if (sub) { const s = document.createElement('small'); s.textContent = sub; d.appendChild(s); } this.ann.appendChild(d); while (this.ann.children.length > 2) this.ann.removeChild(this.ann.firstChild!); setTimeout(() => d.remove(), 2200); }
  countdown(v: number | null) { $('countdown').textContent = v === null ? '' : v <= 0 ? 'GO' : String(v); }
  update(match: Match, me: Rider, viewing: Rider, speedKmh: number) {
    const maxK = 33 * 2 * 3.6; const arc = 245 * (1 - Math.min(1, speedKmh / maxK)); this.gaugeArc.style.strokeDashoffset = String(arc); $('speedNum').textContent = String(Math.round(speedKmh));
    const e = viewing; const pct = Math.max(0, Math.round(e.energy)); $('energyFill').style.width = pct + '%'; $('energyFill').classList.toggle('low', e.energy < 30); $('energyPct').textContent = pct + '%';
    $('foodCount').textContent = String(e.foodEaten); $('aliveCount').textContent = match.aliveRiders().length + '/' + MAX_PLAYERS; const lf = Math.max(0, match.len - match.t); $('timeLeft').textContent = Math.floor(lf / 60) + ':' + String(Math.floor(lf % 60)).padStart(2, '0'); $('timeLeft').style.color = lf < 20 ? 'var(--bad)' : '';
    $('tomCount').textContent = String(e.tomatoes); $('toms').style.opacity = e.tomatoes > 0 ? '1' : '.4';
    const t = $('turbo'); t.classList.toggle('hidden', e.boost <= 0); if (e.boost > 0) $('turboT').textContent = e.boost.toFixed(1);
    // compass: scroll ticks so the heading sits under the needle; heading 0 = +z = N
    const headDeg = ((-e.heading * 180 / Math.PI) % 360 + 360) % 360; const pxPerDeg = 520 / 180;
    for (const tick of Array.from(this.track.children) as HTMLElement[]) { const deg = parseFloat(tick.dataset.deg!); let d = deg - headDeg; d = ((d + 540) % 360) - 180; tick.style.left = (260 + d * pxPerDeg) + 'px'; }
    const jammed = e.blind > 0 && e === me; $('jam').classList.toggle('hidden', !jammed); if (jammed) $('jamT').textContent = String(Math.ceil(e.blind)); $('gps').classList.toggle('jammed', jammed);
    const [target, dist] = jammed ? [null, 0] : match.nearestItem(e.x, e.z, it => it.kind === 'food');
    const tgt = $('compassTarget');
    if (target) { const ang = Math.atan2(target.x - e.x, target.z - e.z) - e.heading; const rel = Math.atan2(Math.sin(ang), Math.cos(ang)); $('gpsArrow').style.transform = 'rotate(' + (-rel * 180 / Math.PI - 90) + 'deg)'; $('gpsText').textContent = FOODS[target.type].name + ' · ' + Math.round(dist) + ' m';
      const relDeg = -rel * 180 / Math.PI; tgt.style.display = Math.abs(relDeg) < 88 ? 'block' : 'none'; tgt.style.left = (260 + relDeg * pxPerDeg) + 'px'; }
    else { $('gpsText').textContent = jammed ? 'JAMMED ' + Math.ceil(e.blind) + 's' : 'scanning'; tgt.style.display = 'none'; }
    const lowE = e === me && e.alive && e.energy < 22; $('lowE').classList.toggle('hidden', !lowE);
    $('spect').classList.toggle('hidden', viewing === me); if (viewing !== me) $('spectName').textContent = viewing.name;
  }
  /** screen-space marker over the nearest food */
  marker(screen: { x: number; y: number; visible: boolean } | null, label: string) {
    let el = document.getElementById('marker'); if (!el) { el = document.createElement('div'); el.id = 'marker'; el.innerHTML = '<span class="pin">◆</span><span class="lbl"></span>'; $('hud').appendChild(el); }
    if (!screen || !screen.visible) { el.style.display = 'none'; return; }
    el.style.display = 'flex'; el.style.left = screen.x + 'px'; el.style.top = screen.y + 'px'; (el.querySelector('.lbl') as HTMLElement).textContent = label;
  }
  showOver(match: Match, me: Rider) {
    const place = match.standings.findIndex(s => s.id === me.id) + 1; const winner = match.standings[0];
    $('overTitle').textContent = place === 1 ? 'YOU WIN!' : (winner ? winner.name + ' wins' : 'Race over'); $('overTitle').className = place === 1 ? 'win' : '';
    $('overSub').textContent = place === 1 ? 'Last rider standing in Veyra Canyon.' : 'You placed #' + place + ' of ' + match.standings.length + '.';
    $('oTime').textContent = Math.floor(me.survived) + 's'; $('oFood').textContent = String(me.foodEaten); $('oPlace').textContent = '#' + place;
    const ol = $('standings'); ol.innerHTML = ''; match.standings.forEach((s) => { const li = document.createElement('li'); li.textContent = s.name + (s.id === me.id ? ' (you)' : ''); const sm = document.createElement('small'); sm.textContent = (s.bot ? 'bot · ' : '') + s.t + 's'; li.appendChild(sm); ol.appendChild(li); });
    $('over').classList.remove('hidden');
  }
}
