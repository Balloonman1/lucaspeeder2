import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--window-size=800,500'] });
const page = await browser.newPage(); const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 300))); page.on('pageerror', e => logs.push('pageerror: ' + e.message)); page.on('requestfailed', r => logs.push('reqfail: ' + r.url()));
page.on('request', r => { if (!/localhost/.test(r.url())) logs.push('ext: ' + r.url()); });
await page.goto(process.argv[2], { waitUntil: 'load', timeout: 120000 }); await new Promise(r => setTimeout(r, 40000));
console.log(await page.evaluate(() => ({ txt: document.getElementById('loadTxt').textContent, backend: document.getElementById('backend').textContent, gpu: !!navigator.gpu })));
console.log(logs.filter(l => !/favicon/.test(l)).slice(0, 40).join('\n')); await browser.close();
