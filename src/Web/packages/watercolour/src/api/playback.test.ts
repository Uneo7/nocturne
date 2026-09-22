import { describe, expect, it } from 'vitest';
import type { IconNode } from '../types';
import { iconStaticBackend } from './playback';

const clock: IconNode[] = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['path', { d: 'M12 6v6l4 2' }],
];

describe('iconStaticBackend', () => {
  it('draws the baked final for an icon that has one', () => {
    expect(iconStaticBackend({ icon: clock, name: 'database' }, true)).toBe('baked');
  });

  it('falls to the plain SVG for an icon that is not baked', () => {
    expect(iconStaticBackend({ icon: clock, name: 'clock' }, false)).toBe('svg');
  });

  it('never routes an artwork source to the SVG backend', () => {
    expect(iconStaticBackend(undefined, false)).toBe('baked');
  });
});