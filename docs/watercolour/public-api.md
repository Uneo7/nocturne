# Public API

Everything is exported from `@nocturne/watercolour` (`src/Web/packages/watercolour/src/index.ts`).
The public surface is plain TypeScript; the Svelte components are thin wrappers
over it.

## `createArtworkPlayer`

The core entry point (`src/api/playback.ts`). Builds a player that draws one
artwork to a canvas, choosing the best backend it can.

```ts
const player = createArtworkPlayer(
  canvas,
  { id: 'crescent-moon', palette: 'moonlight', seed: 42, intensity: 0.7, surface: 'dark' },
  { durationMs: 600, mode: 'auto', motion: 'auto', autoplay: 'once', width: 256, height: 256, dpr: window.devicePixelRatio },
);
```

The second argument is a `SceneSource`: an `ArtworkRef` (`{ id, palette?, seed?,
intensity?, surface?, detail? }`) that the engine expands via `catalogueScene`,
or `{ sceneJson }` / a JSON string holding a versioned scene document (only the
`version` field is checked here; the engine validates the rest).

`surface: 'light' | 'dark'` is the page background the artwork sits on. `dark`
keeps the chosen palette and switches the scene to luminous compositing
(`Background::TransparentOnDark`); it does **not** select the `<palette>_dark`
palettes, which are subtractive variants for hosts that composite over a dark
ground themselves.

### Player methods and state

```ts
player.play(); player.pause(); player.reset(); player.seek(0.5); player.finishImmediately();
player.resize(width, height, dpr);
const png = await player.exportPng(512, 512);            // live only
const { strip, manifest } = await player.exportStrip(12, 256);  // live only
player.dispose();
```

`state` is a snapshot (`mode`, `motion`, `playing`, `finished`, `progress`,
`error`, `fallbackReason`); it is never pushed per frame. Events:

| Event | Payload | Fires |
|---|---|---|
| `ready` | - | a backend is drawing (or the player settled on `none`) |
| `finished` | - | the reveal completed |
| `fallback` | `{ from, error }` | a backend failed; a lower one took over |
| `error` | `WatercolourError` (typed `code`) | nothing could draw |
| `statechange` | - | any state change |

`player.ready` resolves once a backend is drawing. `player.canvas` is the
current element, which differs from the one passed in only after a live-to-baked
fallback (a WebGPU canvas can never give a 2D context, so the element is
replaced in place).

## `detectCapabilities`

`src/api/capabilities.ts`. Probed once per page (cacheable):

```ts
const caps = await detectCapabilities(); // { webgpu, adapter, reducedMotion, offscreenCanvas, reason? }
```

Chrome exposes `navigator.gpu` on machines with no usable adapter, so
`webgpu` and `adapter` are reported separately, with `reason` explaining why
live mode is unavailable when it is.

## Engine host

`src/api/engine-host.ts`. **One WebGPU device per page**, with compiled
pipelines shared by every instance (`GpuEngine::fork`). `release` never tears
the engine down: the compiled pipelines cost more to rebuild than to keep.

```ts
import { getEngineHost, configureEngineHost } from '@nocturne/watercolour';
const host = getEngineHost();
host.stats();                 // { liveInstances, maxLiveInstances, checkpointBytes, lastStepMs, lastRenderMs, initMs, adapterName }
host.maxLiveInstances = 4;    // or configureEngineHost({ maxLiveInstances })
host.onLost((message) => {}); // device lost; players fall back
```

`configureEngineHost` replaces the page singleton and must be called before the
first artwork mounts. The wasm bindings are loaded through a Vite glob because
`src/wasm/` is gitignored; when they are not built the host reports
`EngineUnavailable` and every player answers with baked/static.

## Scheduler

`src/api/scheduler.ts`. **One `requestAnimationFrame` loop** for every live or
baked instance on the page. Hidden time is not counted as elapsed, so a reveal
resumes where it paused instead of jumping to the end. Off-screen artworks are
neither stepped nor rendered (`IntersectionObserver`); a stalled frame is
clamped to `MAX_FRAME_SECONDS = 0.25`.

