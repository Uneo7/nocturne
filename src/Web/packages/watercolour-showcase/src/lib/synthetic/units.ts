const MGDL_PER_MMOL = 18.0182;

export function mgdlToMmol(mgdl: number): number {
  return Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10;
}

export function formatMmol(mgdl: number): string {
  return `${mgdlToMmol(mgdl).toFixed(1)} mmol/L`;
}
