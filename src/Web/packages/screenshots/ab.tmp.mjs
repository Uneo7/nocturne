import { chromium, devices } from '@playwright/test';

const HOVERS = 30;

async function sweep(variant, throttle, mobile) {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext(
    mobile ? { ...devices['Pixel 7'], hasTouch: false, isMobile: false, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6 }
           : { viewport: { width: 1400, height: 1000 } },
  );
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.goto(`http://localhost:5184/bench?v=${variant}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const cards = page.locator(variant === 'css' ? '.css-card' : '.nwc-drops');
  const n = await cards.count();

  const metrics = async () => {
    const { metrics: m } = await cdp.send('Performance.getMetrics');
    const get = (k) => m.find((x) => x.name === k)?.value ?? 0;
    return { script: get('ScriptDuration'), layout: get('LayoutDuration'), style: get('RecalcStyleDuration'), heap: get('JSHeapUsedSize') };
  };

  // Warm: the first hover of each card pays placement and decode once.
  for (let i = 0; i < n; i++) { await cards.nth(i).hover(); await page.waitForTimeout(260); }
  await page.mouse.move(6, 6);
  await page.waitForTimeout(800);

  const before = await metrics();
  await page.evaluate(() => {
    window.__f = [];
    const t0 = performance.now(); let prev = t0;
    const tick = () => { const x = performance.now(); window.__f.push(x - prev); prev = x; if (x - t0 < 60000) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  for (let i = 0; i < HOVERS; i++) {
    await cards.nth(i % n).hover();
    await page.waitForTimeout(260);
    // Parked on a card that is not under test rather than off-page chrome.
    await cards.nth((i + 3) % n).hover();
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(500);

  const after = await metrics();
  const f = await page.evaluate(() => {
    const s = [...window.__f].sort((a, b) => a - b);
    return { p95: s[Math.floor(s.length * 0.95)] ?? 0, max: Math.max(...s, 0), over: s.filter((d) => d > 32).length, n: s.length };
  });
  const png = await page.evaluate(() =>
    Math.round(performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.png'))
      .reduce((a, r) => a + (r.encodedBodySize || 0), 0) / 1024));
  await browser.close();
  return {
    script: (after.script - before.script) * 1000,
    layout: (after.layout - before.layout) * 1000,
    style: (after.style - before.style) * 1000,
    heapKb: Math.round((after.heap - before.heap) / 1024),
    ...f,
    png,
  };
}

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

for (const [throttle, mobile, label] of [[1, false, 'desktop 1x'], [4, true, 'phone 4x'], [6, true, 'phone 6x']]) {
  console.log(`--- ${label}, ${HOVERS} hover cycles, median of 3 ---`);
  for (const variant of ['css', 'drops']) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await sweep(variant, throttle, mobile));
    const pick = (k) => med(runs.map((r) => r[k]));
    console.log(
      `  ${variant.padEnd(6)} script ${pick('script').toFixed(0).padStart(5)}ms  layout ${pick('layout').toFixed(0).padStart(4)}ms  ` +
        `style ${pick('style').toFixed(0).padStart(4)}ms  | per hover ${(pick('script') / HOVERS).toFixed(2)}ms  | ` +
        `p95 ${pick('p95').toFixed(1)}  >32ms ${pick('over')}/${pick('n')}  | heap ${pick('heapKb')}KB  png ${pick('png')}KB`,
    );
  }
}
