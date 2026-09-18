<script lang="ts">
  import { type ArtworkId, type ArtworkOptions, type FitMode, type Surface } from '../types';
  import { type PlayerReadyCallback, mountPlayer } from './helpers';

  let {
    artwork,
    palette,
    seed,
    intensity,
    durationMs,
    easing,
    tail,
    motion,
    quality,
    mode,
    autoplay,
    fit,
    surface,
    assetBaseUrl,
    onready,
    class: className = '',
  }: {
    artwork: ArtworkId;
    /** Defaults to the host theme: a `.dark` class on `<html>`, else `prefers-color-scheme`. */
    surface?: Surface;
    /** `contain` (default) preserves the artwork's aspect; `fill` stretches to the container. */
    fit?: FitMode;
    assetBaseUrl?: string;
    /** Fires once a backend is drawing; the returned cleanup runs with the player's disposal. */
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
      artwork,
      { palette, seed, intensity, durationMs, easing, tail, motion, quality, mode, autoplay, fit, surface, assetBaseUrl },
      onready,
    );
  });
</script>

<div bind:this={frame} class={className} aria-hidden="true" role="presentation" style="position:relative;overflow:hidden">
  <canvas bind:this={canvas} style="position:absolute;inset:0;display:block"></canvas>
</div>
