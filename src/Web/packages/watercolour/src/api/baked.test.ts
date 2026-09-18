import { describe, expect, it } from 'vitest';
import { MAX_BAKED_FRAMES, MAX_BAKED_FRAME_EDGE, parseBakedManifest, stripFramePosition } from './baked';
import { WatercolourError } from './errors';

const valid = { version: 1, frames: 12, width: 256, height: 256, durationMs: 600, layout: 'vertical' };

describe('parseBakedManifest', () => {
  it('accepts the baked format and a JSON string of it', () => {
    expect(parseBakedManifest(valid)).toEqual(valid);
    expect(parseBakedManifest(JSON.stringify(valid))).toEqual(valid);
  });

  it('rejects other versions with a typed error', () => {
    const attempt = () => parseBakedManifest({ ...valid, version: 2 });
    expect(attempt).toThrow(WatercolourError);
    expect(attempt).toThrow(/version 2/);
    try {
      attempt();
    } catch (error) {
      expect((error as WatercolourError).code).toBe('UnsupportedVersion');
    }
  });

  it('enforces the frame and edge caps and the layout', () => {
    expect(() => parseBakedManifest({ ...valid, frames: MAX_BAKED_FRAMES + 1 })).toThrow(/frames/);
    expect(() => parseBakedManifest({ ...valid, frames: 0 })).toThrow(/frames/);
    expect(() => parseBakedManifest({ ...valid, width: MAX_BAKED_FRAME_EDGE + 1 })).toThrow(/edges/);
    expect(() => parseBakedManifest({ ...valid, height: 2.5 })).toThrow(/edges/);
    expect(() => parseBakedManifest({ ...valid, layout: 'horizontal' })).toThrow(/layout/);
    expect(() => parseBakedManifest({ ...valid, durationMs: 0 })).toThrow(/durationMs/);
    expect(() => parseBakedManifest('not json')).toThrow(/not JSON/);
    expect(() => parseBakedManifest(null)).toThrow(/not an object/);
  });
});

describe('stripFramePosition', () => {
  it('lands on exact frames at the ends and blends between neighbours', () => {
    expect(stripFramePosition(0, 12)).toEqual({ from: 0, to: 1, blend: 0 });
    expect(stripFramePosition(1, 12)).toEqual({ from: 11, to: 11, blend: 0 });
    const mid = stripFramePosition(0.5, 12);
    expect(mid.from).toBe(5);
    expect(mid.to).toBe(6);
    expect(mid.blend).toBeCloseTo(0.5);
  });

  it('clamps out-of-range progress and degenerate frame counts', () => {
    expect(stripFramePosition(-1, 12)).toEqual({ from: 0, to: 1, blend: 0 });
    expect(stripFramePosition(2, 12)).toEqual({ from: 11, to: 11, blend: 0 });
    expect(stripFramePosition(Number.NaN, 12)).toEqual({ from: 11, to: 11, blend: 0 });
    expect(stripFramePosition(0.3, 1)).toEqual({ from: 0, to: 0, blend: 0 });
  });

  it('is monotone in progress', () => {
    let last = 0;
    for (let i = 0; i <= 100; i++) {
      const { from, blend } = stripFramePosition(i / 100, 16);
      const position = from + blend;
      expect(position).toBeGreaterThanOrEqual(last);
      last = position;
    }
    expect(last).toBe(15);
  });
});
