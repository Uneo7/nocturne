# Verification

What is tested where, what was verified in a browser, and the measured
performance numbers. The raw figures come from the infra README, the package
README and `docs/plans/2026-09-17-watercolour-plan.md`; see those for the
surrounding detail.

## Unit and integration tests

### `nocturne-watercolour-core` (std only; no GPU needed)

| Area | What is asserted |
|---|---|
| Validation | `Scene::validate()` returns all errors, typed; per-palette/per-artwork validation |
| Seeding | `Seed`/`SubSeed` purposes, splitmix64 stream, lattice hash |
| Paper | four octaves + pooling + fibre, normalised coordinates, aspect-aware generation |
| Palettes | role indexing, `for_dark_surface()`, `MAX_PIGMENTS` |
| Stamps | paper-driven edge break-up, seeded radius jitter, mask rasterisation |
| Kubelka-Munk | zero thickness is clear, unit thickness recovers `Rw`, alpha conversion exact over white and bounded over black, two glazes darker than one |
| Easing | `ease(p) = 1 - (1-p)^2` mapping |
| Boundary | `tests/boundary.rs`: `domain` never reaches `application`; no `wgpu|serde|web_sys|js_sys` in `src/`; `[dependencies]` empty |
| Determinism | `tests/simulation.rs`: same seed is bit-identical, different seed differs |
| Stability sweep | 500 ticks at parameter extremes stay finite and bounded |
| Edge darkening | wet-on-dry disc rims heavier than centre (asserted `> 1.15x`) |
| Wet-on-wet spread | pre-wetted area spreads 90 % pigment radius `> 1.3x` further |
| Playback | `tests/playback.rs`: seek-vs-replay bit-equality, finish-immediately dryness, front-loaded elapsed-time advance, checkpoint bound |

### `nocturne-watercolour-infra` (GPU needed; tests print and return early without an adapter)

| Area | What is asserted |
|---|---|
| Document round trip | every catalogue scene round-trips through `scene_to_json`/`parse_scene_json`; newer/missing versions rejected before the body is parsed; `background` defaults to `"transparent"` when absent |
| GPU lockstep | `tests/gpu.rs`: CPU<->GPU mean absolute difference below **0.01** on both the finished image and the deposited-pigment field (128^2 sim); seeded replay bit-identical on the same device; 128 vs 1024 renders from one state agree in mean alpha; checkpoint seek equals straight replay (bit-identical readback); the checkpoint bound |
| Catalogue | `tests/catalogue.rs`: every id x palette x level x intensity validates; Small is simpler than Large; determinism; a CPU smoke render per id |
| Export | `PngExporter` unpremultiply, sRGB round-trip, valid PNG header |
| Scene tools (wasm crate) | every id builds on both surfaces with the same palette; unknown artwork/palette are typed; palette JSON documents accepted; surface/detail parsing; intensity monotone and in-bounds; strip stitching caps; manifest shape |

### Web (`@nocturne/watercolour`)

| Area | What is asserted |
|---|---|
| Scheduler | `scheduler.test.ts`: one rAF loop, visibility handling, frame clamping |
| Mode resolution | `mode.test.ts`: `resolveMode` matrix (auto/reduced/live/baked/static) and `fallbackOrder` |
| Baked manifest | `baked.test.ts`: `parseBakedManifest` caps (16 frames, 256 px), `stripFramePosition` mapping, load helpers |
| Assets | `assets.test.ts`: `defaultPaletteFor` stays in sync with `scripts/bake-manifest.json`; bundled lookup and fallback |
| Scene documents | `scenes.test.ts`: version-first rejection, `paletteKey` |
| Components | `components.test.ts`: `detailForEdge` thresholds, `seedFromName` determinism/FNV-1a, `artworkOptionsFrom` defaults, `hostSurface` |

### Showcase (`@nocturne/watercolour-showcase`)

Vitest unit tests for the synthetic data (`units`, `history`) and the
`ShowcaseSettings` store (defaults, option forwarding, reset). `check`,
`test` and `build` run clean for the scaffold.

## What was verified in a browser

- **Stage 2 (wasm adapter + TS API) was verified live in Chrome 153**: WebGPU
  worked end to end, wasm module 778 KB / 277 KB gzip, warm GPU init 59-90 ms,
  steady frame ~0.2 ms.
- The progress log records the engineered visual outcomes (wash over light
  reads as watercolour after the refinement pass; Luminous accepted for dark
  hosts; aspect-aware accents re-checked). All visual review was done by the
  orchestrator, not by the worker agents.

## Showcase browser pass

All twelve showcase routes were loaded in Chrome 153 at 1280 px with a clean
console apart from Chrome's `powerPreference` notice; row selection, filtering
to the empty state, tab switching, dark-mode toggling and exports were
exercised. Screenshots live in `.playwright-mcp/stage3/` (gitignored).

