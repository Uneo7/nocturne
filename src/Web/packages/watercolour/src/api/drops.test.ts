import { describe, expect, it } from 'vitest';
import {
  DROP_MARKS,
  markBudget,
  type Box,
  type DropSignature,
  type PlacedDrop,
  inkAspect,
  inkFrame,
  layOutDrops,
  placeSpots,
  planDrop,
  signaturesOf,
  washDrop,
} from './drops';

const DISC = DROP_MARKS.find((m) => m.id === 'avatar-wash')!;
const EDGE = DROP_MARKS.find((m) => m.id === 'selection-edge')!;
const STREAK = DROP_MARKS.find((m) => m.id === 'tab-underline')!;

/** A feature card: a glyph on the left, a title and two lines of copy. */
const CARD = { w: 364, h: 101 };
const CARD_OBSTACLES: Box[] = [
  { x: 8, y: 8, w: 56, h: 56 },
  { x: 64, y: 12, w: 154, h: 30 },
  { x: 64, y: 42, w: 236, h: 26 },
];

describe('inkFrame (paint on the box it was asked for)', () => {
  it('leaves a centred mark where it is', () => {
    const frame = inkFrame(DISC, 100, 100);
    expect(frame.width).toBeCloseTo(100 / (0.813 - 0.129), 5);
    expect(frame.left).toBeCloseTo(-0.129 * frame.width, 5);
  });

  it('pulls an off-centre mark back onto the box', () => {
    // `selection-edge` paints only the left 27 % of its file. Its frame is
    // therefore nearly four times the box, for the paint to fill it.
    const frame = inkFrame(EDGE, 26, 200);
    expect(frame.width).toBeCloseTo(26 / 0.271, 5);
    expect(frame.left).toBeCloseTo(0, 5);
    expect(frame.height).toBeCloseTo(200, 5);
  });

  it('puts the ink extent exactly on the requested box', () => {
    for (const mark of DROP_MARKS) {
      const frame = inkFrame(mark, 80, 40);
      expect(frame.left + mark.ink.x0 * frame.width).toBeCloseTo(0, 6);
      expect(frame.left + mark.ink.x1 * frame.width).toBeCloseTo(80, 6);
      expect(frame.top + mark.ink.y0 * frame.height).toBeCloseTo(0, 6);
      expect(frame.top + mark.ink.y1 * frame.height).toBeCloseTo(40, 6);
    }
  });
});

describe('inkAspect (the shape that gets laid out)', () => {
  it('is the aspect of the paint, not of the file', () => {
    expect(inkAspect(EDGE)).toBeCloseTo((85 / 512) * 0.271, 5);
    expect(inkAspect(STREAK)).toBeGreaterThan(8);
  });
});

describe('placeSpots (finding the empty paper)', () => {
  it('keeps every spot clear of the copy', () => {
    const spots = placeSpots(CARD.w, CARD.h, CARD_OBSTACLES, { count: 3, min: 19 });
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      for (const box of CARD_OBSTACLES) {
        const dx = Math.max(box.x - spot.x, 0, spot.x - (box.x + box.w));
        const dy = Math.max(box.y - spot.y, 0, spot.y - (box.y + box.h));
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(19);
      }
    }
  });

  it('does not pile the next spot onto the last', () => {
    const spots = placeSpots(CARD.w, CARD.h, CARD_OBSTACLES, { count: 3, min: 19 });
    for (let i = 1; i < spots.length; i++) {
      expect(Math.hypot(spots[i]!.x - spots[0]!.x, spots[i]!.y - spots[0]!.y)).toBeGreaterThan(0);
    }
  });

  it('finds nothing on a surface that is all content', () => {
    expect(placeSpots(120, 40, [{ x: -20, y: -20, w: 160, h: 80 }], { count: 3 })).toEqual([]);
  });
});

describe('planDrop (what a member of a run intends)', () => {
  it('is stable for the same index and seed', () => {
    expect(planDrop(3, 77)).toEqual(planDrop(3, 77));
  });

  it('starts consecutive members from different marks', () => {
    for (let i = 0; i < 12; i++) {
      expect(planDrop(i, 5).order[0]!.id).not.toBe(planDrop(i + 1, 5).order[0]!.id);
    }
  });

  it('sends consecutive members to opposite edges', () => {
    expect(planDrop(0, 5).prefer).not.toBe(planDrop(1, 5).prefer);
  });

  it('offers every mark, so a member always has something to fall back on', () => {
    const ids = planDrop(2, 9).order.map((m) => m.id);
    expect(new Set(ids).size).toBe(DROP_MARKS.length);
  });

  it('varies size and angle without running away', () => {
    for (let i = 0; i < 20; i++) {
      const plan = planDrop(i, 31);
      expect(plan.scale).toBeGreaterThanOrEqual(0.86);
      expect(plan.scale).toBeLessThanOrEqual(1.18);
      expect(Math.abs(plan.turn)).toBeLessThanOrEqual(23);
    }
    const scales = new Set(Array.from({ length: 20 }, (_, i) => planDrop(i, 31).scale));
    expect(scales.size).toBeGreaterThan(10);
  });
});

