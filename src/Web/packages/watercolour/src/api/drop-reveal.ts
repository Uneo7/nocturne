/**
 * How a baked mark arrives.
 *
 * `fade` is the generic UI pop the prototype shipped with, kept only so the
 * showcase can put it beside the others. `mask` reveals a static mark through
 * a radial mask spreading from the brush-down point, so the paint's own dried
 * edge is uncovered rather than magnified. `flip` adds the position half:
 * the mark also travels and grows from that point.
 */
export type DropReveal = 'none' | 'fade' | 'mask' | 'flip';

export const DROP_REVEALS: readonly DropReveal[] = ['none', 'fade', 'mask', 'flip'];

export type Bezier = readonly [number, number, number, number];

/**
 * How the wetted area spreads.
 *
 * Front-loaded, then decelerating hard: about 54 % of the area is on the paper
 * by 30 % of the duration and the rest crawls in. The curve is tuned against
 * the engine's own pacing rather than chosen for feel — see
 * {@link revealPacing}.
 */
export const REVEAL_SPREAD_EASE: Bezier = [0.26, 0.8, 0.4, 1];

/**
 * How the pigment gathers.
 *
 * Back-loaded, and deliberately the opposite of a fade-in. Opacity and
 * saturation are still rising once the spread has all but stopped. That is
 * what reads as pigment concentrating at a drying edge.
 */
export const REVEAL_SETTLE_EASE: Bezier = [0.55, 0.05, 0.35, 1];

/** The wetted radius at the start, as a fraction of the finished one. */
export const REVEAL_START_RADIUS = 0.08;
/** Opacity and saturation at the start, as fractions of the settled values. */
export const REVEAL_START_OPACITY = 0.4;
export const REVEAL_START_SATURATION = 0.72;
/** Saturation once dry. Above 1, because the dried edge holds more pigment. */
export const REVEAL_END_SATURATION = 1.06;
/** Scale a `flip` mark starts at, about its brush-down point. */
export const REVEAL_START_SCALE = 0.34;

/**
 * How long a mark takes to arrive, in ms.
 *
 * This is a hover state on a UI element, not a hero: it has to feel like a
 * response to the pointer. The engine's own 3 s reveal is for a piece of
 * artwork someone is looking at, and reads as a hang on a card.
 */
export const DEFAULT_REVEAL_MS = 420;
/** The settle runs past the spread, so the mark is still gaining pigment when it stops moving. */
export const REVEAL_SETTLE_RATIO = 1.45;

export function cssEase(e: Bezier): string {
  return `cubic-bezier(${e[0]}, ${e[1]}, ${e[2]}, ${e[3]})`;
}

/** A CSS `cubic-bezier` sampled by Newton's method, for pacing checks. */
export function cubicBezier([x1, y1, x2, y2]: Bezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    let t = x;
    for (let i = 0; i < 12; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-8) break;
      const slope = slopeX(t);
      if (slope < 1e-6) break;
      t -= error / slope;
    }
    t = Math.min(1, Math.max(0, t));
    return ((ay * t + by) * t + cy) * t;
  };
}

/**
 * The share of the finished mark on the paper at `t`.
 *
 * The mask is a circle, so the area goes as the square of the wetted radius,
 * which is what the curve actually drives.
 */
export function revealArea(t: number, ease: Bezier = REVEAL_SPREAD_EASE): number {
  const radius = REVEAL_START_RADIUS + (1 - REVEAL_START_RADIUS) * cubicBezier(ease)(t);
  return radius * radius;
}

/**
 * Where the engine's reveal suite puts the bar, mirrored here so a baked
 * transition can be held to the same pacing as a live one.
 *
 * `PACE_AT`/`MAX_AREA_AT_PACE` are `every_artwork_is_still_arriving_a_quarter_
 * of_the_way_in`; `SNAP_FRAMES`/`MAX_SNAP_RATIO` are the last-frame jump check.
 * Both live in `crates/nocturne-watercolour-infra/tests/reveal_preserves_the_artwork.rs`.
 */
export const revealPacing = {
  PACE_AT: 0.25,
  MAX_AREA_AT_PACE: 0.45,
  SNAP_FRAMES: 16,
  MAX_SNAP_RATIO: 3.0,
} as const;

/**
 * The radius a mask needs to clear a `w` by `h` box from `origin`.
 *
 * It is the distance to the furthest corner, with room for the gradient's own
 * feathered edge.
 */
export function coveringRadius(w: number, h: number, origin: { x: number; y: number }): number {
  const dx = Math.max(origin.x, 1 - origin.x) * w;
  const dy = Math.max(origin.y, 1 - origin.y) * h;
  return Math.hypot(dx, dy) * 1.18;
}

export interface RevealSample {
  /** The wetted radius in px, for the mask's own stops. */
  radius: number;
  opacity: number;
  saturation: number;
  scale: number;
}

/**
 * One frame of a reveal, for pinning a mark at a progress rather than
 * transitioning it.
 *
 * `t` runs over the settle, which is the longer of the two clocks, so the
 * spread has finished before `t` reaches 1. That is the whole shape of the
 * thing: the paint stops moving, then keeps gaining pigment.
 */
export function sampleReveal(
  t: number,
  reveal: DropReveal,
  { radius, peak }: { radius: number; peak: number },
): RevealSample {
  const clamped = Math.min(1, Math.max(0, t));
  const spread = cubicBezier(REVEAL_SPREAD_EASE)(Math.min(1, clamped * REVEAL_SETTLE_RATIO));
  const settle = cubicBezier(REVEAL_SETTLE_EASE)(clamped);
  if (reveal === 'none') {
    return { radius, opacity: peak, saturation: REVEAL_END_SATURATION, scale: 1 };
  }
  if (reveal === 'fade') {
    return { radius, opacity: peak * settle, saturation: 1, scale: 1 };
  }
  return {
    radius: radius * (REVEAL_START_RADIUS + (1 - REVEAL_START_RADIUS) * spread),
    opacity: peak * (REVEAL_START_OPACITY + (1 - REVEAL_START_OPACITY) * settle),
    saturation: REVEAL_START_SATURATION + (REVEAL_END_SATURATION - REVEAL_START_SATURATION) * settle,
    scale: reveal === 'flip' ? REVEAL_START_SCALE + (1 - REVEAL_START_SCALE) * spread : 1,
  };
}
