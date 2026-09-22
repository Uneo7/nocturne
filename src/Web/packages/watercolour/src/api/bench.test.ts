import { describe, expect, it } from 'vitest';
import { type Box, layOutDrops, placeSpots, planDrop, washDrop } from './drops';

/** Surfaces the marks are actually placed on, at the sizes they occur at. */
const CASES = [
  {
    name: 'feature card 364x101',
    w: 364,
    h: 101,
    count: 3,
    obstacles: [
      { x: 8, y: 8, w: 56, h: 56 },
      { x: 64, y: 12, w: 154, h: 30 },
      { x: 64, y: 42, w: 236, h: 26 },
    ],
  },
  {
    name: 'list row 420x62',
    w: 420,
    h: 62,
    count: 2,
    obstacles: [
      { x: 8, y: 10, w: 120, h: 24 },
      { x: 8, y: 32, w: 180, h: 20 },
      { x: 392, y: 22, w: 20, h: 20 },
    ],
  },
  {
    name: 'wide card 900x180',
    w: 900,
    h: 180,
    count: 3,
    obstacles: [
      { x: 20, y: 20, w: 58, h: 58 },
      { x: 90, y: 24, w: 300, h: 28 },
      { x: 90, y: 56, w: 620, h: 24 },
      { x: 90, y: 84, w: 540, h: 24 },
      { x: 90, y: 120, w: 200, h: 22 },
    ],
  },
  {
    name: 'dense card 600x400, 12 lines',
    w: 600,
    h: 400,
    count: 3,
    obstacles: Array.from({ length: 12 }, (_, i) => ({ x: 24, y: 24 + i * 28, w: 420, h: 24 })),
  },
] satisfies { name: string; w: number; h: number; count: number; obstacles: Box[] }[];

function time(runs: number, fn: (i: number) => void): number {
  fn(0);
  const start = performance.now();
  for (let i = 0; i < runs; i++) fn(i);
  return (performance.now() - start) / runs;
}

/**
 * Not an assertion, a measurement. The placement runs once per surface on
 * mount and again on every resize. Its cost is what decides how many surfaces
 * a page can carry.
 */
describe('placement cost', () => {
  it('reports the per-surface cost of a placement', () => {
    const rows: string[] = [];
    for (const c of CASES) {
      const spotsMs = time(200, () => {
        placeSpots(c.w, c.h, c.obstacles, { count: c.count });
      });
      const spots = placeSpots(c.w, c.h, c.obstacles, { count: c.count });
      const layMs = time(2000, (i) => {
        layOutDrops(planDrop(i % 8, 11), c.w, c.h, spots, c.obstacles, { peak: 1 });
      });
      rows.push(
        `${c.name.padEnd(30)} spots ${spotsMs.toFixed(3)} ms  layout ${layMs.toFixed(4)} ms  total ${(spotsMs + layMs).toFixed(3)} ms  (${spots.length} marks)`,
      );
    }
    const washMs = time(5000, (i) => washDrop(planDrop(i % 8, 3), 168, 40));
    rows.push(`${'wash (a button)'.padEnd(30)} ${washMs.toFixed(4)} ms`);
    console.log('\n' + rows.join('\n') + '\n');
  });

  it('reports the cost of a whole run of surfaces', () => {
    const c = CASES[0]!;
    const grid = time(50, () => {
      for (let i = 0; i < 24; i++) {
        const spots = placeSpots(c.w, c.h, c.obstacles, { count: c.count });
        layOutDrops(planDrop(i, 11), c.w, c.h, spots, c.obstacles);
      }
    });
    console.log(`\n24 feature cards placed: ${grid.toFixed(2)} ms (${(grid / 24).toFixed(3)} ms each)\n`);
  });

  /**
   * A generous ceiling, to catch a tenfold regression without flaking on a
   * loaded machine. The measured cost is a fifth of this; what it guards is
   * someone pinning the search step fine again, which cost 8 ms on this
   * surface and 26 ms across a grid.
   */
  it('stays affordable on the surface that costs the most', () => {
    const c = CASES[3]!;
    const ms = time(30, () => {
      const spots = placeSpots(c.w, c.h, c.obstacles, { count: c.count });
      layOutDrops(planDrop(0, 11), c.w, c.h, spots, c.obstacles);
    });
    expect(ms).toBeLessThan(2);
  });

  it('reports how the cost scales with the search step', () => {
    const c = CASES[2]!;
    const rows: string[] = [];
    for (const step of [2, 4, 6, 8, 12]) {
      const ms = time(20, () => placeSpots(c.w, c.h, c.obstacles, { count: c.count, step }));
      rows.push(`step ${String(step).padStart(2)}  ${ms.toFixed(3)} ms`);
    }
    console.log('\n900x180 card, spot search:\n' + rows.join('\n') + '\n');
  });
});