```ts
import { getScheduler } from '@nocturne/watercolour';
getScheduler().stats(); // { frames, averageMs, p95Ms, lastMs } frame-time histogram
```

## Assets

`src/api/assets.ts`. Bundled assets live under `assets/<artwork>/<paletteKey>/<file>`
and are resolved by Vite at build time; `assetBaseUrl` serves them from a
different origin; explicit `assets` URLs override both. Only the default palette
per artwork is bundled; a missing palette falls back to it (see
[scene-format.md](scene-format.md)).

```ts
import { assetUrl, defaultPaletteFor, hasBundledAsset } from '@nocturne/watercolour';
```

## The Svelte components

All components are Svelte 5 runes, decorative (`aria-hidden`, `role="presentation"`),
size their canvas to the container via `ResizeObserver` (DPR capped at 2), create
the player in an effect and dispose it on destroy or when any prop changes.
Every component accepts the `ArtworkOptions` props (`palette`, `seed`,
`intensity`, `durationMs`, `motion`, `quality`, `mode`, `autoplay`), an
optional `surface`, a `fit` prop, an `onready` callback, and `class`.

Each artwork has a natural aspect (`ARTWORK_ASPECT` / `artworkAspect(id)`; the
icons and `wash` are square, the scenes and accents keep their authored ratio).
With `fit="contain"` (default) the canvas is the largest box of that aspect
inside the container, centred, and the surrounding area stays transparent;
`fit="fill"` stretches to the container as the components did before aspect
awareness. `fit` may also be a function of the container size -
`ConfirmationBackground` uses that to fill only near its 3:1 aspect. `onready`
fires once a backend is drawing; the returned cleanup runs with the player's
disposal.

| Component | Artwork id it renders | Extra props | Notes |
|---|---|---|---|
| `Artwork` | the `artwork` prop | `artwork: ArtworkId`, `assetBaseUrl` | Renders `detailForEdge` from its rendered box's backing long edge (below 64 px small, below 192 px medium, below 320 px large, 320 px and above extraLarge; sim grids 96/160/256/384, live override up to 512); `surface` defaults from a `.dark` class on `<html>`, else `prefers-color-scheme`. |
| `PaintedUnderline` | `tab-underline` | `active: boolean` | `opacity-0` unless `active`; plays once on activation. A 2px hairline in a tab row. |
| `SelectionEdge` | `selection-edge` | `active: boolean`, `side: 'left' \| 'top'` | A vertical or horizontal edge strip; plays once on activation. |
| `AvatarWash` | `avatar-wash` | `name: string`, `size = 32` | Seed derives from `name` via `seedFromName` unless given. Defaults to `auto` mode with `releaseAfterFinish`, so each head paints one frame live and releases the engine (the canvas keeps the pixels) - a member list holds dozens of avatars and a live slot per head would exhaust the cap. |
| `ConfirmationBackground` | `confirmation-background` | - | Fills its container only when it is within 20% of the artwork's 3:1 aspect, else `contain` anchored bottom-left. On dark surfaces the canvas runs at CSS opacity 0.45 because Luminous alpha saturates. |
| `HeaderMotif` | `header-motif` | - | Fixed `aspect-ratio: 5/1; width: 10rem` (160x32); plays once. |

```svelte
<Artwork artwork="crescent-moon" palette="moonlight" seed={42} surface="dark" class="size-32" />
<HeaderMotif palette={settings.accentPalette} seed={settings.artworkSeed} class="hidden sm:flex" />
```

## Mode / motion / fallback resolution

Resolution lives in `src/api/mode.ts`; the player composes it with capability
and asset checks in `playback.ts`.

