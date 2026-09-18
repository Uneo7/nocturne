import { seededRandom } from './random';

export interface GlucosePoint {
  /** Minutes since the start of the window. */
  minute: number;
  mgdl: number;
}

export interface GlucoseStats {
  timeInRangePct: number;
  timeBelowPct: number;
  timeAbovePct: number;
  meanMgdl: number;
  cvPct: number;
  gmiPct: number;
}

export const RANGE_LOW = 70;
export const RANGE_HIGH = 180;

/** A 24 h trace at 5-minute spacing: a slow baseline, three meal bumps, and gentle sensor noise. */
export function generateDay(seed = 1610): GlucosePoint[] {
  const rand = seededRandom(seed);
  const points: GlucosePoint[] = [];
  const meals = [
    { at: 7 * 60 + 30, height: 55 + rand() * 30 },
    { at: 12 * 60 + 45, height: 60 + rand() * 35 },
    { at: 18 * 60 + 30, height: 65 + rand() * 40 },
  ];
  for (let minute = 0; minute < 24 * 60; minute += 5) {
    let value = 118 + 10 * Math.sin((minute / 1440) * Math.PI * 2 - 1.2);
    for (const meal of meals) {
      const dt = minute - meal.at;
      if (dt > 0) value += meal.height * Math.exp(-((dt - 60) ** 2) / (2 * 45 ** 2));
    }
    value += (rand() - 0.5) * 8;
    points.push({ minute, mgdl: Math.round(value) });
  }
  return points;
}

export function computeStats(points: GlucosePoint[]): GlucoseStats {
  const n = points.length;
  if (n === 0) {
    return { timeInRangePct: 0, timeBelowPct: 0, timeAbovePct: 0, meanMgdl: 0, cvPct: 0, gmiPct: 0 };
  }
  let below = 0;
  let above = 0;
  let sum = 0;
  for (const p of points) {
    sum += p.mgdl;
    if (p.mgdl < RANGE_LOW) below++;
    else if (p.mgdl > RANGE_HIGH) above++;
  }
  const mean = sum / n;
  const variance = points.reduce((acc, p) => acc + (p.mgdl - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  return {
    timeInRangePct: Math.round(((n - below - above) / n) * 100),
    timeBelowPct: Math.round((below / n) * 100),
    timeAbovePct: Math.round((above / n) * 100),
    meanMgdl: Math.round(mean),
    cvPct: Math.round((sd / mean) * 1000) / 10,
    // GMI (Bergenstal 2018): 3.31 + 0.02392 x mean mg/dL
    gmiPct: Math.round((3.31 + 0.02392 * mean) * 10) / 10,
  };
}