/** Whether a box's inscribed region lands on any obstacle, as the placer tests it. */
function clashes(drop: { left: number; top: number; width: number; height: number }, boxes: readonly Box[]) {
  const x = drop.left + drop.width * 0.15;
  const y = drop.top + drop.height * 0.15;
  const w = drop.width * 0.7;
  const h = drop.height * 0.7;
  return boxes.some((b) => b.x < x + w && b.x + b.w > x && b.y < y + h && b.y + b.h > y);
}

describe('layOutDrops (turning spots into marks)', () => {
  const lay = (index: number, avoid: readonly DropSignature[] = []) => {
    const plan = planDrop(index, 11);
    const spots = placeSpots(CARD.w, CARD.h, CARD_OBSTACLES, { count: 3 });
    return layOutDrops(plan, CARD.w, CARD.h, spots, CARD_OBSTACLES, { avoid });
  };

  it('keeps free marks off the copy', () => {
    for (let i = 0; i < 6; i++) {
      for (const drop of lay(i)) {
        if (drop.mark.anchor !== 'free') continue;
        expect(clashes(drop, CARD_OBSTACLES)).toBe(false);
      }
    }
  });

  it('only lets a spanning mark take a band with no text in it', () => {
    for (let i = 0; i < 6; i++) {
      for (const drop of lay(i)) {
        if (drop.mark.anchor === 'horizontal') {
          const hit = CARD_OBSTACLES.some((b) => b.y < drop.top + drop.height && b.y + b.h > drop.top);
          expect(hit).toBe(false);
        }
        if (drop.mark.anchor === 'vertical') {
          const hit = CARD_OBSTACLES.some((b) => b.x < drop.left + drop.width && b.x + b.w > drop.left);
          expect(hit).toBe(false);
        }
      }
    }
  });

  it('draws an anchored mark once and a free one at most twice', () => {
    for (let i = 0; i < 8; i++) {
      const counts = new Map<string, number>();
      for (const drop of lay(i)) counts.set(drop.mark.id, (counts.get(drop.mark.id) ?? 0) + 1);
      for (const [id, n] of counts) {
        const mark = DROP_MARKS.find((m) => m.id === id)!;
        expect(n).toBeLessThanOrEqual(mark.anchor === 'free' ? 2 : 1);
      }
    }
  });

  it('turns and mirrors a repeated free mark well away from the first', () => {
    for (let i = 0; i < 8; i++) {
      const free = lay(i).filter((d) => d.mark.anchor === 'free');
      if (free.length < 2) continue;
      expect(free[1]!.flip).toBe(-free[0]!.flip);
      expect(Math.abs(free[1]!.rotation - free[0]!.rotation)).toBeGreaterThanOrEqual(60);
    }
  });

  it('never repeats a neighbour on the mark that reads', () => {
    for (let i = 1; i < 10; i++) {
      const before = signaturesOf(lay(i - 1));
      const mine = lay(i, before);
      if (mine.length === 0 || before.length === 0) continue;
      const lead = mine[0]!;
      expect({ id: lead.mark.id, side: lead.side }).not.toEqual(before[0]);
    }
  });

  it('still prefers to dodge the neighbour with its smaller marks', () => {
    // Four marks over three spots cannot avoid all three of a neighbour's, so
    // the rest of the list is a preference. It should still be doing work.
    let dodged = 0;
    for (let i = 1; i < 10; i++) {
      const before = signaturesOf(lay(i - 1));
      const mine = signaturesOf(lay(i, before));
      if (mine.some((sig) => !before.some((b) => b.id === sig.id && b.side === sig.side))) dodged++;
    }
    expect(dodged).toBeGreaterThan(0);
  });

  it('would rather draw a smaller mark than leave the spot empty', () => {
    // Every signature the surface could possibly want, so the constraint can
    // only be honoured by drawing nothing at all.
    const everything: DropSignature[] = DROP_MARKS.flatMap((m) => [
      { id: m.id, side: 'free' as const },
      { id: m.id, side: 'near' as const },
      { id: m.id, side: 'far' as const },
    ]);
    const plan = planDrop(4, 11);
    const spots = placeSpots(CARD.w, CARD.h, CARD_OBSTACLES, { count: 3 });
    const drops = layOutDrops(plan, CARD.w, CARD.h, spots, CARD_OBSTACLES, { avoid: everything });
    expect(drops.length).toBeGreaterThan(0);
  });

  it('scales every peak together', () => {
    const plan = planDrop(1, 11);
    const spots = placeSpots(CARD.w, CARD.h, CARD_OBSTACLES, { count: 3 });
    const full = layOutDrops(plan, CARD.w, CARD.h, spots, CARD_OBSTACLES);
    const half = layOutDrops(plan, CARD.w, CARD.h, spots, CARD_OBSTACLES, { peak: 0.5 });
    expect(half.map((d) => d.peak)).toEqual(full.map((d) => d.peak * 0.5));
  });

  it('starts an edge mark reveal off the surface it bleeds from', () => {
    for (let i = 0; i < 8; i++) {
      for (const drop of lay(i)) {
        if (drop.side === 'near') expect(Math.min(drop.origin.x, drop.origin.y)).toBeLessThan(0.25);
        if (drop.side === 'far') expect(Math.max(drop.origin.x, drop.origin.y)).toBeGreaterThan(0.75);
      }
    }
  });
});