| Mode | Draws with | Needs | When chosen (`mode: 'auto'`) |
|---|---|---|---|
| `live` | WebGPU via the wasm engine, presented straight to the canvas | `navigator.gpu`, an adapter, a free slot under `maxLiveInstances` (default 4) | Preferred when available and motion is not reduced |
| `baked` | 2D canvas, cross-fading two frames of a PNG strip | the strip + manifest asset (bundled or `assetBaseUrl`) | No usable GPU or the instance cap is reached |
| `static` | 2D canvas, the finished PNG drawn once | the final asset | Reduced motion (first choice), or nothing else works |
| `none` | nothing | - | No GPU and no asset; `error` fires with a typed code |

- Explicit modes fall down the same chain when unavailable (`live` -> `baked`
  -> `static` -> `none`; `static` with no still uses the strip's last frame).
- A backend that dies at runtime (device lost, render error) emits `fallback`
  and the player moves down the chain **without retrying live**.
- Reduced motion (`motion: 'reduced'`, or `'auto'` with
  `prefers-reduced-motion`) shows the finished frame at once: static if an
  asset exists, else the live engine finished immediately, else the strip's
  last frame.
- `releaseAfterFinish` (for live) finishes on first appearance, presents one
  frame and then disposes the engine instance while the canvas keeps the
  pixels, so the artwork holds no live slot or checkpoints. Under reduced
  motion it also lets `auto` pick live over the identical baked still, which is
  what gives `AvatarWash` its per-name wash.
- `autoplay: 'once'` starts on first appearance (the shared `IntersectionObserver`)
  and never loops; `'never'` waits for `play()`.
- `quality: 'auto' | 'low' | 'medium' | 'high'` is accepted and forwarded but
  does not currently change rendering.

## Resource limits

- One WebGPU device per page; compiled pipelines shared by every instance.
- `maxLiveInstances` (default 4): the fifth `auto` artwork resolves to baked.
- Per-instance checkpoint budget in the browser: 48 MB (10 checkpoints at the
  catalogue's 256^2 x 4 pigments), against 256 MB natively;
  `engine.stats().checkpointBytes` reports the live total.
- One rAF loop for the page; hidden documents stop it, off-screen artworks are
  neither stepped nor rendered, a stalled frame is clamped to 250 ms.
- Component DPR is capped at 2.
- Exports are async (`map_async` cannot block in a browser) and `exportStrip`
  leaves the playback finished.
- Timings in `stats()` are CPU submission times from `performance.now()`, not
  GPU completion.

## Integration example: the reports page header motif

The host app (`src/Web/packages/app`) integrates the library on the reports
page (`src/routes/(authenticated)/reports/+page.svelte`): a `header-motif`
renders under the page title, `motion="auto"` and `autoplay="once"` so it
honours `prefers-reduced-motion` and never loops:

```svelte
<Artwork
  artwork="header-motif"
  palette="moonlight"
  motion="auto"
  autoplay="once"
  class="mx-auto mt-4 hidden h-8 w-40 md:block"
/>
```

The showcase's integration page (`watercolour-showcase/src/routes/integration/+page.svelte`)
documents the intended pattern for app-wide use: the motif lives in a shared
page-header component, `Artwork` is decorative (never behind text, never on
alerts or clinical values), motion defaults to the system preference, and the
palette and seed come from the user preferences store so the same person sees
the same wash everywhere.

## The raw wasm surface (briefly)

The wasm module (`src/wasm/`, gitignored, built by `build:wasm`) exposes:
`WatercolourEngine.create()` (one per page), `engine.createInstance(sceneJson,
durationMs)`, the instance's `attach/play/pause/reset/advanceByElapsed/
seekProgress/finishImmediately/render/exportPng/exportStrip/dispose`, plus the
helpers `catalogueScene`, `catalogueIds` and `bakedManifest`. Every error
crosses to JS as an `Error` whose message is `Code: detail`; the TS layer
normalises these into typed `WatercolourError`s. You almost never touch this
surface directly - the `EngineHost` wraps it.