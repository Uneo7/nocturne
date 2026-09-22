<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { prefersReducedMotion } from '../api/capabilities';
  import { resolveMotion } from '../api/mode';
  import { SURFACE_TINT_ALPHA, surfaceTint, tintFilter } from '../api/drop-colour';
  import {
    DEFAULT_REVEAL_MS,
    REVEAL_END_SATURATION,
    REVEAL_SETTLE_EASE,
    REVEAL_SETTLE_RATIO,
    REVEAL_SPREAD_EASE,
    coveringRadius,
    cssEase,
    sampleReveal,
    type DropReveal,
  } from '../api/drop-reveal';
  import { inkFrame, layOutDrops, markBudget, placeSpots, planDrop, washDrop, type PlacedDrop } from '../api/drops';
  import { measureObstacles, type DropFonts } from '../api/drop-text';
  import { seedFromName, type ArtworkMode, type ArtworkMotion, type PaletteId, type Surface } from '../types';
  import type { ArtworkPlayer } from '../api/playback';
  import { getDropGroup } from './drop-group';
  import { hostSurface, watchSurface, type PlayerReadyCallback } from './helpers';
  import Artwork from './Artwork.svelte';

  let {
    as = 'div',
    index,
    name = '',
    trigger = 'hover',
    selected = false,
    shown,
    count = 3,
    peak = 1,
    layout = 'avoid',
    fonts,
    mode = 'static',
    motion = 'auto',
    palette,
    tintSurface = false,
    reveal = 'mask',
    progress,
    revealMs = DEFAULT_REVEAL_MS,
    exitMs = 180,
    generation = 0,
    surface,
    assetBaseUrl,
    onresolved,
    class: className = '',
    contentClass = '',
    children,
    ...rest
  }: {
    /**
     * The tag the surface renders as.
     *
     * A surface has to BE the link or the button it decorates, not wrap one.
     * A mark inside a host that paints its own background disappears behind
     * it. Anything else passed is spread onto that element, so `href`, `type`
     * and `onclick` go where they belong.
     */
    as?: string;
    /** Position in the run. Claimed from the enclosing `DropGroup` when unset. */
    index?: number;
    /** Seeds the marks, so one surface paints the same way across renders. */
    name?: string;
    /** What brings the marks in. Each is a hitbox the user points at on purpose. */
    trigger?: 'hover' | 'select' | 'focus' | 'always';
    /** Only for `trigger="select"`. */
    selected?: boolean;
    /** Overrides the trigger outright, for a host driving the surfaces itself. */
    shown?: boolean;
    /** How many marks to try to place. */
    count?: number;
    /** Scales every mark's opacity. */
    peak?: number;
    /**
     * `avoid` finds the empty space and keeps out of the copy. `wash` puts one
     * mark over the whole control, for a surface that is all label.
     */
    layout?: 'avoid' | 'wash';
    /** Fonts for the off-DOM measurement; without it every line is measured in the DOM. */
    fonts?: DropFonts;
    /**
     * Defaults to `static`, not `auto`.
     *
     * The reveal is what makes a mark arrive, so all a mark needs is its
     * finished paint. Measured over a page of surfaces, the still costs 133 KB
     * against the strip's 341 KB, drops the fewest frames of the three
     * backends and posts no long tasks at all; live adds a GPU device, an
     * instance cap and 50-90 ms tasks for brushwork a mask is covering anyway.
     * Pass `live` or `baked` where the artwork is the point.
     */
    mode?: ArtworkMode;
    motion?: ArtworkMotion;
    /** Paints in this palette instead of each mark's own. */
    palette?: PaletteId;
    /** Warms the surface itself toward the paint that landed on it. */
    tintSurface?: boolean;
    reveal?: DropReveal;
    /**
     * Pins every mark at this point of its reveal, 0 to 1, with the transition
     * off. It is how two reveals are compared at the same instant.
     */
    progress?: number;
    revealMs?: number;
    exitMs?: number;
    /** Bumped to repaint with fresh seeds. */
    generation?: number;
    surface?: Surface;
    assetBaseUrl?: string;
    onresolved?: (key: string, value: string) => void;
    /** The surface's own chrome: border, background, radius. */
    class?: string;
    /** The content's layout. It sits above the paint, so it cannot be the same element. */
    contentClass?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  /**
   * How much of a mark's opacity survives on a dark ground.
   *
   * A dark surface gets the Luminous variant of the palette, whose alpha
   * saturates - `ConfirmationBackground` runs its whole canvas at 0.45 for the
   * same reason. Left alone, a mark that is a touch of magic on white is a
   * blob on black.
   */
  const DARK_PEAK = 0.6;

  const group = getDropGroup();
  // A slot is claimed once, at init: a member that renumbered itself mid-run
  // would repaint the whole run every time one of its siblings moved.
  const slot = untrack(() => index) ?? group?.claim() ?? 0;
  const groupSeed = group?.seed ?? 0;

  let host: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();
  let drops = $state<PlacedDrop[]>([]);
  let hovered = $state(false);
  let focused = $state(false);
  /**
   * Set when a pointer that cannot hover opened the surface.
   *
   * A tap fires `pointerenter` and `pointerleave` inside the same gesture, so
   * a hover trigger lights and goes dark before anything can be seen - on a
   * phone the marks were never visible at all. A touch therefore leaves the
   * marks up, and the next pointer that lands elsewhere takes them down.
   */
  let stuck = $state(false);
  let revealed = $state(false);
  /** Kept mounted through the exit, so the paint fades rather than vanishes. */
  let lingering = $state(false);
  /** The backend each mark actually drew with; a live one runs its own reveal. */
  let drew = $state<string[]>([]);
  let theme = $state<Surface>('light');
  /**
   * Whether the surface is near enough to the viewport to be worth painting.
   *
   * Nothing below the fold can be hovered, so a surface down there has no use
   * for a placement, an asset or a canvas. It starts true only where there is
   * no observer to ask.
   */
  let visible = $state(typeof IntersectionObserver === 'undefined');

  /** A pinned surface is not animating: the host is driving the clock. */
  const scrubbed = $derived(progress !== undefined);
  const animated = $derived(
    !scrubbed && resolveMotion(motion, prefersReducedMotion()) === 'full' && reveal !== 'none',
  );
  const open = $derived(
    scrubbed ||
      (shown ??
        (trigger === 'always'
          ? true
          : trigger === 'select'
            ? selected
            : trigger === 'focus'
              ? focused
              : hovered || focused)),
  );

  /**
   * How far ahead of the viewport a surface prepares itself.
   *
   * Far enough that the marks are placed and the paint fetched before the
   * surface can be pointed at, and near enough that a long list is not
   * preparing rows nobody will reach.
   */
  const PREPARE_MARGIN = '250px';

  $effect(() => {
    const el = host;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1]!.isIntersecting;
      },
      { rootMargin: PREPARE_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  function enter(event: PointerEvent) {
    hovered = true;
    if (event.pointerType !== 'mouse') stuck = true;
  }

  function leave(event: PointerEvent) {
    // A touch has no leave worth honouring: the one it sends arrives mid-tap.
    if (event.pointerType !== 'mouse') return;
    stuck = false;
    hovered = false;
  }

  $effect(() => {
    if (!stuck) return;
    const el = host;
    const dismiss = (event: PointerEvent) => {
      if (el && event.target instanceof Node && el.contains(event.target)) return;
      stuck = false;
      hovered = false;
    };
    // Captured, so a handler that stops propagation cannot leave a mark lit.
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  });

  $effect(() => {
    theme = surface ?? hostSurface();
    if (surface) return;
    return watchSurface((next) => (theme = next));
  });

  /**
   * What the last placement was made from.
   *
   * A surface leaving the viewport and returning asks for the same placement
   * over and over, and the answer cannot have changed: the inputs are the box,
   * the props and what the neighbour drew. Re-entry after the first is free.
   * `fonts` is compared by identity, so a host passing a fresh object literal
   * every render opts itself out - pass a constant.
   */
  let placedFrom = '';
  let placedFonts: DropFonts | undefined;

  function measure() {
    const el = content;
    if (!el || !visible) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const avoid = group?.avoid(slot) ?? [];
    const budget = layout === 'wash' ? 1 : markBudget(w, count);
    const key = [w, h, generation, budget, layout, peak, theme, ...avoid.map((a) => `${a.id}:${a.side}`)].join('|');
    if (key === placedFrom && fonts === placedFonts) return;

    const plan = planDrop(slot, groupSeed);
    const ink = peak * (theme === 'dark' ? DARK_PEAK : 1);
    let placed: PlacedDrop[];
    if (layout === 'wash') {
      placed = washDrop(plan, w, h, { peak: ink });
    } else {
      const obstacles = measureObstacles(el, fonts);
      placed = layOutDrops(plan, w, h, placeSpots(w, h, obstacles, { count: budget }), obstacles, {
        avoid,
        peak: ink,
      });
    }
    placedFrom = key;
    placedFonts = fonts;
    // Registered from the local, not from `drops`: reading back what this
    // effect just wrote makes the effect its own dependency.
    group?.register(slot, placed);
    drops = placed;
  }

  /**
   * How long a resize has to settle before the marks are placed again.
   *
   * A drag fires the observer every frame, and a placement costs a fraction of
   * a millisecond per surface - which a run of them turns into dropped frames
   * for as long as the drag lasts. Nobody is reading the marks mid-drag, so
   * the work waits for the size to stop moving.
   */
  const RESIZE_SETTLE_MS = 120;

  $effect(() => {
    const el = content;
    if (!el) return;
    // Read the inputs a placement depends on, so a repaint re-measures. A
    // surface scrolled into view measures for the first time here.
    void [generation, count, layout, peak, fonts, theme, visible];
    measure();
    let box = `${el.offsetWidth}x${el.offsetHeight}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      // The observer also fires for changes that round to the same box, which
      // would re-place the marks for nothing.
      const next = `${el.offsetWidth}x${el.offsetHeight}`;
      if (next === box) return;
      box = next;
      clearTimeout(timer);
      timer = setTimeout(measure, RESIZE_SETTLE_MS);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      group?.release(slot);
    };
  });

  $effect(() => {
    if (open) {
      lingering = true;
      return;
    }
    if (!animated) {
      lingering = false;
      return;
    }
    const timer = setTimeout(() => (lingering = false), exitMs + 40);
    return () => clearTimeout(timer);
  });

  /**
   * How long the reveal waits for a backend before starting without one.
   *
   * Booting the engine blocks the main thread for about a second the first
   * time. A transition started before that freezes partway, then jumps when
   * the thread comes back. Waiting for the mark to have something to show
   * puts the stall in front of the reveal instead of inside it. The cap is
   * what stops a slow or failing backend holding the surface blank.
   */
  const READY_GRACE_MS = 90;

  /** Guards the latch; a plain `let`, so reading it cannot re-run the effect. */
  let started = false;

  const reported = $derived(drops.reduce((n, _, i) => n + (drew[i] === undefined ? 0 : 1), 0));

  /**
   * The marks are mounted with their start values, then flipped a frame later
   * so the browser has a state to transition from. Flipping in the same frame
   * as the mount lands them finished.
   */
  $effect(() => {
    if (!open) {
      // The latch is kept: clearing it here would swap a live mark's shape
      // back mid-exit, which is the same snap on the way out.
      started = false;
      revealed = false;
      return;
    }
    if (started) return;
    if (!animated) {
      latch();
      revealed = true;
      return;
    }
    let outer = 0;
    let inner = 0;
    const go = () => {
      latch();
      outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => (revealed = true));
      });
    };
    if (drops.length > 0 && reported === drops.length) {
      go();
      return;
    }
    const timer = setTimeout(go, READY_GRACE_MS);
    return () => {
      // Once the reveal has started it owns its frames: a later report must
      // not cancel the flip that is already scheduled.
      if (started) return;
      clearTimeout(timer);
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  });

  /**
   * The backend each mark had when its reveal started.
   *
   * `drew` keeps moving - a player reports `pending`, then a backend, and may
   * fall back again. Reading it live meant a mark that resolved mid-transition
   * swapped its own classes and snapped. What a mark looks like while arriving
   * is settled once, here, and left alone.
   */
  let latchedMode = $state<(string | undefined)[]>([]);

  function latch() {
    started = true;
    latchedMode = drops.map((_, i) => drew[i]);
  }

  /**
   * A player reports `pending` until a backend has drawn, and may fall back
   * after that. The row is refreshed on every event rather than read once.
   */
  function report(key: string, at: number): PlayerReadyCallback {
    return (player: ArtworkPlayer) => {
      const write = () => {
        const { mode: resolved, fallbackReason } = player.state;
        drew[at] = resolved;
        onresolved?.(key, fallbackReason ? `${resolved} (${fallbackReason})` : resolved);
      };
      write();
      return player.on('statechange', write);
    };
  }

  /**
   * Held back until the first latch.
   *
   * Until a backend has reported there is nothing to show and no way to know
   * whether this mark will run its own reveal, so showing its start point
   * means a dense dot that pops when the answer arrives.
   */
  const waiting = $derived(animated && latchedMode.length === 0);

  /**
   * True while a mark that has arrived is on its way out.
   *
   * Without it the exit runs the reveal backwards, and the reveal starts as a
   * small dense point: the mark shrank back to a dot at 40 % opacity and was
   * then cut off when the canvas unmounted. Paint does not un-spread.
   */
  const leaving = $derived(lingering && !open);

  /** A live mark reveals itself, so the mask would animate over the animation. */
  const revealFor = (at: number): DropReveal => (latchedMode[at] === 'live' ? 'none' : reveal);

  /** A live mark takes the palette directly, so only baked pixels are pushed. */
  const tintFor = (drop: PlacedDrop, at: number) =>
    palette && latchedMode[at] !== 'live' ? tintFilter(drop.mark.palette, palette) : undefined;

  /**
   * The clock a live mark runs on, matched to the settled baked one so the two
   * paths arrive together. Left unset it would take the engine's 3 s default.
   */
  const engineMs = $derived(Math.round(revealMs * REVEAL_SETTLE_RATIO));

  const tintPalette = $derived(palette ?? drops[0]?.mark.palette);
  const tintAlpha = $derived(progress ?? (revealed ? 1 : 0));
  const tint = $derived(
    tintSurface && tintPalette ? surfaceTint(tintPalette, SURFACE_TINT_ALPHA * tintAlpha) : 'transparent',
  );
</script>

<!--
  Three layers, because the surface paints its own background: the host draws
  the chrome, the marks sit above that background, and the content sits above
  the marks. A mark placed on the host with a negative z-index disappears
  behind the very background it is meant to bleed into.
-->
<svelte:element
  this={as}
  bind:this={host}
  role={as === 'div' ? 'presentation' : undefined}
  {...rest}
  onpointerenter={enter}
  onpointerleave={leave}
  onfocusin={() => (focused = true)}
  onfocusout={() => (focused = false)}
  class="nwc-drops relative isolate overflow-hidden {className}"
  style:--nwc-drop-ms="{revealMs}ms"
  style:--nwc-drop-settle-ms="{Math.round(revealMs * REVEAL_SETTLE_RATIO)}ms"
  style:--nwc-drop-exit-ms="{exitMs}ms"
  style:--nwc-drop-spread={cssEase(REVEAL_SPREAD_EASE)}
  style:--nwc-drop-settle={cssEase(REVEAL_SETTLE_EASE)}
  style:--nwc-drop-end-sat={REVEAL_END_SATURATION}
>
  {#if tintSurface}
    <div class="nwc-drops__tint pointer-events-none absolute inset-0 z-0" style:background-color={tint}></div>
  {/if}
  <div class="pointer-events-none absolute inset-0 z-0">
    {#each drops as drop, d (`${generation}-${drop.mark.id}-${d}`)}
      {@const frame = inkFrame(drop.mark, drop.width, drop.height)}
      {@const shape = revealFor(d)}
      {@const radius = coveringRadius(drop.width, drop.height, drop.origin)}
      {@const pinned =
        progress === undefined ? undefined : sampleReveal(progress, shape, { radius, peak: drop.peak })}
      <div
        class="nwc-drop nwc-drop--{shape}"
        class:nwc-drop--waiting={waiting}
        class:nwc-drop--animated={animated && lingering}
        class:nwc-drop--leaving={leaving}
        class:nwc-drop--shown={revealed}
        style:left="{drop.left}px"
        style:top="{drop.top}px"
        style:width="{drop.width}px"
        style:height="{drop.height}px"
        style:transform="rotate({drop.rotation}deg) scaleX({drop.flip})"
        style:--nwc-drop-x="{drop.origin.x * 100}%"
        style:--nwc-drop-y="{drop.origin.y * 100}%"
        style:--nwc-drop-r1="{radius}px"
        style:--nwc-drop-peak={drop.peak}
        style:--nwc-drop-tint={tintFor(drop, d) ?? 'saturate(1)'}
        style:--nwc-drop-radius={pinned ? `${pinned.radius}px` : null}
        style:--nwc-drop-scale={pinned ? pinned.scale : null}
        style:--nwc-drop-saturation={pinned ? pinned.saturation : null}
        style:opacity={pinned ? pinned.opacity : null}
      >
        <!--
          The growth is its own element, because it turns about the brush-down
          point and the mirror does not. `scaleX(-1)` about a point that is not
          the middle translates the box, which moved a mirrored mark off the
          empty space it was placed in and onto the copy.
        -->
        <div
          class="nwc-drop__grow absolute inset-0"
          style:transform-origin="{drop.origin.x * 100}% {drop.origin.y * 100}%"
        >
          <!-- The wrapper is the ink box. The artwork's own frame is larger and
               offset inside it, so the paint - which is not centred in that
               frame - lands on the box instead. -->
          <div
            class="absolute"
            style:left="{frame.left}px"
            style:top="{frame.top}px"
            style:width="{frame.width}px"
            style:height="{frame.height}px"
          >
            {#if lingering && visible}
              <Artwork
                artwork={drop.mark.id}
                palette={palette ?? drop.mark.palette}
                seed={seedFromName(`${name}-${slot}-${d}-${generation}`)}
                surface={theme}
                durationMs={engineMs}
                {mode}
                {motion}
                {assetBaseUrl}
                fit="fill"
                class="size-full"
                onready={report(`${name || `surface ${slot}`} ${d}`, d)}
              />
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
  <div bind:this={content} class="relative z-10 {contentClass}">
    {@render children()}
  </div>
</svelte:element>

<style>
  /*
   * The reveal is driven by registered custom properties, because a plain one
   * cannot be interpolated. Without `@property` support the values jump to
   * their settled state, which is the same picture without the arrival.
   */
  @property --nwc-drop-radius {
    syntax: '<length>';
    inherits: false;
    initial-value: 0px;
  }

  /* Inherited, because the growth is applied a level down from where it is
     declared and transitioned. */
  @property --nwc-drop-scale {
    syntax: '<number>';
    inherits: true;
    initial-value: 1;
  }

  @property --nwc-drop-saturation {
    syntax: '<number>';
    inherits: false;
    initial-value: 1;
  }

  .nwc-drops__tint {
    transition: background-color var(--nwc-drop-settle-ms) var(--nwc-drop-settle);
  }

  .nwc-drop__grow {
    transform: scale(var(--nwc-drop-scale));
  }

  .nwc-drop {
    position: absolute;
    overflow: hidden;
    --nwc-drop-radius: calc(var(--nwc-drop-r1) * 0.08);
    --nwc-drop-scale: 1;
    --nwc-drop-saturation: 0.72;
    filter: var(--nwc-drop-tint) saturate(var(--nwc-drop-saturation));
  }

  .nwc-drop--none {
    opacity: var(--nwc-drop-peak);
    --nwc-drop-saturation: var(--nwc-drop-end-sat);
  }

  /* The placeholder it replaces: a generic UI pop, kept for comparison. */
  .nwc-drop--fade {
    opacity: 0;
    --nwc-drop-saturation: 1;
  }

  /*
   * A small, dense core rather than the whole mark at low opacity, so the
   * paint reads as concentrated where the brush touched down.
   */
  .nwc-drop--mask,
  .nwc-drop--flip {
    opacity: calc(var(--nwc-drop-peak) * 0.4);
    -webkit-mask-image: radial-gradient(
      circle at var(--nwc-drop-x) var(--nwc-drop-y),
      #000 0,
      #000 calc(var(--nwc-drop-radius) * 0.55),
      rgb(0 0 0 / 0.5) calc(var(--nwc-drop-radius) * 0.82),
      transparent var(--nwc-drop-radius)
    );
    mask-image: radial-gradient(
      circle at var(--nwc-drop-x) var(--nwc-drop-y),
      #000 0,
      #000 calc(var(--nwc-drop-radius) * 0.55),
      rgb(0 0 0 / 0.5) calc(var(--nwc-drop-radius) * 0.82),
      transparent var(--nwc-drop-radius)
    );
  }

  .nwc-drop--flip {
    --nwc-drop-scale: 0.34;
  }

  /*
   * Hidden rather than transparent. Setting the opacity to zero here would
   * make the reveal interpolate up from zero when the class came off, which
   * is a fade - the one arrival this is not meant to be. Visibility leaves
   * the mark's start values alone and simply does not paint them.
   */
  .nwc-drop--waiting {
    visibility: hidden;
  }

  /*
   * Leaving is not the reverse of arriving: a mark withdraws quickly. The
   * class is only on while the marks are mounted, so once they are gone the
   * element snaps back to its start values instead of animating there empty.
   */
  .nwc-drop--animated {
    transition:
      opacity var(--nwc-drop-exit-ms) ease-out,
      --nwc-drop-radius var(--nwc-drop-exit-ms) ease-out,
      --nwc-drop-scale var(--nwc-drop-exit-ms) ease-out,
      --nwc-drop-saturation var(--nwc-drop-exit-ms) ease-out;
    will-change: opacity, filter, transform;
  }

  /*
   * The area is front-loaded and then crawls; the pigment keeps gathering
   * after it has all but stopped. That order is what sells the watercolour.
   */
  .nwc-drop--animated.nwc-drop--shown {
    transition:
      --nwc-drop-radius var(--nwc-drop-ms) var(--nwc-drop-spread),
      --nwc-drop-scale var(--nwc-drop-ms) var(--nwc-drop-spread),
      opacity var(--nwc-drop-settle-ms) var(--nwc-drop-settle),
      --nwc-drop-saturation var(--nwc-drop-settle-ms) var(--nwc-drop-settle);
  }

  .nwc-drop--shown {
    opacity: var(--nwc-drop-peak);
    --nwc-drop-radius: var(--nwc-drop-r1);
    --nwc-drop-scale: 1;
    --nwc-drop-saturation: var(--nwc-drop-end-sat);
  }

  /*
   * Declared last, so it wins over both the start state and `--shown`. A mark
   * leaving fades from where it dried: the mask stays open and the scale stays
   * put, and only the opacity moves. Letting it fall back to the start state
   * instead rewound the spread and stopped at the start opacity.
   */
  .nwc-drop--leaving {
    opacity: 0;
    --nwc-drop-radius: var(--nwc-drop-r1);
    --nwc-drop-scale: 1;
    --nwc-drop-saturation: var(--nwc-drop-end-sat);
  }
</style>
