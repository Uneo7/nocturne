import { describe, expect, it } from 'vitest';
import { filterEvents, generateEvents, paginate, type HistoryEvent } from './history';

const NOW = Date.UTC(2026, 8, 17, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function event(id: string, hoursAgo: number, type: HistoryEvent['type']): HistoryEvent {
  return { id, at: NOW - hoursAgo * HOUR, type, value: '', notes: '' };
}

describe('generateEvents', () => {
  it('is deterministic for a seed and sorted newest first', () => {
    const a = generateEvents(NOW, 42);
    const b = generateEvents(NOW, 42);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].at).toBeGreaterThanOrEqual(a[i].at);
  });

  it('never places an event in the future', () => {
    for (const e of generateEvents(NOW, 7)) expect(e.at).toBeLessThanOrEqual(NOW);
  });
});

describe('filterEvents', () => {
  const events = [
    event('a', 1, 'reading'),
    event('b', 30, 'bolus'),
    event('c', 5 * 24, 'carbs'),
    event('d', 20 * 24, 'note'),
    event('e', 45 * 24, 'reading'),
  ];

  it('an empty type set means every type', () => {
    expect(filterEvents(events, { types: new Set(), range: 'all' }, NOW)).toHaveLength(5);
  });

  it('narrows by type', () => {
    const out = filterEvents(events, { types: new Set(['reading']), range: 'all' }, NOW);
    expect(out.map((e) => e.id)).toEqual(['a', 'e']);
  });

  it('narrows by rolling range', () => {
    expect(filterEvents(events, { types: new Set(), range: '7d' }, NOW).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(filterEvents(events, { types: new Set(), range: '30d' }, NOW).map((e) => e.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('combines type and range', () => {
    expect(filterEvents(events, { types: new Set(['reading']), range: '7d' }, NOW).map((e) => e.id)).toEqual(['a']);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 23 }, (_, i) => i);

  it('slices ten per page and reports the page count', () => {
    const p = paginate(items, 1, 10);
    expect(p.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(p.totalPages).toBe(3);
    expect(p.total).toBe(23);
  });

  it('returns the short final page', () => {
    expect(paginate(items, 3, 10).items).toEqual([20, 21, 22]);
  });

  it('clamps out-of-range pages', () => {
    expect(paginate(items, 9, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it('an empty list is a single empty page', () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1, total: 0 });
  });
});
