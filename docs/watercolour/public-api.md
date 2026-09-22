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
  { durationMs: 3000, mode: 'auto', motion: 'auto', autoplay: 'once', width: 256, height: 256, dpr: window.devicePixelRatio },
);
```

The second argument is a `SceneSource`: an `ArtworkRef` (`{ id, palette?, seed?,
intensity?, surface?, detail? }`) that the engine expands via `catalogueScene`,
an `IconRef` (`{ icon, name, hints?, ... }`) whose element list `iconScene`
authors into a `lucide-<name>` scene (see Icon sources below), or
`{ sceneJson }` / a JSON string holding a versioned scene document (only the
`version` field is checked here; the engine validates the rest).

`surface: 'light' | 'dark'` is the page background the artwork sits on. `dark`
keeps the chosen palette and switches the scene to luminous compositing
(`Background::TransparentOnDark`); it does **not** select the `<palette>_dark`
palettes, which are subtractive variants for hosts that composite over a dark
ground themselves.

### `durationMs` and `tail`

`durationMs` (default `DEFAULT_DURATION_MS` = 3000) is the whole wall-clock
length of the reveal. `tail` (default `DEFAULT_TAIL` = 0.8) is the **share of
that wall clock spent setting into the page** after the brushwork finishes:
`tail = 0.8` at `durationMs = 3000` means 600 ms of brushwork then 2400 ms of
settling. In live mode it maps to the engine's `Reveal` curve as
`paintWallFraction = 1 - tail`, and in baked mode the strip is already baked at
wall-clock spacing, so the tail plays straight through the strip's settling
frames. `tail` used to mean a share of simulation ticks, and for baked reveals
a hold on the finished frame; both are gone.

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

## Icon sources

`Artwork` also renders a Lucide icon as a watercolour scene. The `icon` prop
takes an `IconArtworkSource` (`{ icon, name, hints? }`): `icon` is the element
list, `name` becomes the scene id (`lucide-<name>-<palette>-<seed>`), and
`hints` tunes the mapping per field. It takes precedence over `artwork`. The
host supplies the element list from the vanilla `lucide` package, which is a
**peerDependency** (`>=0.400.0`, ISC) - the library never imports it:

```svelte
<script lang="ts">
  import { Database } from 'lucide';
