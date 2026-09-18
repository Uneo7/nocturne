import { seededRandom } from './random';

export type EventType = 'reading' | 'bolus' | 'carbs' | 'note';
export type DateRange = 'today' | '7d' | '30d' | 'all';

export interface HistoryEvent {
  id: string;
  /** Unix milliseconds. */
  at: number;
  type: EventType;
  value: string;
  notes: string;
}

export interface HistoryFilter {
  types: ReadonlySet<EventType>;
  range: DateRange;
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

export const EVENT_TYPES: readonly EventType[] = ['reading', 'bolus', 'carbs', 'note'];
export const DATE_RANGES: readonly DateRange[] = ['today', '7d', '30d', 'all'];

const DAY_MS = 24 * 60 * 60 * 1000;

const NOTES = ['', '', 'before walk', 'site change', 'late dinner', 'corrected', 'pre-bolus', ''];

export function generateEvents(now: number, seed = 1610, count = 64): HistoryEvent[] {
  const rand = seededRandom(seed);
  const events: HistoryEvent[] = [];
  for (let i = 0; i < count; i++) {
    const ageDays = Math.floor(rand() * 40) + rand();
    const at = Math.round(now - ageDays * DAY_MS);
    const roll = rand();
    const type: EventType = roll < 0.45 ? 'reading' : roll < 0.7 ? 'bolus' : roll < 0.9 ? 'carbs' : 'note';
    let value: string;
    switch (type) {
      case 'reading':
        value = `${Math.round(80 + rand() * 140)} mg/dL`;
        break;
      case 'bolus':
        value = `${(Math.round(rand() * 16) / 2 + 0.5).toFixed(1)} U`;
        break;
      case 'carbs':
        value = `${Math.round(10 + rand() * 70)} g`;
        break;
      case 'note':
        value = '';
        break;
    }
    events.push({ id: `evt-${i}`, at, type, value, notes: NOTES[Math.floor(rand() * NOTES.length)] });
  }
  return events.sort((a, b) => b.at - a.at);
}

export function rangeStart(range: DateRange, now: number): number {
  switch (range) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case '7d':
      return now - 7 * DAY_MS;
    case '30d':
      return now - 30 * DAY_MS;
    case 'all':
      return Number.NEGATIVE_INFINITY;
  }
}

export function filterEvents(events: readonly HistoryEvent[], filter: HistoryFilter, now: number): HistoryEvent[] {
  const start = rangeStart(filter.range, now);
  return events.filter((e) => e.at >= start && (filter.types.size === 0 || filter.types.has(e.type)));
}

export function paginate<T>(items: readonly T[], page: number, perPage: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * perPage;
  return { items: items.slice(start, start + perPage), page: clamped, totalPages, total: items.length };
}
