import { describe, expect, it } from 'vitest';
import { MAX_LIVE_SIM_RESOLUTION, detailForEdge, simResolutionForEdge } from '../types';

describe('detailForEdge (backing long edge to detail tier)', () => {
  it('steps through the four tiers at the documented thresholds', () => {
    expect(detailForEdge(0)).toBe('small');
    expect(detailForEdge(63)).toBe('small');
    expect(detailForEdge(64)).toBe('medium');
    expect(detailForEdge(191)).toBe('medium');
    expect(detailForEdge(192)).toBe('large');
    expect(detailForEdge(319)).toBe('large');
    expect(detailForEdge(320)).toBe('extraLarge');
    expect(detailForEdge(900)).toBe('extraLarge');
  });

  it('treats a negative edge as small', () => {
    expect(detailForEdge(-5)).toBe('small');
  });
});

describe('simResolutionForEdge (backing long edge to sim grid)', () => {
  it('rounds up to a multiple of 32 and floors at the sim minimum', () => {
    expect(simResolutionForEdge(253)).toBe(256);
    expect(simResolutionForEdge(450)).toBe(256);
    expect(simResolutionForEdge(384)).toBe(256);
    expect(simResolutionForEdge(64)).toBe(64);
    expect(simResolutionForEdge(31)).toBe(64);
    expect(simResolutionForEdge(0)).toBe(64);
  });

  it('caps at the live ceiling, whatever the display asks for', () => {
    expect(simResolutionForEdge(512)).toBe(MAX_LIVE_SIM_RESOLUTION);
    expect(simResolutionForEdge(900)).toBe(MAX_LIVE_SIM_RESOLUTION);
    expect(simResolutionForEdge(4096)).toBe(MAX_LIVE_SIM_RESOLUTION);
  });
});