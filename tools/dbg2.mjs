import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=800,500'] });
const page = await browser.newPage(); await page.setViewport({ width: 800, height: 500 });
await page.goto(process.argv[2], { waitUntil: 'load', timeout: 120000 }); await new Promise(r => setTimeout(r, 25000));
const info = await page.evaluate(async () => { const s = window.__sf2.scene; const mesh = s.getMeshByName('terrainInner'); const n = mesh.getVerticesData('normal'); const p = mesh.getVerticesData('position');
  const sun = s.getLightByName('sun'); const B = window.__B;
  return { nSample: Array.from(n.slice(300000, 300009)).map(v => +v.toFixed(2)), pSample: Array.from(p.slice(300000, 300006)).map(v => +v.toFixed(1)), sunDir: sun.direction.asArray().map(v => +v.toFixed(2)), sunI: sun.intensity, sunOn: sun.isEnabled(), hemi: s.getLightByName('hemi').intensity, env: !!s.environmentTexture, envReady: s.environmentTexture && s.environmentTexture.isReady(), matClass: mesh.material.getClassName(), fog: s.fogDensity, cull: mesh.material.backFaceCulling, lights: s.lights.map(l => l.name + ':' + l.getClassName()), meshLights: mesh.lightSources ? mesh.lightSources.length : 'na', isVisible: mesh.isVisible, indices: mesh.getTotalIndices(), vis: mesh.visibility }; });
console.log(JSON.stringify(info)); await browser.close();
