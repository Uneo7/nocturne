import { describe, expect, it } from 'vitest';
import manifest from '../../scripts/bake-manifest.json';
import { bundledArtworkIds, defaultPaletteFor, hasBundledAsset, DEFAULT_PALETTE } from './assets';

describe('curated bundle', () => {
  it('falls back to the default palette when the requested one is not baked', () => {
    expect(hasBundledAsset({ id: 'crescent-moon', palette: 'moonlight', surface: 'light' }, 'final')).toBe(true);
    expect(hasBundledAsset({ id: 'crescent-moon', palette: 'ember', surface: 'light' }, 'final')).toBe(true);
    expect(hasBundledAsset({ id: 'crescent-moon', palette: 'ember', surface: 'dark' }, 'final')).toBe(true);
    expect(hasBundledAsset({ id: 'header-motif', palette: 'dusk', surface: 'dark' }, 'strip')).toBe(true);
  });

  it('still reports missing assets for unknown artworks', () => {
    expect(hasBundledAsset({ id: 'does-not-exist' }, 'final')).toBe(false);
    expect(hasBundledAsset({ id: 'crescent-moon', palette: 'moonlight', surface: 'light' }, 'manifest')).toBe(true);
  });

  it('bakes exactly the artworks the manifest lists', () => {
    const manifestIds = manifest.artworks.map((a) => a.id).sort();
    expect(bundledArtworkIds()).toEqual(manifestIds);
    for (const id of manifestIds) {
      expect(DEFAULT_PALETTE[id]).toBeDefined();
      expect(defaultPaletteFor(id)).toBe(DEFAULT_PALETTE[id]);
    }
  });

  it('keeps the manifest palettes in sync with DEFAULT_PALETTE', () => {
    for (const artwork of manifest.artworks) {
      expect(DEFAULT_PALETTE[artwork.id]).toBe(artwork.palette);
    }
  });

  it('defaults unknown artworks to moonlight', () => {
    expect(defaultPaletteFor('no-such-artwork')).toBe('moonlight');
  });
});