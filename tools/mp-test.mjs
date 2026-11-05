// Two-browser multiplayer smoke test against a local relay (tools/test-broker.mjs).
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5173/';
const q = '?q=low&broker=' + encodeURIComponent('ws://localhost:8883');
const launch = () => puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=480,300'] });
const [bA, bB] = await Promise.all([launch(), launch()]);
const A = await bA.newPage(), B = await bB.newPage(); await A.setViewport({ width: 480, height: 300 }); await B.setViewport({ width: 480, height: 300 });
const logs = { A: [], B: [] }; A.on('pageerror', e => logs.A.push(e.message)); B.on('pageerror', e => logs.B.push(e.message));
A.on('console', m => { if (m.type() === 'error') logs.A.push(m.text().slice(0, 200)); }); B.on('console', m => { if (m.type() === 'error') logs.B.push(m.text().slice(0, 200)); });
await Promise.all([A.goto(BASE + q, { timeout: 120000 }), B.goto(BASE + q, { timeout: 120000 })]);
const ready = p => p.waitForFunction(() => !document.getElementById('start').classList.contains('hidden'), { timeout: 240000 });
await Promise.all([ready(A), ready(B)]); console.log('both loaded');
await A.evaluate(() => { document.getElementById('nameIn').value = 'Host'; document.getElementById('hostBtn').click(); });
await A.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent), { timeout: 30000 });
const code = await A.$eval('#roomCode', e => e.textContent); console.log('room', code);
await B.evaluate(c => { document.getElementById('nameIn').value = 'Luca'; document.getElementById('codeIn').value = c; document.getElementById('joinBtn').click(); }, code);
await B.waitForFunction(() => !document.getElementById('room').classList.contains('hidden'), { timeout: 30000 });
await A.waitForFunction(() => document.querySelectorAll('#plist .pl:not(.bot)').length === 2, { timeout: 20000 });
console.log('lobby A:', await A.$$eval('#plist .pl', els => els.map(e => e.textContent).join(' | ')));
console.log('lobby B:', await B.$$eval('#plist .pl', els => els.map(e => e.textContent).join(' | ')));
await A.evaluate(() => document.getElementById('roomStartBtn').click());
await B.waitForFunction(() => window.__sf2.match && window.__sf2.mode === 'client', { timeout: 30000 });
console.log('race started on both');
// player holds W and D for a while
await B.evaluate(() => { dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })); });
const info = p => p.evaluate(() => { const s = window.__sf2, m = s.match; return { mode: s.mode, t: +m.t.toFixed(1), cd: +m.countdown.toFixed(1), humans: m.riders.filter(r => !r.bot).map(r => r.name + '@' + r.x.toFixed(1) + ',' + r.z.toFixed(1) + ' e' + Math.round(r.energy)), bots: m.riders.filter(r => r.bot).length, items: m.items.filter(i => i.alive).length, local: m.localId }; });
for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 30000)); console.log('A', JSON.stringify(await info(A))); console.log('B', JSON.stringify(await info(B))); }
console.log('errors A:', logs.A.filter(l => !/favicon|404/.test(l)).slice(0, 5)); console.log('errors B:', logs.B.filter(l => !/favicon|404/.test(l)).slice(0, 5));
await A.screenshot({ path: 'shots/mpA.png' }); await B.screenshot({ path: 'shots/mpB.png' });
await Promise.all([bA.close(), bB.close()]);
