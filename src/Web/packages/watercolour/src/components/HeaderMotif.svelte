<script lang="ts">
  import type { ArtworkOptions, FitMode, Surface } from '../types';
  import { type PlayerReadyCallback, artworkOptionsFrom, mountPlayer } from './helpers';

  let {
    palette,
    seed,
    intensity,
    durationMs,
    motion,
    quality,
    mode,
    fit,
    surface,
    onready,
    class: className = '',
  }: {
    surface?: Surface;
    /** `contain` (default) preserves the artwork's aspect; `fill` stretches to the container. */
    fit?: FitMode;
    onready?: PlayerReadyCallback;
    class?: string;
  } & ArtworkOptions = $props();

  let frame: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    if (!frame || !canvas) return;
    return mountPlayer(
      frame,
      canvas,
      'header-motif',
      artworkOptionsFrom({ palette, seed, intensity, durationMs, motion, quality, mode, fit, surface }, { autoplay: 'once' }),
      onready,
    );
  });
</script>

<div
  bind:this={frame}
  aria-hidden="true"
  style="aspect-ratio: 5 / 1; width: 10rem; position: relative"
  class="overflow-hidden {className}"
>
  <canvas bind:this={canvas} class="block h-full w-full"></canvas>
</div>