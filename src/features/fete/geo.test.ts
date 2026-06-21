import { describe, it, expect } from 'vitest';
import { haversine, walkingMinutes, statusOf, msUntilStart, formatDuration } from './geo';

describe('distance', () => {
  it('Haversine ~ distance connue (≈ 152 m entre Libération et Bareuzai)', () => {
    const a = { lat: 47.3216, lng: 5.0415 };
    const b = { lat: 47.3221, lng: 5.0398 };
    const d = haversine(a, b);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(220);
  });
  it('distance nulle entre un point et lui-même', () => {
    const a = { lat: 47.32, lng: 5.04 };
    expect(haversine(a, a)).toBe(0);
  });
  it('temps de marche croît avec la distance', () => {
    expect(walkingMinutes(2000)).toBeGreaterThan(walkingMinutes(500));
  });
});

describe('statut', () => {
  const s = { start: '2026-06-21T20:00:00', end: '2026-06-21T21:00:00' };
  const t = (h: number, m = 0) => new Date(`2026-06-21T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
  it('à venir avant le début', () => expect(statusOf(s, t(19))).toBe('upcoming'));
  it('en cours pendant', () => expect(statusOf(s, t(20, 30))).toBe('live'));
  it('terminé après la fin', () => expect(statusOf(s, t(21, 1))).toBe('past'));
  it('msUntilStart = 0 si déjà commencé', () => expect(msUntilStart(s, t(20, 30))).toBe(0));
});

describe('formatDuration', () => {
  it('heures et minutes', () => expect(formatDuration(65 * 60000)).toBe('1 h 05'));
  it('minutes', () => expect(formatDuration(12 * 60000)).toBe('12 min'));
});
