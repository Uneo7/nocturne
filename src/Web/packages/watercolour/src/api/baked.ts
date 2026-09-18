import { WatercolourError } from './errors';

/**
 * Baked format: one PNG of `frames` equal frames stacked vertically, evenly
 * spaced in artistic progress. The last frame is finished and dry. The caps
 * bound the decoded bitmap: 16 frames of 256 px is 16 x 256 x 256 x 4 = 4 MB.
 */
export interface BakedManifest {
  version: 1;
  frames: number;
  width: number;
  height: number;
  durationMs: number;
  layout: 'vertical';
}

export const BAKED_MANIFEST_VERSION = 1;
export const MAX_BAKED_FRAMES = 16;
export const MAX_BAKED_FRAME_EDGE = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function positiveInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}

export function parseBakedManifest(input: unknown): BakedManifest {
  const value = typeof input === 'string' ? safeParse(input) : input;
  if (!isRecord(value)) throw new WatercolourError('InvalidManifest', 'manifest is not an object');
  if (value.version !== BAKED_MANIFEST_VERSION) {
    throw new WatercolourError(
      'UnsupportedVersion',
      `manifest version ${String(value.version)} not supported (this build reads ${BAKED_MANIFEST_VERSION})`,
    );
  }
  if (value.layout !== 'vertical') throw new WatercolourError('InvalidManifest', `layout ${String(value.layout)} not supported`);
  if (!positiveInteger(value.frames, MAX_BAKED_FRAMES)) {
    throw new WatercolourError('InvalidManifest', `frames must be an integer in 1..${MAX_BAKED_FRAMES}`);
  }
  if (!positiveInteger(value.width, MAX_BAKED_FRAME_EDGE) || !positiveInteger(value.height, MAX_BAKED_FRAME_EDGE)) {
    throw new WatercolourError('InvalidManifest', `frame edges must be integers in 1..${MAX_BAKED_FRAME_EDGE}`);
  }
  if (typeof value.durationMs !== 'number' || !(value.durationMs > 0) || !Number.isFinite(value.durationMs)) {
    throw new WatercolourError('InvalidManifest', 'durationMs must be a positive number');
  }
  return {
    version: 1,
    frames: value.frames,
    width: value.width,
    height: value.height,
    durationMs: value.durationMs,
    layout: 'vertical',
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new WatercolourError('InvalidManifest', `manifest is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface StripPosition {
  /** Index of the frame drawn at full opacity. */
  from: number;
  /** Index of the frame cross-faded on top; equals `from` at exact frames. */
  to: number;
  /** Opacity of `to`, 0..1. */
  blend: number;
}

/** Maps artistic progress 0..1 onto the two adjacent strip frames it lies between. */
export function stripFramePosition(progress: number, frames: number): StripPosition {
  const count = Math.max(1, Math.floor(frames));
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
  const scaled = p * (count - 1);
  const from = Math.min(count - 1, Math.floor(scaled));
  const to = Math.min(count - 1, from + 1);
  const blend = from === to ? 0 : scaled - from;
  return { from, to, blend };
}

export interface StripBitmap {
  manifest: BakedManifest;
  bitmap: ImageBitmap;
}

/**
 * Decodes the whole strip once. A single `createImageBitmap` costs one decode
 * and one GPU upload; drawing frames is then two `drawImage` calls.
 */
export async function loadStrip(stripUrl: string, manifest: BakedManifest): Promise<StripBitmap> {
  const response = await fetch(stripUrl);
  if (!response.ok) throw new WatercolourError('AssetMissing', `${stripUrl}: HTTP ${response.status}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'default' });
  if (bitmap.width !== manifest.width || bitmap.height !== manifest.height * manifest.frames) {
    bitmap.close();
    throw new WatercolourError(
      'InvalidStrip',
      `strip is ${bitmap.width}x${bitmap.height}, manifest describes ${manifest.width}x${manifest.height * manifest.frames}`,
    );
  }
  return { manifest, bitmap };
}

/**
 * Cross-fades the two frames around `progress` into a cleared canvas.
 * `globalAlpha` over transparent pixels is not a true linear blend; at 12
 * frames the difference is below what the eye picks up.
 */
export function drawStripFrame(
  ctx: CanvasRenderingContext2D,
  strip: StripBitmap,
  progress: number,
  width: number,
  height: number,
): void {
  const { manifest, bitmap } = strip;
  const { from, to, blend } = stripFramePosition(progress, manifest.frames);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 1;
  ctx.drawImage(bitmap, 0, from * manifest.height, manifest.width, manifest.height, 0, 0, width, height);
  if (blend > 0) {
    ctx.globalAlpha = blend;
    ctx.drawImage(bitmap, 0, to * manifest.height, manifest.width, manifest.height, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}

/** Decodes the final PNG; works with no GPU at all. */
export async function loadStill(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new WatercolourError('AssetMissing', `${url}: HTTP ${response.status}`);
  return createImageBitmap(await response.blob(), { premultiplyAlpha: 'premultiply' });
}

export function drawStill(ctx: CanvasRenderingContext2D, image: ImageBitmap, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 1;
  ctx.drawImage(image, 0, 0, width, height);
}
