import { describe, expect, it } from 'vitest';
import { artworkAspect, detailForEdge, seedFromName } from '../types';
import { artworkOptionsFrom, containBox, hostSurface } from './helpers';

describe('detailForEdge (size to detail)', () => {
  it('maps the backing long edge to the catalogue detail level', () => {
    expect(detailForEdge(0)).toBe('small');
    expect(detailForEdge(32)).toBe('small');
    expect(detailForEdge(63)).toBe('small');
    expect(detailForEdge(64)).toBe('medium');
    expect(detailForEdge(96)).toBe('medium');
    expect(detailForEdge(191)).toBe('medium');
    expect(detailForEdge(192)).toBe('large');
    expect(detailForEdge(319)).toBe('large');
    expect(detailForEdge(320)).toBe('extraLarge');
    expect(detailForEdge(512)).toBe('extraLarge');
  });
});

describe('seedFromName (name to seed)', () => {
  it('is deterministic per name', () => {
    expect(seedFromName('Sam Okafor')).toBe(seedFromName('Sam Okafor'));
  });

  it('differs between names', () => {
    expect(seedFromName('Sam Okafor')).not.toBe(seedFromName('Priya Natarajan'));
  });

  it('matches FNV-1a for the empty string', () => {
    expect(seedFromName('')).toBe(0x811c9dc5);
  });

  it('stays within uint32 range', () => {
    const seed = seedFromName('a deliberately long name that wraps the hash more than once');
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('artworkOptionsFrom (prop to option)', () => {
  it('passes through every provided option', () => {
    const options = artworkOptionsFrom({
      palette: 'ember',
      seed: 7,
      intensity: 0.5,
      durationMs: 900,
      motion: 'full',
      quality: 'high',
      mode: 'baked',
      autoplay: 'never',
    });
    expect(options).toEqual({
      palette: 'ember',
      seed: 7,
      intensity: 0.5,
      durationMs: 900,
      motion: 'full',
      quality: 'high',
      mode: 'baked',
      autoplay: 'never',
    });
  });

  it('applies defaults for unset options', () => {
    const options = artworkOptionsFrom({}, { mode: 'static', autoplay: 'once' });
    expect(options.mode).toBe('static');
    expect(options.autoplay).toBe('once');
  });

  it('lets an explicit option win over its default', () => {
    const options = artworkOptionsFrom({ mode: 'live' }, { mode: 'static' });
    expect(options.mode).toBe('live');
  });
});

describe('hostSurface', () => {
  it('defaults to light with no DOM or dark preference', () => {
    expect(hostSurface()).toBe('light');
  });
});

describe('artworkAspect (per-artwork aspect table)', () => {
  it('keeps icons square and scenes/accents at their authored ratio', () => {
    expect(artworkAspect('crescent-moon')).toBe(1);
    expect(artworkAspect('avatar-wash')).toBe(1);
    expect(artworkAspect('tab-underline')).toBe(8);
    expect(artworkAspect('selection-edge')).toBe(1 / 6);
    expect(artworkAspect('header-motif')).toBe(5);
    expect(artworkAspect('confirmation-background')).toBe(3);
    expect(artworkAspect('distant-mountains')).toBe(2);
    expect(artworkAspect('moonlit-shoreline')).toBeCloseTo(16 / 9, 5);
  });
});

describe('containBox (aspect-fit canvas box)', () => {
  it('fits the largest box of the aspect inside the container and centres it', () => {
    expect(containBox(743, 128, 2)).toEqual({ width: 256, height: 128, offsetX: 243.5, offsetY: 0 });
    const box = containBox(235, 172, 3);
    expect(box.width).toBe(235);
    expect(box.height).toBeCloseTo(235 / 3, 5);
    expect(box.offsetX).toBe(0);
    expect(box.offsetY).toBeCloseTo((172 - 235 / 3) / 2, 5);
  });

  it('fills the container when the aspect already matches', () => {
    expect(containBox(160, 32, 5)).toEqual({ width: 160, height: 32, offsetX: 0, offsetY: 0 });
  });

  it('anchors to the bottom-left instead of centring', () => {
    const box = containBox(235, 172, 3, 'bottom-left');
    expect(box.width).toBe(235);
    expect(box.height).toBeCloseTo(235 / 3, 5);
    expect(box.offsetX).toBe(0);
    expect(box.offsetY).toBeCloseTo(172 - 235 / 3, 5);
  });
});