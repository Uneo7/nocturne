import type { ArtworkId, PaletteId } from '../types';

/**
 * How a mark was painted, which decides how it may be placed. A disc is a free
 * drop and can sit anywhere at any angle. The others were painted against an
 * edge and only read flush to one. A corner wash floated in the middle of a
 * card, rotated, looks like a mistake.
 */
export type DropAnchor = 'free' | 'horizontal' | 'vertical';

/**
 * Which of the two edges an anchored mark took, or `free` for a drop that took
 * neither. Recorded so a run of surfaces can be stopped from all wearing the
 * same right-hand stripe.
 */
export type DropSide = 'near' | 'far' | 'free';

/** Where the paint sits inside the artwork's own frame, as a fraction of it. */
export interface InkExtent {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DropMark {
  id: ArtworkId;
  palette: PaletteId;
  aspect: number;
  anchor: DropAnchor;
  ink: InkExtent;
}

/**
 * The catalogue's abstract marks. Nothing with a recognisable subject belongs
 * here: beside a Lucide glyph, an apple or a heart reads as a second icon.
 *
 * `ink` is measured off the baked stills and is not always centred:
 * `selection-edge` paints only the left 27 % of its own frame. A mark placed
 * by its frame therefore lands somewhere other than asked, so everything below
 * is placed by ink.
 */
export const DROP_MARKS: readonly DropMark[] = [
  {
    id: 'avatar-wash',
    palette: 'water',
    aspect: 1,
    anchor: 'free',
    ink: { x0: 0.129, x1: 0.813, y0: 0.129, y1: 0.811 },
  },
  {
    id: 'confirmation-background',
    palette: 'moss',
    aspect: 512 / 171,
    anchor: 'horizontal',
    ink: { x0: 0, x1: 1, y0: 0, y1: 1 },
  },
  {
    id: 'tab-underline',
    palette: 'ember',
    aspect: 8,
    anchor: 'horizontal',
    ink: { x0: 0.033, x1: 1, y0: 0.328, y1: 0.719 },
  },
  {
    id: 'selection-edge',
    palette: 'water',
    aspect: 85 / 512,
    anchor: 'vertical',
    ink: { x0: 0, x1: 0.271, y0: 0, y1: 1 },
  },
];

/** The aspect of the ink alone, which is what gets laid out. */
export const inkAspect = (m: DropMark) =>
  (m.aspect * (m.ink.x1 - m.ink.x0)) / (m.ink.y1 - m.ink.y0);

/**
 * The artwork's frame, sized and offset so its ink lands exactly on a `w` by
 * `h` box. The frame is what the engine paints into, so this is the one place
 * that knows a mark's paint is off-centre inside it.
 */
export function inkFrame(m: DropMark, w: number, h: number) {
  const fw = m.ink.x1 - m.ink.x0;
  const fh = m.ink.y1 - m.ink.y0;
  const width = w / fw;
  const height = h / fh;
  return { width, height, left: -m.ink.x0 * width, top: -m.ink.y0 * height };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clearance(x: number, y: number, boxes: readonly Box[]): number {
  let best = Infinity;
  for (const b of boxes) {
    const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
    const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
    const d = Math.hypot(dx, dy);
    if (d === 0) return 0;
    if (d < best) best = d;
  }
  return best;
}

export interface Spot {
  x: number;
  y: number;
  r: number;
}

/**
 * How far apart the candidate points are, for a surface of this size.
 *
 * The search is a grid sweep, so its cost goes as the area over the square of
 * the step: a fixed 4 px costs 0.5 ms on a feature card but 8 ms on a large
 * one, and that runs per surface. Scaling the step with the surface keeps the
 * cost roughly flat, and it costs nothing visible - the marks it is placing
 * are a hundred pixels across, so a few pixels of slack in where the roomiest
 * point sits cannot be seen. Small surfaces keep the fine step they need.
 */
export function searchStep(cw: number, ch: number): number {
  return Math.min(12, Math.max(4, Math.round(Math.min(cw, ch) / 16)));
}

/**
 * How many marks a surface of this size can carry without crowding.
 *
 * Cost is linear in the count - on a 364x101 card one mark is 0.065 ms, two
 * 0.137 ms and three 0.280 ms - and a phone-width card has nowhere to put a
 * third anyway. Narrowing the budget is both cheaper and, on a small surface,
 * better looking.
 */
export function markBudget(cw: number, requested: number): number {
  if (cw < 240) return Math.min(requested, 1);
  if (cw < 340) return Math.min(requested, 2);
  return requested;
}

/**
 * Greedy largest-first: claim the roomiest point on the surface, then treat
 * that claim as an obstacle so the next mark cannot pile onto it.
 *
 * The clearance field is swept once, against the obstacles, and each claim
 * then repairs only the part of it the claim can reach. A claim cannot lower
 * a cell further away than the best clearance on the surface, because that
 * cell's distance to the claim already exceeds every clearance there is - so
 * the repair is exact, not an approximation, and a rescan per mark is waste.
 */
export function placeSpots(
  cw: number,
  ch: number,
  obstacles: readonly Box[],
  { count = 3, min = 19, step = searchStep(cw, ch) } = {},
): Spot[] {
  const xs: number[] = [];
  for (let x = -6; x <= cw + 6; x += step) xs.push(x);
  const ys: number[] = [];
  for (let y = -6; y <= ch + 6; y += step) ys.push(y);

  const clear = new Float64Array(xs.length * ys.length);
  /**
   * The roomiest cell anywhere, which bounds every later repair.
   *
   * It is not the clearance of the cell that wins - the score penalises the
   * surface edge, so a penalised cell can be roomier than the winner - and
   * using the winner's would leave cells beyond it un-repaired.
   */
  let reach = 0;
  for (let iy = 0; iy < ys.length; iy++) {
    for (let ix = 0; ix < xs.length; ix++) {
      const r = clearance(xs[ix]!, ys[iy]!, obstacles);
      clear[iy * xs.length + ix] = r;
      if (r > reach) reach = r;
    }
  }

  const out: Spot[] = [];
  for (let n = 0; n < count; n++) {
    let best: (Spot & { score: number }) | null = null;
    // Scanned in the same order as the field was built, so a tie still falls
    // to the first cell that reached the score.
    for (let iy = 0; iy < ys.length; iy++) {
      const y = ys[iy]!;
      for (let ix = 0; ix < xs.length; ix++) {
        const r = clear[iy * xs.length + ix]!;
        if (r < min) continue;
        const x = xs[ix]!;
        // A mark may run off the surface edge, so being near one is not
        // penalised as hard as crowding the text.
        const score = r + Math.min(0, Math.min(x, y, cw - x, ch - y)) * 0.25;
        if (!best || score > best.score) best = { x, y, r, score };
      }
    }
    if (!best) break;
    out.push({ x: best.x, y: best.y, r: best.r });
    if (n + 1 === count) break;

    const box = { x: best.x - best.r * 0.8, y: best.y - best.r * 0.8, w: best.r * 1.6, h: best.r * 1.6 };
    // A cell further from the claim than the roomiest cell on the surface
    // already has a distance no claim can lower it past.
    const x0 = box.x - reach;
    const x1 = box.x + box.w + reach;
    const y0 = box.y - reach;
    const y1 = box.y + box.h + reach;
    for (let iy = 0; iy < ys.length; iy++) {
      const y = ys[iy]!;
      if (y < y0 || y > y1) continue;
      const dy = Math.max(box.y - y, 0, y - (box.y + box.h));
      for (let ix = 0; ix < xs.length; ix++) {
        const x = xs[ix]!;
        if (x < x0 || x > x1) continue;
        const at = iy * xs.length + ix;
        if (clear[at] === 0) continue;
        const dx = Math.max(box.x - x, 0, x - (box.x + box.w));
        const d = dx === 0 && dy === 0 ? 0 : Math.hypot(dx, dy);
        if (d < clear[at]!) clear[at] = d;
      }
    }
  }
  return out;
}

/**
 * Whether a box lands on any obstacle.
 *
 * A free mark is roughly round, so the corners of its box are empty paper. The
 * test shrinks the box to the inscribed square, rather than reporting a clip
 * the eye will never see.
 */
function overlaps(box: Box, obstacles: readonly Box[]): boolean {
  const inset = { x: box.x + box.w * 0.15, y: box.y + box.h * 0.15, w: box.w * 0.7, h: box.h * 0.7 };
  return obstacles.some(
    (b) =>
      b.x < inset.x + inset.w && b.x + b.w > inset.x && b.y < inset.y + inset.h && b.y + b.h > inset.y,
  );
}

/** A mark drawn at a side, which is what a neighbour must not repeat. */
export interface DropSignature {
  id: ArtworkId;
  side: DropSide;
}

export interface PlacedDrop {
  mark: DropMark;
  /** The ink box, in surface coordinates. */
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  flip: 1 | -1;
  peak: number;
  side: DropSide;
  /**
   * Where the brush touched down, as a fraction of the ink box.
   *
   * The mask reveal spreads from here rather than from the middle. A mark that
   * runs off an edge therefore arrives from the paper it bleeds off.
   */
  origin: { x: number; y: number };
}

/** How much of an edge mark's width stays on the surface; the rest bleeds off. */
const ON_CARD = 0.62;
/** An edge mark is stretched toward this thickness: its ink is a hairline at surface scale. */
const EDGE_WEIGHT = 26;
/**
 * The most an edge mark's aspect may be pushed away from the one it was
 * painted at.
 *
 * `selection-edge` is a 1:23 hairline, so stretching it to a readable 26 px
 * across a card compresses it nearly five times and the wash stops being a
 * mark: it reads as a hard blue slab down the border. A painted line that is
 * thin is still a line.
 */
const EDGE_STRETCH = 2.5;

/** An edge mark's thickness: readable, but never distorted past {@link EDGE_STRETCH}. */
function edgeWeight(natural: number): number {
  return Math.max(natural, Math.min(EDGE_WEIGHT, natural * EDGE_STRETCH));
}
/** A free drop may hang off the surface, but not so far that only a sliver is left. */
const MIN_ON = 0.45;
const PEAKS = [0.8, 0.5, 0.32];

/**
 * The per-member decisions a group makes before anything is measured. They
 * are the order marks are tried in, the edge to reach for, and the variation
 * in size and angle.
 *
 * A plan is deterministic in the group's seed and the member's index. The same
 * surface therefore paints the same way across renders, and the plan can be
 * reasoned about without a DOM.
 */
export interface DropPlan {
  /** The order marks are tried in. */
  order: readonly DropMark[];
  /** True when the member reaches for the near edge first. */
  prefer: boolean;
  /** Multiplier on a free mark's long edge. */
  scale: number;
  /** Degrees added to a free mark's angle. */
  turn: number;
}

/** xorshift over a 32-bit seed, so a plan is stable without carrying state. */
function mix(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  h ^= h << 13;
  h >>>= 0;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

/**
 * The plan for one member of a run.
 *
 * A run of identical rows all wearing the same mark in the same place is what
 * most obviously breaks the illusion. Consecutive members therefore start from
 * different marks and reach for opposite edges. Size and angle vary too: two
 * neighbours drawing one disc at one size still reads as a repeat.
 */
export function planDrop(index: number, seed = 0, marks: readonly DropMark[] = DROP_MARKS): DropPlan {
  const n = marks.length;
  const noise = mix(seed, index);
  // Stride coprime with the catalogue size, so successive indices lead with
  // successive marks rather than cycling through a subset.
  const stride = n > 2 && n % 3 !== 0 ? 3 : 1;
  const lead = (index * stride + (seed % n)) % n;
  const order: DropMark[] = [];
  for (let i = 0; i < n; i++) order.push(marks[(lead + i) % n]!);
  return {
    order,
    prefer: index % 2 === 0,
    scale: 0.86 + ((noise >>> 8) % 1000) / 1000 * 0.32,
    turn: ((noise >>> 20) % 47) - 23,
  };
}

export interface LayOutOptions {
  /**
   * Marks a neighbour already drew, its own leading mark first.
   *
   * The mark that reads never repeats the neighbour's leading one. The rest of
   * the list is a preference: a smaller mark takes a repeat rather than leave
   * the surface bare. Four marks over three spots cannot avoid every one of a
   * neighbour's three, and the largest is the one the eye compares.
   */
  avoid?: readonly DropSignature[];
  /** Scales every mark's opacity; 1 keeps the tuned peaks. */
  peak?: number;
}

function matches(avoid: readonly DropSignature[], id: ArtworkId, side: DropSide): boolean {
  return avoid.some((a) => a.id === id && a.side === side);
}

/**
 * Turns the spots into marks. Only four abstract marks exist, so variety comes
 * from how each is used rather than from how many there are. A free drop may
 * appear twice on a surface when the second is mirrored and turned well away
 * from the first. An anchored mark may appear once, because the edge fixes it.
 */
export function layOutDrops(
  plan: DropPlan,
  cw: number,
  ch: number,
  spots: readonly Spot[],
  obstacles: readonly Box[],
  { avoid = [], peak = 1 }: LayOutOptions = {},
): PlacedDrop[] {
  const drawn = place(plan, cw, ch, spots, obstacles, avoid, peak);
  // A surface the constraint shut out entirely would rather repeat its
  // neighbour than sit bare, so it drops the constraint and tries again.
  return drawn.length > 0 || avoid.length === 0 ? drawn : place(plan, cw, ch, spots, obstacles, [], peak);
}

function place(
  plan: DropPlan,
  cw: number,
  ch: number,
  spots: readonly Spot[],
  obstacles: readonly Box[],
  avoid: readonly DropSignature[],
  peak: number,
): PlacedDrop[] {
  const used = new Map<string, number>();
  const limit = (m: DropMark) => (m.anchor === 'free' ? 2 : 1);
  const maxLong = Math.min(cw, ch) * 1.35;
  const out: PlacedDrop[] = [];
  const leading = avoid.slice(0, 1);

  /** The rotation the first free drop took, which a second has to clear. */
  let turned: number | undefined;

  spots.forEach((s, i) => {
    // The first mark drawn is the one that reads, so it never repeats a
    // neighbour's. The smaller ones would rather be drawn than be unique, and
    // get a second pass with the constraint dropped.
    const lead = out.length === 0;
    const passes = avoid.length === 0 || lead ? 1 : 2;

    for (let pass = 0; pass < passes; pass++) {
      const veto = lead ? leading : pass === 0 ? avoid : [];
      // A spanning mark cannot dodge text sideways, so it only takes an edge
      // whose whole band is clear. When neither edge qualifies it hands the
      // spot to the next mark rather than leaving it empty.
      for (const mark of plan.order) {
        const seen = used.get(mark.id) ?? 0;
        if (seen >= limit(mark)) continue;

        const ia = inkAspect(mark);
        const long = Math.min(s.r * 2 * (i === 0 ? 1.7 : 1.35) * plan.scale, maxLong);
        let width = ia >= 1 ? long : long * ia;
        let height = ia >= 1 ? long / ia : long;
        let left = s.x - width / 2;
        let top = s.y - height / 2;
        let rotation = plan.turn + ((i * 53) % 70) - 35;
        let side: DropSide = 'free';

        if (mark.anchor === 'horizontal') {
          width = cw * 1.12;
          height = edgeWeight(width / ia);
          left = -cw * 0.06;
          const free = (t: number) => !obstacles.some((b) => b.y < t + height && b.y + b.h > t);
          const near = -height * (1 - ON_CARD);
          const far = ch - height * ON_CARD;
          const order: [number, DropSide][] =
            s.y <= ch / 2 === plan.prefer
              ? [
                  [near, 'near'],
                  [far, 'far'],
                ]
              : [
                  [far, 'far'],
                  [near, 'near'],
                ];
          const choice = order.find(
            ([t, sd]) => free(t) && !matches(veto, mark.id, sd),
          );
          if (!choice) continue;
          top = choice[0];
          side = choice[1];
          rotation = 0;
        } else if (mark.anchor === 'vertical') {
          height = ch * 1.16;
          width = edgeWeight(height * ia);
          top = -ch * 0.08;
          const free = (l: number) => !obstacles.some((b) => b.x < l + width && b.x + b.w > l);
          const near = -width * (1 - ON_CARD);
          const far = cw - width * ON_CARD;
          const order: [number, DropSide][] =
            s.x <= cw / 2 === plan.prefer
              ? [
                  [near, 'near'],
                  [far, 'far'],
                ]
              : [
                  [far, 'far'],
                  [near, 'near'],
                ];
          const choice = order.find(
            ([l, sd]) => free(l) && !matches(veto, mark.id, sd),
          );
          if (!choice) continue;
          left = choice[0];
          side = choice[1];
          rotation = 0;
        } else {
          if (matches(veto, mark.id, 'free')) continue;
          // Keeping the mark on the surface can push it back over the text
          // the spot avoided. It gives up size until it clears again.
          for (let shrink = 0; shrink < 6; shrink++) {
            left = Math.min(Math.max(s.x - width / 2, -width * (1 - MIN_ON)), cw - width * MIN_ON);
            top = Math.min(Math.max(s.y - height / 2, -height * (1 - MIN_ON)), ch - height * MIN_ON);
            if (!overlaps({ x: left, y: top, w: width, h: height }, obstacles)) break;
            width *= 0.82;
            height *= 0.82;
          }
          if (overlaps({ x: left, y: top, w: width, h: height }, obstacles)) continue;
          // A second drop is turned off the first one's angle, not off its
          // own, or two marks a few degrees apart read as a printing fault.
          if (turned !== undefined) rotation = turned + (turned > 0 ? -72 : 72);
          turned = rotation;
        }

        out.push({
          mark,
          left,
          top,
          width,
          height,
          rotation,
          // Consecutive members mirror each other, so a run with only one
          // placeable mark still varies rather than stamping the same disc.
          flip: (seen ? -1 : 1) * (plan.prefer ? 1 : -1) as 1 | -1,
          peak: (PEAKS[i] ?? 0.3) * peak,
          side,
          origin: brushDown(mark, side, left, top, width, height, cw, ch),
        });
        used.set(mark.id, seen + 1);
        return;
      }
    }
  });

  return out;
}

/**
 * Where a mark's reveal starts, as a fraction of its own ink box.
 *
 * An edge mark is loaded at the edge it hugs and drawn along it, so its paint
 * arrives from off the surface. A free drop touches down a little off centre.
 * A brush landing dead centre and spreading evenly reads as a circle opening,
 * not as paint.
 */
function brushDown(
  mark: DropMark,
  side: DropSide,
  left: number,
  top: number,
  width: number,
  height: number,
  cw: number,
  ch: number,
): { x: number; y: number } {
  if (mark.anchor === 'horizontal') return { x: side === 'near' ? 0.12 : 0.88, y: side === 'near' ? 0.2 : 0.8 };
  if (mark.anchor === 'vertical') return { x: side === 'near' ? 0.2 : 0.8, y: side === 'near' ? 0.12 : 0.88 };
  // Toward whichever surface edge the drop hangs off, so it bleeds inward.
  const cx = left + width / 2;
  const cy = top + height / 2;
  return {
    x: cx < cw / 2 ? 0.34 : 0.66,
    y: cy < ch / 2 ? 0.34 : 0.66,
  };
}

/**
 * A single mark washing the whole control rather than taking an edge.
 *
 * A button is nearly all label. An edge mark at hairline weight on a 40 px
 * control barely registers, and there is no empty space for a free drop to
 * find. The wash sits behind the label instead, which the three-layer stack
 * already keeps legible.
 */
export function washDrop(
  plan: DropPlan,
  cw: number,
  ch: number,
  { peak = 1 }: { peak?: number } = {},
): PlacedDrop[] {
  const mark = plan.order.find((m) => m.anchor === 'free') ?? plan.order[0]!;
  const ia = inkAspect(mark);
  // Over-sized, so the dried edge falls outside the control. The eye then
  // reads paint rather than a shape sitting on a button.
  const width = Math.max(cw, ch * ia) * 1.34 * plan.scale;
  const height = width / ia;
  return [
    {
      mark,
      left: (cw - width) / 2 + (plan.prefer ? -cw * 0.08 : cw * 0.08),
      top: (ch - height) / 2,
      width,
      height,
      rotation: plan.turn * 0.7,
      flip: plan.prefer ? 1 : -1,
      peak: 0.46 * peak,
      side: 'free',
      origin: { x: plan.prefer ? 0.3 : 0.7, y: 0.42 },
    },
  ];
}

/** Every signature a set of placements occupies, for a neighbour to avoid. */
export function signaturesOf(drops: readonly PlacedDrop[]): DropSignature[] {
  return drops.map((d) => ({ id: d.mark.id, side: d.side }));
}
