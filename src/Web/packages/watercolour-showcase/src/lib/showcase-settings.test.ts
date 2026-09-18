import { describe, expect, it } from 'vitest';
import { SHOWCASE_DEFAULTS, ShowcaseSettings } from './showcase-settings.svelte';

describe('ShowcaseSettings', () => {
  it('starts from the documented defaults', () => {
    const s = new ShowcaseSettings();
    expect(s.mode).toBe('auto');
    expect(s.motion).toBe('auto');
    expect(s.palette).toBe('moonlight');
    expect(s.seed).toBe(SHOWCASE_DEFAULTS.seed);
    expect(s.quality).toBe('auto');
    expect(s.previewBackground).toBe('system');
  });

  it('forwards only artwork options', () => {
    const s = new ShowcaseSettings();
    s.palette = 'ember';
    s.seed = 7;
    expect(s.options).toEqual({ palette: 'ember', seed: 7, mode: 'auto', motion: 'auto', quality: 'auto' });
    expect(s.options).not.toHaveProperty('previewBackground');
  });

  it('reset restores every default', () => {
    const s = new ShowcaseSettings();
    s.mode = 'static';
    s.motion = 'full';
    s.palette = 'slate';
    s.seed = 99;
    s.quality = 'high';
    s.previewBackground = 'dark';
    s.reset();
    expect(s.options).toEqual({
      palette: SHOWCASE_DEFAULTS.palette,
      seed: SHOWCASE_DEFAULTS.seed,
      mode: SHOWCASE_DEFAULTS.mode,
      motion: SHOWCASE_DEFAULTS.motion,
      quality: SHOWCASE_DEFAULTS.quality,
    });
    expect(s.previewBackground).toBe('system');
  });
});
