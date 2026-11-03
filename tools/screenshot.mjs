// Headless capture of the running game for review. Usage: node tools/screenshot.mjs [url] [outfile] [waitSeconds]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:4173/?auto=1&drive=1&webgl';
const out = process.argv[3] || 'shots/shot.png';
const wait = +(process.argv[4] || 14);
fs.mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
const logs = [];
page.on('response', r => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url()); });
page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') logs.push(`[${t}] ${m.text().slice(0, 400)}`); });
page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await new Promise(r => setTimeout(r, wait * 1000));
const info = await page.evaluate(() => { const s = window.__sf2; const m = s && s.match; return { backend: s && s.backend, fps: s && s.engine.getFps().toFixed(1), t: m && m.t.toFixed(1), me: m && m.riders[0] && { x: m.riders[0].x.toFixed(1), z: m.riders[0].z.toFixed(1), y: m.riders[0].y.toFixed(2), speed: m.riders[0].speed.toFixed(1), energy: m.riders[0].energy.toFixed(1), food: m.riders[0].foodEaten }, alive: m && m.aliveRiders().length, loadTxt: document.getElementById('loadTxt')?.textContent, meshes: s && s.scene.meshes.length, draws: s && s.engine.drawCalls }; });
await page.screenshot({ path: out });
console.log(JSON.stringify(info)); console.log(logs.slice(0, 30).join('\n'));
await browser.close();
