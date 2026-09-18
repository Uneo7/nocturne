import { describe, expect, it } from 'vitest';
import { formatMmol, mgdlToMmol } from './units';

describe('mgdlToMmol', () => {
  it('converts the usual landmarks', () => {
    expect(mgdlToMmol(180)).toBe(10);
    expect(mgdlToMmol(70)).toBe(3.9);
    expect(mgdlToMmol(54)).toBe(3);
  });

  it('formats with one decimal', () => {
    expect(formatMmol(142)).toBe('7.9 mmol/L');
  });
});
