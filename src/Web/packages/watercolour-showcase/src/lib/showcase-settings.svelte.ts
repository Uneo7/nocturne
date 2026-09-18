import type { ArtworkMode, ArtworkMotion, ArtworkOptions, ArtworkQuality, PaletteId } from '$lib/artwork';

export type PreviewBackground = 'light' | 'dark' | 'system';

export const SHOWCASE_DEFAULTS = {
  mode: 'auto' as ArtworkMode,
  motion: 'auto' as ArtworkMotion,
  palette: 'moonlight' as PaletteId,
  seed: 1610,
  quality: 'auto' as ArtworkQuality,
  previewBackground: 'system' as PreviewBackground,
};

export class ShowcaseSettings {
  mode = $state<ArtworkMode>(SHOWCASE_DEFAULTS.mode);
  motion = $state<ArtworkMotion>(SHOWCASE_DEFAULTS.motion);
  palette = $state<PaletteId>(SHOWCASE_DEFAULTS.palette);
  seed = $state<number>(SHOWCASE_DEFAULTS.seed);
  quality = $state<ArtworkQuality>(SHOWCASE_DEFAULTS.quality);
  previewBackground = $state<PreviewBackground>(SHOWCASE_DEFAULTS.previewBackground);

  /** The subset every page forwards to its artwork. */
  readonly options: ArtworkOptions = $derived({
    palette: this.palette,
    seed: this.seed,
    mode: this.mode,
    motion: this.motion,
    quality: this.quality,
  });

  reset() {
    this.mode = SHOWCASE_DEFAULTS.mode;
    this.motion = SHOWCASE_DEFAULTS.motion;
    this.palette = SHOWCASE_DEFAULTS.palette;
    this.seed = SHOWCASE_DEFAULTS.seed;
    this.quality = SHOWCASE_DEFAULTS.quality;
    this.previewBackground = SHOWCASE_DEFAULTS.previewBackground;
  }

  reseed() {
    this.seed = Math.floor(Math.random() * 1_000_000);
  }
}

export const showcaseSettings = new ShowcaseSettings();
