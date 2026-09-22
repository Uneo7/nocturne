import { describe, expect, it } from 'vitest';
import { type Box, type Spot, placeSpots, searchStep } from './drops';

/**
 * The placement written the obvious way: rescan the whole grid against every
 * obstacle, once per mark.
 *
 * {@link placeSpots} now sweeps the clearance field once and has each claim
 * repair only what it can reach, which is several times faster. The two are
 * required to agree exactly, and this is the only thing that says so. The
 * other placement tests assert properties a different-looking layout could
 * still satisfy.
 *
 * This is a frozen specification, not code to keep in step with the real one.
 * If a later change to `placeSpots` makes the two disagree, the question to
 * answer is whether the marks were meant to move.
 */
function rescanPerMark(
  cw: number,
  ch: number,
  obstacles: readonly Box[],
  { count = 3, min = 19, step = searchStep(cw, ch) } = {},
): Spot[] {
  const clearance = (x: number, y: number, boxes: readonly Box[]) => {
    let best = Infinity;
    for (const b of boxes) {
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
      const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
      const d = Math.hypot(dx, dy);
      if (d === 0) return 0;
      if (d < best) best = d;
    }
    return best;
  };
  const boxes = obstacles.slice();
  const out: Spot[] = [];
  for (let n = 0; n < count; n++) {
    let best: (Spot & { score: number }) | null = null;
    for (let y = -6; y <= ch + 6; y += step) {
      for (let x = -6; x <= cw + 6; x += step) {
        const r = clearance(x, y, boxes);
        if (r < min) continue;
        const score = r + Math.min(0, Math.min(x, y, cw - x, ch - y)) * 0.25;
        if (!best || score > best.score) best = { x, y, r, score };
      }
    }
    if (!best) break;
    out.push({ x: best.x, y: best.y, r: best.r });
    boxes.push({ x: best.x - best.r * 0.8, y: best.y - best.r * 0.8, w: best.r * 1.6, h: best.r * 1.6 });
  }
  return out;
}

/** Deterministic, so a disagreement can be reproduced from the seed alone. */
function rng(seed: number) {
  let h = seed >>> 0;
  return () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 0xffffffff;
  };
}

describe('the swept field draws what a rescan per mark drew', () => {
  it('agrees across a spread of surfaces and content', () => {
    const random = rng(20260921);
    for (let trial = 0; trial < 400; trial++) {
      const cw = Math.round(60 + random() * 900);
      const ch = Math.round(40 + random() * 400);
      const obstacles: Box[] = [];
      for (let i = 0, n = Math.floor(random() * 8); i < n; i++) {
        obstacles.push({
          x: Math.round(random() * cw),
          y: Math.round(random() * ch),
          w: Math.round(10 + random() * cw * 0.6),
          h: Math.round(8 + random() * ch * 0.4),
        });
      }
      const count = 1 + Math.floor(random() * 3);
      // Reported with the trial, so a failure names the surface that broke.
      expect({ trial, spots: placeSpots(cw, ch, obstacles, { count }) }).toEqual({
        trial,
        spots: rescanPerMark(cw, ch, obstacles, { count }),
      });
    }
  });

  it('agrees with no obstacles at all, where every cell is infinitely clear', () => {
    expect(placeSpots(300, 200, [])).toEqual(rescanPerMark(300, 200, []));
  });

  it('agrees where the content covers everything', () => {
    const full: Box[] = [{ x: -50, y: -50, w: 500, h: 400 }];
    expect(placeSpots(300, 200, full)).toEqual(rescanPerMark(300, 200, full));
  });

  it('agrees on a surface whose roomiest cell is not the one that wins', () => {
    // The score penalises the surface edge, so the winner can be less clear
    // than a corner cell. The repair is bounded by the roomiest cell, not the
    // winner, and this is the shape that catches the difference.
    const obstacles: Box[] = [{ x: 120, y: 20, w: 60, h: 160 }];
    expect(placeSpots(300, 200, obstacles, { count: 3 })).toEqual(
      rescanPerMark(300, 200, obstacles, { count: 3 }),
    );
  });
});
