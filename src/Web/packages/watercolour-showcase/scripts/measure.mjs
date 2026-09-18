#!/usr/bin/env node
// Perf measurement for the watercolour showcase. Run against a dev server on :5181.
// Requires a WebGPU-capable Chrome (channel 'chrome'); falls back to bundled chromium.
// Every wait is bounded (<= 15 s) and wrapped in try/catch; a failed step records
// "not measured: <reason>" and the script moves on. A global watchdog exits after 6 min.
// Prints progress to stdout and one JSON results object between RESULT_BEGIN / RESULT_END.

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '..', '..', 'app', 'package.json'));
const { chromium } = require('@playwright/test');

const WATCHDOG_MS = 6 * 60 * 1000;
setTimeout(() => {
  console.error('[measure] watchdog fired; exiting');
  process.exit(2);
}, WATCHDOG_MS).unref();

const REPO = join(__dirname, '..', '..', '..', '..', '..');
const BASE = 'http://localhost:5181';
const OUT_DIR = join(REPO, '.playwright-mcp', 'perf');
const WASM_PATH = join(REPO, 'src', 'Web', 'packages', 'watercolour', 'src', 'wasm', 'nocturne_watercolour_bg.wasm');
const ASSETS_DIR = join(REPO, 'src', 'Web', 'packages', 'watercolour', 'assets');

