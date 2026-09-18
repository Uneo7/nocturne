export type ArtworkId =
  | 'wash'
  | 'crescent-moon'
  | 'alarm-bell'
  | 'linked-rings'
  | 'report-pages'
  | 'magnifying-glass'
  | 'confirmation-mark'
  | 'moonlit-shoreline'
  | 'distant-mountains'
  | 'connected-shores'
  | 'overlapping-shapes'
  | 'avatar-wash'
  | 'tab-underline'
  | 'selection-edge'
  | 'confirmation-background'
  | 'header-motif';

export type PaletteId = 'moonlight' | 'water' | 'dusk' | 'ember' | 'moss' | 'slate';

export type ArtworkMode = 'auto' | 'live' | 'baked' | 'static';
export type ArtworkMotion = 'auto' | 'reduced' | 'full';
export type ArtworkQuality = 'auto' | 'low' | 'medium' | 'high';
export type ArtworkAutoplay = 'once' | 'never';

/**
 * How a component lays its canvas out in a container that is not the
 * artwork's own aspect. `contain` (default) sizes the canvas to the largest
 * box of the artwork's aspect that fits and centres it, leaving the
 * surrounding area transparent; `fill` stretches the artwork to the
 * container as the components did before aspect awareness.
 */
export type FitMode = 'contain' | 'fill';

/**
 * The page background the artwork sits on. `dark` keeps the palette and
 * switches the scene to luminous compositing (`Background::TransparentOnDark`).
 */
export type Surface = 'light' | 'dark';

/** How much of an artwork the catalogue draws for the size it is shown at. */
export type DetailLevel = 'small' | 'medium' | 'large' | 'extraLarge';

export interface ArtworkOptions {
  palette?: PaletteId;
  seed?: number;
  /** 0..1, default 0.7: scales pigment concentration. */
  intensity?: number;
  /** Wall-clock length of the reveal, default 600. */
  durationMs?: number;
  /**
   * 0..1, default 0.3: the final share of the reveal spent settling and
   * drying. Live reveals lengthen the scene's settle phase; baked reveals
   * hold the finished frame for the tail.
   */
  tail?: number;
  /**
   * Maps wall-clock progress (0..1) to the progress shown, e.g.
   * `import { cubicOut } from 'svelte/easing'`. Absent = the engine's
   * built-in front-loaded curve.
   */
  easing?: (t: number) => number;
  motion?: ArtworkMotion;
  quality?: ArtworkQuality;
  mode?: ArtworkMode;
  autoplay?: ArtworkAutoplay;
}

export const ARTWORK_IDS: readonly ArtworkId[] = [
  'wash',
  'crescent-moon',
  'alarm-bell',
  'linked-rings',
  'report-pages',
  'magnifying-glass',
  'confirmation-mark',
  'moonlit-shoreline',
  'distant-mountains',
  'connected-shores',
  'overlapping-shapes',
  'avatar-wash',
  'tab-underline',
  'selection-edge',
  'confirmation-background',
  'header-motif',
];

export const PALETTE_IDS: readonly PaletteId[] = ['moonlight', 'water', 'dusk', 'ember', 'moss', 'slate'];

export const DEFAULT_INTENSITY = 0.7;
export const DEFAULT_DURATION_MS = 600;
export const DEFAULT_TAIL = 0.3;

/**
 * The natural width/height ratio of each catalogue artwork, from the baked
 * aspect table (icons and `wash` are square, scenes and accents keep the
 * ratio they were authored at). The components use it to size the canvas in
 * `contain` mode and to pick the detail tier from the actual painted box.
 */
export const ARTWORK_ASPECT: Readonly<Record<ArtworkId, number>> = {
  wash: 1,
  'crescent-moon': 1,
  'alarm-bell': 1,
  'linked-rings': 1,
  'report-pages': 1,
  'magnifying-glass': 1,
  'confirmation-mark': 1,
  'moonlit-shoreline': 16 / 9,
  'distant-mountains': 2,
  'connected-shores': 2,
  'overlapping-shapes': 1,
  'avatar-wash': 1,
  'tab-underline': 8,
  'selection-edge': 1 / 6,
  'confirmation-background': 3,
  'header-motif': 5,
};

export function artworkAspect(id: ArtworkId): number {
  return ARTWORK_ASPECT[id] ?? 1;
}

/**
 * Detail tier for the canvas's BACKING long edge (CSS size times device
 * pixel ratio, capped at 2). Mirrors `DetailLevel::detail_for_edge_px` in
 * the wasm crate: below 64 px small, below 192 px medium, below 320 px
 * large, 320 px and above extraLarge.
 */
export function detailForEdge(edgePx: number): DetailLevel {
  if (edgePx < 64) return 'small';
  if (edgePx < 192) return 'medium';
  if (edgePx < 320) return 'large';
  return 'extraLarge';
}

/**
 * Simulation grid side for a live reveal at a backing long edge: the edge
 * rounded up to a multiple of 32, capped at `SimResolution.MAX` (512) and
 * floored at `SimResolution.MIN` (64). The engine clamps again defensively.
 */
export function simResolutionForEdge(edgePx: number): number {
  const edge = Math.max(0, Math.round(edgePx));
  if (edge >= 512) return 512;
  return Math.max(64, Math.ceil(edge / 32) * 32);
}

/** FNV-1a over the name, so the same person always receives the same wash. */
export function seedFromName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
