#!/usr/bin/env node
// Browser check of the gallery Large section, playground options, easing and tail.
// Run against a dev server on :5181. Every wait is bounded (<= 15 s) and wrapped
// in try/catch; a failed step is recorded as "not measured: <reason>" and the
// script moves on. A global watchdog exits after 6 min. Screenshots for a vision
// reviewer land in .playwright-mcp/large/.

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '..', '..', 'app', 'package.json'));
const { chromium } = require('@playwright/test');

const WATCHDOG_MS = 6 * 60 * 1000;
setTimeout(() => {
  console.error('[check-large] watchdog fired; exiting');
  process.exit(2);
}, WATCHDOG_MS).unref();

const REPO = join(__dirname, '..', '..', '..', '..', '..');
const BASE = 'http://localhost:5181';
const OUT_DIR = join(REPO, '.playwright-mcp', 'large');
const VIEWPORT = { width: 1440, height: 1000 };
const log = (msg) => console.log(`[check-large] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const consoleEvents = [];
function attachConsole(page) {
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') consoleEvents.push({ type: t, text: m.text() });
  });
  page.on('pageerror', (e) => consoleEvents.push({ type: 'pageerror', text: String(e.message || e) }));
}

const screenshots = [];
async function shot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, type: 'png' });
  screenshots.push(path);
  log(`screenshot ${name}`);
  return path;
}

async function nav(page, path, settleMs = 4000) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(settleMs);
}

const settle = (page, ms) => page.waitForTimeout(ms).catch(() => {});

async function launchBrowser() {
  try {
    const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu'] });
    return { browser: b, channel: 'chrome', fallback: false };
  } catch (e) {
    log(`channel 'chrome' launch failed (${e.message}); falling back to bundled chromium`);
    const b = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
    return { browser: b, channel: 'bundled-chromium', fallback: true };
  }
}

// bits-ui Select: close anything open, open the trigger (a combobox by
// aria-label), then click the visible option whose data-value matches. Values
// are the programmatic ids (e.g. 'cubicOut'), not the display text.
async function selectOption(page, ariaLabel, value) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(150);
  const trigger = page.locator(`[aria-label="${ariaLabel}"]`).first();
  await trigger.click({ timeout: 8000 });
  await sleep(400);
  const esc = value.replace(/"/g, '\\"');
  const target = page.locator(`[role="option"][data-value="${esc}"]`).filter({ visible: true }).first();
  await target.waitFor({ state: 'visible', timeout: 8000 });
  await target.click({ timeout: 8000 });
  await sleep(400);
}

// --- page helper functions (Playwright evaluates these as function sources) ---
function readLargeTiles() {
  const out = { error: null, tiles: [] };
  const h = Array.from(document.querySelectorAll('h2')).find((e) => e.textContent.trim() === 'Large');
  if (!h) return { ...out, error: 'Large heading not found' };
  const section = h.closest('section');
  if (!section) return { ...out, error: 'Large section not found' };
  const live = window.__watercolourLive || [];
  section.querySelectorAll('.rounded-lg.border').forEach((surface) => {
    const bg = surface.classList.contains('dark') ? 'dark' : 'light';
    surface.querySelectorAll('.flex.flex-col.items-center.gap-1').forEach((tile) => {
      const caption = tile.querySelector('span')?.textContent?.trim() ?? null;
      const canvas = tile.querySelector('canvas');
      const sized = tile.querySelector('.shrink-0');
      const rect = sized ? sized.getBoundingClientRect() : null;
      let sim = null;
      let ticks = null;
      if (canvas) {
        for (let i = live.length - 1; i >= 0; i--) {
          if (live[i].canvas === canvas) {
            try {
              sim = live[i].instance.simResolution();
            } catch {
              continue;
            }
            try {
              ticks = live[i].instance.totalTicks();
            } catch {}
            break;
          }
        }
      }
      out.tiles.push({
        surface: bg,
        caption,
        cssSize: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : (sized?.style.width ?? null),
        backing: canvas ? `${canvas.width}x${canvas.height}` : null,
        liveSimGrid: sim,
        liveTicks: ticks,
      });
    });
  });
  out.liveInstances = live.length;
  return out;
}

function readGalleryEngineStats() {
  const dl = Array.from(document.querySelectorAll('dl')).find((d) => d.textContent.includes('live instances'));
  if (!dl) return null;
  const els = Array.from(dl.children).map((e) => e.textContent.trim());
  const m = {};
  for (let i = 0; i + 1 < els.length; i += 2) m[els[i]] = els[i + 1];
  return m;
}

function readPlaygroundReadout() {
  const pair = (dl) => {
    const out = {};
    const kids = Array.from(dl.children);
    for (const kid of kids) {
      const dt = kid.querySelector(':scope > dt');
      const dd = kid.querySelector(':scope > dd');
      if (dt && dd) {
        out[dt.textContent.trim()] = dd.textContent.trim();
        continue;
      }
      if (kid.tagName === 'DT') {
        const idx = kids.indexOf(kid);
        const next = kids[idx + 1];
        if (next && next.tagName === 'DD') out[kid.textContent.trim()] = next.textContent.trim();
      }
    }
    return out;
  };
  const c = document.querySelector('[data-playground-canvas]');
  const out = {
    progress: c ? parseFloat(c.dataset.progress || '0') : null,
    playing: c ? c.dataset.playing : null,
    mode: c ? c.dataset.mode : null,
  };
  const readout = document.querySelector('dl.grid.w-full');
  if (readout) Object.assign(out, pair(readout));
  const stats = document.querySelector('[data-playground-stats]');
  if (stats) {
    const paired = pair(stats);
    for (const k of Object.keys(paired)) out['stat.' + k] = paired[k];
  }
  return out;
}

// Engine-side progress. `pageProgress` is the elapsed fraction (linear when a
// caller easing is active); `engineProgress` is the eased value actually fed to
// the simulation, read off the live wasm instance.
function readPlaygroundEase() {
  const c = document.querySelector('[data-playground-canvas]');
  const canvas = c?.querySelector('canvas');
  const arr = window.__watercolourLive || [];
  let engineProgress = null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].canvas === canvas) {
      try {
        engineProgress = arr[i].instance.progress();
      } catch {
        continue;
      }
      break;
    }
  }
  let visiblePct = null;
  const scrub = Array.from(document.querySelectorAll('[aria-label="Scrub"]'))[0];
  const cell = scrub?.closest('.grid.gap-2');
  if (cell) visiblePct = cell.querySelector('.w-12')?.textContent?.trim() ?? null;
  return {
    pageProgress: c ? parseFloat(c.dataset.progress || '0') : null,
    engineProgress,
    visiblePct,
  };
}

function readTailValue() {
  const sl = Array.from(document.querySelectorAll('[aria-label="Tail"]'))[0];
  if (!sl) return null;
  const cell = sl.closest('.grid.gap-2');
  const span = cell?.querySelector('.flex.justify-between span');
  return span ? span.textContent.trim() : null;
}

// --- helpers -----------------------------------------------------------------
async function waitForPlaygroundLive(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => document.querySelector('[data-playground-canvas]')?.dataset.mode === 'live',
    { timeout: timeoutMs, polling: 250 },
  );
}

// The slider's keyboard handler lives on the thumb ([role="slider"] inside the
// root), so focus the thumb and use End / ArrowLeft. Each key commits.
async function setSliderValue(page, ariaLabel, maxValue, step, target) {
  const root = page.locator(`[aria-label="${ariaLabel}"]`).first();
  const thumb = root.locator('[role="slider"]').first();
  await thumb.focus().catch(() => {});
  await thumb.press('End').catch(() => {});
  const steps = Math.round((maxValue - target) / step);
  for (let i = 0; i < steps; i++) await thumb.press('ArrowLeft').catch(() => {});
  await sleep(400);
  return { value: await page.evaluate(readTailValue).catch(() => null) };
}

async function sampleEase(page, baseName) {
  await page.getByRole('button', { name: 'Reset', exact: true }).click().catch(() => {});
  await sleep(300);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const t0 = Date.now();
  const samples = [];
  for (const target of [0.5, 1.5, 3, 4.5]) {
    const wait = target * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    const s = await page.evaluate(readPlaygroundEase).catch((e) => ({ error: String(e.message || e) }));
    samples.push({ target, ...s });
    await shot(page, `${baseName}-${target}`);
  }
  return samples;
}

async function playToFinish(page, timeoutMs = 15000) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  try {
    await page.waitForFunction(
      () => {
        const c = document.querySelector('[data-playground-canvas]');
        if (!c) return false;
        if (c.dataset.playing === 'false') return true;
        return parseFloat(c.dataset.progress || '0') >= 0.999;
      },
      { timeout: timeoutMs, polling: 250 },
    );
    return 'finished';
  } catch {
    await page.getByRole('button', { name: 'Finish', exact: true }).click().catch(() => {});
    return 'finished-by-finish-button';
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const result = { viewport: VIEWPORT, screenshots: [], browser: null, measuredAt: new Date().toISOString() };

  const launch = await launchBrowser().catch((e) => ({ launchError: String(e.message || e) }));
  if (launch.launchError) {
    console.log('RESULT_BEGIN');
    console.log(JSON.stringify(result, null, 2));
    console.log('RESULT_END');
    return;
  }
  const browser = launch.browser;
  result.browser = { channel: launch.channel, fallback: launch.fallback, version: await browser.version() };
  log(`launched ${launch.channel} ${result.browser.version}`);

  // ---- 1. /gallery Large section ----------------------------------------------------------
  log('>> gallery Large');
  const galleryCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.25 });
  const galleryPage = await galleryCtx.newPage();
  attachConsole(galleryPage);
  try {
    await nav(galleryPage, '/gallery');
    await galleryPage
      .evaluate(() => {
        const h = Array.from(document.querySelectorAll('h2')).find((e) => e.textContent.trim() === 'Large');
        h?.scrollIntoView({ block: 'start' });
      })
      .catch(() => {});
    await settle(galleryPage, 6000);

    result.galleryLightTiles = await galleryPage.evaluate(readLargeTiles).catch((e) => ({ error: String(e.message || e) }));
    log('gallery light tiles read');
    result.galleryLight = await shot(galleryPage, 'gallery-large-light');

    await galleryPage.evaluate(() => document.documentElement.classList.add('dark')).catch(() => {});
    await settle(galleryPage, 5000);
    result.galleryDarkTiles = await galleryPage.evaluate(readLargeTiles).catch((e) => ({ error: String(e.message || e) }));
    result.galleryDark = await shot(galleryPage, 'gallery-large-dark');
    result.galleryEngineStats = await galleryPage.evaluate(readGalleryEngineStats).catch((e) => ({ error: String(e.message || e) }));
    log('gallery dark + engine stats done');

    await galleryPage.evaluate(() => document.documentElement.classList.remove('dark')).catch(() => {});
    for (const id of ['moonlit-shoreline', 'alarm-bell']) {
      await selectOption(galleryPage, 'Large artwork', id).catch((e) => log(`select ${id} FAILED (${e.message})`));
      await settle(galleryPage, 5000);
      result['galleryLarge_' + id] = await shot(galleryPage, `gallery-large-${id}`);
      result['galleryLarge_' + id + '_tiles'] = await galleryPage.evaluate(readLargeTiles).catch((e) => ({ error: String(e.message || e) }));
      log(`gallery artwork ${id} done`);
    }

    // Diagnostic: the palette swatches above consume the 4 live slots, so the
    // Large tiles fall back to baked and their captions never populate. Setting
    // the page Mode to 'baked' frees the cap; switching the artwork then forces
    // the Large tiles to recreate, so they acquire a live slot and the caption
    // (detail · sim grid) populates -- confirming the cause.
    await selectOption(galleryPage, 'Mode', 'baked').catch((e) => log('mode baked FAILED (' + e.message + ')'));
    await settle(galleryPage, 3000);
    await selectOption(galleryPage, 'Large artwork', 'linked-rings').catch((e) => log('artwork linked-rings FAILED (' + e.message + ')'));
    await settle(galleryPage, 6000);
    result.galleryBakedModeTiles = await galleryPage.evaluate(readLargeTiles).catch((e) => ({ error: String(e.message || e) }));
    result.galleryBakedModeStats = await galleryPage.evaluate(readGalleryEngineStats).catch((e) => ({ error: String(e.message || e) }));
    result.galleryBakedMode = await shot(galleryPage, 'gallery-large-captions');
    log('gallery baked-mode diagnostic done');
  } catch (e) {
    log('gallery step FAILED: ' + (e.message || e));
    result.galleryError = String(e.message || e);
  }
  await galleryCtx.close().catch(() => {});
  log('<< gallery Large');

  // ---- 2. /playground easing + tail -------------------------------------------------------
  log('>> playground options');
  const pgCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.25, acceptDownloads: true });
  const pgPage = await pgCtx.newPage();
  attachConsole(pgPage);
  try {
    await nav(pgPage, '/playground');
    try {
      await waitForPlaygroundLive(pgPage);
    } catch (e) {
      log('playground did not reach live mode: ' + (e.message || e));
    }
    result.playgroundDefault = await pgPage.evaluate(readPlaygroundReadout).catch((e) => ({ error: String(e.message || e) }));
    result.playgroundDefaultTail = await pgPage.evaluate(readTailValue).catch(() => null);
    log('playground default readout: ' + JSON.stringify(result.playgroundDefault));

    // Configure the easing scene: output 1024, sim 512, artwork crescent-moon,
    // easing cubicOut, tail 0.4, duration 4000.
    await pgPage.locator('#pg-duration').fill('4000');
    await pgPage.locator('#pg-duration').dispatchEvent('change');
    await selectOption(pgPage, 'Output size', '1024').catch((e) => log('output 1024 FAILED (' + e.message + ')'));
    await selectOption(pgPage, 'Simulation grid', '512').catch((e) => log('sim 512 FAILED (' + e.message + ')'));
    await selectOption(pgPage, 'Artwork', 'crescent-moon').catch((e) => log('artwork crescent-moon FAILED (' + e.message + ')'));
    await selectOption(pgPage, 'Easing', 'cubicOut').catch((e) => log('easing cubicOut FAILED (' + e.message + ')'));
    result.tailSet = await setSliderValue(pgPage, 'Tail', 0.6, 0.05, 0.4);
    await settle(pgPage, 2000);
    try {
      await waitForPlaygroundLive(pgPage);
    } catch (e) {
      log('post-config did not reach live: ' + (e.message || e));
    }
    result.playgroundConfigured = await pgPage.evaluate(readPlaygroundReadout).catch((e) => ({ error: String(e.message || e) }));
    result.playgroundConfiguredTail = await pgPage.evaluate(readTailValue).catch(() => null);
    log('configured: ' + JSON.stringify(result.playgroundConfigured));

    result.cubicOutSamples = await sampleEase(pgPage, 'playground-ease').catch((e) => ({ error: String(e.message || e) }));
    log('cubicOut samples done');

    // Switch to engine default and replay.
    await selectOption(pgPage, 'Easing', 'engine').catch((e) => log('easing engine default FAILED (' + e.message + ')'));
    await settle(pgPage, 2000);
    try {
      await waitForPlaygroundLive(pgPage);
    } catch (e) {
      log('engine-default did not reach live: ' + (e.message || e));
    }
    result.engineDefaultSamples = await sampleEase(pgPage, 'playground-ease-engine').catch((e) => ({ error: String(e.message || e) }));

    // Finished frames for resolution comparison (still output 1024 / sim 512).
    const fin512 = await playToFinish(pgPage).catch((e) => 'play-failed: ' + (e.message || e));
    result.playground1024_512 = { outcome: fin512, screenshot: await shot(pgPage, 'playground-1024-512') };
    log('1024/512 finished screenshot done');

    // Same output, sim 96.
    await selectOption(pgPage, 'Simulation grid', '96').catch((e) => log('sim 96 FAILED (' + e.message + ')'));
    await settle(pgPage, 2000);
    try {
      await waitForPlaygroundLive(pgPage);
    } catch (e) {
      log('sim96 did not reach live: ' + (e.message || e));
    }
    const fin96 = await playToFinish(pgPage).catch((e) => 'play-failed: ' + (e.message || e));
    result.playground1024_96 = { outcome: fin96, screenshot: await shot(pgPage, 'playground-1024-96') };
    log('1024/96 finished screenshot done');

    // PNG export via the button; record the download name if it resolves.
    try {
      const downloadPromise = pgPage.waitForEvent('download', { timeout: 15000 });
      await pgPage.getByRole('button', { name: 'PNG', exact: true }).click();
      const download = await downloadPromise;
      result.pngExport = { ok: true, suggestedFilename: download.suggestedFilename() };
      log('PNG export ok: ' + download.suggestedFilename());
    } catch (e) {
      result.pngExport = { ok: false, error: String(e.message || e) };
      log('PNG export skipped/failed: ' + (e.message || e));
    }
  } catch (e) {
    log('playground step FAILED: ' + (e.message || e));
    result.playgroundError = String(e.message || e);
  }
  await pgCtx.close().catch(() => {});
  log('<< playground options');

  // ---- 3. console findings ----------------------------------------------------------------
  result.console = consoleEvents;
  result.screenshots = screenshots;

  await browser.close().catch(() => {});
  log('done');
  console.log('RESULT_BEGIN');
  console.log(JSON.stringify(result, null, 2));
  console.log('RESULT_END');
}

main().catch((e) => {
  console.error('[check-large] FATAL', e);
  process.exitCode = 1;
});