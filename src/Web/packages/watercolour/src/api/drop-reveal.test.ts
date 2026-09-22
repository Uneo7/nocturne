import { describe, expect, it } from 'vitest';
import {
  REVEAL_END_SATURATION,
  REVEAL_SETTLE_EASE,
  REVEAL_SETTLE_RATIO,
  REVEAL_SPREAD_EASE,
  REVEAL_START_OPACITY,
  REVEAL_START_RADIUS,
  REVEAL_START_SCALE,
  coveringRadius,
  cssEase,
  cubicBezier,
  revealArea,
  revealPacing,
  sampleReveal,
} from './drop-reveal';

describe('cubicBezier (the CSS curve, sampled)', () => {
  it('pins both ends', () => {
    const ease = cubicBezier(REVEAL_SPREAD_EASE);
    expect(ease(0)).toBeCloseTo(0, 6);
    expect(ease(1)).toBeCloseTo(1, 6);
  });

  it('is monotonic, so nothing ever runs backwards', () => {
    const ease = cubicBezier(REVEAL_SPREAD_EASE);
    let last = -1;
    for (let i = 0; i <= 200; i++) {
      const value = ease(i / 200);
      expect(value).toBeGreaterThanOrEqual(last - 1e-9);
      last = value;
    }
  });

  it('matches the identity curve it is given', () => {
    const linear = cubicBezier([0.25, 0.25, 0.75, 0.75]);
    expect(linear(0.4)).toBeCloseTo(0.4, 4);
  });
});

/**
 * The baked reveal is held to the same bar as the engine's own, which is what
 * `reveal_preserves_the_artwork` measures on the live path. A transition that
 * arrives faster than the simulation reads as a UI pop next to it.
 */
describe('the spread paces like the engine', () => {
  it('is still arriving a quarter of the way in', () => {
    expect(revealArea(revealPacing.PACE_AT)).toBeLessThanOrEqual(revealPacing.MAX_AREA_AT_PACE);
  });

  it('front-loads the spread, so most of the area is there by 30 %', () => {
    expect(revealArea(0.3)).toBeGreaterThan(0.5);
  });

  it('does not snap on the last frame', () => {
    const { SNAP_FRAMES, MAX_SNAP_RATIO } = revealPacing;
    const steps: number[] = [];
    for (let i = 1; i <= SNAP_FRAMES; i++) {
      steps.push(revealArea(i / SNAP_FRAMES) - revealArea((i - 1) / SNAP_FRAMES));
    }
    const sorted = [...steps].sort((a, b) => a - b);
    const median = Math.max(sorted[Math.floor(sorted.length / 2)]!, 1e-6);
    expect(steps[steps.length - 1]! / median).toBeLessThanOrEqual(MAX_SNAP_RATIO);
  });

  it('never jumps mid-reveal either', () => {
    const { SNAP_FRAMES, MAX_SNAP_RATIO } = revealPacing;
    const steps: number[] = [];
    for (let i = 1; i <= SNAP_FRAMES; i++) {
      steps.push(revealArea(i / SNAP_FRAMES) - revealArea((i - 1) / SNAP_FRAMES));
    }
    const sorted = [...steps].sort((a, b) => a - b);
    const median = Math.max(sorted[Math.floor(sorted.length / 2)]!, 1e-6);
    expect(Math.max(...steps) / median).toBeLessThanOrEqual(MAX_SNAP_RATIO);
  });

  it('starts as a dense point rather than a whole faint mark', () => {
    expect(revealArea(0)).toBeCloseTo(REVEAL_START_RADIUS ** 2, 6);
    expect(revealArea(0)).toBeLessThan(0.01);
  });

  it('decelerates: the second half adds less than the first quarter', () => {
    expect(revealArea(1) - revealArea(0.5)).toBeLessThan(revealArea(0.25) - revealArea(0));
  });
});

describe('the settle gathers pigment after the spread has stopped', () => {
  it('is back-loaded, unlike the spread', () => {
    const settle = cubicBezier(REVEAL_SETTLE_EASE);
    const spread = cubicBezier(REVEAL_SPREAD_EASE);
    expect(settle(0.3)).toBeLessThan(spread(0.3));
    expect(settle(0.3)).toBeLessThan(0.3);
  });
});

describe('cssEase (what goes in the stylesheet)', () => {
  it('writes the curve the tests measured', () => {
    expect(cssEase(REVEAL_SPREAD_EASE)).toBe('cubic-bezier(0.26, 0.8, 0.4, 1)');
  });
});

describe('coveringRadius (a mask that finishes the job)', () => {
  it('reaches past the furthest corner from the brush-down point', () => {
    const w = 200;
    const h = 80;
    const origin = { x: 0.12, y: 0.2 };
    const radius = coveringRadius(w, h, origin);
    const furthest = Math.hypot((1 - origin.x) * w, (1 - origin.y) * h);
    expect(radius).toBeGreaterThan(furthest);
  });

  it('holds for a mark revealed from the middle', () => {
    const radius = coveringRadius(100, 100, { x: 0.5, y: 0.5 });
    expect(radius).toBeGreaterThan(Math.hypot(50, 50));
  });
});

describe('sampleReveal (one frame, pinned)', () => {
  const box = { radius: 120, peak: 0.8 };

  it('starts as a dense point and ends as the whole mark', () => {
    const start = sampleReveal(0, 'mask', box);
    const end = sampleReveal(1, 'mask', box);
    expect(start.radius).toBeCloseTo(120 * REVEAL_START_RADIUS, 6);
    expect(end.radius).toBeCloseTo(120, 6);
    expect(start.opacity).toBeCloseTo(0.8 * REVEAL_START_OPACITY, 6);
    expect(end.opacity).toBeCloseTo(0.8, 6);
  });

  it('gathers pigment rather than losing it', () => {
    expect(sampleReveal(0, 'mask', box).saturation).toBeLessThan(1);
    expect(sampleReveal(1, 'mask', box).saturation).toBeCloseTo(REVEAL_END_SATURATION, 6);
  });

  it('stops spreading before it stops darkening', () => {
    const late = sampleReveal(1 / REVEAL_SETTLE_RATIO, 'mask', box);
    expect(late.radius).toBeCloseTo(120, 4);
    expect(late.opacity).toBeLessThan(0.8);
  });

  it('only moves a flip mark', () => {
    expect(sampleReveal(0, 'flip', box).scale).toBeCloseTo(REVEAL_START_SCALE, 6);
    expect(sampleReveal(1, 'flip', box).scale).toBeCloseTo(1, 6);
    expect(sampleReveal(0, 'mask', box).scale).toBe(1);
  });

  it('leaves a fade with nothing but its opacity', () => {
    const half = sampleReveal(0.5, 'fade', box);
    expect(half.radius).toBe(120);
    expect(half.scale).toBe(1);
    expect(half.opacity).toBeGreaterThan(0);
    expect(half.opacity).toBeLessThan(0.8);
  });

  it('shows a mark with no reveal at once', () => {
    expect(sampleReveal(0, 'none', box)).toEqual({
      radius: 120,
      opacity: 0.8,
      saturation: REVEAL_END_SATURATION,
      scale: 1,
    });
  });

  it('clamps a progress outside the clock', () => {
    expect(sampleReveal(-1, 'mask', box)).toEqual(sampleReveal(0, 'mask', box));
    expect(sampleReveal(2, 'mask', box)).toEqual(sampleReveal(1, 'mask', box));
  });
});