</script>
<Artwork icon={{ icon: Database, name: 'database' }} />
```

`lucide`'s `IconNode` type matches the library's `IconNode` structurally, so
the import needs no cast. The library ships a built-in tuning table,
`ICON_HINTS` (from `scripts/icon-hints.json`), applied per name before the
element list reaches `iconScene`; `mergeIconHints(name, callerHints)` layers a
caller's hints over it, caller wins per field.

Icon sources resolve assets like any artwork (baked `lucide-<name>` set when
one exists, default-palette fallback included). When neither WebGPU nor a baked
asset is available, an icon falls to the **plain Lucide SVG** (`iconSvg`) at the
`static` rung instead of the finished PNG - it always resolves, so an icon
never falls to `none`.

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
| `Artwork` | the `artwork` prop, or the `icon` prop (a Lucide element list, takes precedence) | `artwork: ArtworkId`, `icon?: IconArtworkSource`, `assetBaseUrl` | Renders `detailForEdge` from its rendered box's backing long edge (below 64 px small, below 192 px medium, below 320 px large, 320 px and above extraLarge; sim grids 96/160/256/384, live override up to 512); `surface` defaults from the host theme: a `.dark`/`.light` class on `<html>`, then `<html>`'s computed `color-scheme`, then `prefers-color-scheme`. |
| `PaintedUnderline` | `tab-underline` | `active: boolean` | `opacity-0` unless `active`; plays once on activation. A 2px hairline in a tab row. |
| `SelectionEdge` | `selection-edge` | `active: boolean`, `side: 'left' \| 'top'` | A vertical or horizontal edge strip; plays once on activation. |
| `AvatarWash` | `avatar-wash` | `name: string`, `size = 32` | Seed derives from `name` via `seedFromName` unless given. Defaults to `auto` mode with `releaseAfterFinish`, so each head paints one frame live and releases the engine (the canvas keeps the pixels) - a member list holds dozens of avatars and a live slot per head would exhaust the cap. |
| `ConfirmationBackground` | `confirmation-background` | - | Fills its container only when it is within 20% of the artwork's 3:1 aspect, else `contain` anchored bottom-left. On dark surfaces the canvas runs at CSS opacity 0.45 because Luminous alpha saturates. |
| `HeaderMotif` | `header-motif` | - | Fixed `aspect-ratio: 5/1; width: 10rem` (160x32); plays once. |
| `DropSurface` | whichever abstract marks it places (`DROP_MARKS`) | see [Paint drops](#paint-drops) | Wraps arbitrary content and paints marks in its empty space on hover, selection or focus. |
| `DropGroup` | - | `name?: string` | Hands each `DropSurface` inside it an index and a shared seed, and stops a run repeating itself. |

```svelte
<Artwork artwork="crescent-moon" palette="moonlight" seed={42} surface="dark" class="size-32" />
<HeaderMotif palette={settings.accentPalette} seed={settings.artworkSeed} class="hidden sm:flex" />
```

## Paint drops

`DropSurface` is the one component that places artwork rather than rendering a
fixed piece of it. A card, a row or a button shows content; on hover the
surface paints abstract marks in the space **around** that content, never over
it. It is a touch of magic, so it is rare: a surface earns a mark only when the
user points at it on purpose, its short edge is at least 64 px with 40 px of
genuinely empty space, and it is a moment rather than a dense working surface.
Charts, tables, forms and anything read for numbers get nothing.

### The stack

A surface paints its own background, so a mark with a negative z-index
disappears behind the background it is meant to bleed into. The component is
three layers and the host has to keep them apart:

- the host takes `class` - border, background, radius, and `overflow: hidden`;
- the marks sit in an `inset-0` layer above that background;
- the content takes `contentClass` and sits above the marks.

### Placement

Marks are placed by **ink**, never by the element box. `selection-edge` paints
only the left 27 % of its own file, so centring its element on a border leaves
the visible line inset by nearly half the element. `inkFrame` sizes and offsets
the artwork's frame inside an overflow-hidden wrapper, so the wrapper *is* the
ink box and a position means what it says. The extents live in `DROP_MARKS`.

An edge mark sits **on** the border with 62 % of itself on the surface, and its
aspect is never pushed more than 2.5x from the one it was painted at - a 1:23
hairline stretched to a readable 26 px stops being a mark and reads as a slab.
A spanning mark may only take an edge whose whole band is clear of text; if
neither qualifies it hands the spot to the next mark rather than running across
the copy.

`layout="wash"` replaces all of that with one mark over the whole control,
behind the label. It is for a surface that is all content - a button has no
empty space for a mark to find, and an edge mark there is either invisible or a
slab.

### Measuring the content

| Prop | What it does |
|---|---|
| `fonts?: DropFonts` | A `DropFont` (`font`, `lineHeight`, `align?`) per `data-drop-text` value. Text is then laid out **off the DOM** by Pretext, which returns real line boxes with no layout read. |
| `data-drop-text="<key>"` | On a text element, names the font it is set in. |
| `data-drop-obstacle` | On anything that is not text - an icon, an avatar, an image - measured as one box. |

A `DropFont`'s `font` string has to match the host's CSS **exactly**, down to
the weight and the stack; Pretext measures off that string, so a mismatch
returns line boxes for text that was never drawn. Text with no declared font
falls back to `Range.getClientRects`, which is correct and costs a layout read
per text node.

Line boxes are the point: a title that stops at 154 px in a 266 px column
blocks 154 px, so the space beside it stays usable.

### Runs

Wrap a grid or a list in `DropGroup`. Each `DropSurface` claims its index at
init and registers what it drew, and the next member is told to avoid it. The
mark that reads never repeats its neighbour's leading one; the smaller marks
prefer to avoid the rest of the neighbour's set but take a repeat rather than
leave the surface bare. Four marks over three spots cannot avoid all three.

Where only one mark can be placed at all - a 62 px list row - the run varies
how it is drawn instead: consecutive members mirror each other and take a
different angle and size.

### How a mark arrives

`reveal` picks the transition for a **baked** mark. A live mark runs the
engine's own reveal and is left alone.

| `reveal` | What it does |
|---|---|
| `none` | The mark is simply there. |
| `fade` | Opacity only: the generic UI pop, kept for comparison. |
| `mask` (default) | A radial mask spreads outward from the brush-down point across a static mark, so the paint's own dried edge is uncovered rather than magnified. |
| `flip` | The mask, plus the mark growing from that point. |

The spread is front-loaded and then decelerates hard - about 54 % of the area
is on the paper by 30 % of the duration. It is tuned against the engine's own
pacing, not chosen for feel: `revealArea` is held to the same `PACE_AT` /
`MAX_AREA_AT_PACE` / `MAX_SNAP_RATIO` bounds as
`reveal_preserves_the_artwork`. Opacity and saturation keep **rising** after
the spread has all but stopped, which is the opposite of a fade-in and is what
reads as pigment concentrating at a drying edge.

A mark arrives in `revealMs` (420 ms by default) with the pigment settling
over 1.45x that. This is a hover state on a UI element, not a hero: the
engine's 3 s default reads as a hang on a card, so a live mark is given the
same clock rather than its own.

A mark is held **invisible** until its backend has reported, or 90 ms, so the
reveal never starts against a canvas with nothing on it. What the mark looks
like while arriving is then settled once and left alone: reading the resolved
backend live meant a mark that came back `live` mid-transition dropped its own
mask and snapped to full.

Leaving is not the reverse of arriving. A mark fades from where it dried over
`exitMs` (180 ms), with the mask left open and the scale left alone; running
the reveal backwards instead shrank it to the dense point it arrived from and
cut it off there, at the start opacity rather than at nothing.

`progress` pins every mark at a point of its reveal with the transition off,
which is how two reveals are compared at the same instant.

Under reduced motion the marks are **presented without the transition** rather
than suppressed.

### Colour

Every mark is baked in exactly one palette, so asking for another silently
falls back to the bake.

- **The paint takes the surface's colour.** `palette` is passed straight to a
  live mark, which is exact and free. A baked mark is steered with
  `tintFilter`, a `hue-rotate`/`saturate` pair derived from the palettes' base
  washes - an approximation, because `hue-rotate` is a linear matrix rather
  than a hue wheel and moves the granulation with the pigment. Where the colour
  is load bearing, bake the palette.
- **The surface takes the paint's colour.** `tintSurface` warms the host toward
  the mark that landed on it, from `PALETTE_PIGMENTS` - the `r_white`
  reflectances of the engine's own pigments, so nothing reads a pixel back.

Assets re-resolve when the theme changes (`watchSurface`), so a grid still on
screen through a toggle swaps to the dark bake. A dark surface also gets 60 %
of the opacity a light one does: the dark bake is the Luminous variant of the
palette and its alpha saturates, which is the same reason
`ConfirmationBackground` runs its whole canvas at 0.45. Left alone, a mark that
is a touch of magic on white is a blob on black.

### Example

```svelte
<DropGroup name="feature cards">
  {#each features as feature (feature.title)}
    <DropSurface
      name={feature.title}
      fonts={{ title: { font: '600 14px "Cabin", sans-serif', lineHeight: 20 },
               copy: { font: '400 14px "Cabin", sans-serif', lineHeight: 20 } }}
      class="rounded-xl border bg-card"
      contentClass="flex items-start gap-3 p-4"
    >
      <div data-drop-obstacle class="size-10"><Icon /></div>
      <div>
        <h3 data-drop-text="title" class="text-sm font-semibold">{feature.title}</h3>
        <p data-drop-text="copy" class="text-sm text-muted-foreground">{feature.copy}</p>
      </div>
    </DropSurface>
  {/each}
</DropGroup>
```

### Touch

A tap fires `pointerenter`, `pointerdown`, `pointerup` and **`pointerleave`**
inside the one gesture. A hover trigger therefore lit and went dark before
anything could be seen: measured on a phone, a tap left every mark in its
waiting state with no canvas at all, for ever.

A surface opened by a pointer that cannot hover keeps its marks up, and the
next pointer that lands outside it takes them down. A mouse is unchanged -
leaving still closes. `trigger="hover"` is therefore reachable on a phone, and
was not before.

### Off screen

A surface watches its own visibility. Nothing below the fold can be pointed at,
so until it comes within 250 px of the viewport it places no marks, fetches no
paint and mounts no canvas; when it leaves again it gives all three back. On a
page holding 42 marks open at once, 27 canvases are alive at the top and 6 at
the bottom.

Marks are placed against the trigger, not against the scroll: a surface that
was already open when it scrolled away comes back with its marks present rather
than replaying their arrival. Scrolling a page with every surface held open
costs 4 dropped frames in 196 and no long tasks.

Stills are decoded once and shared (`sharedStill`), because one page can put
the same four marks on forty surfaces and a surface that scrolls away rebuilds
its backend. Two images over a scroll session went from 69 decodes to 2. The
cache owns what it lends, so a borrower never closes a bitmap; `loadStill`
still hands out one of your own.

### What it costs

Measured on a production build, a page of 15 surfaces carrying 42 marks.

| Backend | Assets | Dropped frames | Long tasks |
|---|---|---|---|
| `static` (default) | 133 KB | 3-7 of 254 | none |
| `baked` | 341 KB | 9-13 of 254 | none |
| `live` | 341 KB + 638 KB wasm | 21-30 of 234 | 52-93 ms, several |

The reveal itself is cheap and composited: one card's arrival holds 60 fps
(p50 16.7 ms, p95 17.3 ms) and `mask`, `flip` and `fade` cost the same. The
cost that matters is the **placement**, which runs per surface on mount and
again when the surface is resized:

| Surface | Per placement |
|---|---|
| list row 420x62 | 0.23 ms |
| feature card 364x101 | 0.24 ms |
| wide card 900x180 | 0.45 ms |
| dense card 600x400, 12 lines | 0.98 ms |
| a button (`layout="wash"`) | 0.0003 ms |

Three things keep that number down:

- **{@link searchStep}** scales the grid step with the surface. Pinned at 4 px,
  the dense card costs 8.3 ms and a grid of 24 cards costs 26 ms.
- **{@link placeSpots} sweeps the clearance field once** and has each claim
  repair only the part of it the claim can reach, rather than rescanning per
  mark. The repair is exact rather than approximate, and the output is
  identical to the rescan across 400 randomised surfaces.
- **{@link markBudget}** narrows the count on a small surface, where cost is
  linear in it and a third mark has nowhere to go.

Together those took a 24-card grid from 26 ms to 2.4 ms.

A placement is also **memoised** on what it was made from - the box, the props,
the theme and what the neighbour drew - so a surface leaving the viewport and
returning does not pay again. `fonts` is compared by identity, so pass a
constant rather than an object literal. A resize settles for 120 ms first,
because a drag would otherwise re-place every surface every frame.

### Warming the engine

The first `EngineHost.acquire` blocks the main thread for a few hundred ms
(375 ms measured on a discrete laptop GPU) while the wasm module loads and
WebGPU hands over a device. Paid on a pointer-enter it freezes the transition
that pointer just started, so a host that expects live marks calls
`getEngineHost().warm()` at idle. It builds the device without holding one of
the four live slots, and resolves `false` where there is no usable GPU - which
is not an error, because that is the case the baked path exists for.

`/drops` in the showcase is the working reference, with the reveals side by
side on a scrubber and both colour directions behind toggles.

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
- An icon source with no baked set draws the plain Lucide SVG at the `static`
  rung (`IconSvgBackend`), which always resolves, so icons never fall to `none`.

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
durationMs, settleFraction, paintWallFraction)` — where `settleFraction` (0 =
unchanged) lengthens the drying tail and `paintWallFraction` (0 = default) is
the wall-clock share the brushwork gets — the instance's
`attach/play/pause/reset/advanceByElapsed/setProgressCurve (frontLoaded|linear|reveal)/
seekProgress/finishImmediately/render/exportPng/exportStrip/dispose`, plus the
helpers `catalogueScene`, `iconScene`, `catalogueIds` and `bakedManifest`. Every error
crosses to JS as an `Error` whose message is `Code: detail`; the TS layer
normalises these into typed `WatercolourError`s. You almost never touch this
surface directly - the `EngineHost` wraps it.