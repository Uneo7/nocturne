import { getContext, hasContext, setContext } from 'svelte';
import type { DropSignature, PlacedDrop } from '../api/drops';

const KEY = Symbol.for('nocturne.watercolour.drop-group');

/**
 * What a run of surfaces shares.
 *
 * Members claim their own index in mount order, so a parent lays out a grid or
 * a list without threading indices by hand. Each then registers what it
 * actually drew, and the next member is told to avoid it.
 */
export interface DropGroupContext {
  /** Claimed once per member, at init. */
  claim(): number;
  readonly seed: number;
  /** What the member before `index` drew, for {@link layOutDrops} to dodge. */
  avoid(index: number): DropSignature[];
  register(index: number, drops: readonly PlacedDrop[]): void;
  release(index: number): void;
}

/**
 * The registry is a plain `Map`, deliberately. A member reads its neighbour's
 * placement while measuring, and a reactive read there would re-run the
 * measurement that wrote it.
 */
export function createDropGroup(seed: number): DropGroupContext {
  const drawn = new Map<number, DropSignature[]>();
  let next = 0;
  return {
    claim: () => next++,
    get seed() {
      return seed;
    },
    avoid: (index) => drawn.get(index - 1) ?? [],
    register: (index, drops) => {
      drawn.set(
        index,
        drops.map((d) => ({ id: d.mark.id, side: d.side })),
      );
    },
    release: (index) => {
      drawn.delete(index);
    },
  };
}

export function setDropGroup(group: DropGroupContext): void {
  setContext(KEY, group);
}

/** The enclosing group, or `undefined` for a surface standing on its own. */
export function getDropGroup(): DropGroupContext | undefined {
  return hasContext(KEY) ? getContext<DropGroupContext>(KEY) : undefined;
}