The visual review of those captures (the luminous review's Folder B) found:

- **Stair-stepped edges are gone** on every piece: the cubic B-spline fix
  confirmed in the browser (`index-after-resolution-2.png` has a smooth
  contour). The edge fix is the one confirmed improvement.
- **Light surfaces integrate well.** Reports, onboarding, invites-accept,
  confirmations and history-empty are the strongest - artwork reads as painted
  watercolour, is well placed and clear of text.
- **Dark mode is the weak case.** The index wash band reads murky/grey on the
  dark surface - the same grey-dirt defect as the luminous tuning review - and
  is the only piece that looks like a blob rather than translucent watercolour.
- Several small accents (dashboard title band, settings swatches, integration
  bands) are so small they barely register; not wrong, just low-impact.

Perf: the existing single-instance numbers below stand; the multi-instance
measurement (several artworks sharing one engine host) is pending.

## Measured performance

### Native GPU (NVIDIA GeForce RTX 5060 Laptop GPU, wgpu 30.0.1 via Vulkan, Windows 11, release)

From `examples/render_native.rs`, seed 42, 256^2 sim, 4 pigments:

| Measurement | wash (320 ticks) | crescent_moon (360 ticks) | glaze_pair (400 ticks) |
|---|---|---|---|
| Device + pipeline init | 2.2-6.5 s (first run of the process; shader compilation) | - | - |
| GPU straight run, per tick (incl. stroke uploads and checkpoints) | 0.58 ms | 0.76 ms | 0.49-0.53 ms |
| GPU render 512^2 incl. readback | 68-91 ms | 80-84 ms | 78-83 ms |
| GPU 8 reveal frames 256^2 (seek + replay + render) | 163 ms | 244 ms | 243 ms |
| CPU reference, per tick | 28.6 ms | 21.5 ms | 20.4 ms |
| CPU render 512^2 | 166 ms | 94 ms | 120 ms |
| **CPU<->GPU finished frame, mean abs diff** (linear premultiplied RGBA, Subtractive) | 0.0010 (max 0.137) | 0.0003-0.0005 (max 0.067-0.093) | 0.0-0.00005 (max 0.005-0.103) |

Whole-catalogue render (15 ids, the three detail levels that existed when it was
measured, both grounds) took 8.7 s.
Small catalogue renders cost 20-50 ms on the GPU, Large 60-200 ms.

### Browser (Chrome 153, Windows 11, RTX 5060 Laptop GPU; 512^2 canvas, 256^2 sim grid, showcase defaults)

| Measurement | Value |
|---|---|
| wasm module | 778 KB, 277 KB gzip |
| GPU init (adapter + device + pipeline compile, once per page) | 59-90 ms warm; ~2.1 s cold (`engine.stats().initMs`) |
| First painted frame after a cold `createArtworkPlayer` | 1.1-1.6 s warm (from `performance.mark` around module load, engine init, first presented frame; the showcase exposes `watercolour:first-paint`) |
| Steady-state scheduler cost | ~0.2 ms per frame (CPU step + render submission; `getScheduler().stats()` histogram) |
| Checkpoints | ~44 MB per live instance in the browser (10 checkpoints at 256^2 x 4 pigments) |
| Baked assets | 5.98 MB on disk (30 sets; strips ~120 KB, 512 px finals ~78 KB, 128 px finals ~7 KB) |

Methodology: `performance.mark`/`performance.now` around module load,
`WatercolourEngine.create`, first paint and each scheduler tick; single-run
spot checks on the machine above, not a benchmark harness.

## Limitations

- **Single alpha per pixel** (`ALPHA_SOFTNESS = 0.6`): a chromatic glaze loses a
  little saturation over white and glows brighter than physical over dark; a
  dense body pigment still reads as an opaque slab over dark (that is what the
  `for_dark_surface()` palettes are for).
- **CPU/GPU not bit-exact**: a few boundary cells dry one tick apart under
  fused-multiply-add rounding. Mean difference stays three orders of magnitude
  inside the 0.01 tolerance; see the measured table.
- **Luminous bodies are flatter/pastel on dark**; a translucent variant needs a
  smooth (Gaussian/soft-max) presence kernel. Preview hook exists
  (`luminous_variants` in `render_native`), not shipped.
- **Luminous dark-surface bodies read flat or murky** (the vision review's
  verdict): the shipped tuning is kept because the translucent tunings
  reintroduce grey dirt; the fix belongs in the alpha and grain curves, not the
  reconstruction kernel.
- **The 600 ms reveal at a 512 grid can exceed the 16 ms frame budget** on the
  largest heroes: at `extraLarge` complexity (tick scale 1.25) the reveal needs
  ~18 ticks/frame at 60 fps, and at 512 each tick costs ~0.8-1.4 ms on the GPU
  (measured, per-tick numbers in the resolution report), so a large hero is
  ~14-25 ms/frame. The scheduler's catch-up keeps it correct, but not a smooth
  60 fps at the biggest backing sizes.
- **Baked assets stay at their baked detail**; the resolution override applies
  to live mode only.
- **The host app's `svelte-check` has 46 pre-existing errors** unrelated to this
  library (stale generated NSwag client, bot api-client, two test/route files);
  the watercolour integration adds none.
- **Worker agents could not view images**, so visual verdicts came from the
  coordinator and the vision review, not from the build agents.
- **Checkpoint buffers live on the GPU only**; no host-side spill.
- **`GpuEngine::apply` submits one command buffer per operation and `render`
  blocks on readback** - fine for authoring and export; an interactive host
  would want to batch.
- **Device init is slow** (4-6 s native, ~2.1 s cold in the browser) because all
  shaders compile at engine creation; a pipeline cache is a later optimisation.
- **Baked strip cross-fade is not a true linear blend**; at 10-12 frames the
  difference is not visible.
- **`quality` is accepted but inert**; `offscreenCanvas` is probed but not used.
- **No texture-based rendering path**; output is buffer-based (no 256-byte row
  alignment concerns), which is fine for these sizes.
- **Performance numbers are single-run spot checks**, not a harness.