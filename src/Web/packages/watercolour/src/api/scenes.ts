import type { ArtworkId, DetailLevel, PaletteId, Surface } from '../types';
import { DEFAULT_INTENSITY } from '../types';
import { WatercolourError, toWatercolourError } from './errors';
import type { WasmModule } from './engine-host';

/** Version of the scene document this build reads; the engine validates everything past it. */
export const SCENE_DOCUMENT_VERSION = 1;

export interface ArtworkRef {
  id: ArtworkId;
  palette?: PaletteId;
  seed?: number;
  intensity?: number;
  surface?: Surface;
  detail?: DetailLevel;
}

/** A ready scene document (JSON string) or a catalogue reference the engine expands. */
export type SceneSource = ArtworkRef | { sceneJson: string };

/** Live-mode overrides derived from the canvas's backing store size. */
export interface SceneResolutionOverride {
  detail?: DetailLevel;
  /** Sim grid side; 0 keeps the detail's default. */
  simResolution?: number;
}

export function isArtworkRef(source: SceneSource): source is ArtworkRef {
  return typeof (source as ArtworkRef).id === 'string';
}

export interface SceneDocumentHeader {
  version: typeof SCENE_DOCUMENT_VERSION;
  id?: string;
}

/**
 * Checks only the version field; a newer document fails here with a typed
 * error instead of deep inside the engine's parser.
 */
export function parseSceneDocument(json: string): SceneDocumentHeader {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new WatercolourError('InvalidScene', `scene document is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WatercolourError('InvalidScene', 'scene document is not an object');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'number') {
    throw new WatercolourError('UnsupportedVersion', 'scene document has no version field');
  }
  if (record.version !== SCENE_DOCUMENT_VERSION) {
    throw new WatercolourError(
      'UnsupportedVersion',
      `scene document version ${record.version} not supported (this build reads ${SCENE_DOCUMENT_VERSION})`,
    );
  }
  return { version: SCENE_DOCUMENT_VERSION, id: typeof record.id === 'string' ? record.id : undefined };
}

/**
 * Directory a baked asset set lives under: `moonlight` for a light page,
 * `moonlight_dark` for the same palette composited for a dark one. This is
 * an asset key only; the engine takes palette and surface separately.
 */
export function paletteKey(palette: PaletteId = 'moonlight', surface: Surface = 'light'): string {
  return surface === 'dark' ? `${palette}_dark` : palette;
}

export function resolveSceneJson(
  module: Pick<WasmModule, 'catalogueScene'>,
  ref: ArtworkRef,
  override: SceneResolutionOverride = {},
): string {
  try {
    return module.catalogueScene(
      ref.id,
      ref.seed ?? 0,
      ref.palette ?? 'moonlight',
      ref.intensity ?? DEFAULT_INTENSITY,
      override.detail ?? ref.detail ?? 'large',
      ref.surface ?? 'light',
      override.simResolution ?? 0,
    );
  } catch (error) {
    throw toWatercolourError(error);
  }
}