describe('washDrop (a control that is all label)', () => {
  it('covers the control it sits behind', () => {
    const drop = washDrop(planDrop(0, 3), 168, 40)[0]!;
    expect(drop.left).toBeLessThanOrEqual(0);
    expect(drop.top).toBeLessThanOrEqual(0);
    expect(drop.left + drop.width).toBeGreaterThanOrEqual(168);
    expect(drop.top + drop.height).toBeGreaterThanOrEqual(40);
  });

  it('draws one free mark, never an edge', () => {
    for (let i = 0; i < 8; i++) {
      const drops = washDrop(planDrop(i, 3), 168, 40);
      expect(drops).toHaveLength(1);
      expect(drops[0]!.mark.anchor).toBe('free');
    }
  });

  it('holds the wash back, because it sits under the label', () => {
    expect(washDrop(planDrop(0, 3), 168, 40)[0]!.peak).toBeLessThan(0.6);
  });
});

describe('a run of surfaces', () => {
  it('never draws the same mark in the same place twice in a row', () => {
    const rows = { w: 420, h: 62 };
    const obstacles: Box[] = [
      { x: 8, y: 10, w: 120, h: 24 },
      { x: 8, y: 32, w: 180, h: 20 },
      { x: 392, y: 22, w: 20, h: 20 },
    ];
    let previous: DropSignature[] = [];
    let before: PlacedDrop | undefined;
    for (let i = 0; i < 8; i++) {
      const plan = planDrop(i, 1234);
      const spots = placeSpots(rows.w, rows.h, obstacles, { count: 2 });
      const drops = layOutDrops(plan, rows.w, rows.h, spots, obstacles, { avoid: previous });
      const lead = drops[0];
      if (lead && before) {
        // A row this tight has room for one mark and one only, so the run can
        // only vary how it is drawn. Stamping it identically is the fault the
        // allocator exists to stop.
        const repeated = lead.mark.id === before.mark.id && lead.side === before.side;
        if (repeated) {
          const turned = Math.abs(lead.rotation - before.rotation) >= 10;
          const resized = Math.abs(lead.width - before.width) / before.width >= 0.05;
          expect(lead.flip !== before.flip || turned || resized).toBe(true);
        }
      }
      before = lead;
      previous = signaturesOf(drops);
    }
    expect(before).toBeDefined();
  });
});

describe('an edge mark keeps the shape it was painted at', () => {
  it('never compresses a mark far past its own aspect', () => {
    const surfaces = [
      { w: 364, h: 101 },
      { w: 420, h: 62 },
      { w: 260, h: 220 },
      { w: 900, h: 140 },
    ];
    for (const surface of surfaces) {
      const obstacles: Box[] = [{ x: surface.w * 0.2, y: surface.h * 0.3, w: surface.w * 0.3, h: 20 }];
      for (let i = 0; i < 6; i++) {
        const spots = placeSpots(surface.w, surface.h, obstacles, { count: 3 });
        for (const drop of layOutDrops(planDrop(i, 7), surface.w, surface.h, spots, obstacles)) {
          if (drop.mark.anchor === 'free') continue;
          const natural = inkAspect(drop.mark);
          const drawn = drop.width / drop.height;
          // A hairline stretched five times stops being a mark and becomes a
          // slab, which is what this bound exists to stop.
          expect(Math.max(drawn / natural, natural / drawn)).toBeLessThanOrEqual(2.5 + 1e-6);
        }
      }
    }
  });
});


describe('markBudget (what a small surface can carry)', () => {
  it('leaves a roomy surface alone', () => {
    expect(markBudget(364, 3)).toBe(3);
    expect(markBudget(900, 3)).toBe(3);
  });

  it('drops a phone-width card to two', () => {
    expect(markBudget(300, 3)).toBe(2);
    expect(markBudget(339, 3)).toBe(2);
  });

  it('gives a very narrow surface one mark', () => {
    expect(markBudget(180, 3)).toBe(1);
  });

  it('never asks for more than the host wanted', () => {
    for (const w of [120, 260, 400, 1200]) {
      for (const requested of [1, 2, 3]) {
        expect(markBudget(w, requested)).toBeLessThanOrEqual(requested);
        expect(markBudget(w, requested)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('costs what the budget says it does', () => {
    const obstacles: Box[] = [{ x: 20, y: 20, w: 120, h: 40 }];
    const two = placeSpots(300, 200, obstacles, { count: markBudget(300, 3) });
    expect(two.length).toBeLessThanOrEqual(2);
  });
});
