import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=800,500'] });
const page = await browser.newPage(); await page.setViewport({ width: 800, height: 500 });
const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 300)));
await page.goto(process.argv[2], { waitUntil: 'load', timeout: 120000 }); await new Promise(r => setTimeout(r, 30000));
const info = await page.evaluate(() => { const s = window.__sf2.scene; const m = s.getMaterialByName('terrain'); const mesh = s.getMeshByName('terrainInner'); const eff = m.getEffect ? m.getEffect() : null; const e2 = mesh.subMeshes[0].effect;
  const samplers = ['tTrailD','tGroundD','splatMap','tCliffD']; const out = { ready: m.isReady(mesh), hasEffect: !!e2, defines: e2 && e2.defines && e2.defines.toString().slice(0, 200) };
  if (e2) { out.samplersList = e2._samplerList && e2._samplerList.filter(x => /^t|splat/.test(x)); out.uniformLoc = samplers.map(n => [n, !!(e2.getUniform && e2.getUniform(n))]); out.compileError = e2.getCompilationError && e2.getCompilationError(); }
  out.texReady = samplers.map(n => [n, m._newSamplerInstances && Object.entries(m._newSamplerInstances).filter(([k]) => k.endsWith(n)).map(([k, t]) => [t.isReady(), t.url || t.name])]);
  out.maxTex = s.getEngine().getCaps().maxTexturesImageUnits; out.rock = (() => { const r = s.getMaterialByName('rockSandstone'); const rm = s.getMeshByName('hoodoo0'); const e = rm.subMeshes[0].effect; return { ok: !!e, locs: e && ['tD','tN'].map(n => !!e.getUniform(n)) }; })();
  return out; });
console.log(JSON.stringify(info, null, 1)); console.log(logs.filter(l => !/favicon|404/.test(l)).slice(0, 20).join('\n')); await browser.close();