const VIEWPORT = { width: 1280, height: 900 };
const REPEATS = 3;
const log = (msg) => console.log(`[measure] ${msg}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function median(values) {
  const s = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function stats(values) {
  if (!values || values.length === 0) return { n: 0, median: NaN, min: NaN, max: NaN };
  const nums = values.filter((v) => Number.isFinite(v));
  return { n: nums.length, median: median(nums), min: Math.min(...nums), max: Math.max(...nums) };
}
function p95(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return NaN;
  return nums[Math.min(nums.length - 1, Math.floor(nums.length * 0.95))];
}

const isNotMeasured = (x) => x && typeof x === 'object' && 'notMeasured' in x;
const notMeasured = (reason) => ({ notMeasured: String((reason && reason.message) || reason) });

// Run a named step with progress lines; failures become { notMeasured: <reason> }.
async function runStep(name, fn) {
  log(`>> ${name}`);
  try {
    const value = await fn();
    log(`<< ${name}: ok`);
    return value;
  } catch (e) {
    log(`<< ${name}: FAILED (${(e && e.message) || e})`);
    return notMeasured(e);
  }
}

// Navigation per brief: domcontentloaded, then a fixed settle wait.
async function nav(page, path, settleMs = 4000) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(settleMs);
}

// --- filesystem: bundle + assets -----------------------------------------------------------
function dirBytes(dir) {
  let total = 0;
  const count = { files: 0, dirs: 0 };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count.dirs += 1;
      const sub = dirBytes(join(dir, entry.name));
      total += sub.bytes;
      count.files += sub.files;
      count.dirs += sub.dirs;
    } else if (entry.isFile()) {
      total += statSync(join(dir, entry.name)).size;
      count.files += 1;
    }
  }
  return { bytes: total, files: count.files, dirs: count.dirs };
}

// --- page helpers (real functions: playwright evaluates strings as expressions) -------------
function readPlaygroundStats() {
  const el = document.querySelector('[data-playground-stats]');
  if (!el) return null;
  const els = Array.from(el.children).map((e) => e.textContent.trim());
  const out = {};
  for (let i = 0; i + 1 < els.length; i += 2) out[els[i]] = els[i + 1];
  out.__raw = el.innerText;
  return out;
}

function readGalleryStats() {
  const dl = Array.from(document.querySelectorAll('dl')).find((d) => d.textContent.includes('live instances'));
  if (!dl) return null;
  const els = Array.from(dl.children).map((e) => e.textContent.trim());
  const out = {};
  for (let i = 0; i + 1 < els.length; i += 2) out[els[i]] = els[i + 1];
  out.__raw = dl.innerText;
  return out;
}

function firstPaintPresent() {
  const w = window.__watercolour;
  return Boolean(w && typeof w.firstPaintMs === 'number');
}

// Wait for first paint, bounded to 15 s.
async function waitForFirstPaint(page, timeoutMs = 15000) {
  await page.waitForFunction(firstPaintPresent, { timeout: timeoutMs, polling: 250 });
}

async function collectStartup(page) {
  return page.evaluate(() => {
    const w = window.__watercolour;
    const marks = performance
      .getEntriesByType('mark')
      .filter((m) => m.name.includes('watercolour'))
      .map((m) => ({ name: m.name, startTime: Math.round(m.startTime * 100) / 100 }));
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      firstPaintMs: w ? w.firstPaintMs : undefined,
      gpuInitMs: w ? w.gpuInitMs : undefined,
      marks,
      domContentLoadedEnd: nav ? Math.round(nav.domContentLoadedEventEnd) : undefined,
      loadEventEnd: nav ? Math.round(nav.loadEventEnd) : undefined,
    };
  });
}

async function measureCold(page) {
  await nav(page, '/playground');
  try {
    await waitForFirstPaint(page);
  } catch (e) {
    return notMeasured(e);
  }
  return { kind: 'cold', outcome: 'ok', ...(await collectStartup(page)) };
}

async function measureWarm(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(4000);
  try {
    await waitForFirstPaint(page);
  } catch (e) {
    return notMeasured(e);
  }
  return { kind: 'warm', outcome: 'ok', ...(await collectStartup(page)) };
}

// --- measurement: active simulation on /playground -----------------------------------------
async function prepareSimPage(page) {
  const dur = page.locator('#pg-duration');
  await dur.fill('20000');
  await dur.dispatchEvent('change');
  await page.waitForFunction(
    () => {
      const c = document.querySelector('[data-playground-canvas]');
      return c && c.dataset.mode === 'live';
    },
    { timeout: 15000, polling: 250 },
  );
}

async function runSimRepeat(page) {
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await sleep(200);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-playground-canvas]')?.dataset.playing === 'true',
    { timeout: 15000, polling: 100 },
  );
  await sleep(300);
  return page.evaluate(async () => {
    const statsEl = document.querySelector('[data-playground-stats]');
    const readStats = () => {
      if (!statsEl) return null;
      const els = Array.from(statsEl.children).map((e) => e.textContent.trim());
      const m = {};
      for (let i = 0; i + 1 < els.length; i += 2) m[els[i]] = els[i + 1];
      return m;
    };
    const samples = [];
    const rafStart = performance.now();
    const rafDeltas = [];
    let prev = rafStart;
    const rafPromise = new Promise((resolve) => {
      function frame(t) {
        rafDeltas.push(t - prev);
        prev = t;
        if (t - rafStart >= 3000) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const started = performance.now();
    while (performance.now() - started < 5000) {
      samples.push({ t: Math.round(performance.now() - started), ...readStats() });
      await new Promise((r) => setTimeout(r, 500));
    }
    await rafPromise;
    const deltas = rafDeltas.slice();
    deltas.shift();
    return { samples, rafDeltas: deltas };
  });
}

async function measureSim(page) {
  await prepareSimPage(page);

  const repeats = [];
  for (let i = 0; i < REPEATS; i++) {
    try {
      const result = await runSimRepeat(page);
      repeats.push(result);
      log(`sim repeat ${i + 1}/${REPEATS} done (${result.samples.length} samples, ${result.rafDeltas.length} rAF deltas)`);
      await page.getByRole('button', { name: 'Pause', exact: true }).click().catch(() => {});
      await sleep(200);
    } catch (e) {
      // A concurrent Vite HMR reload or a GPU hiccup can kill the page mid-repeat;
      // re-navigate and retry before giving up on this repeat.
      log(`sim repeat ${i + 1}/${REPEATS} failed (${(e && e.message) || e}); retrying fresh page`);
      try {
        await page.goto(`${BASE}/playground`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(4000);
        await prepareSimPage(page);
        const result = await runSimRepeat(page);
        repeats.push(result);
        log(`sim repeat ${i + 1}/${REPEATS} retry done (${result.samples.length} samples, ${result.rafDeltas.length} rAF deltas)`);
      } catch (e2) {
        repeats.push(notMeasured(e2));
        log(`sim repeat ${i + 1}/${REPEATS} FAILED after retry (${(e2 && e2.message) || e2})`);
      }
    }
  }

  const allDeltas = repeats.flatMap((r) => (isNotMeasured(r) ? [] : r.rafDeltas));
  const perSample = repeats.map((r) => {
    if (isNotMeasured(r)) return r;
    const s = r.samples;
    const stepVals = s.map((x) => parseFloat(x && x['last step'])).filter((v) => Number.isFinite(v));
    return {
      sampleCount: s.length,
      cards: s.map((x) => x && x['frame avg / p95']).filter(Boolean).slice(0, 6),
      lastStepMs: stats(stepVals),
      raf: stats(r.rafDeltas),
    };
  });
  return {
    repeats: perSample,
    rafOverall: { ...stats(allDeltas), p95: p95(allDeltas) },
    note: 'rAF histogram over 3 s per repeat; stats card read every 500 ms for 5 s per repeat',
  };
}

// --- measurement: /gallery -----------------------------------------------------------------
async function sampleCapOverTime(page, ms) {
  const started = Date.now();
  const samples = [];
  while (Date.now() - started < ms) {
    const s = await page.evaluate(readGalleryStats);
    if (s && s['live instances']) {
      const m = s['live instances'].match(/(\d+)\s*\/\s*(\d+)/);
      if (m) {
        samples.push({ t: Date.now() - started, live: +m[1], max: +m[2], raw: s.__raw });
      }
    }
    await sleep(250);
  }
  const lives = samples.map((s) => s.live);
  const caps = samples.map((s) => s.max);
  return {
    samples: samples.length,
    maxObserved: lives.length ? Math.max(...lives) : 0,
    cap: caps.length ? Math.max(...caps) : 0,
    exceeded: samples.some((s) => s.live > s.max),
    lastRaw: samples.length ? samples[samples.length - 1].raw : null,
  };
}

// --- measurement: invites canvases ---------------------------------------------------------
function readInviteCanvases() {
  const out = [];
  let idx = 0;
  for (const c of document.querySelectorAll('canvas')) {
    const isAvatar = Boolean(c.closest('.rounded-full'));
    let read;
    try {
      const scratch = document.createElement('canvas');
      scratch.width = c.width || 1;
      scratch.height = c.height || 1;
      const ctx = scratch.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(c, 0, 0);
      const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
      let alphaMax = 0;
      let painted = 0;
      let opaque = 0;
      let h = 0x811c9dc5;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a > alphaMax) alphaMax = a;
        if (a > 0) painted += 1;
        if (a === 255) opaque += 1;
        h ^= a;
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      read = { alphaMax, paintedPixels: painted, opaquePixels: opaque, totalPixels: data.length / 4, hash: h >>> 0 };
    } catch (e) {
      read = { error: String((e && e.message) || e) };
    }
    out.push({ index: idx++, isAvatar, backing: c.width + 'x' + c.height, read });
  }
  return out;
}

// --- screenshots ---------------------------------------------------------------------------
async function shot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, type: 'png' });
  return path;
}

async function launchBrowser() {
  try {
    const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu', '--enable-precise-memory-info'] });
    return { browser: b, channel: 'chrome', fallback: false };
  } catch (e) {
    log(`channel 'chrome' launch failed (${e.message}); falling back to bundled chromium`);
    const b = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-precise-memory-info'] });
    return { browser: b, channel: 'bundled-chromium', fallback: true };
  }
}

// Browser that can be relaunched if Chrome dies mid-run (GPU process crash is
// seen on this laptop). Sections re-read `state.browser` via this helper.
const browserState = { browser: null, info: null };

async function ensureBrowser() {
  const current = browserState.browser;
  if (current && current.isConnected()) return current;
  if (current) await current.close().catch(() => {});
  log('browser not connected; relaunching');
  const launch = await runStep('relaunch Chrome', launchBrowser);
  if (isNotMeasured(launch)) throw new Error('relaunch failed: ' + launch.notMeasured);
  browserState.browser = launch.browser;
  browserState.info = launch;
  return launch.browser;
}

function browserInfo() {
  return browserState.info;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const result = { bundle: {}, viewport: VIEWPORT, screenshots: {}, measuredAt: new Date().toISOString() };

  const bundle = await runStep('bundle sizes', async () => {
    const wasmBuf = readFileSync(WASM_PATH);
    return {
      wasmBytes: wasmBuf.length,
      wasmGzipBytes: gzipSync(wasmBuf, { level: 9 }).length,
      assets: dirBytes(ASSETS_DIR),
    };
  });
  result.bundle = bundle;

  const launch = await runStep('launch Chrome', launchBrowser);
  if (isNotMeasured(launch)) {
    result.launch = launch;
    console.log('RESULT_BEGIN');
    console.log(JSON.stringify(result, null, 2));
    console.log('RESULT_END');
    return;
  }
  browserState.browser = launch.browser;
  browserState.info = launch;
  const browser = launch.browser;
  result.browser = { channel: launch.channel, fallback: launch.fallback, version: await browser.version() };
  log(`launched ${launch.channel} ${result.browser.version}`);

  // ---- 1. startup: cold + warm ------------------------------------------------------------
  const cold = await runStep('startup cold x3', async () => {
    const out = [];
    const br = await ensureBrowser();
    for (let i = 0; i < REPEATS; i++) {
      try {
        const ctx = await br.newContext({ viewport: VIEWPORT });
        const page = await ctx.newPage();
        result.browser.userAgent = result.browser.userAgent ?? (await page.evaluate(() => navigator.userAgent));
        const m = await measureCold(page);
        out.push(m);
        log(`cold load ${i + 1}/${REPEATS}: ${isNotMeasured(m) ? 'not measured: ' + m.notMeasured : `firstPaint=${m.firstPaintMs}ms gpuInit=${m.gpuInitMs}ms`}`);
        await ctx.close();
      } catch (e) {
        out.push(notMeasured(e));
        log(`cold load ${i + 1}/${REPEATS} FAILED (${(e && e.message) || e})`);
      }
    }
    return out;
  });

  const warm = await runStep('startup warm x3', async () => {
    const out = [];
    const br = await ensureBrowser();
    for (let i = 0; i < REPEATS; i++) {
      try {
        const ctx = await br.newContext({ viewport: VIEWPORT });
        const page = await ctx.newPage();
        await nav(page, '/playground');
        try {
          await waitForFirstPaint(page);
        } catch (e) {
          log(`warm ${i + 1} first paint timeout on initial nav: ${e.message}`);
        }
        const m = await measureWarm(page);
        out.push(m);
        log(`warm reload ${i + 1}/${REPEATS}: ${isNotMeasured(m) ? 'not measured: ' + m.notMeasured : `firstPaint=${m.firstPaintMs}ms gpuInit=${m.gpuInitMs}ms`}`);
        await ctx.close();
      } catch (e) {
        out.push(notMeasured(e));
        log(`warm load ${i + 1}/${REPEATS} FAILED (${(e && e.message) || e})`);
      }
    }
    return out;
  });

  const startup = { cold, warm, coldMedian: null, warmMedian: null };
  const coldOk = Array.isArray(cold) ? cold.filter((c) => !isNotMeasured(c) && c.outcome === 'ok') : [];
  const warmOk = Array.isArray(warm) ? warm.filter((w) => !isNotMeasured(w) && w.outcome === 'ok') : [];
  if (coldOk.length) {
    startup.coldMedian = {
      firstPaintMs: median(coldOk.map((c) => c.firstPaintMs)),
      gpuInitMs: median(coldOk.map((c) => c.gpuInitMs)),
    };
  }
  if (warmOk.length) {
    startup.warmMedian = {
      firstPaintMs: median(warmOk.map((w) => w.firstPaintMs)),
      gpuInitMs: median(warmOk.map((w) => w.gpuInitMs)),
    };
  }
  result.startup = startup;

  // ---- 2. active simulation ----------------------------------------------------------------
  const sim = await runStep('20 s reveal sim (3 repeats)', async () => {
    const br = await ensureBrowser();
    const ctx = await br.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    await nav(page, '/playground');
    try {
      await waitForFirstPaint(page);
    } catch (e) {
      log(`sim page first paint timeout: ${e.message}`);
    }
    const statsCard = await page.evaluate(readPlaygroundStats).catch((e) => notMeasured(e));
    const simResult = await measureSim(page);
    await ctx.close();
    return { statsCard, sim: simResult };
  });
  result.sim = sim;

  // ---- 3 + 4. /gallery: components, cap, memory -------------------------------------------
  const gallery = await runStep('/gallery cap + memory', async () => {
    const br = await ensureBrowser();
    const ctx = await br.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    const memBefore = await page.evaluate(() => {
      if (!performance.memory) return null;
      return { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize };
    });
    await nav(page, '/gallery');
    await page.waitForTimeout(1000);
    const statsTop = await page.evaluate(readGalleryStats).catch((e) => notMeasured(e));
    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length).catch((e) => notMeasured(e));
    const cap = await sampleCapOverTime(page, 5000);
    const heapAfterTop = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null)).catch(() => null);

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })).catch(() => {});
    await page.waitForTimeout(3000);
    const statsBottom = await page.evaluate(readGalleryStats).catch((e) => notMeasured(e));

    const memAfter = await page.evaluate(() => {
      if (!performance.memory) return null;
      return { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize };
    }).catch(() => null);
    await ctx.close();
    return {
      statsTop,
      statsBottom,
      canvasCount,
      cap,
      heapAfterTop,
      heap: {
        before: memBefore,
        after: memAfter,
        deltaBytes: memBefore && memAfter ? memAfter.usedJSHeapSize - memBefore.usedJSHeapSize : null,
      },
    };
  });
  result.gallery = gallery;
  log(`gallery: ${JSON.stringify({ canvasCount: gallery.canvasCount, cap: gallery.cap })}`);

  // ---- 7. screenshots ---------------------------------------------------------------------
  const screenshots = await runStep('screenshots', async () => {
    const br = await ensureBrowser();
    const ctx = await br.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    const saved = {};
    // gallery light
    await page.evaluate(() => localStorage.setItem('mode-watcher-mode', 'light')).catch(() => {});
    await nav(page, '/gallery');
    await page.waitForTimeout(5000);
    saved['gallery-light'] = await shot(page, 'gallery-light');
    // gallery dark: add class 'dark' to html, wait 3 s
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(3000);
    saved['gallery-dark'] = await shot(page, 'gallery-dark');
    await page.evaluate(() => document.documentElement.classList.remove('dark'));

    const lightRoutes = ['/invites', '/reports', '/confirmations', '/dashboard', '/alarms', '/onboarding'];
    for (const route of lightRoutes) {
      await page.evaluate(() => localStorage.setItem('mode-watcher-mode', 'light')).catch(() => {});
      await nav(page, route);
      const name = `${route.replace(/^\//, '').replace(/\//g, '-')}-light`;
      saved[name] = await shot(page, name);
      log(`screenshot ${name}`);
    }
    // confirmations dark
    await page.evaluate(() => localStorage.setItem('mode-watcher-mode', 'dark')).catch(() => {});
    await nav(page, '/confirmations');
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(3000);
    saved['confirmations-dark'] = await shot(page, 'confirmations-dark');
    log('screenshot confirmations-dark');

    // ---- /invites canvas analysis ------------------------------------------------------------
    const invites = await runStep('/invites canvas hashes', async () => {
      await page.evaluate(() => localStorage.setItem('mode-watcher-mode', 'light')).catch(() => {});
      await nav(page, '/invites');
      const canvases = await page.evaluate(readInviteCanvases);
      const avatars = canvases.filter((c) => c.isAvatar);
      const hashes = avatars.filter((c) => c.read && typeof c.read.hash === 'number').map((c) => c.read.hash);
      const unique = new Set(hashes).size;
      const failed = canvases.filter((c) => c.read && c.read.error);
      return {
        canvases: canvases.length,
        avatars: avatars.length,
        avatarHashes: hashes,
        distinctAvatarHashes: unique,
        readErrors: failed.map((c) => ({ index: c.index, isAvatar: c.isAvatar, error: c.read.error })),
      };
    });
    await ctx.close();
    return { saved, invites };
  });
  result.screenshots = isNotMeasured(screenshots) ? screenshots : screenshots.saved;
  result.invites = isNotMeasured(screenshots) ? notMeasured('screenshots step failed') : screenshots.invites;

  // ---- 6. 375 px viewport -----------------------------------------------------------------
  const small = await runStep('375 px viewport', async () => {
    const br = await ensureBrowser();
    const ctx = await br.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    const out = {};
    for (const route of ['/dashboard', '/gallery']) {
      await nav(page, route, 3000);
      out[route] = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        fits: document.documentElement.scrollWidth <= window.innerWidth,
      }));
    }
    await ctx.close();
    return out;
  });
  result.viewport375 = small;

  await browserState.browser?.close().catch(() => {});
  log('done');
  console.log('RESULT_BEGIN');
  console.log(JSON.stringify(result, null, 2));
  console.log('RESULT_END');
}

main().catch((e) => {
  console.error('[measure] FATAL', e);
  process.exitCode = 1;
});