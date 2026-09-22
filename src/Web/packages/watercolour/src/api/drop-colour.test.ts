import { describe, expect, it } from 'vitest';
import { PALETTE_IDS } from '../types';
import {
  PALETTE_PIGMENTS,
  SURFACE_TINT_ALPHA,
  dominantPigment,
  surfaceTint,
  tintFilter,
} from './drop-colour';

describe('PALETTE_PIGMENTS (the paint, without reading a pixel)', () => {
  it('covers every palette the engine ships', () => {
    for (const id of PALETTE_IDS) expect(PALETTE_PIGMENTS[id]).toBeDefined();
  });

  it('gives each role a colour a stylesheet can use', () => {
    for (const id of PALETTE_IDS) {
      for (const channel of Object.values(PALETTE_PIGMENTS[id])) {
        expect(channel).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
      }
    }
  });

  it('reads a palette by its base wash', () => {
    expect(dominantPigment('ember')).toBe(PALETTE_PIGMENTS.ember.baseWash);
    expect(dominantPigment('water')).not.toBe(dominantPigment('ember'));
  });
});

describe('tintFilter (steering a baked mark)', () => {
  it('does nothing when the bake is already right', () => {
    expect(tintFilter('water', 'water')).toBeUndefined();
  });

  it('always turns the short way round the wheel', () => {
    for (const from of PALETTE_IDS) {
      for (const to of PALETTE_IDS) {
        const filter = tintFilter(from, to);
        if (!filter) continue;
        const turn = Number(/hue-rotate\((-?[\d.]+)deg\)/.exec(filter)![1]);
        expect(Math.abs(turn)).toBeLessThanOrEqual(180);
      }
    }
  });

  it('lands the mark on the hue it was asked for', () => {
    // water sits at 209 deg and ember at 23, which is 174 deg the long-looking
    // way round and the short way in fact.
    const turn = Number(/hue-rotate\((-?[\d.]+)deg\)/.exec(tintFilter('water', 'ember')!)![1]);
    expect(((209 + turn) % 360 + 360) % 360).toBeCloseTo(23, 4);
  });

  it('opens up the saturation for a more saturated target', () => {
    const gain = Number(/saturate\(([\d.]+)\)/.exec(tintFilter('slate', 'ember')!)![1]);
    expect(gain).toBeGreaterThan(1);
  });

  it('pulls it back for a duller one', () => {
    const gain = Number(/saturate\(([\d.]+)\)/.exec(tintFilter('ember', 'slate')!)![1]);
    expect(gain).toBeLessThan(1);
  });
});

describe('surfaceTint (a surface taking colour from its paint)', () => {
  it('carries the pigment at the alpha asked for', () => {
    expect(surfaceTint('moss', SURFACE_TINT_ALPHA)).toBe(
      PALETTE_PIGMENTS.moss.baseWash.replace('rgb(', 'rgba(').replace(')', `, ${SURFACE_TINT_ALPHA.toFixed(3)})`),
    );
  });

  it('stays a wash rather than a coloured card', () => {
    expect(SURFACE_TINT_ALPHA).toBeLessThan(0.1);
  });

  it('is invisible at zero, so the tint can be transitioned in', () => {
    expect(surfaceTint('water', 0)).toContain('0.000');
  });
});
