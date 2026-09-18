import { describe, expect, it } from 'vitest';
import { WatercolourError, toWatercolourError } from './errors';
import { paletteKey, parseSceneDocument, resolveSceneJson } from './scenes';

describe('parseSceneDocument', () => {
  it('accepts version 1 and reports the id', () => {
    expect(parseSceneDocument('{"version":1,"id":"wash-water-7"}')).toEqual({ version: 1, id: 'wash-water-7' });
  });

  it('rejects other and missing versions with UnsupportedVersion', () => {
    for (const doc of ['{"version":2}', '{"version":"1"}', '{}']) {
      try {
        parseSceneDocument(doc);
        expect.unreachable(doc);
      } catch (error) {
        expect(error).toBeInstanceOf(WatercolourError);
        expect((error as WatercolourError).code).toBe('UnsupportedVersion');
      }
    }
  });

  it('rejects non-JSON and non-objects with InvalidScene', () => {
    for (const doc of ['nope', '[]', 'null']) {
      try {
        parseSceneDocument(doc);
        expect.unreachable(doc);
      } catch (error) {
        expect((error as WatercolourError).code).toBe('InvalidScene');
      }
    }
  });
});

describe('resolveSceneJson', () => {
  it('passes the palette key, defaults and detail through to the engine', () => {
    const calls: unknown[][] = [];
    const module = {
      catalogueScene: (...args: unknown[]) => {
        calls.push(args);
        return '{"version":1}';
      },
    };
    resolveSceneJson(module, { id: 'crescent-moon', palette: 'dusk', surface: 'dark', seed: 42, intensity: 0.9, detail: 'small' });
    resolveSceneJson(module, { id: 'wash' });
    expect(calls).toEqual([
      ['crescent-moon', 42, 'dusk', 0.9, 'small', 'dark', 0],
      ['wash', 0, 'moonlight', 0.7, 'large', 'light', 0],
    ]);
  });

  it('lets a live override win over the ref detail and passes the sim resolution', () => {
    const calls: unknown[][] = [];
    const module = {
      catalogueScene: (...args: unknown[]) => {
        calls.push(args);
        return '{"version":1}';
      },
    };
    resolveSceneJson(module, { id: 'moonlit-shoreline', detail: 'medium' }, { detail: 'extraLarge', simResolution: 480 });
    resolveSceneJson(module, { id: 'wash' }, { simResolution: 512 });
    expect(calls).toEqual([
      ['moonlit-shoreline', 0, 'moonlight', 0.7, 'extraLarge', 'light', 480],
      ['wash', 0, 'moonlight', 0.7, 'large', 'light', 512],
    ]);
  });

  it('turns the engine message into a typed error', () => {
    const module = {
      catalogueScene: () => {
        throw new Error('UnknownArtwork: alarm-bell');
      },
    };
    try {
      resolveSceneJson(module, { id: 'alarm-bell' });
      expect.unreachable();
    } catch (error) {
      expect((error as WatercolourError).code).toBe('UnknownArtwork');
      expect((error as WatercolourError).message).toBe('alarm-bell');
    }
  });
});

describe('paletteKey and toWatercolourError', () => {
  it('suffixes dark surfaces and defaults to moonlight', () => {
    expect(paletteKey()).toBe('moonlight');
    expect(paletteKey('ember', 'light')).toBe('ember');
    expect(paletteKey('ember', 'dark')).toBe('ember_dark');
  });

  it('keeps known codes and files the rest under Unknown', () => {
    expect(toWatercolourError(new Error('InstanceLimit: 4 live')).code).toBe('InstanceLimit');
    expect(toWatercolourError('DeviceLost: gone').code).toBe('DeviceLost');
    expect(toWatercolourError(new Error('Something: else')).code).toBe('Unknown');
    expect(toWatercolourError(new TypeError('boom')).message).toBe('boom');
  });
});
